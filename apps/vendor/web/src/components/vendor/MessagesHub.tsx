"use client";

// The vendor's Messages (plan step 4 of the 2026-10 redesign): the Figma
// design's hub — conversations on the left, the open thread in the middle,
// and on the right what this couple is to the vendor (their lead or booking,
// the event, the contract) with "Add to leads" and "Mark as unread".
//
// Messages is conversation only. Price offers that arrive in a thread link
// to the lead's drawer; nothing here accepts, counters or sends a contract.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  getMyVendor,
  getPipeline,
  leadFromConversation,
  listConversations,
  listVendorBookings,
  markConversationUnread,
  openBookingThread,
} from "@/lib/jorna";
import { centsToMoney } from "@/lib/vendorPlan";
import { LABEL_TEXT, relationFor, showInInbox, tabFor, type MessageLabel, type Relation } from "@/lib/messageLabels";
import type { ConversationSummary, Pipeline, VendorBooking } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";
import { ModerationMenu } from "@/components/ModerationMenu";
import { ConversationThread, type OfferLink } from "@/components/ConversationThread";
import { Drawer, FilterTabs, PageHeader, PrimaryAction, StatusPill, type Tone } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";

type Filter = "all" | "enquiries" | "bookings" | "unread";

// Inquiry and Booked match the Leads and Bookings pages' own pills.
const LABEL_TONE: Record<MessageLabel, Tone> = {
  inquiry: "amber",
  negotiation: "maroon",
  booked: "green",
  closed: "grey",
};

