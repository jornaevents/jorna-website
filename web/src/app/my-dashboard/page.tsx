"use client";

// The vendor dashboard, ported from the Figma Make design ("Design Revision
// Request", 2026-07-27). It answers the three things a vendor opens the app
// for: what needs me, when is my next job, and where is my money.
//
// Ported rather than dropped in, the same way the marketing page was. The Make
// export writes every colour as an inline style="var(--maroon)"; the values
// match globals.css exactly but the names don't, so this is rebuilt on the
// app's own utilities. The design's left sidebar is dropped too — the app has
// a header nav and a phone tab bar already, and a third shell would make the
// vendor side feel like a different product.
//
// Three things in the design were not carried over, because the API can't back
// them:
//
//   - "Expires in 18 h" on a request. Nothing expires: there is no expiry,
//     deadline, or respond-by field anywhere in the schema.
//   - "Platform fee is 10%". No rate is published — only a per-booking
//     platform_fee_cents — so the real rate is derived from what was taken and
//     simply omitted when there's nothing to derive it from.
//   - Invented review authors and job addresses; these read from the API.
//
// The action list, the money, the jobs and the listing health all come from
// lib/vendorPlan, which lib/attention also reads — so this and the "Needs you"
// badge can't disagree.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  confirmBookingEvent,
  getEarnings,
  getMyAvailability,
  getMyVendor,
  getStripeStatus,
  getUnreadCount,
  listServices,
  listVendorBookings,
  respondToChange,
  setBookingStatus,
  startStripeOnboarding,
} from "@/lib/jorna";
import { clearAttentionCache } from "@/lib/attention";
import { checkInAtVenue, LocationError } from "@/lib/checkin";
import {
  centsToMoney,
  listingHealth,
  vendorMoney,
  vendorEvents,
  vendorTasks,
  type HealthIssue,
  type VendorEvent,
  type VendorMoney,
  type VendorTask,
} from "@/lib/vendorPlan";
import {
  categoryLabel,
  priceLine,
  type AvailabilitySlot,
  type Earnings,
  type ServiceItem,
  type StripeStatus,
  type VendorBooking,
  type VendorDetail,
} from "@/lib/types";
import { Avatar, Button, LinkButton } from "@/components/ui";
import { VendorNav } from "@/components/VendorNav";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { DateChangeRequest } from "@/components/DateChangeRequest";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function clock(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Everything the page reads, fetched in one pass. */
interface Snapshot {
  vendor: VendorDetail | null;
  bookings?: VendorBooking[];
  earnings?: Earnings | null;
  stripe?: StripeStatus | null;
  services?: ServiceItem[];
  availability?: AvailabilitySlot[];
  unread?: number;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="eyebrow mb-3">{children}</h2>;
}

// ── Needs you ────────────────────────────────────────────────────────

function ActionRow({
  task,
  busy,
  onAct,
}: {
  task: VendorTask;
  busy: boolean;
  onAct: (task: VendorTask) => void;
}) {
  const alarm = task.tone === "alarm";
  return (
    <div
      className={`flex items-start gap-3.5 rounded-2xl p-4 ${
        alarm
          ? "border-[1.5px] border-maroon bg-maroon/[0.06] dark:border-gold dark:bg-gold/[0.08]"
          : "border border-card-edge bg-card shadow-[var(--shadow-card)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          alarm ? "bg-maroon dark:bg-gold" : task.tone === "urgent" ? "bg-gold" : "bg-gold/50"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            alarm ? "text-maroon dark:text-gold" : "text-ink"
          }`}
        >
          {task.title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{task.detail}</p>
        <div className="mt-3">
          <Button
            variant={alarm ? "primary" : "ghost"}
            size="md"
            disabled={busy}
            onClick={() => onAct(task)}
          >
            {busy ? "Working…" : task.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Money ────────────────────────────────────────────────────────────

function Bucket({
  label,
  cents,
  count,
  dot,
  value,
}: {
  label: string;
  cents: number;
  count?: number;
  dot: string;
  value: string;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-card-edge bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </p>
        <span aria-hidden="true" className={`mt-1 size-2 shrink-0 rounded-full ${dot}`} />
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${value}`}>
        {centsToMoney(cents)}
      </p>
      {count != null ? (
        <p className="mt-0.5 text-xs text-ink-faint">
          {count} {count === 1 ? "booking" : "bookings"}
        </p>
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function VendorDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [notVendor, setNotVendor] = useState(false);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [cash, setCash] = useState<VendorMoney | null>(null);
  // The whole status, not just whether it's complete: what Stripe is waiting on
  // is the part a vendor can act on, and paymentsSetup needs it to say so.
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/my-dashboard");
  }, [authLoading, user, router]);

  /**
   * Fetch without touching state, so the effect below can set it inside a
   * `.then` — a state setter called straight from an effect body is the
   * cascading-render pattern the lint rule is about.
   */
  const fetchAll = useCallback(async (): Promise<Snapshot | null> => {
    if (!user) return null;
    const me = await getMyVendor().catch(() => null);
    if (!me) return { vendor: null };

    // Each of these is a section of the page; one failing should cost that
    // section, not the dashboard.
    const [bookings, earnings, stripe, services, availability, unread] =
      await Promise.all([
        listVendorBookings(me.vendor_id, { limit: 100 })
          .then((r) => r.items)
          .catch(() => [] as VendorBooking[]),
        getEarnings(me.vendor_id).catch(() => null),
        getStripeStatus(me.vendor_id).catch(() => null),
        listServices({ vendor_id: me.vendor_id, limit: 100 })
          .then((r) => r.items)
          .catch(() => [] as ServiceItem[]),
        getMyAvailability().catch(() => [] as AvailabilitySlot[]),
        // Not a vendorTasks item: lib/attention already emits its own unread
        // row for the badge, and adding one there would count every message
        // twice. The dashboard was simply missing it.
        getUnreadCount()
          .then((r) => r.unread_count)
          .catch(() => 0),
      ]);

    return {
      vendor: me, bookings, earnings, stripe, services, availability, unread,
    };
  }, [user]);

  const apply = useCallback((snap: Snapshot | null) => {
    if (!snap) return;
    if (!snap.vendor) {
      setNotVendor(true);
      setLoading(false);
      return;
    }
    setVendor(snap.vendor);
    setBookings(snap.bookings ?? []);
    setCash(vendorMoney(snap.earnings ?? null));
    setStripe(snap.stripe ?? null);
    setServices(snap.services ?? []);
    setAvailability(snap.availability ?? []);
    setUnread(snap.unread ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then((snap) => {
      if (!cancelled) apply(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAll, apply]);

  /** Re-read after an action, so the new state is the server's. */
  const reload = useCallback(async () => {
    apply(await fetchAll());
  }, [fetchAll, apply]);

  async function act(task: VendorTask) {
    setBusyId(task.id);
    setNotice(null);
    try {
      if (task.kind === "stripe" && vendor) {
        const { onboarding_url } = await startStripeOnboarding(vendor.vendor_id);
        window.location.href = onboarding_url;
        return;
      }
      if (task.kind === "confirm" && task.bookingId) {
        await confirmBookingEvent(task.bookingId);
        setNotice("Confirmed — your payout is released once the client confirms too.");
      } else if (task.kind === "check-in" && task.bookingId) {
        await checkInAtVenue(task.bookingId);
        setNotice("Checked in. Your client has been told you've arrived.");
      } else if (
        task.kind === "request" ||
        task.kind === "negotiation" ||
        task.kind === "date-change"
      ) {
        // Answered on /my-bookings, which owns the negotiation panel and the
        // date-change accept/decline. Requests don't reach here — the dashboard
        // filters them out in favour of its own Requests section — but the kind
        // stays listed so this can't silently do nothing if that changes back.
        router.push("/my-bookings");
        return;
      }
      clearAttentionCache();
      await reload();
    } catch (err) {
      setNotice(
        err instanceof LocationError || err instanceof ApiError
          ? err.message
          : "That didn't work. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  /** Settling an offer changes the booking's price and status, so re-read. */
  async function afterAction() {
    clearAttentionCache();
    await reload();
  }

  /**
   * Answer a date move. The server re-runs the double-booking check on accept
   * and names the clashing booking when it refuses, which is the one thing that
   * makes the refusal actionable — so its message is shown as-is.
   */
  async function moveDate(
    booking: VendorBooking,
    accept: boolean,
    message?: string,
  ) {
    const cr = booking.change_request;
    if (!cr) return;
    setBusyId(cr.change_request_id);
    setNotice(null);
    try {
      await respondToChange(cr.change_request_id, accept, message);
      setNotice(
        accept
          ? "Moved. Your client has been told."
          : "Declined. Your booking stays as it was.",
      );
      await afterAction();
    } catch (err) {
      setNotice(
        err instanceof ApiError ? err.message : "That didn't work. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function answer(bookingId: string, status: "approved" | "rejected") {
    setBusyId(bookingId);
    setNotice(null);
    try {
      await setBookingStatus(bookingId, status);
      setNotice(status === "approved" ? "Booking accepted." : "Request declined.");
      clearAttentionCache();
      await reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (notVendor) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">
          This is the vendor dashboard
        </h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-ink-soft">
          You don&apos;t have a vendor profile yet. Set one up to list packages, take
          bookings, and get paid through escrow.
        </p>
        <LinkButton href="/vendor-profile" className="mt-6">
          Start selling
        </LinkButton>
      </div>
    );
  }

  const allTasks = vendorTasks(bookings, stripe);
  const events = vendorEvents(bookings, allTasks);
  // "Needs you" is now only what belongs to the account rather than to any one
  // celebration — which, once the offer and date-move panels came onto the
  // booking rows, is Stripe and unread messages and nothing else. Every other
  // action is a button on the booking it concerns.
  //
  // The tasks themselves still exist and still count: each event card shows how
  // many of them it holds, and the cards are ordered so the ones owing an
  // answer come first.
  const tasks = allTasks.filter((t) => t.kind === "stripe");
  const health = listingHealth({ vendor, services, availability });
  const name = [vendor?.f_name, vendor?.l_name].filter(Boolean).join(" ");

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={vendor?.pfp_url} name={name} size={48} />
          <div className="min-w-0">
            <span className="eyebrow">Vendor dashboard</span>
            <h1 className="serif mt-1 text-3xl text-maroon dark:text-gold sm:text-4xl">
              {name || "Your business"}
            </h1>
            {vendor?.category ? (
              <p className="text-sm text-ink-faint">
                {categoryLabel(vendor.subcategory || vendor.category)}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-6">
        <VendorNav />
      </div>

      {notice ? (
        <p className="mb-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {notice}
        </p>
      ) : null}

      {/* Two columns from lg up: the left is what a vendor works through, the
          right is what they refer to. Phones and tablets keep the single stack,
          where a 320px rail beside a booking row would be neither.

          minmax(0,1fr) rather than 1fr — a grid track is auto-sized by default,
          so a long service name or address would push the column wider than its
          share and squeeze the rail instead of wrapping. */}
      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <div className="min-w-0">
      {/* ── Needs you ── */}
      {tasks.length > 0 || unread > 0 ? (
        <section>
          <SectionLabel>Needs you</SectionLabel>
          <div className="grid gap-2.5">
            {tasks.map((task) => (
              <ActionRow
                key={task.id}
                task={task}
                busy={busyId === task.id}
                onAct={act}
              />
            ))}
            {/* Last, because a message is the one thing here nobody's money is
                waiting on. */}
            {unread > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-card-edge bg-card p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {unread} unread {unread === 1 ? "message" : "messages"}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    In your event group chats.
                  </p>
                </div>
                <LinkButton href="/messages" variant="ghost" size="md">
                  Read
                </LinkButton>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-card-edge bg-panel p-5 text-center text-ink-soft">
          Nothing needs you right now.
        </p>
      )}

      {/* ── Your events ──
          One card per celebration, not one row per booking. A vendor booked for
          a mehndi, a sangeet and a reception has three bookings and one client,
          one venue and one weekend — as a flat list that read as three
          unrelated jobs, and the sections split them further by whatever each
          happened to need.

          Ordered by what it costs to miss: anything owing an answer first, then
          soonest, with finished events last. */}
      {events.length > 0 ? (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Your events</SectionLabel>
            <Link
              href="/my-bookings"
              className="mb-3 text-sm font-medium text-maroon transition hover:text-gold dark:text-gold"
            >
              All bookings
            </Link>
          </div>
          <div className="grid gap-3">
            {events.slice(0, 8).map((e) => (
              <EventCard
                key={e.id}
                event={e}
                busyId={busyId}
                onAct={act}
                onAnswer={answer}
                onMoveDate={moveDate}
                onSettled={afterAction}
              />
            ))}
          </div>
        </section>
      ) : null}

        </div>

        {/* Sticky so the money stays put while a long list of events scrolls —
            top-20 clears the sticky site header above it. */}
        <div className="mt-10 lg:sticky lg:top-20 lg:mt-0">
      {/* ── Money ──
          Three numbers and where they are in the pipeline. The per-booking
          gross-fee-net breakdown was here too, six rows of the same list
          /my-earnings prints in full — that page is the ledger, this is the
          answer to "where is my money", and they are different questions. */}
      {cash ? (
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Money</SectionLabel>
            <Link
              href="/my-earnings"
              className="mb-3 text-sm font-medium text-maroon transition hover:text-gold dark:text-gold"
            >
              Full ledger
            </Link>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
            <Bucket
              label="Released"
              cents={cash.releasedCents}
              dot="bg-green"
              value="text-green"
            />
            <Bucket
              label="In escrow"
              cents={cash.inEscrowCents}
              dot="bg-gold"
              value="text-gold"
            />
            <Bucket
              label="Upcoming"
              cents={cash.upcomingCents}
              count={cash.upcomingCount}
              dot="bg-ink-faint"
              value="text-ink-soft"
            />
          </div>

          {cash.disputedCents > 0 || cash.refundedCents > 0 ? (
            <p className="mt-2.5 rounded-xl border border-maroon/40 bg-maroon/[0.06] px-3.5 py-2.5 text-sm text-maroon dark:text-gold">
              {cash.disputedCents > 0
                ? `${centsToMoney(cash.disputedCents)} is under dispute and can't move yet.`
                : null}
              {cash.disputedCents > 0 && cash.refundedCents > 0 ? " " : null}
              {cash.refundedCents > 0
                ? `${centsToMoney(cash.refundedCents)} has been refunded.`
                : null}
            </p>
          ) : null}

        </section>
      ) : null}

      {/* No weekly hours here. Whether they're set is a listing-health row
          below — the consequence of not setting them is why a vendor would care
          — and the hours themselves belong on /my-calendar, next to the grid
          they constrain, rather than under a vendor's next jobs. That made
          three places showing them and one place editing them. */}

      {/* ── Listing health ── */}
      {health.length > 0 ? (
        <section className="mt-6">
          <SectionLabel>Why you might not be getting booked</SectionLabel>
          <div className="grid gap-2">
            {health.map((h) => (
              <HealthRow key={h.id} issue={h} />
            ))}
          </div>
        </section>
      ) : null}

        </div>
      </div>

      {/* No "all your bookings" footer. The same link is on the section above,
          where it's next to the six jobs it's offering to extend, and again in
          VendorNav at the top of the page. Three routes to one list. */}
    </div>
  );
}

