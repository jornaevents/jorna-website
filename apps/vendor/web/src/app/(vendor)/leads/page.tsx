"use client";

// Leads (plan step 2 of the 2026-10 redesign): everything before a contract is
// signed, from the backend's one pipeline (GET /leads/pipeline, backend
// DECISIONS #20). Inquiries haven't been sent a contract; Negotiations have.
// Which ones need the vendor, and why, is the server's call — this page only
// draws it, so web and iOS can't disagree.
//
// A lead opens in a side drawer with what that stage can do; a sent contract
// opens straight into the negotiation workspace (components/negotiation),
// where the couple's proposed changes are answered. Negotiation happens here,
// never in Messages. The old counter-offer panel stays for counters already
// open (backend DECISIONS #23).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  archiveBooking,
  getContract,
  getMyVendor,
  getPipeline,
  sendContract,
  setBookingStatus,
  updateLead,
  voidContract,
} from "@/lib/jorna";
import { emailNotice, guestBookingLink } from "@/lib/contractLink";
import { describeEvent, visibleEvents } from "@/lib/contractTimeline";
import { centsToMoney } from "@/lib/vendorPlan";
import type { Contract, Pipeline, PipelineItem } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { NegotiationPanel as ContractNegotiation } from "@/components/negotiation/NegotiationPanel";
import { Drawer, FilterTabs, PageHeader, StatTile, StatusPill, type Tone } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";
import { NewMenu } from "@/components/vendor/NewMenu";
import { InquiryShareButton } from "@/components/vendor/InquiryShare";

type Filter = "all" | "inquiry" | "negotiation" | "archived";
type Sort = "recent" | "upcoming" | "value";
type Look = "attention" | "waiting" | "inquiry";

const REASON: Record<string, string> = {
  changes_proposed: "They proposed changes to the contract",
  revised: "Your new version is with them",
  new_request: "New request — they're waiting for your reply",
  new_lead: "New lead — reach out to them",
  draft: "Contract drafted but not sent",
  counter_offer: "They made a counter-offer",
  declined: "They declined the contract",
  expired: "The hold ran out before they signed",
  sent: "Contract sent",
  viewed: "They've opened the contract",
  counter_sent: "Your counter-offer is with them",
  contacted: "You've been in touch",
  quoted: "You've sent a quote",
};

/** How a closed lead ended (backend #28); it sits under Archived. */
const OUTCOME: Record<NonNullable<PipelineItem["outcome"]>, string> = {
  declined: "You declined",
  cancelled_by_client: "Client cancelled",
  contract_declined: "Client declined",
  not_going_ahead: "Not going ahead",
};

function archivedLabel(item: PipelineItem): string {
  return item.outcome ? OUTCOME[item.outcome] : "Archived";
}

/** "6:00 PM – 11:00 PM" from HH:MM, or null. */
function hours(start?: string | null, end?: string | null): string | null {
  const fmt = (t?: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
    if (!m) return null;
    const h = Number(m[1]);
    return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
  };
  const a = fmt(start);
  const b = fmt(end);
  return a && b ? `${a} – ${b}` : a;
}

function look(item: PipelineItem): Look {
  if (item.attention === "needs_you") return "attention";
  if (item.attention === "waiting") return "waiting";
  return "inquiry";
}

const LOOK: Record<Look, { label: string; tone: Tone; border: string }> = {
  attention: { label: "Needs your attention", tone: "red", border: "border-l-[#cf736b]" },
  waiting: { label: "Waiting on client", tone: "green", border: "border-l-[#78aa8c]" },
  inquiry: { label: "Inquiry", tone: "amber", border: "border-l-[#d9bc5b]" },
};

function initials(name: string): string {
  const parts = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "·") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const isIsoDate = (s?: string | null) => Boolean(s && /^\d{4}-\d{2}-\d{2}/.test(s));