function initials(name?: string | null): string {
  const parts = (name ?? "").replace(/&/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "·") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = Date.parse(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function prettyDate(s?: string | null): string {
  if (!s || s === "TBD") return "TBD";
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  return new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const title = (c: ConversationSummary) => c.name || "Conversation";

function DetailRow({ icon, label, value }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-gold">
        <Icon name={icon} size={16} />
      </span>
      <span className="grid min-w-0">
        <small className="text-[0.68rem] text-ink-faint">{label}</small>
        <strong className="truncate text-sm text-ink">{value}</strong>
      </span>
    </div>
  );
}

/** Starting a chat is limited to couples the vendor already has a lead or
 *  booking with (plan): account bookings and requests, opened by their own
 *  booking thread. Guest contracts have no account to message. */
function NewMessagePicker({
  open,
  onClose,
  bookings,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  bookings: VendorBooking[];
  onOpened: (conversationId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choices = bookings.filter(
    (b) => !b.is_guest_booking && b.user_id && !["rejected", "cancelled"].includes(b.status),
  );
  async function start(b: VendorBooking) {
    setBusy(b.booking_id);
    setError(null);
    try {
      const conv = await openBookingThread(b.booking_id);
      onOpened(conv.conversation_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that conversation.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Drawer open={open} onClose={onClose} title="New message" subtitle="Message a client you have a lead or booking with.">
      {choices.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No clients to message yet. Clients who book or send a request through Jorna appear here.
        </p>
      ) : (
        <ul className="grid gap-2">
          {choices.map((b) => (
            <li key={b.booking_id}>
              <button
                type="button"
                disabled={busy != null}
                onClick={() => start(b)}
                className="flex w-full items-center gap-3 rounded-xl border border-card-edge bg-card px-3.5 py-3 text-left hover:border-line disabled:opacity-60"
              >
                <span className="grid size-9 place-items-center rounded-full bg-maroon/10 text-xs font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                  {initials(b.client_name)}
                </span>
                <span className="grid min-w-0">
                  <strong className="truncate text-sm text-ink">{b.client_name || "Client"}</strong>
                  <small className="truncate text-xs text-ink-faint">
                    {[b.service_name, prettyDate(b.date_iso)].filter(Boolean).join(" · ")}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-3 text-sm text-maroon dark:text-gold">{error}</p> : null}
    </Drawer>
  );
}

export function MessagesHub() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");

  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [live, setLive] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your messages.");
    }
  }, []);

  /** Bookings and the leads pipeline: what each thread is to the vendor.
   *  Null for whichever couldn't be loaded, so a failed refresh keeps the
   *  last good copy instead of wiping every label. */
  const fetchContext = useCallback(async () => {
    const mine = await getMyVendor().catch(() => null);
    const [b, p] = await Promise.all([
      mine ? listVendorBookings(mine.vendor_id, { limit: 100 }).then((r) => r.items).catch(() => null) : Promise.resolve(null),
      getPipeline().catch(() => null),
    ]);
    return { bookings: b, pipeline: p };
  }, []);

  const applyContext = useCallback((ctx: { bookings: VendorBooking[] | null; pipeline: Pipeline | null }) => {
    if (ctx.bookings) setBookings(ctx.bookings);
    if (ctx.pipeline) setPipeline(ctx.pipeline);
  }, []);

  // The list has no socket of its own; a slow poll moves a thread up and bumps
  // its count when a message arrives elsewhere.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = () =>
      listConversations()
        .then((c) => !cancelled && setConversations(c))
        .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your messages."));
    // Labels come from the pipeline and bookings, so they refresh with the
    // list: a request or a signature elsewhere shows here without a reload.
    const refreshContext = () => fetchContext().then((ctx) => !cancelled && applyContext(ctx));
    refresh();
    refreshContext();
    const poll = setInterval(() => {
      refresh();
      refreshContext();
    }, 25000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [user, fetchContext, applyContext]);

  const select = useCallback(
    (id: string | null) => {
      setNotice(null);
      router.replace(id ? `/messages?id=${id}` : "/messages");
      // Opening a thread reads it; mirror that here instead of waiting a poll.
      if (id) setConversations((cs) => cs?.map((c) => (c.conversation_id === id ? { ...c, unread_count: 0 } : c)) ?? cs);
    },
    [router],
  );

  // The open thread is being read, so it counts as read here — including
  // when it was opened straight from a link, before any click.
  const sorted = useMemo(
    () =>
      [...(conversations ?? [])]
        .map((c) => (c.conversation_id === selectedId ? { ...c, unread_count: 0 } : c))
        .sort((a, b) =>
        (b.last_message?.created_at ?? b.created_at ?? "").localeCompare(a.last_message?.created_at ?? a.created_at ?? ""),
      ),
    [conversations, selectedId],
  );
  // Worked out once per thread: the list, its tabs and the open thread all
  // read the same answer.
  const relations = useMemo(() => {
    const out = new Map<string, Relation>();
    for (const c of sorted) out.set(c.conversation_id, relationFor(c, bookings, pipeline, user?.user_id));
    return out;
  }, [sorted, bookings, pipeline, user?.user_id]);
  const inbox = sorted.filter(showInInbox);
  const inTab = (c: ConversationSummary, f: Filter) => {
    if (f === "all") return true;
    if (f === "unread") return (c.unread_count ?? 0) > 0;
    const r = relations.get(c.conversation_id);
    return r != null && tabFor(r) === f;
  };
  const q = query.trim().toLowerCase();
  const shown = inbox.filter(
    (c) =>
      inTab(c, filter) &&
      (!q || title(c).toLowerCase().includes(q) || (c.last_message?.content ?? "").toLowerCase().includes(q)),
  );
  const unreadThreads = inbox.filter((c) => inTab(c, "unread")).length;
  // A plan chat isn't listed, but a link to one (an older email) still opens it.
  const selected = sorted.find((c) => c.conversation_id === selectedId) ?? null;
  const relation = selected ? (relations.get(selected.conversation_id) ?? null) : null;
  const otherMember =
    selected?.members && selected.members.length === 2
      ? selected.members.find((m) => m.user_id !== user?.user_id)
      : undefined;
  const canAddLead = Boolean(selected && relation?.kind === "none" && otherMember);

  const vendorOfferLink: OfferLink = (c) => ({
    href: c?.booking_id ? `/leads?open=${encodeURIComponent(`booking:${c.booking_id}`)}` : "/leads",
    label: "Answer in Leads",
  });

  async function addToLeads() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await leadFromConversation(selected.conversation_id);
      applyContext(await fetchContext());
      setNotice("Added to your leads.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add them to your leads.");
    } finally {
      setBusy(false);
    }
  }

  /** Closes the thread: it re-reads its messages every few seconds while
   *  open, and reading is what clears the mark. */
  async function markUnread() {
    if (!selected) return;
    const id = selected.conversation_id;
    setBusy(true);
    try {
      await markConversationUnread(id);
      setConversations((cs) => cs?.map((c) => (c.conversation_id === id ? { ...c, unread_count: Math.max(1, c.unread_count ?? 0) } : c)) ?? cs);
      router.replace("/messages");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark it unread.");
    } finally {
      setBusy(false);
    }
  }

  if (!user || conversations == null) {
    return error ? (
      <p className="py-20 text-center text-ink-soft">{error}</p>
    ) : (
      <p className="py-20 text-center text-ink-soft">Loading…</p>
    );
  }

  const relationActions = (
    <>
      {relation?.href ? (
        <Link
          href={relation.href}
          className="inline-flex items-center justify-center rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04]"
        >
          {relation.linkLabel}
        </Link>
      ) : null}
      {canAddLead ? (
        <Button variant="ghost" disabled={busy} onClick={addToLeads}>
          Add to leads
        </Button>
      ) : null}
      <button type="button" disabled={busy} onClick={markUnread} className="text-sm font-semibold text-gold disabled:opacity-50">
        Mark as unread
      </button>
    </>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Client communication"
        title="Messages"
        subtitle="Every client's conversation, organised and moving forward."
        action={<PrimaryAction onClick={() => setPicking(true)}>New message</PrimaryAction>}
      />

      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mb-3 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">{notice}</p> : null}

      <section
        aria-label="Messages"
        className="grid overflow-hidden rounded-2xl border border-card-edge bg-card shadow-[var(--shadow-card)] md:h-[calc(100vh-13rem)] md:min-h-[34rem] md:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_17rem]"
      >
        {/* Conversations. On a phone, the list or the thread, not both. */}
        <aside
          aria-label="Conversations"
          className={`min-h-0 flex-col border-line-soft md:flex md:border-r ${selected ? "hidden" : "flex"}`}
        >
          <div className="flex items-end justify-between gap-2 px-4 pb-3 pt-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Inbox</p>
              <p className="serif mt-0.5 text-lg text-ink">Conversations</p>
            </div>
            {unreadThreads > 0 ? <StatusPill tone="amber">{unreadThreads} unread</StatusPill> : null}
          </div>
          <label className="mx-4 flex h-9 items-center gap-2 rounded-[9px] border border-line bg-ground-2 px-2.5 text-ink-faint focus-within:border-gold">
            <Icon name="search" size={15} />
            <input
              aria-label="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </label>
          <div className="mx-4 mt-3 mb-2">
            <FilterTabs<Filter>
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "enquiries", label: "Enquiries", count: inbox.filter((c) => inTab(c, "enquiries")).length },
                { value: "bookings", label: "Bookings", count: inbox.filter((c) => inTab(c, "bookings")).length },
                { value: "unread", label: "Unread", count: unreadThreads },
              ]}
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((c) => {
              const unread = c.unread_count ?? 0;
              const active = c.conversation_id === selectedId;
              const r = relations.get(c.conversation_id);
              return (
                <li key={c.conversation_id}>
                  <button
                    type="button"
                    onClick={() => select(c.conversation_id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-2.5 border-t border-line-soft px-4 py-3 text-left transition ${
                      active ? "bg-panel" : "hover:bg-panel/50"
                    }`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-maroon/10 text-[0.7rem] font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                      {initials(title(c))}
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <strong className={`truncate text-sm ${unread ? "text-ink" : "text-ink-soft"}`}>{title(c)}</strong>
                        <small className="shrink-0 text-[0.68rem] text-ink-faint">
                          {timeAgo(c.last_message?.created_at ?? c.created_at)}
                        </small>
                      </span>
                      {r?.label ? (
                        <span className="mt-1 flex min-w-0 items-center gap-1.5">
                          <StatusPill tone={LABEL_TONE[r.label]} dot>
                            {LABEL_TEXT[r.label]}
                          </StatusPill>
                          {r.pkg ? <span className="truncate text-[0.68rem] text-ink-faint">{r.pkg}</span> : null}
                        </span>
                      ) : null}
                      <span className="truncate text-xs text-ink-faint">{c.last_message?.content || "No messages yet"}</span>
                    </span>
                    {unread > 0 ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-[6px] bg-gold-bright px-1 text-[0.65rem] font-bold text-[#2a0c19]">
                        {unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-faint">
              {inbox.length === 0 ? "No conversations yet." : "No conversations found."}
            </p>
          ) : null}
        </aside>

        {/* The thread. */}
        <div className={`min-h-0 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
                <button
                  type="button"
                  onClick={() => select(null)}
                  aria-label="Back to conversations"
                  className="grid size-9 place-items-center rounded-[10px] border border-line text-ink-soft md:hidden"
                >
                  <Icon name="chevron" size={16} className="rotate-180" />
                </button>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-maroon/10 text-xs font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                  {initials(title(selected))}
                </span>
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-sm text-ink">{title(selected)}</strong>
                  <small className="text-xs text-ink-faint">
                    {relation?.label
                      ? LABEL_TEXT[relation.label]
                      : selected.subject_type === "enquiry"
                        ? "A question"
                        : "Conversation"}
                    {" · "}
                    <span className={live ? "text-green" : ""}>{live ? "Live" : "Connecting…"}</span>
                  </small>
                </span>
                {otherMember ? (
                  <span className="hidden sm:block">
                    <ModerationMenu
                      targetType="conversation"
                      targetId={selected.conversation_id}
                      blockUserId={otherMember.user_id}
                      label="this person"
                    />
                  </span>
                ) : null}
              </div>
              {/* Below xl the side panel is hidden; its actions sit here (and,
                  on a phone, report/block, which the header has no room for). */}
              <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2 xl:hidden">
                {relationActions}
                {otherMember ? (
                  <span className="ml-auto sm:hidden">
                    <ModerationMenu
                      targetType="conversation"
                      targetId={selected.conversation_id}
                      blockUserId={otherMember.user_id}
                      label="this person"
                    />
                  </span>
                ) : null}
              </div>
              <ConversationThread
                key={selected.conversation_id}
                className="min-h-[24rem] flex-1 p-3"
                conversationId={selected.conversation_id}
                currentUserId={user.user_id}
                conversation={selected}
                offerLink={vendorOfferLink}
                onLive={setLive}
                placeholder={`Message ${title(selected)}`}
              />
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-10 text-center">
              <div>
                <Icon name="messages" size={28} className="mx-auto text-ink-faint" />
                <p className="mt-2 text-sm text-ink-faint">Pick a conversation to read it here.</p>
              </div>
            </div>
          )}
        </div>

        {/* Who this is and what they're booking. */}
        <aside aria-label="Details" className="hidden min-h-0 overflow-y-auto border-l border-line-soft bg-ground-2/60 p-5 xl:block">
          {selected && relation ? (
            <>
              <div className="grid justify-items-center pb-5 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-maroon/10 text-sm font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                  {initials(title(selected))}
                </span>
                <strong className="mt-2 text-sm text-ink">{title(selected)}</strong>
                {relation.label ? (
                  <span className="mt-1.5">
                    <StatusPill tone={LABEL_TONE[relation.label]}>{LABEL_TEXT[relation.label]}</StatusPill>
                  </span>
                ) : null}
              </div>
              {relation.kind !== "none" ? (
                <div className="grid gap-3 border-t border-line-soft py-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Event details</p>
                  <DetailRow icon="calendar" label="Date" value={prettyDate(relation.date)} />
                  <DetailRow icon="profile" label="Venue" value={relation.venue || "TBD"} />
                  <DetailRow icon="sparkles" label="Package" value={relation.pkg || "—"} />
                  <DetailRow
                    icon="earnings"
                    label="Value"
                    value={relation.valueCents != null ? centsToMoney(relation.valueCents) : "—"}
                  />
                </div>
              ) : (
                <p className="border-t border-line-soft py-4 text-sm text-ink-faint">
                  Not a lead or booking yet.
                </p>
              )}
              {relation.contractId ? (
                <div className="grid gap-2 border-t border-line-soft py-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Shared documents</p>
                  <Link
                    href={`/contracts/view?id=${relation.contractId}`}
                    className="flex items-center gap-2.5 rounded-xl border border-card-edge bg-card px-3 py-2.5"
                  >
                    <span className="text-gold">
                      <Icon name="contract" size={16} />
                    </span>
                    <span className="grid flex-1">
                      <strong className="text-sm text-ink">Service agreement</strong>
                      <small className="text-xs text-ink-faint">Contract</small>
                    </span>
                    <Icon name="chevron" size={14} className="text-ink-faint" />
                  </Link>
                </div>
              ) : null}
              <div className="grid justify-items-center gap-2.5 border-t border-line-soft pt-4">{relationActions}</div>
            </>
          ) : (
            <p className="text-sm text-ink-faint">Details about the client show here.</p>
          )}
        </aside>
      </section>

      <NewMessagePicker
        open={picking}
        onClose={() => setPicking(false)}
        bookings={bookings}
        onOpened={(id) => {
          setPicking(false);
          void loadConversations().then(() => select(id));
        }}
      />
    </div>
  );
}
