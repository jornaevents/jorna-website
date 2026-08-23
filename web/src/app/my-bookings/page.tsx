"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  confirmBookingEvent,
  getMyVendor,
  getStripeStatus,
  listVendorBookings,
  respondToChange,
  setBookingStatus,
} from "@/lib/jorna";
import { checkInAtVenue, LocationError } from "@/lib/checkin";
import { paymentsSetup } from "@/lib/vendorPlan";
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  categoryLabel,
  eventIsOver,
  formatCheckInTime,
  priceLine,
  type StripeStatus,
  type VendorBooking,
  type VendorDetail,
} from "@/lib/types";
import { Button, Card, LinkButton } from "@/components/ui";
import { VendorNav } from "@/components/VendorNav";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { DateChangeRequest } from "@/components/DateChangeRequest";

/** "2027-06-14" → "14 Jun 2027". Raw ISO reads like a database row. */
function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

type Filter = "pending" | "upcoming" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Needs your answer" },
  { value: "upcoming", label: "Accepted" },
  { value: "all", label: "All" },
];

function matches(filter: Filter, b: VendorBooking): boolean {
  if (filter === "all") return true;
  if (filter === "pending")
    return b.status === "pending" || b.status === "negotiation_ongoing";
  return b.status === "approved" || b.status === "payment_confirmed";
}

/** Can this be checked into? True when the plan has a place — a booked venue,
    or the event's own address. Mirrors what the server resolves, so the button
    is never offered for a call it has to refuse. */