/** A booking's ISO date, or a lead's free text ("fall 2027") as typed. */
function eventDate(s?: string | null): string {
  if (!s || s === "TBD") return "Date TBD";
  if (!isIsoDate(s)) return s;
  const d = new Date(`${s.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ago(iso?: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  const days = Math.round(mins / 1440);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sortItems(items: PipelineItem[], sort: Sort): PipelineItem[] {
  const copy = [...items];
  if (sort === "value") {
    return copy.sort((a, b) => (b.estimated_value_cents ?? -1) - (a.estimated_value_cents ?? -1));
  }
  if (sort === "upcoming") {
    // Dated events soonest first; free-text and missing dates last.
    return copy.sort((a, b) => {
      const ad = isIsoDate(a.event_date) ? a.event_date! : "9999";
      const bd = isIsoDate(b.event_date) ? b.event_date! : "9999";
      return ad.localeCompare(bd);
    });
  }
  return copy.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}

// ── Row ──────────────────────────────────────────────────────────────

/** A sent, unsigned contract opens straight into the negotiation workspace;
 *  everything else (inquiries, drafts, voided) into the lead drawer. */
function negotiable(item: PipelineItem): boolean {
  return (
    item.source === "contract" &&
    !item.archived &&
    Boolean(item.booking_id) &&
    (item.contract_status === "sent" || item.contract_status === "viewed" || item.contract_status === "expired")
  );
}

function LeadRow({ item, onOpen }: { item: PipelineItem; onOpen: () => void }) {
  const l = LOOK[look(item)];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`grid min-h-[4.75rem] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-l-4 border-card-edge ${l.border} bg-card px-3.5 py-3 text-left transition hover:-translate-y-px hover:shadow-[0_7px_18px_rgba(50,44,38,0.06)] md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_11.5rem_auto] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_7rem_11.5rem_5.5rem_auto]`}
    >
      <span className="grid size-10 place-items-center rounded-full bg-maroon/10 text-xs font-bold text-maroon dark:bg-gold/15 dark:text-gold">
        {initials(item.name)}
      </span>
      <span className="grid min-w-0">
        <strong className="truncate text-sm text-ink">{item.name}</strong>
        <small className="mt-0.5 truncate text-xs text-ink-faint">
          {/* Two requests from one client differ by their event (#165). */}
          {[item.event_name, item.service_name].filter(Boolean).join(" · ") || (item.source === "lead" ? "Lead" : "Request")}
        </small>
      </span>
      <span className="hidden min-w-0 md:grid">
        <small className="text-[0.68rem] text-ink-faint">Event</small>
        <strong className="truncate text-sm text-ink">{eventDate(item.event_date)}</strong>
        <span className="truncate text-xs text-ink-faint">{item.location || "Venue TBD"}</span>
      </span>
      <span className="hidden min-w-0 lg:grid">
        <small className="text-[0.68rem] text-ink-faint">Estimated value</small>
        <strong className="serif text-sm text-ink">
          {item.estimated_value_cents != null ? centsToMoney(item.estimated_value_cents) : "—"}
        </strong>
      </span>
      <span className="justify-self-end md:justify-self-start">
        {item.archived ? <StatusPill tone="grey">{archivedLabel(item)}</StatusPill> : <StatusPill tone={l.tone} dot>{l.label}</StatusPill>}
      </span>
      <span className="hidden items-center gap-1 text-xs text-ink-faint lg:flex">
        <Icon name="clock" size={12} />
        {ago(item.updated_at)}
      </span>
      <Icon name="chevron" size={16} className="hidden text-ink-faint md:block" />
    </button>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────

function Detail({ label, children, wrap }: { label: string; children: React.ReactNode; wrap?: boolean }) {
  return (
    <div className={`min-w-0 ${wrap ? "col-span-2" : ""}`}>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 text-sm text-ink ${wrap ? "break-words" : "truncate"}`}>{children}</dd>
    </div>
  );
}

