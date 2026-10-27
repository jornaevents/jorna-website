"use client";

// Contracts (plan step 7 of the 2026-10 redesign, first half): the design's
// template gallery and document library. Every contract this vendor has
// written, and where each one stands.
//
// There's no list-contracts endpoint: a contract *is* a VendorBooking with a
// contract_token, so this reads /bookings/vendor/{id} and filters. Status
// comes from vendorPlan's contractStatus. Confirming a payment stays on
// Bookings, which owns it.
//
// The gallery opens the contract editor (/contracts/new) on a package's
// template, scratch on the vendor's usual terms, or one of their saved
// templates (backend DECISIONS #31) — or the addendum and
// cancellation editor (/contracts/document), which first asks which signed
// booking the document is for.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { getMyVendor, listMyServices, listVendorBookings, sendContract, voidContract } from "@/lib/jorna";
import {
  type SavedContractTemplate,
  type ServiceItem,
  type TemplateKind,
  type VendorBooking,
  type VendorDetail,
} from "@/lib/types";
import { changesWaiting, contractNeedsVendor, contractStatus, type ContractStatus } from "@/lib/vendorPlan";
import { signerMatches } from "@/lib/signerName";
import { guestBookingLink, guestBookingPreviewLink } from "@/lib/contractLink";
import { deleteTemplate, duplicateTemplate, loadTemplates, renameTemplate } from "@/lib/contractTemplates";
import { templateChoices, type TemplateChoice } from "@/lib/templateChoices";
import { money, type TemplateBody } from "@jorna/shared/lib/contractDraft";
import { KIND_LABEL } from "@/lib/attachedDocuments";
import { Button } from "@jorna/shared/components/ui";
import { Drawer, FilterTabs, PageHeader, StatusPill, type Tone } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";
import { NewMenu } from "@/components/vendor/NewMenu";
import { ContractDefaultsDrawer } from "@/components/vendor/ContractDefaultsDrawer";

/** The plan's statuses: Draft, Sent, Viewed, Signed, Deposit due, Paid,
 *  Expired, Declined, Void — plus the two where the couple says they've paid
 *  and it's the vendor's turn to confirm. */
function statusLabel(b: VendorBooking, s: ContractStatus): { label: string; tone: Tone } {
  switch (s) {
    case "draft":
      return { label: "Draft", tone: "grey" };
    case "changes_waiting":
      return { label: "Your turn", tone: "red" };
    case "countersign":
      return { label: "Your signature", tone: "red" };
    case "awaiting_signature":
      return b.viewed_at ? { label: "Viewed", tone: "amber" } : { label: "Sent", tone: "amber" };
    case "expired":
      return { label: "Expired", tone: "red" };
    case "declined":
      return { label: "Declined", tone: "red" };
    case "deposit_due":
      return { label: "Deposit due", tone: "amber" };
    case "confirm_deposit":
    case "confirm_payment":
      return { label: "Confirm payment", tone: "red" };
    case "balance_due":
      return { label: "Signed", tone: "green" };
    case "paid":
      return { label: "Paid", tone: "green" };
    case "cancelled":
      // Signed by both, then ended — not the same as never agreed.
      return b.signed_at ? { label: "Cancelled", tone: "grey" } : { label: "Void", tone: "grey" };
  }
}

type Filter = "all" | "needs_you" | "waiting" | "signed" | "closed";
const closed = (s: ContractStatus) => s === "cancelled" || s === "declined";
const FILTER_TEST: Record<Filter, (s: ContractStatus) => boolean> = {
  // Everything, so the tabs add up (web #167).
  all: () => true,
  needs_you: contractNeedsVendor,
  waiting: (s) => s === "awaiting_signature",
  signed: (s) => ["deposit_due", "balance_due", "paid", "confirm_deposit", "confirm_payment"].includes(s),
  closed,
};

