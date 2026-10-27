"use client";

// Bookings (plan step 3 of the 2026-10 redesign): what's been agreed — a
// contract signed, or a marketplace request accepted before contracts. Tabs
// are lib/vendorPlan's bookingTab (shown as Deposit due / Upcoming / Done), the same
// ones Overview shows. Requests and unsigned offers live on Leads.
//
// Each row expands to the design's five-step progress, the event's details,
// its money, and whatever is the vendor's move: confirming a payment the
// couple says they've sent, answering a date change, checking in, or
// cancelling. Those are the same calls this page made before the redesign.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { money as exactMoney } from "@/lib/ledger";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  confirmBookingEvent,
  confirmDepositReceived,
  confirmPaymentReceived,
  getMyVendor,
  listVendorBookings,
  markBookingSeen,
  respondToChange,
  setBookingStatus,
} from "@/lib/jorna";
import { checkInAtVenue, LocationError } from "@/lib/checkin";
import {
  bookingSteps,
  bookingMoney,
  bookingProgress,
  bookingTab,
  centsToMoney,
  overPill,
  paymentsToConfirm,
  type BookingTab,
  type PaymentToConfirm,
} from "@/lib/vendorPlan";
import { BOOKINGS_SEEN_EVENT, isNewBooking } from "@/lib/newBookings";
import { eventIsOver, formatCheckInTime, type VendorBooking, type VendorDetail } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";
import { DateChangeRequest } from "@/components/DateChangeRequest";
import { MessageVendorButton } from "@/components/MessageVendorButton";
import { FilterTabs, PageHeader, StatTile, StatusPill, type Tone } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";
import { NewMenu } from "@/components/vendor/NewMenu";

// The same three words as Overview ("Copy rules" in apps/vendor/CLAUDE.md).
const TAB: Record<BookingTab, { label: string; tone: Tone }> = {
  deposit_due: { label: "Deposit due", tone: "amber" },
  confirmed: { label: "Upcoming", tone: "green" },
  over: { label: "Done", tone: "grey" },
};

type Filter = "all" | BookingTab;

const eventName = (b: VendorBooking) => b.event_name || b.client_name || b.guest_name || "A celebration";
const clientName = (b: VendorBooking) => b.client_name || b.guest_name || "Your client";