// ── Events ───────────────────────────────────────────────────────────

/** "Sat 16 Aug", or "14 – 16 Aug 2026" when it runs across days. */
function dateSpan(event: VendorEvent): string | null {
  const from = prettyDate(event.dateIso);
  if (!from) return null;
  const to = prettyDate(event.endIso);
  return to && to !== from ? `${from} – ${to}` : from;
}

/**
 * One booking inside its celebration, with whatever it owes attached.
 *
 * The action comes from the task list rather than being re-derived here, so a
 * row can never offer a button the "Needs you" rules don't agree exists.
 */
function BookingRow({
  booking,
  tasks,
  busyId,
  onAct,
  onAnswer,
  onMoveDate,
  onSettled,
}: {
  booking: VendorBooking;
  tasks: VendorTask[];
  busyId: string | null;
  onAct: (task: VendorTask) => void;
  onAnswer: (bookingId: string, status: "approved" | "rejected") => void;
  onMoveDate: (booking: VendorBooking, accept: boolean, message?: string) => void;
  onSettled: () => void;
}) {
  const b = booking;
  const start = clock(b.time_start);
  const end = clock(b.time_end);
  const price = priceLine(b);
  const pending = b.status === "pending";
  const here = Boolean(b.vendor_checked_in_at);
  const negotiating = b.status === "negotiation_ongoing";
  // Behind a button, not open on arrival: NegotiationPanel fetches the offer
  // thread when it mounts, so rendering one per negotiating booking would cost
  // a request each on every dashboard load for a panel most visits never read.
  const [showOffer, setShowOffer] = useState(false);

  // Confirm and check in are plain mutations, so the row can drive them off the
  // task list. The other two have panels of their own below — listing them here
  // as well would put two buttons on the row for one answer.
  const simple = tasks.filter((t) => t.kind === "confirm" || t.kind === "check-in");

  return (
    <div className="border-t border-line-soft px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium text-ink">{b.service_name || "Package"}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {[
              prettyDate(b.date_iso),
              start ? `${start}${end ? `–${end}` : ""}` : null,
              b.guest_count ? `${b.guest_count} guests` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {b.location ? (
            <p className="mt-0.5 truncate text-xs text-ink-faint">{b.location}</p>
          ) : null}
          {b.client_note ? (
            <p className="mt-1.5 rounded-lg bg-panel px-2.5 py-1.5 text-xs text-ink-soft">
              “{b.client_note}”
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums text-ink">{money(price.amount)}</p>
          {price.caption ? (
            <p className="text-xs text-ink-faint">{price.caption}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {here ? (
          <span className="rounded-full bg-green/12 px-2.5 py-0.5 text-xs font-medium text-green">
            Checked in
          </span>
        ) : null}
        {pending && b.negotiable ? (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
            Negotiable
          </span>
        ) : null}

        {/* Accept and decline live on the booking, not in a separate inbox —
            the answer is about this job, on this day, at this price, and all
            three are on the row. */}
        {pending ? (
          <>
            <Button
              size="md"
              disabled={busyId === b.booking_id}
              onClick={() => onAnswer(b.booking_id, "approved")}
            >
              {busyId === b.booking_id ? "Working…" : "Accept"}
            </Button>
            <Button
              variant="ghost"
              size="md"
              disabled={busyId === b.booking_id}
              onClick={() => onAnswer(b.booking_id, "rejected")}
            >
              Decline
            </Button>
          </>
        ) : null}

        {simple.map((task) => (
          <Button
            key={task.id}
            size="md"
            disabled={busyId === task.id}
            onClick={() => onAct(task)}
          >
            {busyId === task.id ? "Working…" : task.cta}
          </Button>
        ))}

        {negotiating ? (
          <Button variant="ghost" size="md" onClick={() => setShowOffer((v) => !v)}>
            {showOffer ? "Hide offer" : "Review offer"}
          </Button>
        ) : null}
      </div>

      {/* An offer, answered here. It used to be a link to /my-bookings — the
          only page that could settle one — so the dashboard could say a client
          was waiting but not let the vendor answer them. */}
      {negotiating && showOffer ? (
        <NegotiationPanel
          bookingId={b.booking_id}
          listedPrice={b.price}
          onSettled={onSettled}
        />
      ) : null}

      {/* Same story for a date move, minus the toggle: this one reads the
          change request off the booking we already have and fetches nothing, so
          hiding it would only cost a click. */}
      {b.change_request ? (
        <DateChangeRequest
          booking={b}
          busy={busyId === b.change_request.change_request_id}
          onAnswer={(accept, message) => onMoveDate(b, accept, message)}
        />
      ) : null}
    </div>
  );
}

function EventCard({
  event,
  busyId,
  onAct,
  onAnswer,
  onMoveDate,
  onSettled,
}: {
  event: VendorEvent;
  busyId: string | null;
  onAct: (task: VendorTask) => void;
  onAnswer: (bookingId: string, status: "approved" | "rejected") => void;
  onMoveDate: (booking: VendorBooking, accept: boolean, message?: string) => void;
  onSettled: () => void;
}) {
  const when = dateSpan(event);
  const m = event.money;
  const totals = [
    m.upcoming > 0 ? `${money(m.upcoming)} upcoming` : null,
    m.inEscrow > 0 ? `${money(m.inEscrow)} in escrow` : null,
    m.released > 0 ? `${money(m.released)} released` : null,
  ].filter(Boolean);

  return (
    <div
      className={`overflow-hidden rounded-2xl shadow-[var(--shadow-card)] ${
        event.isToday
          ? "border border-maroon bg-maroon/[0.04] dark:border-gold dark:bg-gold/[0.06]"
          : "border border-card-edge bg-card"
      }`}
    >
      {event.isToday ? (
        <p className="bg-maroon px-4 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ground dark:bg-gold">
          Today
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="serif text-lg text-ink">{event.name}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {[event.clientName, when].filter(Boolean).join(" · ")}
            {event.bookings.length > 1
              ? ` · ${event.bookings.length} bookings`
              : ""}
          </p>
        </div>
        {event.tasks.length > 0 ? (
          <span className="shrink-0 rounded-full bg-maroon px-3 py-1 text-xs font-semibold text-ground dark:bg-gold dark:text-ground">
            {event.tasks.length} needs you
          </span>
        ) : null}
      </div>

      {event.bookings.map((b) => (
        <BookingRow
          key={b.booking_id}
          booking={b}
          tasks={event.tasks.filter((t) => t.bookingId === b.booking_id)}
          busyId={busyId}
          onAct={onAct}
          onAnswer={onAnswer}
          onMoveDate={onMoveDate}
          onSettled={onSettled}
        />
      ))}

      {totals.length > 0 || m.unpricedCount > 0 ? (
        <p className="border-t border-line-soft bg-panel px-4 py-2.5 text-xs text-ink-soft">
          {totals.join(" · ")}
          {m.unpricedCount > 0 ? (
            <span className="text-ink-faint">
              {totals.length > 0 ? " · " : ""}
              {m.unpricedCount === 1 ? "1 booking isn't" : `${m.unpricedCount} bookings aren't`}{" "}
              priced yet
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function HealthRow({ issue }: { issue: HealthIssue }) {
  const critical = issue.severity === "critical";
  return (
    <div
      className={`flex items-start gap-3 rounded-xl p-4 ${
        critical
          ? "border border-maroon bg-maroon/[0.05] dark:border-gold dark:bg-gold/[0.07]"
          : "border border-card-edge bg-card"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          critical ? "bg-maroon dark:bg-gold" : "bg-gold"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            critical ? "text-maroon dark:text-gold" : "text-ink"
          }`}
        >
          {issue.issue}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{issue.consequence}</p>
        <div className="mt-3">
          <LinkButton
            href={issue.href}
            variant={critical ? "primary" : "ghost"}
            size="md"
          >
            {issue.cta}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