function initials(name?: string | null): string {
  const parts = (name ?? "").replace(/&/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "·") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function prettyDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function prettyDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Where an unsigned offer stands — opened yet, and how long the date is held. */
function offerLine(b: VendorBooking, s: ContractStatus): string | null {
  if (s === "draft") return "Not sent — the date isn't held";
  if (s === "changes_waiting") {
    const n = changesWaiting(b);
    return `${clientOf(b)} asked for ${n === 1 ? "a change" : `${n} changes`} — answer them`;
  }
  if (s === "countersign") {
    return `${b.signer_name || clientOf(b)} signed${b.client_signed_at ? ` ${prettyDate(b.client_signed_at)}` : ""} — add your signature to book it`;
  }
  if (s === "cancelled" && b.signed_at) {
    return `Cancelled after signing${b.vendor_decline_note ? ` — “${b.vendor_decline_note}”` : ""}`;
  }
  if (b.signed_at && b.signer_name) {
    // Who signed, and whether that's who the contract is for (#167).
    const mismatch = b.guest_name && !signerMatches(b.signer_name, b.guest_name) ? ` — the contract is for ${b.guest_name}` : "";
    return `Signed by ${b.signer_name} ${prettyDate(b.signed_at)}${mismatch}`;
  }
  if (s === "declined") return `Declined${b.decline_reason ? ` — “${b.decline_reason}”` : ""}`;
  if (s !== "awaiting_signature" && s !== "expired") return null;
  const seen = b.viewed_at ? `Opened ${prettyDate(b.viewed_at)}` : "Not opened yet";
  if (!b.hold_expires_at) return seen;
  return s === "expired"
    ? `${seen} · hold ended ${prettyDay(b.hold_expires_at)} — date released`
    : `${seen} · date held until ${prettyDay(b.hold_expires_at)}`;
}

const clientOf = (b: VendorBooking) => b.guest_name || b.client_name || "Client";
const titleOf = (b: VendorBooking) =>
  b.document_title || b.event_name || `${b.service_name || "Services"} agreement`;

/** The latest thing that happened to it. */
function lastModified(b: VendorBooking): string | null {
  const stamps = [b.created_at, b.sent_at, b.viewed_at, b.signed_at, b.declined_at].filter(Boolean) as string[];
  return stamps.length ? stamps.sort().at(-1)! : null;
}

// ── Gallery ──────────────────────────────────────────────────────────

function DocPreview({ brand, title, foot }: { brand: string; title: string; foot: string }) {
  return (
    <span className="relative flex h-36 flex-col rounded-t-xl border-b border-card-edge bg-ground-2 px-4 pt-4">
      <span className="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-gold">{brand}</span>
      <span className="serif mt-2 text-sm leading-tight text-ink">{title}</span>
      <span className="mt-3 grid gap-1.5">
        {[90, 75, 85, 60].map((w) => (
          <i key={w} className="block h-1 rounded-full bg-ink/10" style={{ width: `${w}%` }} />
        ))}
      </span>
      <span className="absolute bottom-3 right-4 border-t border-ink/20 pt-0.5 text-[0.55rem] text-ink-faint">{foot}</span>
    </span>
  );
}

function GalleryCard({
  href,
  disabled,
  preview,
  name,
  note,
}: {
  href?: string;
  disabled?: boolean;
  preview: React.ReactNode;
  name: string;
  note: string;
}) {
  const body = (
    <>
      {preview}
      <span className="grid px-4 py-3">
        <strong className="truncate text-sm text-ink">{name}</strong>
        <small className="truncate text-xs text-ink-faint">{note}</small>
      </span>
    </>
  );
  const cls = "flex flex-col overflow-hidden rounded-xl border border-card-edge bg-card text-left shadow-[var(--shadow-card)]";
  return href && !disabled ? (
    <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:border-line`}>
      {body}
    </Link>
  ) : (
    <div aria-disabled="true" className={`${cls} opacity-60`}>
      {body}
    </div>
  );
}

/** One template's row: what it is, how to use it, and how to change it. */
function TemplateRow({
  name,
  tag,
  use,
  edit,
  busy,
  onRename,
  onDuplicate,
  onDelete,
  deleteLabel = "Delete",
}: {
  name: string;
  tag?: string | null;
  use: { href: string; label: string };
  edit?: string;
  busy: boolean;
  onRename?: (name: string) => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const action = "text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-50";
  return (
    <li className="grid gap-2 rounded-xl border border-card-edge bg-card px-3.5 py-3">
      {renaming && onRename ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftName.trim()) return;
            onRename(draftName.trim());
            setRenaming(false);
          }}
        >
          <input
            aria-label="Template name"
            value={draftName}
            maxLength={120}
            onChange={(e) => setDraftName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-card-edge bg-ground-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-gold"
          />
          <Button type="submit" variant="ghost" size="md" disabled={!draftName.trim()}>
            Save
          </Button>
        </form>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm text-ink">{name}</strong>
          {tag ? (
            <span className="shrink-0 rounded-[6px] bg-gold/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.06em] text-gold">
              {tag}
            </span>
          ) : null}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={use.href} className="text-xs font-semibold text-gold">
          {use.label}
        </Link>
        {edit ? (
          <Link href={edit} className="text-xs font-semibold text-ink-soft hover:text-ink">
            Edit
          </Link>
        ) : null}
        {onRename && !renaming ? (
          <button type="button" className={action} disabled={busy} onClick={() => setRenaming(true)}>
            Rename
          </button>
        ) : null}
        <button type="button" className={action} disabled={busy} onClick={onDuplicate}>
          Duplicate
        </button>
        {onDelete ? (
          <button type="button" className={action} disabled={busy} onClick={onDelete}>
            {deleteLabel}
          </button>
        ) : null}
      </span>
    </li>
  );
}

/** Every template the vendor can start from or change (backend DECISIONS
 *  #31): each package's, their own, and their addenda and cancellations. */
function ManageTemplates({
  open,
  onClose,
  packages,
  saved,
  documents,
  busy,
  status,
  onRename,
  onDuplicate,
  onDelete,
}: {
  open: boolean;
  /** What the last change did, or why it didn't. */
  status: { text: string; error: boolean } | null;
  onClose: () => void;
  packages: TemplateChoice[];
  saved: TemplateChoice[];
  documents: SavedContractTemplate[];
  busy: boolean;
  onRename: (templateId: string, name: string) => void;
  onDuplicate: (name: string, body: TemplateBody, kind?: TemplateKind) => void;
  onDelete: (templateId: string, reset?: boolean) => void;
}) {
  const heading = "text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint";
  return (
    <Drawer open={open} onClose={onClose} title="Your templates" subtitle="Start a contract from one, or change how it starts.">
      <div className="grid gap-5">
        {status ? (
          <p
            role={status.error ? "alert" : "status"}
            className={`rounded-lg px-3 py-2 text-sm ${status.error ? "bg-maroon/10 text-maroon dark:text-gold" : "bg-green/10 text-green"}`}
          >
            {status.text}
          </p>
        ) : null}
        <section aria-label="Package templates" className="grid gap-2">
          <p className={heading}>Your packages</p>
          <p className="-mt-1 text-xs text-ink-faint">
            Each package has a template that follows its price and details until you edit it.
          </p>
          <ul className="grid gap-2">
            {packages.map((p) => (
              <TemplateRow
                key={p.id}
                name={p.name}
                tag={p.edited ? "Edited" : null}
                use={{ href: `/contracts/new?package=${p.serviceId}`, label: "Start a contract from it" }}
                edit={`/contracts/template?package=${p.serviceId}`}
                busy={busy}
                onRename={p.templateId ? (name) => onRename(p.templateId!, name) : undefined}
                onDuplicate={() => onDuplicate(p.name, p.body)}
                onDelete={p.templateId ? () => onDelete(p.templateId!, true) : undefined}
                deleteLabel="Reset to package"
              />
            ))}
          </ul>
        </section>

        <section aria-label="Saved templates" className="grid gap-2">
          <p className={heading}>Your templates</p>
          {saved.length === 0 ? (
            <p className="text-sm text-ink-faint">
              None yet. Duplicate a package&apos;s, or use &ldquo;Save as a template&rdquo; in the contract editor&apos;s ⋯ menu.
            </p>
          ) : (
            <ul className="grid gap-2">
              {saved.map((t) => (
                <TemplateRow
                  key={t.id}
                  name={t.name}
                  use={{ href: `/contracts/new?template=${t.templateId}`, label: "Start a contract from it" }}
                  edit={`/contracts/template?id=${t.templateId}`}
                  busy={busy}
                  onRename={(name) => onRename(t.templateId!, name)}
                  onDuplicate={() => onDuplicate(t.name, t.body)}
                  onDelete={() => onDelete(t.templateId!)}
                />
              ))}
            </ul>
          )}
        </section>

        {documents.length ? (
          <section aria-label="Document templates" className="grid gap-2">
            <p className={heading}>Addenda and cancellations</p>
            <ul className="grid gap-2">
              {documents.map((t) => (
                <TemplateRow
                  key={t.template_id}
                  name={t.name}
                  use={{
                    href: `/contracts/document?kind=${t.kind}&template=${t.template_id}`,
                    label: `New ${KIND_LABEL[t.kind as "addendum" | "cancellation"].toLowerCase()} from it`,
                  }}
                  busy={busy}
                  onRename={(name) => onRename(t.template_id, name)}
                  onDuplicate={() => onDuplicate(t.name, t.body as unknown as TemplateBody, t.kind)}
                  onDelete={() => onDelete(t.template_id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [contracts, setContracts] = useState<VendorBooking[] | null>(null);
  const [templates, setTemplates] = useState<SavedContractTemplate[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [editingDefaults, setEditingDefaults] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/contracts&role=vendor");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyVendor()
      .then(async (mine) => {
        if (cancelled) return;
        if (!mine) {
          router.replace("/vendor-onboarding");
          return;
        }
        setVendor(mine);
        const [res, tpl, svc] = await Promise.all([
          listVendorBookings(mine.vendor_id, { limit: 100 }),
          loadTemplates().catch(() => [] as SavedContractTemplate[]),
          listMyServices(mine.vendor_id).catch(() => null),
        ]);
        if (cancelled) return;
        setContracts(res.items.filter((b) => b.contract_token));
        setTemplates(tpl);
        setServices(svc?.items ?? []);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your contracts."));
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contracts ?? [])
      .map((b) => ({ b, s: contractStatus(b) }))
      .filter(({ b, s }) => FILTER_TEST[filter](s) && (!q || [titleOf(b), clientOf(b)].some((v) => v.toLowerCase().includes(q))))
      .sort((x, y) => {
        // Needs-you first — the reason most visits happen — then most recent.
        const nx = contractNeedsVendor(x.s) ? 0 : 1;
        const ny = contractNeedsVendor(y.s) ? 0 : 1;
        if (nx !== ny) return nx - ny;
        return (lastModified(y.b) ?? "").localeCompare(lastModified(x.b) ?? "");
      });
  }, [contracts, filter, query]);

  function replace(updated: VendorBooking) {
    setContracts((cs) => cs?.map((c) => (c.booking_id === updated.booking_id ? { ...c, ...updated } : c)) ?? cs);
  }

  async function copyLink(b: VendorBooking) {
    if (!b.contract_token) return;
    try {
      await navigator.clipboard.writeText(guestBookingLink(b.contract_token));
      setCopiedId(b.booking_id);
      setTimeout(() => setCopiedId((id) => (id === b.booking_id ? null : id)), 2000);
    } catch {
      setError("Couldn't copy — open the contract and copy the link from there.");
    }
  }

  async function act(b: VendorBooking, fn: () => Promise<VendorBooking | unknown>, done: string) {
    setBusyId(b.booking_id);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "booking_id" in res) replace(res as VendorBooking);
      setNotice(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusyId(null);
      setConfirmVoidId(null);
    }
  }

  const [templateBusy, setTemplateBusy] = useState(false);

  // The drawer shows what its own changes did, not the page's last notice.
  function openManaging() {
    setNotice(null);
    setError(null);
    setManaging(true);
  }

  /** A change to the templates, then the list as the account has it. */
  async function changeTemplates(fn: () => Promise<unknown>, done: string) {
    setTemplateBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change that template.");
    } finally {
      setTemplates(await loadTemplates().catch(() => templates));
      setTemplateBusy(false);
    }
  }

  if (error && !contracts) return <p className="py-20 text-center text-ink-soft">{error}</p>;
  if (authLoading || !user || !contracts || !vendor) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const brand = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ") || "Your business";
  const choices = templateChoices(services, templates);
  // The first few packages here; every one is in Send a contract's list.
  const shownPackages = choices.packages.slice(0, 2);
  const morePackages = choices.packages.length - shownPackages.length;
  const count = (f: Filter) => (contracts ?? []).filter((b) => FILTER_TEST[f](contractStatus(b))).length;

  return (
    <div>
      <PageHeader
        eyebrow="Document workspace"
        title="Contracts"
        subtitle="Create, send and manage every client agreement in one place."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingDefaults(true)}
              className="inline-flex h-10 items-center rounded-[11px] border border-line px-4 text-sm font-semibold text-ink-soft transition hover:text-ink"
            >
              Defaults
            </button>
            <NewMenu />
          </div>
        }
      />

      {editingDefaults ? (
        <ContractDefaultsDrawer
          open
          onClose={() => setEditingDefaults(false)}
          vendor={vendor}
          onSaved={(v) => {
            setVendor(v);
            setNotice("Defaults saved. New contracts start from them.");
          }}
        />
      ) : null}

      <section aria-label="Template gallery">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Template gallery</p>
            <p className="serif mt-1 text-lg text-ink">Start a new contract</p>
          </div>
          <button type="button" onClick={openManaging} className="text-sm font-semibold text-gold">
            Manage templates
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <GalleryCard
            href="/contracts/new?scratch=1"
            preview={
              <span className="grid h-36 place-items-center rounded-t-xl border-b border-dashed border-line bg-ground-2 text-3xl text-ink-faint">
                +
              </span>
            }
            name="Start from scratch"
            note="Your usual terms, no items yet"
          />
          {shownPackages.map((p) => (
            <GalleryCard
              key={p.id}
              href={`/contracts/new?package=${p.serviceId}`}
              preview={<DocPreview brand={brand} title={p.body.title || `${p.name} agreement`} foot="Signature" />}
              name={p.name}
              note={p.edited ? "Your edited template" : `Package · ${money(Math.round((p.price ?? 0) * 100))}`}
            />
          ))}
          <GalleryCard
            href="/contracts/document?kind=addendum"
            preview={<DocPreview brand={brand} title="Service addendum" foot="Signature" />}
            name="Service addendum"
            note="Changes to a signed booking"
          />
          <GalleryCard
            href="/contracts/document?kind=cancellation"
            preview={<DocPreview brand={brand} title="Cancellation agreement" foot="Signature" />}
            name="Cancellation agreement"
            note="Ends a signed booking, in writing"
          />
        </div>
        {morePackages > 0 || choices.saved.length > 0 ? (
          <p className="mt-2 text-xs text-ink-faint">
            {[
              morePackages > 0 ? `${morePackages} more package${morePackages === 1 ? "" : "s"}` : null,
              choices.saved.length > 0 ? `${choices.saved.length} saved template${choices.saved.length === 1 ? "" : "s"}` : null,
            ]
              .filter(Boolean)
              .join(" and ")}{" "}
            in{" "}
            <Link href="/contracts/new" className="font-semibold text-gold">
              Send a contract
            </Link>
            .
          </p>
        ) : null}
      </section>

      {notice ? <p className="mt-6 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">{notice}</p> : null}
      {error ? (
        <p role="alert" className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <section
        aria-label="Document library"
        className="mt-6 rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Document library</p>
            <p className="serif mt-1 text-lg text-ink">Your contracts</p>
          </div>
          <label className="flex h-9 w-full items-center gap-2 rounded-[9px] border border-line bg-ground-2 px-2.5 text-ink-faint focus-within:border-gold sm:w-64">
            <Icon name="search" size={15} />
            <input
              aria-label="Search contracts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contracts"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </label>
        </div>
        <div className="mt-4 min-w-0 max-w-full">
          <FilterTabs<Filter>
            label="Contract status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: count("all") },
              { value: "needs_you", label: "Needs you", count: count("needs_you") },
              { value: "waiting", label: "Waiting on client", count: count("waiting") },
              { value: "signed", label: "Signed", count: count("signed") },
              { value: "closed", label: "Declined & void", count: count("closed") },
            ]}
          />
        </div>

        <div
          aria-hidden="true"
          className="mt-4 hidden grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_8rem_7rem_17rem] gap-3.5 px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-ink-faint md:grid"
        >
          <span />
          <span>Name</span>
          <span>Client</span>
          <span>Status</span>
          <span>Last modified</span>
          <span />
        </div>
        <ul>
          {rows.map(({ b, s }) => {
            const st = statusLabel(b, s);
            // A draft opens in the builder; anything sent or signed, read-only.
            const href = s === "draft" ? `/contracts/new?edit=${b.booking_id}` : `/contracts/view?id=${b.booking_id}`;
            const sendable = s === "draft" || s === "expired";
            const live = s === "awaiting_signature" || s === "expired" || s === "draft";
            return (
              <li key={b.booking_id} className="border-t border-line-soft">
                <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3.5 px-3 py-3 md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_8rem_7rem_17rem]">
                  <span className="grid size-8 place-items-center rounded-lg bg-gold-bright/15 text-gold">
                    <Icon name="contract" size={17} />
                  </span>
                  <Link href={href} className="grid min-w-0">
                    <strong className="truncate text-sm text-ink hover:underline">{titleOf(b)}</strong>
                    <small className="truncate text-xs text-ink-faint">
                      {offerLine(b, s) ?? (b.date_iso ? `Event ${prettyDate(b.date_iso)}` : "Contract document")}
                      <span className="md:hidden"> · {clientOf(b)}</span>
                    </small>
                  </Link>
                  <span className="hidden min-w-0 items-center gap-2 text-sm text-ink-soft md:flex">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-maroon/10 text-[0.65rem] font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                      {initials(clientOf(b))}
                    </span>
                    <span className="truncate">{clientOf(b)}</span>
                  </span>
                  <span className="justify-self-end md:justify-self-start">
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </span>
                  <span className="hidden text-xs text-ink-faint md:block">{prettyDate(lastModified(b))}</span>
                  <span className="col-span-3 flex flex-wrap items-center justify-end gap-1 md:col-span-1">
                    {s === "changes_waiting" ? (
                      <Link href={`/contracts/changes?id=${b.booking_id}`} className="px-2 py-1 text-xs font-semibold text-gold">
                        Answer
                      </Link>
                    ) : s === "countersign" ? (
                      <Link href={`/contracts/view?id=${b.booking_id}`} className="px-2 py-1 text-xs font-semibold text-gold">
                        Sign
                      </Link>
                    ) : contractNeedsVendor(s) && s !== "draft" && s !== "expired" ? (
                      <Link
                        href={b.payment_schedule?.length ? `/contracts/view?id=${b.booking_id}` : `/my-bookings?id=${b.booking_id}`}
                        className="px-2 py-1 text-xs font-semibold text-gold"
                      >
                        {s === "confirm_deposit" ? "Confirm deposit" : "Confirm payment"}
                      </Link>
                    ) : null}
                    {sendable ? (
                      <button
                        type="button"
                        disabled={busyId === b.booking_id}
                        onClick={() =>
                          act(b, () => sendContract(b.booking_id), s === "draft" ? "Sent — the date is held." : "Resent — the date is held again.")
                        }
                        className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
                      >
                        {s === "draft" ? "Send" : "Resend & hold date"}
                      </button>
                    ) : null}
                    {b.contract_token && s !== "cancelled" && s !== "declined" ? (
                      <button type="button" onClick={() => copyLink(b)} className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink">
                        {copiedId === b.booking_id ? "Copied!" : "Copy link"}
                      </button>
                    ) : null}
                    {b.contract_token ? (
                      <a
                        href={guestBookingPreviewLink(b.contract_token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                      >
                        View as client
                      </a>
                    ) : null}
                    {live ? (
                      <button
                        type="button"
                        onClick={() => setConfirmVoidId(b.booking_id)}
                        className="px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink"
                      >
                        Void
                      </button>
                    ) : null}
                  </span>
                </div>
                {confirmVoidId === b.booking_id ? (
                  <div className="mx-3 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel px-3.5 py-2.5">
                    <p className="text-sm text-ink-soft">Void this contract? The link stops working and the date opens up.</p>
                    <span className="flex gap-2">
                      <Button disabled={busyId === b.booking_id} onClick={() => act(b, () => voidContract(b.booking_id), "Voided.")}>
                        Void contract
                      </Button>
                      <Button variant="quiet" onClick={() => setConfirmVoidId(null)}>
                        Keep it
                      </Button>
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {rows.length === 0 ? (
          contracts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-ink-faint">
                No contracts yet. Create one and send the link — your client fills in their details and signs.
              </p>
              <Link href="/contracts/new" className="mt-3 inline-block text-sm font-semibold text-gold">
                Create your first contract
              </Link>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-ink-faint">No contracts match.</p>
          )
        ) : null}
      </section>

      <ManageTemplates
        open={managing}
        onClose={() => setManaging(false)}
        packages={choices.packages}
        saved={choices.saved}
        documents={templates.filter((t) => t.kind === "addendum" || t.kind === "cancellation")}
        busy={templateBusy}
        status={error ? { text: error, error: true } : notice ? { text: notice, error: false } : null}
        onRename={(id, name) => void changeTemplates(() => renameTemplate(id, name), `Renamed to “${name}”.`)}
        onDuplicate={(name, body, kind) =>
          void changeTemplates(() => duplicateTemplate(name, body, kind), `Copied “${name}” to your templates.`)
        }
        onDelete={(id, reset) =>
          void changeTemplates(
            () => deleteTemplate(id),
            reset ? "Back to the package's own template — it follows the package again." : "Template deleted.",
          )
        }
      />
    </div>
  );
}