function initials(name: string): string {
  const parts = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "·") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function prettyDate(iso?: string | null): string {
  if (!iso || iso === "TBD") return "Date TBD";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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

// To the cent when there are cents: a $453.33 deposit read as $453 (2026-10-26).
const money = (cents: number | null | undefined) =>
  cents == null ? "—" : cents % 100 ? exactMoney(cents) : centsToMoney(cents);

/** The server lets a vendor pull out of an agreed booking unless money is
 *  mid-flight or already settled — the same guard as before the redesign. */
function cancellable(b: VendorBooking): boolean {
  return (
    b.status === "approved" &&
    !["processing", "released", "refunded", "cancelled", "disputed"].includes((b.payment_status ?? "unpaid").toLowerCase())
  );
}

const hasVenue = (b: VendorBooking) => b.checkin_latitude != null && b.checkin_longitude != null;

/** Escrow track only (disabled for the MVP): the vendor's half of releasing
 *  held money — check in at the venue, or confirm it happened. */
function releaseStep(b: VendorBooking): "check-in" | "confirm" | null {
  if (b.payment_status !== "paid" || b.vendor_confirmed_at) return null;
  if (hasVenue(b)) return "check-in";
  return eventIsOver(b) ? "confirm" : null;
}

function yourMove(b: VendorBooking): boolean {
  const cr = b.change_request;
  return (
    paymentsToConfirm(b).length > 0 ||
    Boolean(cr && cr.status === "pending" && cr.repriced_amount_cents == null) ||
    releaseStep(b) != null
  );
}

// ── Pieces ───────────────────────────────────────────────────────────

function Progress({ b }: { b: VendorBooking }) {
  const done = bookingProgress(b);
  const m = bookingMoney(b);
  const steps = bookingSteps(b);
  return (
    <ol className="relative grid gap-2 sm:grid-cols-5 sm:gap-1">
      {steps.map((step, i) => {
        const complete = i < done;
        const current = i === done - 1 && done < steps.length;
        return (
          <li key={step} className="flex items-start gap-2.5 sm:flex-col sm:items-center sm:text-center">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                complete
                  ? "border-transparent bg-maroon text-white dark:bg-gold dark:text-[#2a0c19]"
                  : "border-line text-ink-faint"
              } ${current ? "ring-4 ring-gold-bright/30" : ""}`}
            >
              {complete ? "✓" : i + 1}
            </span>
            <span className="grid">
              {step === "Contract signed" && complete && b.contract_token ? (
                <Link href={`/contracts/view?id=${b.booking_id}`} className="text-xs font-semibold text-gold">
                  {step}
                </Link>
              ) : (
                <strong className={`text-xs ${complete ? "text-ink" : "text-ink-faint"}`}>{step}</strong>
              )}
              <small className="text-[0.68rem] text-ink-faint">
                {complete ? (current ? "Current stage" : "Done") : "Upcoming"}
              </small>
              {step === "Deposit paid" && m.depositCents != null ? (
                <small className="text-[0.68rem] text-ink-soft">{money(m.depositCents)}</small>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Info({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-r border-line-soft px-3.5 py-3 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0">
      <small className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-ink-faint">{label}</small>
      <strong className="mt-1 block truncate text-sm text-ink">{value}</strong>
      {sub ? <span className="block truncate text-xs text-ink-faint">{sub}</span> : null}
    </div>
  );
}

function paymentLabel(p: PaymentToConfirm): string {
  if (p.kind === "installment") return `${p.label}${p.amountCents ? ` (${money(p.amountCents)})` : ""}`;
  if (p.kind === "deposit") return `the deposit${p.amountCents ? ` (${money(p.amountCents)})` : ""}`;
  return `the balance${p.amountCents ? ` (${money(p.amountCents)})` : ""}`;
}

function Expanded({
  b,
  busy,
  onAct,
  onChangeRequest,
}: {
  b: VendorBooking;
  busy: boolean;
  onAct: (fn: () => Promise<unknown>, success: string, fallback?: string) => void;
  onChangeRequest: (accept: boolean, message?: string) => Promise<void>;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // A contract both sides signed: its terms still apply, money may have been
  // paid, and the backend asks for a reason (DECISIONS #37 there).
  const signedContract = Boolean(b.contract_token && b.signed_at);
  const receivedCents = (b.payment_schedule ?? []).filter((i) => i.confirmed_at).reduce((sum, i) => sum + i.amount_cents, 0);
  const m = bookingMoney(b);
  const toConfirm = paymentsToConfirm(b);
  const release = releaseStep(b);
  const stepIndex = bookingProgress(b);
  const steps = bookingSteps(b);
  const stage = stepIndex >= steps.length ? "Complete" : steps[Math.max(0, stepIndex - 1)];
  const highlighted = yourMove(b);

  return (
    <div className="border-t border-line-soft bg-ground-2/60 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Booking stage</p>
          <p className="serif mt-0.5 text-lg text-ink">{stage}</p>
        </div>
        <div className="text-right">
          <small className="text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">Booking total</small>
          <p className="serif text-lg text-ink">{money(m.totalCents)}</p>
        </div>
      </div>

      <div className="mt-4">
        <Progress b={b} />
      </div>

      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-card-edge bg-card sm:grid-cols-3">
        <Info label="Date & time" value={prettyDate(b.date_iso)} sub={timeRange(b.time_start, b.time_end)} />
        <Info label="Location" value={b.location || "TBD"} />
        <Info label="Guests" value={b.guest_count ? `${b.guest_count} guests` : "—"} />
        <Info label="Package" value={b.service_name || "—"} />
        <Info
          label="Deposit"
          value={m.depositCents != null ? money(m.depositCents) : "None"}
          sub={m.depositCents != null ? (m.depositPaid ? "Paid" : (m.depositDue ?? "Not yet paid")) : undefined}
        />
        <Info
          label="Remaining balance"
          value={m.paidInFull ? "$0" : money(m.balanceCents)}
          sub={
            m.paidInFull ? (
              "Paid in full"
            ) : m.overdue ? (
              <span className="font-semibold text-maroon dark:text-gold">Overdue — {m.balanceDue ?? "due now"}</span>
            ) : (
              (m.balanceDue ?? (eventIsOver(b) ? "Due now" : "Due after the event"))
            )
          }
        />
      </div>

      {b.client_checked_in_at ? (
        <p className="mt-3 text-xs text-green">
          {clientName(b)} checked in at the venue on {formatCheckInTime(b.client_checked_in_at)}.
        </p>
      ) : null}

      {/* Whatever is the vendor's move, highlighted so it isn't missed among
          the details. */}
      {highlighted ? (
        <div className="mt-4 rounded-xl border border-gold-bright/60 bg-gold-bright/10 p-4">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gold">Your move</p>
          <div className="mt-2 grid gap-2.5">
            {toConfirm.map((p) => (
              <div key={p.kind === "installment" ? p.installmentId : p.kind} className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink">
                  {clientName(b)} says they&apos;ve sent {paymentLabel(p)}.
                </p>
                {/* A contract's payments are answered on the contract (with Not
                    received beside Confirm); Bookings points there (2026-10-26). */}
                {p.kind === "installment" ? (
                  <Link href={`/contracts/view?id=${b.booking_id}`} className="text-sm font-semibold text-gold hover:underline">
                    Confirm on the contract →
                  </Link>
                ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    onAct(
                      () => (p.kind === "deposit" ? confirmDepositReceived(b.booking_id) : confirmPaymentReceived(b.booking_id)),
                      "Confirmed — they can see you've got it.",
                    )
                  }
                >
                  I received it
                </Button>
                )}
              </div>
            ))}
            {release === "check-in" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink">Check in at the venue to confirm you delivered.</p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    onAct(
                      () => checkInAtVenue(b.booking_id),
                      "Checked in. Your payout releases once your client confirms too.",
                      "Couldn't check you in — make sure you're at the venue.",
                    )
                  }
                >
                  Check in at venue
                </Button>
              </div>
            ) : null}
            {release === "confirm" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink">Confirm the event happened to release your payment.</p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    onAct(() => confirmBookingEvent(b.booking_id), "Confirmed. The payment releases once your client confirms too.")
                  }
                >
                  Confirm
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {b.change_request ? (
        <DateChangeRequest booking={b} busy={busy} onAnswer={onChangeRequest} />
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {b.contract_token ? (
          <Link
            href={`/contracts/view?id=${b.booking_id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04]"
          >
            <Icon name="contract" size={16} /> Signed contract
          </Link>
        ) : null}
        {!b.is_guest_booking ? <MessageVendorButton bookingId={b.booking_id} /> : null}
        {cancellable(b) && !confirmCancel ? (
          <Button variant="quiet" className="ml-auto" onClick={() => setConfirmCancel(true)}>
            Cancel booking
          </Button>
        ) : null}
      </div>

      {confirmCancel ? (
        <div className="mt-3 rounded-xl border border-card-edge bg-card p-4">
          <p className="text-sm text-ink">
            Cancel this booking? {clientName(b)} is told straight away and it comes off their plan.{" "}
            {signedContract
              ? `You both signed it, so its cancellation terms still apply${
                  b.cancellation_window_hours != null
                    ? ` (cancelling within ${Math.round(b.cancellation_window_hours / 24)} days of the event)`
                    : ""
                }. ${receivedCents > 0 ? `You've confirmed receiving ${money(receivedCents)} — settle that with them directly.` : "You haven't confirmed any payment from them."}`
              : b.payment_status === "paid"
              ? "They'll be refunded in full — you won't be paid for this one."
              : b.payment_method === "manual" && ["marked_paid", "confirmed_paid"].includes(b.payment_status ?? "")
                ? "They told us they already paid you directly — cancelling won't refund that automatically."
                : "Nothing has been paid through Jorna, so nothing is refunded."}
          </p>
          {signedContract ? (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                To end it with both signatures, send a{" "}
                <Link href={`/contracts/document?kind=cancellation&booking=${b.booking_id}`} className="font-semibold text-gold">
                  cancellation agreement
                </Link>{" "}
                instead.
              </p>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs text-ink-faint">Why you&apos;re cancelling — {clientName(b)} sees this</span>
                <textarea
                  value={cancelReason}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                />
              </label>
            </>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy || (signedContract && !cancelReason.trim())}
              onClick={() =>
                onAct(
                  () => setBookingStatus(b.booking_id, "rejected", signedContract ? cancelReason.trim() : null),
                  "Cancelled. Your client has been told.",
                )
              }
            >
              Yes, cancel it
            </Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep the booking
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function BookingsInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [bookings, setBookings] = useState<VendorBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(params.get("id"));

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/my-bookings");
  }, [authLoading, user, router]);

  const load = useCallback(async (vendorId: string) => {
    const res = await listVendorBookings(vendorId, { limit: 100 });
    setBookings(res.items);
    return res.items;
  }, []);

  /** Opening a new booking is what clears it from the Bookings badge
   *  (backend DECISIONS #30). The pill goes at once; the sidebar re-reads
   *  its count once the server has it. */
  const markSeen = useCallback((b: VendorBooking) => {
    if (!isNewBooking(b)) return;
    const now = new Date().toISOString();
    setBookings((bs) => bs?.map((x) => (x.booking_id === b.booking_id ? { ...x, vendor_seen_at: now } : x)) ?? bs);
    markBookingSeen(b.booking_id)
      .then(() => window.dispatchEvent(new Event(BOOKINGS_SEEN_EVENT)))
      .catch(() => {});
  }, []);

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
        const items = await load(mine.vendor_id);
        // A link straight to one booking (?id=) opens it, so it's seen.
        const linked = items.find((b) => b.booking_id === params.get("id"));
        if (!cancelled && linked) markSeen(linked);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your bookings."));
    return () => {
      cancelled = true;
    };
  }, [user, load, router, markSeen, params]);

  const rows = useMemo(() => {
    const tabbed = (bookings ?? [])
      .map((b) => ({ b, tab: bookingTab(b) }))
      .filter((r): r is { b: VendorBooking; tab: BookingTab } => r.tab != null);
    // New first, then your move; then upcoming soonest; Over last, most
    // recent first.
    return tabbed.sort((x, y) => {
      const xn = isNewBooking(x.b) ? 0 : 1;
      const yn = isNewBooking(y.b) ? 0 : 1;
      if (xn !== yn) return xn - yn;
      const xm = yourMove(x.b) ? 0 : 1;
      const ym = yourMove(y.b) ? 0 : 1;
      if (xm !== ym) return xm - ym;
      if ((x.tab === "over") !== (y.tab === "over")) return x.tab === "over" ? 1 : -1;
      const byDate = (x.b.date_iso ?? "").localeCompare(y.b.date_iso ?? "");
      return x.tab === "over" ? -byDate : byDate;
    });
  }, [bookings]);

  async function act(b: VendorBooking, fn: () => Promise<unknown>, success: string, fallback = "That didn't work. Try again.") {
    if (!vendor) return;
    setBusyId(b.booking_id);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load(vendor.vendor_id);
      setNotice(success);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof LocationError ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !bookings) {
    return <p className="py-20 text-center text-ink-soft">{error}</p>;
  }
  if (authLoading || !user || !bookings) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const count = (t: BookingTab) => rows.filter((r) => r.tab === t).length;
  const balancesDue = rows.filter((r) => r.tab === "over" && !overPill(r.b).paid).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.tab === filter);

  return (
    <div>
      <PageHeader
        eyebrow="Event management"
        title="Bookings"
        subtitle="Every celebration from signature to final payment."
        action={<NewMenu />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon="clock" tone="amber" label={TAB.deposit_due.label} value={count("deposit_due")} note="Signed, deposit not in" />
        <StatTile icon="bookings" tone="green" label={TAB.confirmed.label} value={count("confirmed")} note="Deposit in, event ahead" />
        <StatTile
          icon="sparkles"
          tone="grey"
          label={TAB.over.label}
          value={count("over")}
          note={balancesDue ? `${balancesDue} with a balance due` : "Past events"}
        />
      </div>

      {notice ? <p className="mt-4 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">{notice}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <section aria-label="Booking list" className="mt-4 rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">All clients</p>
            <p className="serif mt-1 text-lg text-ink">Booking list</p>
          </div>
          <div className="min-w-0 max-w-full">
            <FilterTabs<Filter>
              label="Bookings"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: rows.length },
                { value: "deposit_due", label: TAB.deposit_due.label, count: count("deposit_due") },
                { value: "confirmed", label: TAB.confirmed.label, count: count("confirmed") },
                { value: "over", label: TAB.over.label, count: count("over") },
              ]}
            />
          </div>
        </div>

        <div className="grid gap-2">
          {shown.map(({ b, tab }) => {
            const open = expanded === b.booking_id;
            const m = bookingMoney(b);
            const move = yourMove(b);
            return (
              <div
                key={b.booking_id}
                className={`overflow-hidden rounded-[13px] border bg-card transition ${
                  open ? "border-line shadow-[0_8px_24px_rgba(50,44,38,0.06)]" : "border-card-edge"
                }`}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => {
                    setExpanded(open ? null : b.booking_id);
                    if (!open) markSeen(b);
                  }}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-3.5 py-3 text-left md:grid-cols-[auto_minmax(0,1fr)_8rem_minmax(0,1fr)_7rem_6rem_auto]"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-maroon/10 text-xs font-bold text-maroon dark:bg-gold/15 dark:text-gold">
                    {initials(eventName(b))}
                  </span>
                  <span className="grid min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <strong className="truncate text-sm text-ink">{eventName(b)}</strong>
                      {isNewBooking(b) ? (
                        <span className="shrink-0 rounded-[6px] bg-gold/20 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.06em] text-gold">
                          New
                        </span>
                      ) : null}
                    </span>
                    <small className="truncate text-xs text-ink-faint">{b.service_name}</small>
                  </span>
                  <span className="hidden min-w-0 md:grid">
                    <small className="text-[0.68rem] text-ink-faint">Event date</small>
                    <strong className="truncate text-sm text-ink">{prettyDate(b.date_iso)}</strong>
                  </span>
                  <span className="hidden min-w-0 md:grid">
                    <small className="text-[0.68rem] text-ink-faint">Venue</small>
                    <strong className="truncate text-sm text-ink">{b.location || "TBD"}</strong>
                  </span>
                  <span className="justify-self-end md:justify-self-start">
                    {move ? (
                      <StatusPill tone="red" dot>
                        Your move
                      </StatusPill>
                    ) : m.overdue ? (
                      <StatusPill tone="red">Overdue</StatusPill>
                    ) : tab === "over" ? (
                      <StatusPill tone={overPill(b).paid ? "green" : "amber"}>{overPill(b).label}</StatusPill>
                    ) : (
                      <StatusPill tone={TAB[tab].tone}>{TAB[tab].label}</StatusPill>
                    )}
                  </span>
                  <span className="hidden text-right md:block">
                    <small className="block text-[0.68rem] text-ink-faint">Total</small>
                    <strong className="serif text-sm text-ink">{money(m.totalCents)}</strong>
                  </span>
                  <Icon
                    name="chevron"
                    size={17}
                    className={`text-ink-faint transition ${open ? "rotate-90" : ""}`}
                  />
                </button>
                {open ? (
                  <Expanded
                    b={b}
                    busy={busyId === b.booking_id}
                    onAct={(fn, success, fallback) => void act(b, fn, success, fallback)}
                    onChangeRequest={async (accept, message) => {
                      await act(
                        b,
                        () => respondToChange(b.change_request!.change_request_id, accept, message),
                        accept ? "Moved. Your client has been told." : "Declined. Your booking stays as it was.",
                      );
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <p className="py-14 text-center text-sm text-ink-faint">
            {rows.length === 0
              ? "No bookings yet. A booking appears here once the client signs their contract — requests and offers are on Leads."
              : "No bookings in this category."}
          </p>
        ) : null}
      </section>
    </div>
  );
}

export default function MyBookingsPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <BookingsInner />
    </Suspense>
  );
}