function hasVenue(b: VendorBooking): boolean {
  return b.checkin_latitude != null && b.checkin_longitude != null;
}

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  // Whether accepting here would actually get this vendor paid — the Stripe
  // gate used to only surface on /my-dashboard, so a vendor who works from
  // this page could accept any number of bookings without ever seeing it.
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [stripeChecked, setStripeChecked] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/my-bookings");
  }, [authLoading, user, router]);

  const load = useCallback(async (vendorId: string) => {
    const res = await listVendorBookings(vendorId, { limit: 100 });
    setBookings(res.items);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyVendor()
      .then(async (mine) => {
        if (cancelled) return;
        setVendor(mine);
        if (mine) {
          await load(mine.vendor_id);
          getStripeStatus(mine.vendor_id)
            .then((s) => !cancelled && setStripe(s))
            .catch(() => !cancelled && setStripe(null))
            .finally(() => !cancelled && setStripeChecked(true));
        }
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load your bookings."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, load]);

  async function decide(b: VendorBooking, status: "approved" | "rejected") {
    if (!vendor) return;
    const wasApproved = b.status === "approved";
    setBusyId(b.booking_id);
    setError(null);
    setNotice(null);
    try {
      await setBookingStatus(b.booking_id, status);
      setConfirmDecline(null);
      setConfirmCancel(null);
      setNotice(
        status === "approved"
          ? "Accepted. The client can pay now — the money is held until after the event."
          // Declining a request and pulling out of a booking are the same
          // call and very different acts; the confirmation should say which.
          : wasApproved
            ? "Cancelled. Your client has been told and it's off their plan."
            : "Declined.",
      );
      await load(vendor.vendor_id);
    } catch (err) {
      // A 409 means this date is already taken by another accepted booking.
      // The server's message explains it; show that rather than a generic error.
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't update that request. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  /** Run a release action, then refetch so the new state is authoritative. */
  async function release(
    b: VendorBooking,
    action: () => Promise<unknown>,
    fallback: string,
  ) {
    if (!vendor) return;
    setBusyId(b.booking_id);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load(vendor.vendor_id);
      setNotice("Confirmed. The payment releases once the client confirms too.");
    } catch (err) {
      // A LocationError explains a permission/GPS problem specifically —
      // showing the generic fallback instead left a blocked vendor no wiser
      // about why "make sure you're at the venue" kept failing when they were.
      setError(
        err instanceof ApiError || err instanceof LocationError ? err.message : fallback,
      );
    } finally {
      setBusyId(null);
    }
  }

  // The geolocation half lives in lib/checkin, shared with the vendor
  // dashboard, which offers the same action.
  function checkIn(b: VendorBooking) {
    void release(
      b,
      () => checkInAtVenue(b.booking_id),
      "Couldn't check you in — make sure you're at the venue.",
    );
  }

  function vendorConfirm(b: VendorBooking) {
    void release(
      b,
      () => confirmBookingEvent(b.booking_id),
      "Couldn't confirm — please try again.",
    );
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (!vendor) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">
          You&apos;re not selling on Jorna yet
        </h1>
        <p className="mt-3 text-ink-soft">
          Booking requests show up here once you have a vendor profile and at
          least one package.
        </p>
        <LinkButton href="/vendor-profile" className="mt-6">
          Create vendor profile
        </LinkButton>
      </div>
    );
  }

  const shown = bookings.filter((b) => matches(filter, b));
  const pendingCount = bookings.filter((b) => matches("pending", b)).length;
  const setup = paymentsSetup(stripe);
  const paymentsBlocked = stripeChecked && !setup.ready;

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <VendorNav />
      <header>
        <span className="eyebrow">Selling</span>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold sm:text-5xl">
          Booking requests
        </h1>
        <p className="mt-2 text-ink-soft">
          {pendingCount > 0
            ? `${pendingCount} waiting on you.`
            : "Nothing waiting on you right now."}
        </p>
      </header>

      {paymentsBlocked ? (
        <div className="mt-6 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink-soft">
          <p>
            <strong className="text-ink">{setup.title}.</strong> {setup.detail} You can still
            accept requests below, but you won&apos;t be paid for them until this is sorted.
          </p>
          <Link href="/my-earnings" className="mt-1.5 inline-block font-semibold text-gold hover:underline">
            {setup.cta} →
          </Link>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              filter === f.value
                ? "border-gold bg-gold/15 text-maroon dark:text-gold"
                : "border-card-edge bg-ground-2 text-ink-soft hover:border-gold/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-6 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">
          {notice}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="mt-12 text-center text-ink-soft">Nothing here yet.</p>
      ) : (
        <div className="mt-6 grid gap-3">
          {shown.map((b) => {
            const pay = b.payment_status ?? "unpaid";
            const state =
              pay !== "unpaid" && pay !== "processing"
                ? (PAYMENT_STATUS_LABELS[pay] ?? pay)
                : (BOOKING_STATUS_LABELS[b.status] ?? b.status);
            const decidable =
              b.status === "pending" || b.status === "negotiation_ongoing";
            // Pulling out of one already accepted. Only while the money hasn't
            // moved — past that the client is out of pocket for a date they're
            // holding, and unwinding it is a refund with its own rules. Mirrors
            // the server's MONEY_MOVED_STATUSES, so the button is never offered
            // for a call that has to be refused.
            const cancellable =
              b.status === "approved" &&
              !["processing", "paid", "released", "refunded", "disputed"].includes(
                (b.payment_status ?? "unpaid").toLowerCase(),
              );
            const price = priceLine(b);
            const dates =
              b.date_end && b.date_end !== b.date_iso
                ? `${b.date_iso} → ${b.date_end}`
                : b.date_iso;

            return (
              <Card key={b.booking_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="serif text-lg text-ink">
                      {b.service_name || "Package"}
                    </h3>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {b.client_name || "A client"}
                      {b.event_name ? ` · ${b.event_name}` : ""}
                      {b.service_category
                        ? ` · ${categoryLabel(b.service_subcategory || b.service_category)}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-ink-faint">
                      {[
                        dates,
                        b.time_start && b.time_end
                          ? `${b.time_start}–${b.time_end}`
                          : null,
                        b.location,
                        b.guest_count ? `${b.guest_count} guests` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-ink-soft">{state}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="serif text-lg text-ink">{money(price.amount)}</p>
                    {price.caption ? (
                      <p className="text-xs text-ink-faint">{price.caption}</p>
                    ) : null}
                    {b.price_pending_quantity ? (
                      <p className="mt-1 max-w-[12rem] text-xs text-gold">
                        Client still needs to add a quantity before paying.
                      </p>
                    ) : null}
                  </div>
                </div>

                {decidable ? (
                  confirmDecline === b.booking_id ? (
                    <div className="mt-3 rounded-lg bg-panel p-3">
                      <p className="text-xs text-ink-soft">
                        Decline this request? The client will need to find someone
                        else for this slot.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="md"
                          disabled={busyId === b.booking_id}
                          onClick={() => decide(b, "rejected")}
                        >
                          {busyId === b.booking_id ? "Declining…" : "Decline"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="md"
                          onClick={() => setConfirmDecline(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      {paymentsBlocked ? (
                        <p className="mb-2 text-right text-xs text-gold">
                          Accepting won&apos;t pay out yet — {setup.title.toLowerCase()}.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="md"
                          onClick={() => setConfirmDecline(b.booking_id)}
                        >
                          Decline
                        </Button>
                        <Button
                          size="md"
                          disabled={busyId === b.booking_id}
                          onClick={() => decide(b, "approved")}
                        >
                          {busyId === b.booking_id ? "Accepting…" : "Accept"}
                        </Button>
                      </div>
                    </div>
                  )
                ) : null}

                {/* Pulling out of a booking already accepted. A vendor whose
                    circumstances changed had no way out of one at all, so the
                    honest options were to say so in the chat and hope, or not
                    turn up. Quiet, and behind a confirmation: it is somebody
                    else's celebration losing a supplier. */}
                {cancellable ? (
                  confirmCancel === b.booking_id ? (
                    <div className="mt-3 rounded-lg bg-panel p-3">
                      <p className="text-xs text-ink-soft">
                        Cancel this booking? {b.client_name || "Your client"} is
                        told straight away, and it comes off their plan. They
                        haven&apos;t paid, so nothing is refunded — but they will
                        have to find someone else
                        {b.date_iso ? ` for ${prettyDate(b.date_iso)}` : ""}.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="md"
                          disabled={busyId === b.booking_id}
                          onClick={() => decide(b, "rejected")}
                        >
                          {busyId === b.booking_id
                            ? "Cancelling…"
                            : "Yes, cancel it"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="md"
                          onClick={() => setConfirmCancel(null)}
                        >
                          Keep the booking
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="quiet"
                        size="md"
                        onClick={() => setConfirmCancel(b.booking_id)}
                      >
                        Cancel this booking
                      </Button>
                    </div>
                  )
                ) : null}

                {/* Negotiation — on a negotiable request the vendor can counter
                    the client's offer or settle a price before accepting. */}
                {decidable && b.negotiable ? (
                  <div className="mt-3">
                    <NegotiationPanel
                      bookingId={b.booking_id}
                      listedPrice={b.price}
                      onSettled={() => {
                        setNotice("Price agreed — the booking is approved at the new price.");
                        void load(vendor.vendor_id);
                      }}
                    />
                  </div>
                ) : null}

                {/* The client wants to move this one. Their date is yours to
                    hold once you've agreed to it, so this is a question rather
                    than a change that has already happened to you. */}
                {b.change_request ? (
                  <DateChangeRequest
                    booking={b}
                    busy={busyId === b.change_request.change_request_id}
                    onAnswer={async (accept, message) => {
                      setBusyId(b.change_request!.change_request_id);
                      setNotice(null);
                      try {
                        await respondToChange(
                          b.change_request!.change_request_id,
                          accept,
                          message,
                        );
                        setNotice(
                          accept
                            ? "Moved. Your client has been told."
                            : "Declined. Your booking stays as it was.",
                        );
                        await load(vendor.vendor_id);
                      } catch (err) {
                        // The server names the clashing booking on a 409, which
                        // is the one thing that makes the refusal actionable.
                        setNotice(
                          err instanceof ApiError
                            ? err.message
                            : "That didn't work. Try again.",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  />
                ) : null}

                {/* The client's GPS arrival. Presence only — it is not their
                    escrow confirmation, so it never moves the payout along. */}
                {b.client_checked_in_at ? (
                  <p className="mt-3 text-xs text-green">
                    {b.client_name || "Your client"} checked in at the venue on{" "}
                    {formatCheckInTime(b.client_checked_in_at)}.
                  </p>
                ) : null}

                {/* Escrow release — the vendor's half, once the money is held */}
                {b.payment_status === "paid" ? (
                  <div className="mt-3 border-t border-line-soft pt-3">
                    {b.vendor_confirmed_at ? (
                      <p className="text-xs text-ink-soft">
                        {b.customer_confirmed_at
                          ? "Confirmed by both — your payout is on its way."
                          : "You've confirmed. Waiting on the client to confirm before the payment releases."}
                      </p>
                    ) : hasVenue(b) ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-ink-faint">
                          Check in at the venue to confirm you delivered.
                        </p>
                        <Button
                          size="md"
                          disabled={busyId === b.booking_id}
                          onClick={() => checkIn(b)}
                        >
                          {busyId === b.booking_id ? "Checking in…" : "Check in at venue"}
                        </Button>
                      </div>
                    ) : eventIsOver(b) ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-ink-faint">
                          Confirm the event happened to release your payment.
                        </p>
                        <Button
                          size="md"
                          disabled={busyId === b.booking_id}
                          onClick={() => vendorConfirm(b)}
                        >
                          {busyId === b.booking_id ? "Confirming…" : "Confirm"}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-soft">
                        You can confirm after the event
                        {b.date_iso && b.date_iso !== "TBD" ? ` (${b.date_iso})` : ""}.
                      </p>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