function LeadDrawer({
  item,
  onClose,
  onChanged,
  onNegotiate,
}: {
  item: PipelineItem | null;
  onClose: () => void;
  onChanged: () => void;
  onNegotiate: (bookingId: string) => void;
}) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"decline" | "void" | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const bookingId = item?.booking_id ?? null;
  const isContract = item?.source === "contract";

  // Keyed by lead (see the page), so each lead's drawer starts clean and only
  // the contract — for its timeline and signing link — needs fetching.
  useEffect(() => {
    if (!bookingId || !isContract) return;
    let cancelled = false;
    getContract(bookingId)
      .then((c) => !cancelled && setContract(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId, isContract]);

  if (!item) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  /** Copying the link counts as sending it (plan): a draft is sent first, so
   *  the hold starts and the lead becomes a Negotiation. */
  async function copyLink() {
    if (!item || !bookingId) return;
    await run(
      "copy",
      async () => {
        const token = contract?.contract_token ?? (await getContract(bookingId)).contract_token;
        if (item.contract_status === "draft") await sendContract(bookingId);
        await navigator.clipboard.writeText(guestBookingLink(token));
      },
      item.contract_status === "draft" ? "Link copied — the date is now on hold for them." : "Link copied.",
    );
  }

  const reason = item.attention_reason ? REASON[item.attention_reason] ?? null : null;
  const l = LOOK[look(item)];
  const archived = item.archived;
  const status = item.contract_status;
  const ghost = "w-full sm:w-auto";
  const fromForm = item.lead_source === "inquiry_form";

  const archiveAction = () =>
    item.lead_id
      ? updateLead(item.lead_id, { archived: !archived })
      : archiveBooking(item.booking_id!, !archived);

  return (
    <Drawer
      open
      onClose={onClose}
      title={item.name}
      subtitle={item.event_name && item.event_name !== item.name ? item.event_name : item.service_name ?? undefined}
      footer={
        <div className="flex flex-wrap gap-2">
          {/* A form inquiry has no thread; email is how they asked to hear back. */}
          {fromForm && item.email && !item.conversation_id ? (
            <a
              href={`mailto:${item.email}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04]"
            >
              <Icon name="messages" size={16} /> Reply by email
            </a>
          ) : null}
          {item.conversation_id ? (
            <Link
              href={`/conversation?id=${item.conversation_id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04]"
            >
              <Icon name="messages" size={16} /> Message
            </Link>
          ) : null}
          {item.outcome ? null : (
            <Button
              variant="quiet"
              className="ml-auto"
              disabled={busy != null}
              onClick={() => run("archive", archiveAction, archived ? "Back in your active leads." : "Archived.")}
            >
              {archived ? "Unarchive" : "Archive"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {archived ? <StatusPill tone="grey">{archivedLabel(item)}</StatusPill> : <StatusPill tone={l.tone} dot>{l.label}</StatusPill>}
        <StatusPill tone="grey">{item.stage === "negotiation" ? "Negotiation" : "Inquiry"}</StatusPill>
        {fromForm ? <StatusPill tone="grey">From your inquiry form</StatusPill> : null}
      </div>
      {reason ? <p className="mt-2 text-sm text-ink-soft">{reason}</p> : null}
      {item.outcome_note ? (
        <p className="mt-2 text-sm text-ink-soft">
          {item.outcome === "declined" ? "You told them" : "They said"}: “{item.outcome_note}”
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-card-edge bg-card p-4">
        <Detail label="Event date">{eventDate(item.event_date)}</Detail>
        <Detail label="Time">{hours(item.time_start, item.time_end) ?? "—"}</Detail>
        <Detail label="Venue" wrap>
          {item.location || "TBD"}
        </Detail>
        {item.guest_count ? <Detail label="Guests">{item.guest_count}</Detail> : null}
        <Detail label="Package">{item.service_name || "—"}</Detail>
        <Detail label="Estimated value">
          {item.estimated_value_cents != null ? centsToMoney(item.estimated_value_cents) : "—"}
        </Detail>
        {item.email ? <Detail label="Email">{item.email}</Detail> : null}
        {item.phone ? <Detail label="Phone">{item.phone}</Detail> : null}
      </dl>

      {item.client_note ? (
        <div className="mt-5">
          <p className="eyebrow">What they wrote</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-soft">“{item.client_note}”</p>
        </div>
      ) : null}

      {item.note ? (
        <div className="mt-5">
          {/* A form inquiry's note is their message; anyone else's is the vendor's own. */}
          <p className="eyebrow">{fromForm ? "What they wrote" : "Notes"}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-soft">{item.note}</p>
        </div>
      ) : null}

      {/* What this stage can do. A closed lead has nothing left to do. */}
      <div className={`mt-6 ${item.outcome ? "hidden" : ""}`}>
        <p className="eyebrow">Next step</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {item.source === "request" ? (
            <>
              <LinkPrimary href={`/contracts/new?request=${item.booking_id}`}>Create contract</LinkPrimary>
              {/* One click, with the vendor's usual terms — what Bookings'
                  "Accept & send contract" did before requests moved here. */}
              <Button
                variant="ghost"
                className={ghost}
                disabled={busy != null}
                onClick={() =>
                  run("accept", async () => {
                    const r = await setBookingStatus(item.booking_id!, "approved");
                    setNotice(
                      r.email_sent === true
                        ? "Sent — we've emailed them a contract built from your usual terms. The date is held until they sign."
                        : r.email_sent === false
                          ? "Sent a contract built from your usual terms, but we couldn't email them. Copy the link from the contract and send it yourself. The date is held until they sign."
                          : "Sent a contract built from your usual terms. The date is held until they sign.",
                    );
                  })
                }
              >
                Send with my usual terms
              </Button>
              <Button variant="ghost" className={ghost} disabled={busy != null} onClick={() => setConfirm("decline")}>
                Decline
              </Button>
            </>
          ) : null}

          {item.source === "lead" ? (
            <>
              <LinkPrimary href={`/contracts/new?lead=${item.lead_id}`}>Create contract</LinkPrimary>
              {item.lead_status === "new" ? (
                <Button
                  variant="ghost"
                  className={ghost}
                  disabled={busy != null}
                  onClick={() => run("contacted", () => updateLead(item.lead_id!, { status: "contacted" }), "Marked as contacted.")}
                >
                  Mark as contacted
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className={ghost}
                disabled={busy != null}
                onClick={() => run("lost", () => updateLead(item.lead_id!, { status: "lost" }), "Closed.")}
              >
                Mark as not going ahead
              </Button>
            </>
          ) : null}

          {isContract && status === "draft" ? (
            <>
              <LinkPrimary href={`/contracts/new?edit=${item.booking_id}`}>Edit contract</LinkPrimary>
              {item.email ? (
                <Button
                  variant="ghost"
                  className={ghost}
                  disabled={busy != null}
                  onClick={() =>
                    run("send", async () => {
                      const c = await sendContract(item.booking_id!, { emailClient: true });
                      setNotice(emailNotice(c.email_sent, item.email));
                    })
                  }
                >
                  Send by email
                </Button>
              ) : null}
              <Button variant="ghost" className={ghost} disabled={busy != null} onClick={copyLink}>
                Copy link
              </Button>
            </>
          ) : null}

          {isContract && (status === "sent" || status === "viewed" || status === "expired") ? (
            <>
              <Button className={ghost} onClick={() => onNegotiate(item.booking_id!)}>
                {item.proposal_status === "open" ? "Review changes" : "Open negotiation"}
              </Button>
              <Link
                href={`/contracts/view?id=${item.booking_id}`}
                className="self-center px-2 text-sm font-semibold text-gold"
              >
                View contract
              </Link>
              <Button variant="ghost" className={ghost} disabled={busy != null} onClick={copyLink}>
                Copy link
              </Button>
              <Button
                variant="ghost"
                className={ghost}
                disabled={busy != null}
                onClick={() =>
                  run(
                    "resend",
                    () => sendContract(item.booking_id!, { emailClient: Boolean(item.email) }),
                    status === "expired" ? "Resent — the date is held again." : "Resent.",
                  )
                }
              >
                {status === "expired" ? "Resend and hold again" : "Resend"}
              </Button>
              <Link href={`/contracts/new?edit=${item.booking_id}`} className="self-center px-2 text-sm font-semibold text-gold">
                Edit
              </Link>
              <Button variant="quiet" className={ghost} disabled={busy != null} onClick={() => setConfirm("void")}>
                Void
              </Button>
            </>
          ) : null}

          {isContract && status === "declined" ? (
            <LinkPrimary href="/contracts/new">Start a new contract</LinkPrimary>
          ) : null}
        </div>

        {confirm ? (
          <div className="mt-3 rounded-xl border border-card-edge bg-card p-3.5">
            <p className="text-sm text-ink">
              {confirm === "decline"
                ? "Decline this request? We'll email them that you can't take it."
                : "Void this contract? The link stops working and the date opens up."}
            </p>
            {confirm === "decline" ? (
              <label className="mt-2.5 block">
                <span className="mb-1 block text-xs text-ink-faint">A note to them (optional)</span>
                <textarea
                  value={declineNote}
                  maxLength={500}
                  rows={2}
                  placeholder="e.g. I'm booked that weekend — sorry!"
                  onChange={(e) => setDeclineNote(e.target.value)}
                  className="w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                />
              </label>
            ) : null}
            <div className="mt-2.5 flex gap-2">
              <Button
                disabled={busy != null}
                onClick={() =>
                  confirm === "decline"
                    ? run("decline", () => setBookingStatus(item.booking_id!, "rejected", declineNote.trim() || null), "Declined.")
                    : run("void", () => voidContract(item.booking_id!), "Voided.")
                }
              >
                {confirm === "decline" ? "Decline request" : "Void contract"}
              </Button>
              <Button variant="quiet" onClick={() => setConfirm(null)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : null}

        {notice ? <p className="mt-3 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">{notice}</p> : null}
        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}
      </div>

      {item.attention_reason === "counter_offer" || item.attention_reason === "counter_sent" ? (
        <div className="mt-6">
          <p className="eyebrow">Price</p>
          <div className="mt-2.5">
            <NegotiationPanel
              bookingId={item.booking_id!}
              listedPrice={(item.estimated_value_cents ?? 0) / 100}
              counterpartyName={item.name}
              onSettled={onChanged}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <p className="eyebrow">Timeline</p>
        <ol className="mt-2.5 grid gap-2.5 border-l border-line pl-4">
          {item.created_at ? (
            <TimelineRow at={item.created_at}>
              {item.source === "request" ? "Request received" : item.source === "lead" ? "Added to leads" : "Contract created"}
            </TimelineRow>
          ) : null}
          {visibleEvents(contract?.timeline ?? [])
            .filter((e) => e.kind !== "created")
            .map((e, i) => (
              <TimelineRow key={i} at={e.at}>
                {describeEvent(e, contract ?? {})}
              </TimelineRow>
            ))}
        </ol>
      </div>
    </Drawer>
  );
}

function TimelineRow({ at, children }: { at: string; children: React.ReactNode }) {
  return (
    <li className="relative text-sm text-ink-soft">
      <i aria-hidden="true" className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-gold-bright" />
      {children}
      <span className="block text-xs text-ink-faint">
        {new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </span>
    </li>
  );
}

function LinkPrimary({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-maroon px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
    >
      {children}
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function LeadsInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  // The negotiation workspace (backend DECISIONS #23): a contract's booking id.
  const [negotiating, setNegotiating] = useState<string | null>(params.get("negotiate"));
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/leads&role=vendor");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const mine = await getMyVendor();
    if (!mine) return "not-vendor" as const;
    return { vendorId: mine.vendor_id, pipeline: await getPipeline() };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    load()
      .then((r) => {
        if (cancelled) return;
        if (r === "not-vendor") router.replace("/vendor-onboarding");
        else {
          setError(null);
          setVendorId(r.vendorId);
          setPipeline(r.pipeline);
        }
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your leads."));
    return () => {
      cancelled = true;
    };
  }, [user, load, router, tick]);

  const shown = useMemo(() => {
    if (!pipeline) return [];
    const items = pipeline.items.filter((i) =>
      filter === "archived" ? i.archived : !i.archived && (filter === "all" || i.stage === filter),
    );
    return sortItems(items, sort);
  }, [pipeline, filter, sort]);

  const open = pipeline?.items.find((i) => i.id === openId) ?? null;

  if (error && !pipeline) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">{error}</p>
        <Button variant="ghost" className="mt-4" onClick={() => setTick((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }
  if (authLoading || !user || !pipeline) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const c = pipeline.counts;

  return (
    <div>
      <PageHeader
        eyebrow="Sales pipeline"
        title="Leads"
        subtitle="Everyone you're talking to who hasn't signed yet."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {vendorId ? <InquiryShareButton vendorId={vendorId} /> : null}
            <NewMenu
              first="client"
              onClientAdded={(lead) => {
                setNotice(`${lead.name} is on your leads as an inquiry.`);
                setFilter("all");
                setTick((n) => n + 1);
              }}
            />
          </div>
        }
      />

      {notice ? (
        <p role="status" className="mb-4 rounded-lg bg-ground-2 px-3 py-2 text-sm text-ink-soft">
          ✓ {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon="leads" tone="amber" label="Inquiries" value={c.inquiries} note="No contract sent yet" />
        <StatTile icon="clock" tone="green" label="Waiting on client" value={c.waiting} note="No action needed" />
        <StatTile icon="messages" tone="red" label="Needs your attention" value={c.needs_you} note="Reply soon" />
      </div>

      <section aria-label="Pipeline" className="mt-4 rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Pipeline</p>
            <p className="serif mt-1 text-lg text-ink">{filter === "archived" ? "Archived leads" : "Active leads"}</p>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">
            <FilterTabs<Filter>
              label="Stage"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "inquiry", label: "Inquiries", count: c.inquiries },
                { value: "negotiation", label: "Negotiations", count: c.negotiations },
                { value: "archived", label: "Archived", count: c.archived },
              ]}
            />
            <div role="group" aria-label="Sort" className="flex gap-0.5 rounded-[9px] border border-line p-[3px]">
              {(
                [
                  ["recent", "clock", "Recent"],
                  ["upcoming", "calendar", "Upcoming"],
                  ["value", "earnings", "Value"],
                ] as const
              ).map(([value, icon, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                  className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-xs font-semibold ${
                    sort === value ? "bg-panel text-ink" : "text-ink-faint hover:text-ink-soft"
                  }`}
                >
                  <Icon name={icon} size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          {shown.map((item) => (
            <LeadRow
              key={item.id}
              item={item}
              onOpen={() => (negotiable(item) ? setNegotiating(item.booking_id!) : setOpenId(item.id))}
            />
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-14 text-center text-sm text-ink-faint">
            {filter === "archived"
              ? "Nothing archived."
              : "No leads here yet. Inquiries from your inquiry form, requests from the marketplace, clients you add from Messages and contracts you send all show up here. Share your inquiry form to get your first one."}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-x-5 gap-y-1.5 border-t border-line-soft pt-3 text-xs text-ink-faint">
          {(["inquiry", "waiting", "attention"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <i aria-hidden="true" className={`h-3 w-1 rounded-full border-l-4 ${LOOK[k].border}`} />
              {k === "inquiry" ? "Inquiry" : k === "waiting" ? "Waiting on the client" : "Needs your attention"}
            </span>
          ))}
        </div>
      </section>

      <LeadDrawer
        key={open?.id ?? "closed"}
        item={open}
        onClose={() => setOpenId(null)}
        onChanged={() => setTick((n) => n + 1)}
        onNegotiate={(id) => {
          setOpenId(null);
          setNegotiating(id);
        }}
      />
      <ContractNegotiation
        key={negotiating ?? "negotiation-closed"}
        bookingId={negotiating}
        onClose={() => setNegotiating(null)}
        onDone={(message) => {
          setNegotiating(null);
          setNotice(message);
          setTick((n) => n + 1);
        }}
        onDetails={() => {
          const lead = pipeline?.items.find((i) => i.booking_id === negotiating);
          setNegotiating(null);
          if (lead) setOpenId(lead.id);
        }}
      />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <LeadsInner />
    </Suspense>
  );
}
