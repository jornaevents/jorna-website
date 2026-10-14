"use client";

// Overview, the vendor's home (plan step 1 of the 2026-10 redesign, from the
// Figma Make "Wedding Vendor Dashboard"): a summary of every other page, each
// part linking to it. It replaced /my-dashboard, whose actions (answering
// requests, check-in, confirming payments, offers) all live on Bookings.
//
// Every number is a reducer in lib/vendorPlan over data the other pages read
// too, so Overview can't disagree with them.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getMyVendor, getPipeline, listConversations, listLeads, listVendorBookings } from "@/lib/jorna";
import {
  bookingTab,
  overPill,
  bookingsByDay,
  centsToMoney,
  countdownLabel,
  depositsOwedCents,
  leadSummary,
  overdueInstallments,
  paymentsToConfirm,
  receivedThisMonthCents,
  upcomingBookings,
  type BookingTab,
} from "@/lib/vendorPlan";
import type { ConversationSummary, Lead, Pipeline, VendorBooking, VendorDetail } from "@/lib/types";
import { Button, Card } from "@jorna/shared/components/ui";
import { FilterTabs, PageHeader, StatusPill, type Tone } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";
import { NewMenu } from "@/components/vendor/NewMenu";

interface Snapshot {
  vendor: VendorDetail;
  bookings: VendorBooking[];
  leads: Lead[];
  conversations: ConversationSummary[];
  /** Null if it couldn't be read; the lead card then counts from bookings. */
  pipeline: Pipeline | null;
}

interface LeadNumbers {
  open: number;
  needReply: number;
  newThisWeek: number | null;
  /** When the longest-waiting lead that needs a reply came in. */
  oldestWaitingIso: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The lead card's numbers from the pipeline — the same list and rules the
 *  Leads page shows. Creation times exist only for leads and for bookings
 *  made since backend 0066, so "new this week" can undercount old data, but
 *  never overcounts. */
function pipelineNumbers(p: Pipeline): LeadNumbers {
  const active = p.items.filter((i) => !i.archived);
  const since = Date.now() - WEEK_MS;
  const waiting = active
    .filter((i) => i.attention === "needs_you" && i.created_at)
    .map((i) => i.created_at!)
    .sort();
  return {
    open: p.counts.inquiries + p.counts.negotiations,
    needReply: p.counts.needs_you,
    newThisWeek: active.filter((i) => i.created_at && new Date(i.created_at).getTime() >= since).length,
    oldestWaitingIso: waiting[0] ?? null,
  };
}

function waitedFor(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

// The same three words on every page ("Copy rules" in apps/vendor/CLAUDE.md). The keys are
// vendorPlan's; only what a vendor reads changed.
const TAB_LABEL: Record<BookingTab, string> = {
  deposit_due: "Deposit due",
  confirmed: "Upcoming",
  over: "Done",
};
const TAB_TONE: Record<BookingTab, Tone> = { deposit_due: "amber", confirmed: "green", over: "grey" };

function initials(name?: string | null): string {
  const parts = (name ?? "").replace(/&/g, " ").split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "·").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

/** The header's one line: who's waiting on you today, in words — leads
 *  waiting on a reply, and money on signed contracts: payments to confirm
 *  and payments past due (web #170, which said "Nothing needs you" while
 *  Bookings said "Your move"). */
function todayLine(needReply: number, money: { confirm: number; overdue: number }): string {
  const parts: string[] = [];
  if (needReply) parts.push(needReply === 1 ? "1 client is waiting on you" : `${needReply} clients are waiting on you`);
  if (money.confirm) parts.push(money.confirm === 1 ? "1 payment to confirm" : `${money.confirm} payments to confirm`);
  if (money.overdue) parts.push(money.overdue === 1 ? "1 payment is overdue" : `${money.overdue} payments are overdue`);
  if (!parts.length) return "Nothing needs you today.";
  const line = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${line[0].toUpperCase()}${line.slice(1)}.`;
}

/** Money on signed contracts that's the vendor's move, the same rules as
 *  Bookings ("Your move") and its overdue flag. */
function moneyWaiting(bookings: VendorBooking[]): { confirm: number; overdue: number } {
  return bookings.reduce(
    (n, b) => ({ confirm: n.confirm + paymentsToConfirm(b).length, overdue: n.overdue + overdueInstallments(b).length }),
    { confirm: 0, overdue: 0 },
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function prettyDate(iso?: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, opts);
}

/** "16:30" → "4:30 PM"; a range when there's an end. */
function timeRange(start?: string | null, end?: string | null): string | null {
  const fmt = (t?: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h)) return t;
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };
  const a = fmt(start);
  const b = fmt(end);
  return a && b ? `${a}–${b}` : a;
}

function relativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return null;
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const clientName = (b: VendorBooking) => b.event_name || b.client_name || b.guest_name || "A celebration";

// ── Cards ────────────────────────────────────────────────────────────

function Kicker({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] ${light ? "text-white/70" : "text-ink-faint"}`}>
      {children}
    </p>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line px-3 text-sm font-semibold text-ink-soft transition hover:border-ink-faint hover:bg-card"
    >
      {children}
      <Icon name="chevron" size={16} />
    </Link>
  );
}

/** "Next event": the design's burgundy card, stepping through what's coming. */
function NextEventCard({
  upcoming,
  index,
  onStep,
}: {
  upcoming: VendorBooking[];
  index: number;
  onStep: (delta: number) => void;
}) {
  const b = upcoming[index];
  return (
    <section className="relative flex min-h-[16.5rem] flex-col overflow-hidden rounded-[17px] bg-[#641f34] p-5 text-white shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_82%_10%,#9b5365_0,transparent_35%),radial-gradient(circle_at_0%_100%,#3b0f1b_0,transparent_52%)]"
      />
      <div className="relative flex items-start justify-between gap-3">
        <Kicker light>
          <Icon name="sparkles" size={15} /> Next event
        </Kicker>
        {upcoming.length > 1 ? (
          <div className="flex items-center gap-0.5 rounded-lg border border-[#e4c778]/40 bg-[#3b0f1b]/25 p-0.5">
            <button
              type="button"
              aria-label="Previous event"
              onClick={() => onStep(-1)}
              className="grid h-6 w-7 place-items-center rounded-[5px] text-lg text-[#f0d995] hover:bg-white/10"
            >
              ‹
            </button>
            <span className="min-w-7 text-center text-[0.65rem] text-white/60">
              {index + 1}/{upcoming.length}
            </span>
            <button
              type="button"
              aria-label="Next event"
              onClick={() => onStep(1)}
              className="grid h-6 w-7 place-items-center rounded-[5px] text-lg text-[#f0d995] hover:bg-white/10"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {b ? (
        <div className="relative mt-8">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.05em]">
            {countdownLabel(b.date_iso)}
          </span>
          <p className="serif mt-3 text-2xl leading-tight">{clientName(b)}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
            <span className="flex items-center gap-1.5">
              <Icon name="calendar" size={15} /> {prettyDate(b.date_iso, { weekday: "short", month: "short", day: "numeric" })}
            </span>
            {timeRange(b.time_start, b.time_end) ? (
              <span className="flex items-center gap-1.5">
                <Icon name="clock" size={15} /> {timeRange(b.time_start, b.time_end)}
              </span>
            ) : null}
          </div>
          <div className="my-4 h-px bg-white/15" />
          <Link href={`/my-bookings?id=${b.booking_id}`} className="flex items-center gap-2.5">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-white/12 text-[0.65rem] font-bold text-[#efd69a]">
              {initials(b.service_name)}
            </span>
            <span className="grid min-w-0">
              <strong className="truncate text-sm">{b.service_name || "Your package"}</strong>
              <small className="truncate text-xs text-white/60">{b.location || "Venue to be confirmed"}</small>
            </span>
            <Icon name="chevron" className="ml-auto text-white/50" />
          </Link>
        </div>
      ) : (
        <div className="relative mt-auto">
          <p className="serif text-xl">Nothing booked yet</p>
          <p className="mt-1 text-sm text-white/70">Your next upcoming event will show here.</p>
        </div>
      )}
    </section>
  );
}

function LeadsCard({ open, needReply, newThisWeek, oldestWaitingIso }: LeadNumbers) {
  return (
    <Card className="flex min-h-[16.5rem] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Kicker>Clients you&apos;re talking to</Kicker>
          <p className="serif mt-1 text-[2.5rem] leading-none tracking-[-0.06em] text-ink">{open}</p>
        </div>
        {newThisWeek ? <StatusPill tone="green">+{newThisWeek} this week</StatusPill> : null}
      </div>
      <div className="mt-7 mb-5">
        {needReply > 0 ? (
          <StatusPill tone="red" dot>
            {needReply} {needReply === 1 ? "needs" : "need"} your reply
          </StatusPill>
        ) : (
          <p className="text-sm text-ink-faint">Nobody&apos;s waiting on you.</p>
        )}
        {needReply > 0 && oldestWaitingIso ? (
          <p className="mt-2 text-xs text-ink-faint">Oldest has waited {waitedFor(oldestWaitingIso)}.</p>
        ) : null}
      </div>
      <CardLink href="/leads">Review leads</CardLink>
    </Card>
  );
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function MiniCalendar({
  bookings,
  month,
  selectedIso,
  onStep,
}: {
  bookings: VendorBooking[];
  month: { year: number; month: number };
  selectedIso: string | null;
  onStep?: (delta: number) => void;
}) {
  const byDay = useMemo(() => bookingsByDay(bookings.filter((b) => bookingTab(b) != null)), [bookings]);
  const first = new Date(month.year, month.month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(month.year, month.month + 1, 0).getDate();
  const cells = Math.ceil((lead + daysIn) / 7) * 7;
  const today = new Date();
  const iso = (d: number) =>
    `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // Bookings, not booking-days: a three-day event is one event (web #170).
  const eventCount = new Set(
    Array.from({ length: daysIn }, (_, i) => byDay.get(iso(i + 1)) ?? []).flat().map((b) => b.booking_id),
  ).size;

  return (
    <Card className="flex min-h-[16.5rem] flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Kicker>Calendar</Kicker>
          <p className="serif mt-1 text-lg text-ink">
            {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
        </div>
        {onStep ? (
          <div className="flex gap-1">
            {[-1, 1].map((d) => (
              <button
                key={d}
                type="button"
                aria-label={d < 0 ? "Previous event" : "Next event"}
                onClick={() => onStep(d)}
                className="grid size-[25px] place-items-center rounded-[7px] border border-line text-ink-soft"
              >
                {d < 0 ? "‹" : "›"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-7 text-center text-[0.65rem] font-bold text-ink-faint">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-y-1 text-center text-xs">
        {Array.from({ length: cells }, (_, i) => {
          const day = i - lead + 1;
          if (day < 1 || day > daysIn) return <span key={i} />;
          const dIso = iso(day);
          const isToday =
            today.getFullYear() === month.year && today.getMonth() === month.month && today.getDate() === day;
          const has = byDay.has(dIso);
          return (
            <span
              key={i}
              className={`relative mx-auto grid h-6 w-[26px] place-items-center rounded-lg ${
                isToday ? "bg-maroon font-bold text-white" : "text-ink-soft"
              } ${dIso === selectedIso ? "font-bold ring-2 ring-gold-bright" : ""}`}
            >
              {day}
              {has && !isToday ? (
                <i aria-hidden="true" className="absolute bottom-0.5 size-[3px] rounded-full bg-gold-bright" />
              ) : null}
            </span>
          );
        })}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-line-soft pt-2.5 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          <i aria-hidden="true" className="size-1.5 rounded-full bg-gold-bright" />
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
        <Link href="/my-calendar" className="flex items-center gap-1 font-semibold text-gold">
          View calendar <Icon name="chevron" size={14} />
        </Link>
      </div>
    </Card>
  );
}

type BookingFilter = "all" | BookingTab;

function BookingsCard({ bookings }: { bookings: VendorBooking[] }) {
  const [filter, setFilter] = useState<BookingFilter>("all");
  const rows = useMemo(() => {
    const tabbed = bookings
      .map((b) => ({ b, tab: bookingTab(b) }))
      .filter((r): r is { b: VendorBooking; tab: BookingTab } => r.tab != null);
    // Upcoming soonest first; anything Over after them, most recent first.
    tabbed.sort((x, y) => {
      if ((x.tab === "over") !== (y.tab === "over")) return x.tab === "over" ? 1 : -1;
      const byDate = (x.b.date_iso ?? "").localeCompare(y.b.date_iso ?? "");
      return x.tab === "over" ? -byDate : byDate;
    });
    return tabbed;
  }, [bookings]);
  const count = (t: BookingTab) => rows.filter((r) => r.tab === t).length;
  const shown = (filter === "all" ? rows : rows.filter((r) => r.tab === filter)).slice(0, 6);
  const owed = depositsOwedCents(bookings);
  const received = receivedThisMonthCents(bookings);

  return (
    <section aria-label="Bookings" className="md:col-span-2">
      <Card className="h-full p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="serif text-lg text-ink">Booked</p>
          </div>
          <FilterTabs<BookingFilter>
            label="Bookings"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "deposit_due", label: TAB_LABEL.deposit_due, count: count("deposit_due") },
              { value: "confirmed", label: TAB_LABEL.confirmed, count: count("confirmed") },
              { value: "over", label: TAB_LABEL.over, count: count("over") },
            ]}
          />
        </div>

        {/* Each figure says what it is in the same line, not under a label. */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-ink/[0.04] px-4 py-3 text-sm sm:flex sm:items-center sm:gap-8">
          <p className="text-ink-soft">
            <span className="serif text-lg text-ink">{centsToMoney(owed)}</span> waiting to be paid
          </p>
          <p className="text-ink-soft">
            <span className="serif text-lg text-ink">{centsToMoney(received)}</span> paid this month
          </p>
          <Link href="/my-earnings" className="col-span-2 flex items-center gap-1 text-xs font-semibold text-gold sm:ml-auto">
            View earnings <Icon name="chevron" size={14} />
          </Link>
        </div>

        <ul className="mt-3">
          {shown.map(({ b, tab }) => (
            <li key={b.booking_id}>
              <Link
                href={`/my-bookings?id=${b.booking_id}`}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-line-soft px-1.5 py-3 text-ink-soft transition hover:bg-panel/50 sm:grid-cols-[auto_minmax(0,1fr)_7rem_6.5rem_auto]"
              >
                <span className="grid size-9 place-items-center rounded-full bg-maroon/10 text-[0.7rem] font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                  {initials(clientName(b))}
                </span>
                <span className="grid min-w-0">
                  <strong className="truncate text-sm text-ink">{clientName(b)}</strong>
                  <small className="truncate text-xs text-ink-faint">{b.service_name}</small>
                </span>
                <span className="hidden text-xs text-ink-faint sm:block">{prettyDate(b.date_iso) ?? "Date TBD"}</span>
                <span>
                  {tab === "over" ? (
                    <StatusPill tone={overPill(b).paid ? "green" : "amber"}>{overPill(b).label}</StatusPill>
                  ) : (
                    <StatusPill tone={TAB_TONE[tab]}>{TAB_LABEL[tab]}</StatusPill>
                  )}
                </span>
                <Icon name="chevron" size={16} className="hidden text-ink-faint sm:block" />
              </Link>
            </li>
          ))}
        </ul>
        {shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-faint">
            {rows.length === 0 ? "No bookings yet — they appear here once a contract is signed." : "No bookings in this category."}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function InboxCard({ conversations }: { conversations: ConversationSummary[] }) {
  const latest = useMemo(
    () =>
      [...conversations]
        .filter((c) => c.last_message)
        .sort((a, b) => (b.last_message?.created_at ?? "").localeCompare(a.last_message?.created_at ?? ""))
        .slice(0, 4),
    [conversations],
  );
  return (
    <section aria-label="Inbox">
      <Card className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="serif text-lg text-ink">Messages</p>
          <Link href="/messages" className="text-xs font-semibold text-gold">
            View all
          </Link>
        </div>
        <ul className="mt-3">
          {latest.map((c) => {
            const unread = (c.unread_count ?? 0) > 0;
            return (
              <li key={c.conversation_id}>
                <Link
                  href={`/conversation?id=${c.conversation_id}`}
                  className="relative flex items-center gap-2.5 border-t border-line-soft py-3"
                >
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-maroon/10 text-[0.7rem] font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                    {initials(c.name)}
                  </span>
                  {unread ? (
                    <i
                      aria-label="Unread"
                      className="absolute left-[27px] top-2.5 size-2 rounded-full border-2 border-card bg-gold-bright"
                    />
                  ) : null}
                  <span className="grid min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className={`truncate text-sm ${unread ? "text-ink" : "text-ink-soft"}`}>
                        {c.name || "Conversation"}
                      </strong>
                      <small className="shrink-0 text-[0.7rem] text-ink-faint">
                        {relativeTime(c.last_message?.created_at)}
                      </small>
                    </span>
                    <span className="truncate text-xs text-ink-faint">{c.last_message?.content || "Attachment"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {latest.length === 0 ? <p className="py-10 text-center text-sm text-ink-faint">No messages yet.</p> : null}
        <div className="mt-auto pt-3">
          <CardLink href="/messages">Open messages</CardLink>
        </div>
      </Card>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function OverviewInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [eventIndex, setEventIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // The old dashboard's "Leads" tab is its own page; old links still carry it.
  const leadsView = params.get("view") === "leads";
  useEffect(() => {
    if (leadsView) router.replace("/leads");
  }, [leadsView, router]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/overview");
  }, [authLoading, user, router]);

  const load = useCallback(async (): Promise<Snapshot | "not-vendor" | "failed"> => {
    let vendor: VendorDetail | null;
    try {
      vendor = await getMyVendor();
    } catch {
      return "failed";
    }
    if (!vendor) return "not-vendor";
    // Each card degrades on its own: a failed inbox shouldn't blank the page.
    const [bookings, leads, conversations] = await Promise.all([
      listVendorBookings(vendor.vendor_id, { limit: 100 })
        .then((r) => r.items)
        .catch(() => [] as VendorBooking[]),
      listLeads()
        .then((r) => r.items)
        .catch(() => [] as Lead[]),
      listConversations().catch(() => [] as ConversationSummary[]),
    ]);
    const pipeline = await getPipeline().catch(() => null);
    return { vendor, bookings, leads, conversations, pipeline };
  }, []);

  useEffect(() => {
    if (!user || leadsView) return;
    let cancelled = false;
    load().then((r) => {
      if (cancelled) return;
      if (r === "not-vendor") router.replace("/vendor-onboarding");
      else if (r === "failed") setFailed(true);
      else {
        setFailed(false);
        setSnap(r);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, leadsView, load, router, attempt]);

  const upcoming = useMemo(() => (snap ? upcomingBookings(snap.bookings) : []), [snap]);
  const leads = useMemo<LeadNumbers>(() => {
    if (snap?.pipeline) return pipelineNumbers(snap.pipeline);
    const fallback = snap ? leadSummary(snap.bookings, snap.leads) : { open: 0, needReply: 0 };
    return { ...fallback, newThisWeek: null, oldestWaitingIso: null };
  }, [snap]);

  if (failed) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">Couldn&apos;t load your overview.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (authLoading || !user || !snap) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const now = new Date();
  const index = upcoming.length ? eventIndex % upcoming.length : 0;
  const shownEvent = upcoming[index] ?? null;
  const step = (d: number) => setEventIndex((i) => (i + d + upcoming.length) % upcoming.length);
  const calMonth = shownEvent?.date_iso
    ? { year: Number(shownEvent.date_iso.slice(0, 4)), month: Number(shownEvent.date_iso.slice(5, 7)) - 1 }
    : { year: now.getFullYear(), month: now.getMonth() };
  const firstName = user.f_name || snap.vendor.f_name;

  return (
    <div>
      <PageHeader
        eyebrow={now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        subtitle={todayLine(leads.needReply, moneyWaiting(snap.bookings))}
        action={<NewMenu />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)_minmax(0,1.05fr)]">
        <NextEventCard upcoming={upcoming} index={index} onStep={step} />
        <LeadsCard {...leads} />
        <MiniCalendar
          bookings={snap.bookings}
          month={calMonth}
          selectedIso={shownEvent?.date_iso ?? null}
          onStep={upcoming.length > 1 ? step : undefined}
        />
        <BookingsCard bookings={snap.bookings} />
        <InboxCard conversations={snap.conversations} />
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <OverviewInner />
    </Suspense>
  );
}
