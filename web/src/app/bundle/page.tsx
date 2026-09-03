"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  confirmBookingEvent,
  createCheckoutSession,
  deleteBundle,
  disputeBooking,
  getBundle,
  getGuestList,
  refundBooking,
  listBundles,
  listEvents,
  removeBookingFromBundle,
  renameBundle,
  selectBundle,
  updateBooking,
  updateEvent,
  CARD_RETURN_KEY,
  forgetSavedCard,
  getBundleConversation,
  getSavedCard,
  startCardSetup,
  type SavedCard,
} from "@/lib/jorna";
import { ServiceSwapPanel } from "@/components/ServiceSwapPanel";
import { MessageVendorButton } from "@/components/MessageVendorButton";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { ReviewPanel } from "@/components/ReviewPanel";
import { VenueCheckIn } from "@/components/VenueCheckIn";
import { RunSheet } from "@/components/RunSheet";
import { DateChangePanel } from "@/components/DateChangePanel";
import { CityCombobox } from "@/components/CityCombobox";
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  categoryLabel,
  autoReleaseOn,
  canConfirmBooking,
  eventHasStarted,
  lastDay,
  priceLine,
  priceUnitKind,
  refundWindowLeft,
  withinRefundWindow,
  type BundleBooking,
  type BundleDetail,
  type BundleEventInfo,
  type EventCreateInput,
  type EventItem,
  type GuestList,
} from "@/lib/types";
import {
  bookingGaps,
  celebrationProgress,
  describeGaps,
  isDeadBooking,
  isDraftBundle,
  missingCategories,
  moneyForBundle,
  planIsCommitted,
  planForBundle,
  sendReadiness,
  taskDetail,
} from "@/lib/planning";
import { clearAttentionCache } from "@/lib/attention";
import {
  formatAddress,
  isCompleteAddress,
  parseAddress,
  addressFromVenue,
  zipFromVenue,
  type Address,
} from "@/lib/address";
import { AddressFields } from "@/components/AddressFields";
import { DraftDetails } from "@/components/DraftDetails";
import { PlanProgress } from "@/components/PlanProgress";
import { ClientOnlyRoute } from "@/components/ClientOnlyRoute";
import { addressPin } from "@/lib/geocode";
import { Avatar, Button, Card, Field, LinkButton } from "@/components/ui";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/** "2026-08-08" → "8 Aug 2026". Raw ISO reads like a database row. */
function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "18:00" → "6:00 PM". Null when there's nothing readable to show. */
function clock(raw?: string | null): string | null {
  if (!raw || raw === "TBD") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * When and where this vendor is expected.
 *
 * Every booking has carried a date, a time window and its own location since
 * the day bookings existed, and no client screen showed any of it. The run
 * sheet does, but only in the week before — so for months a host with six
 * vendors booked had nowhere to check that the photographer had the right day,
 * or that the mehndi artist was coming to the house rather than the hall.
 *
 * Blank-tolerant on purpose: a draft is allowed to be missing all three, and
 * the gap notice above says so. This shows what is known rather than asserting
 * what isn't.
 */
function BookingWhen({
  booking,
  eventDateIso,
}: {
  booking: BundleBooking;
  /** The celebration's own date, so a booking on a different day can say so. */
  eventDateIso?: string | null;
}) {
  const date = prettyDate(booking.date_iso);
  const end = booking.date_end && booking.date_end !== booking.date_iso
    ? prettyDate(booking.date_end)
    : null;
  const start = clock(booking.time_start);
  const finish = clock(booking.time_end);
  const when = start ? `${start}${finish ? `–${finish}` : ""}` : null;
  // Worth flagging rather than leaving to be spotted: a booking sitting on a
  // different day from the celebration is either a second function or a
  // mistake, and both are things a host wants to see.
  const offDay =
    Boolean(date) &&
    Boolean(eventDateIso) &&
    eventDateIso !== "TBD" &&
    booking.date_iso !== eventDateIso;

  if (!date && !when && !booking.location) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
      {date ? (
        <span className={offDay ? "font-medium text-gold" : undefined}>
          {date}
          {end ? ` – ${end}` : ""}
        </span>
      ) : null}
      {when ? <span className="tabular-nums">{when}</span> : null}
      {booking.location ? (
        <span className="min-w-0 truncate text-ink-faint">{booking.location}</span>
      ) : null}
      {offDay ? (
        <span className="text-ink-faint">· not your main event day</span>
      ) : null}
    </div>
  );
}

/**
 * This booking's own headcount, editable.
 *
 * A celebration here is usually several gatherings with different guest lists —
 * a mehndi of eighty, a reception of three hundred — and the number that
 * matters is per gathering: a caterer bills against the function they're
 * working, not the week. The guest list has always modelled that
 * (FunctionHeadcount, per function), but the plan had a single field that fanned
 * one number across every booking, so the mehndi caterer was billed for the
 * reception.
 *
 * The API has taken a per-booking guest_count all along. This is the field that
 * was never offered. Only where it's still the client's to set: once a vendor
 * has been told a number, `locked_fields` says so and the server refuses.
 *
 * Also covers per-performer pricing (entertainment groups billed by how many
 * performers they're asked to provide) — same mechanics, `performer_count`
 * instead of `guest_count`.
 *
 * A booking's *need* for a given quantity is decided by the caller, not this
 * component — a vendor can opt in to requiring a guest count and/or a
 * performer count independently of price unit (Service.require_guest_count /
 * require_performer_count), so a single booking can need both at once. The
 * caller renders one of these per applicable `field`.
 */
function BookingGuests({
  booking,
  field: quantityField,
  onSaved,
}: {
  booking: BundleBooking;
  /** Which quantity this instance edits — the caller decides how many of
   *  these to render (0, 1, or 2) based on price unit + the opt-in flags. */
  field: "guests" | "performers";
  onSaved: () => void | Promise<void>;
}) {
  const isPerformer = quantityField === "performers";
  const count = isPerformer ? booking.performer_count : booking.guest_count;
  const noun = isPerformer ? "performer" : "guest";
  const bookingField = isPerformer ? "performer_count" : "guest_count";

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(count != null ? String(count) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = (booking.locked_fields ?? []).includes(bookingField);
  if (isBeyondActionable(booking) || isDeadBooking(booking)) return null;

  if (locked) {
    return (
      <p className="mt-2 text-xs text-ink-faint">
        {count} {noun}s — {booking.vendor_name || "your vendor"} has this number,
        so it&apos;s settled.
      </p>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateBooking(booking.booking_id, {
        [bookingField]: Number(value) > 0 ? Number(value) : null,
      });
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="mt-2 text-xs text-ink-soft">
        {count ? `${count} ${noun}s for this one` : `No ${noun} count yet`}{" "}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-semibold text-gold hover:underline"
        >
          {count ? "Change" : "Add"}
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={1}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="80"
        aria-label={`${noun[0].toUpperCase()}${noun.slice(1)}s for ${booking.service_name || "this package"}`}
        className="w-24 rounded-lg border border-card-edge bg-ground-2 px-2.5 py-1 text-sm tabular-nums text-ink outline-none focus:border-gold"
      />
      <Button size="md" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button variant="ghost" size="md" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      <span className="text-xs text-ink-faint">
        {isPerformer
          ? "Just this booking — how many performers this vendor needs to provide."
          : "Just this booking — a mehndi and a reception rarely share a headcount."}
      </span>
      {error ? (
        <span className="text-xs text-maroon dark:text-gold">{error}</span>
      ) : null}
    </div>
  );
}

/** A message with the one thing the old string didn't carry: whether it's
    good news. Everything used to render maroon, so "your confirmation is
    recorded" arrived looking like a failure. */
interface Note {
  text: string;
  ok: boolean;
}

function NoteLine({ note, className = "" }: { note: Note; className?: string }) {
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        note.ok ? "bg-green/10 text-green" : "bg-maroon/10 text-maroon dark:text-gold"
      } ${className}`}
    >
      {note.text}
    </p>
  );
}

type PanelKind = "refund" | "dispute" | "remove";
type Panel = { bookingId: string; kind: PanelKind } | null;

/**
 * Once money has moved, the composition is fixed — swapping or removing a
 * booking would strand a payment. Mirrors the iOS rule.
 */
function isBeyondActionable(b: BundleBooking): boolean {
  if (b.status === "payment_confirmed") return true;
  const ps = (b.payment_status ?? "unpaid").toLowerCase();
  return ["paid", "released", "refunded", "disputed"].includes(ps);
}

/**
 * Payment states where money has moved, is moving, or moved and came back.
 *
 * Mirrors the backend's MONEY_MOVED_STATUSES exactly, because that is what
 * refuses the delete — a plan holding any of these is a financial record before
 * it is a plan, and deleting it strands the charge rather than reversing it.
 *
 * Deliberately not `isBeyondActionable` above, which answers a different
 * question (can this booking still be swapped) and omits "processing".
 */
const MONEY_MOVED = ["processing", "paid", "released", "refunded", "disputed"];

/** What's been paid on this plan, or null when nothing has. */
function heldOnPlan(
  bookings: BundleBooking[],
): { amount: number; count: number } | null {
  const held = bookings.filter((b) =>
    MONEY_MOVED.includes((b.payment_status ?? "unpaid").toLowerCase()),
  );
  if (held.length === 0) return null;
  return {
    amount: held.reduce((sum, b) => sum + (b.price ?? 0), 0),
    count: held.length,
  };
}

/**
 * Out with a vendor, and not yet answered.
 *
 * A request in this state is on somebody else's screen. Editing it from here
 * means editing a question after it's been asked: swapping the service leaves
 * the vendor holding a request for something that isn't in the plan any more,
 * and haggling over a price they haven't agreed to supply yet is a conversation
 * out of order. The one thing that's still honestly yours is withdrawing it, so
 * that's the only thing offered.
 */
function isAwaitingVendor(b: BundleBooking, draft: boolean): boolean {
  if (draft || isBeyondActionable(b)) return false;
  return b.status === "pending" || b.status === "negotiation_ongoing";
}

/**
 * Escrow-aware status line for one booking.
 *
 * A draft's bookings are stored as "pending", whose label is "Awaiting vendor" —
 * but on a draft no vendor has been given anything to await. The store's word
 * for the row isn't the right word for the reader, so a draft says what's
 * actually true of it.
 */
function statusLine(b: BundleBooking, draft: boolean): { text: string; tone: string } {
  const pay = b.payment_status ?? "unpaid";
  // A payment in flight is its own state, and fell through to "Approved" —
  // so a client returning from Stripe, having just been told "Payment is
  // processing", found their booking captioned Approved with a Pay button
  // beside it. That reads as the payment having failed, and invites a second.
  if (pay === "processing") {
    return { text: "Payment processing", tone: "text-gold" };
  }
  if (pay !== "unpaid") {
    const tone =
      pay === "released"
        ? "text-green"
        : pay === "refunded" || pay === "disputed"
          ? "text-maroon dark:text-gold"
          : "text-gold";
    return { text: PAYMENT_STATUS_LABELS[pay] ?? pay, tone };
  }
  if (draft && (b.status === "pending" || b.status === "negotiation_ongoing")) {
    return { text: "Not sent yet", tone: "text-ink-faint" };
  }
  // Said in full on this page: "Awaiting vendor" is what the shared label calls
  // it, which reads fine in a vendor's own list and leaves a host wondering
  // whether the request went anywhere. Spelling out what's being waited for
  // answers that without them having to ask.
  if (b.status === "pending") {
    return { text: "Awaiting vendor approval", tone: "text-gold" };
  }
  return {
    // Rejected used to share the faintest tone with routine, already-settled
    // states — the one status change here a client hasn't necessarily seen
    // yet read as the least noticeable line on the page.
    text: BOOKING_STATUS_LABELS[b.status] ?? b.status,
    tone: b.status === "rejected" ? "text-maroon dark:text-gold" : "text-ink-soft",
  };
}

function BookingRow({
  booking,
  event,
  draft,
  busyId,
  note,
  panel,
  onPay,
  onConfirm,
  onOpenPanel,
  onClosePanel,
  onRefund,
  onDispute,
  onSwap,
  onRemove,
  onNegotiated,
  onUpdated,
}: {
  booking: BundleBooking;
  event: BundleEventInfo | null | undefined;
  draft: boolean;
  busyId: string | null;
  /** The result of the last action taken on this booking, if it was this one. */
  note: Note | null;
  panel: Panel;
  onPay: (b: BundleBooking) => void;
  onConfirm: (b: BundleBooking) => void;
  onOpenPanel: (bookingId: string, kind: PanelKind) => void;
  onClosePanel: () => void;
  onRefund: (b: BundleBooking) => void;
  onDispute: (b: BundleBooking, reason: string) => void;
  onSwap: (b: BundleBooking) => void;
  onRemove: (b: BundleBooking) => void;
  onNegotiated: () => void;
  /** Re-read the plan after an edit that isn't an escrow action. */
  onUpdated: () => void;
}) {
  const [reason, setReason] = useState("");
  const [showNeg, setShowNeg] = useState(false);
  const pay = booking.payment_status ?? "unpaid";
  const price = priceLine(booking);
  const status = statusLine(booking, draft);
  const awaiting = isAwaitingVendor(booking, draft);
  const busy = busyId === booking.booking_id;
  const openPanel = panel?.bookingId === booking.booking_id ? panel.kind : null;

  // Mirror the backend's checkout guards so we never offer a button that must
  // fail: only an approved, not-yet-paid booking with a resolvable total.
  //
  // "processing" is excluded. A charge is already in flight — offering to start
  // a second one is how a client pays twice for the same booking, and the
  // status line now says what's happening instead.
  const payable = booking.status === "approved" && pay === "unpaid";
  const blockedOnQuantity = payable && booking.price_pending_quantity;
  const pendingQuantityNoun =
    priceUnitKind(booking.price_unit) === "performer" ? "a performer count" : "a guest count or date range";

  // Escrow actions only exist while the money is held on the platform.
  const held = pay === "paid";
  const youConfirmed = Boolean(booking.customer_confirmed_at);
  const canConfirm = held && !youConfirmed && canConfirmBooking(booking);
  const refundable = held && withinRefundWindow(booking.paid_at);
  const refundLeft = refundable ? refundWindowLeft(booking.paid_at) : null;
  const gaps = bookingGaps(booking, event);

  return (
    <Card id={`booking-${booking.booking_id}`} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Avatar name={booking.vendor_name} size={40} />
          <div className="min-w-0">
            <h3 className="serif text-lg text-ink">{booking.service_name || "Package"}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">
              {booking.vendor_name}
              {booking.service_category
                ? ` · ${categoryLabel(booking.service_subcategory || booking.service_category)}`
                : ""}
            </p>
            <span
              className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-ground-2 px-2.5 py-0.5 text-xs font-medium ${status.tone}`}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {status.text}
            </span>
            <BookingWhen booking={booking} eventDateIso={event?.date_iso} />
            {priceUnitKind(booking.price_unit) === "person" || booking.require_guest_count ? (
              <BookingGuests booking={booking} field="guests" onSaved={onUpdated} />
            ) : null}
            {priceUnitKind(booking.price_unit) === "performer" ||
            booking.require_performer_count ? (
              <BookingGuests booking={booking} field="performers" onSaved={onUpdated} />
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="serif text-lg text-ink">{money(price.amount)}</p>
          {price.caption ? <p className="text-xs text-ink-faint">{price.caption}</p> : null}
        </div>
      </div>

      {/* What this one still needs. On a draft nobody has been told anything
          yet, so saying the vendor "can't act" would be describing a request
          that hasn't been made. */}
      {/* `isBeyondActionable` is false for a rejected unpaid booking, so a
          vendor who has already declined was still being reported as unable to
          act until it had a guest count. Nothing is waiting on a dead booking. */}
      {gaps.length > 0 && !isBeyondActionable(booking) && !isDeadBooking(booking) ? (
        <p className="mt-3 rounded-lg border border-gold/50 bg-gold/[0.08] px-3 py-2 text-xs text-ink-soft">
          {draft
            ? `Needs ${describeGaps(gaps)} before ${booking.vendor_name || "this vendor"} can be asked.`
            : `${booking.vendor_name || "The vendor"} can't act on this until it has ${describeGaps(gaps)}.`}
        </p>
      ) : null}

      {/* Payment */}
      {blockedOnQuantity ? (
        <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink-soft">
          {/* Reached only when the quantity is still pending, so the caption is
              the rate label rather than a total. */}
          This package is priced {price.caption || "per unit"}. Its total needs {pendingQuantityNoun}
          before it can be paid —{" "}
          <a href="#still-needed" className="font-medium text-gold hover:underline">
            add that above
          </a>
          .
        </p>
      ) : payable ? (
        <div className="mt-3 flex justify-end">
          <Button onClick={() => onPay(booking)} disabled={busy}>
            {busy ? "Opening checkout…" : `Pay ${money(booking.price)}`}
          </Button>
        </div>
      ) : null}

      {/* Negotiation — only on a negotiable service, before any money moves,
          and not while the vendor is still deciding whether to take the job.
          Not on a draft either: `awaiting` is false there because nothing has
          been asked, which let the button through on a booking no vendor has
          received. Haggling over a job nobody has been offered is a
          conversation out of order — and the backend confirms they genuinely
          haven't been told (booking_service skips the notification on a draft). */}
      {booking.open_to_price_negotiation &&
      !isBeyondActionable(booking) &&
      !isDeadBooking(booking) &&
      !awaiting &&
      !draft ? (
        showNeg ? (
          <div className="mt-3">
            <NegotiationPanel
              bookingId={booking.booking_id}
              listedPrice={booking.price}
              onSettled={onNegotiated}
            />
          </div>
        ) : (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="md" onClick={() => setShowNeg(true)}>
              Negotiate price
            </Button>
          </div>
        )
      ) : null}

      {/* Composition — only while no money has moved. Once the request is out,
          withdrawing it is the only change left that's honestly the host's to
          make, so the row of options collapses to that one. */}
      {!isBeyondActionable(booking) ? (
        openPanel === "remove" ? (
          <div className="mt-3 rounded-lg bg-panel p-3">
            <p className="text-xs text-ink-soft">
              {awaiting
                ? `Withdraw your request to ${booking.vendor_name || "this vendor"}? They'll stop seeing it, and the rest of your plan carries on. You can book them again later.`
                : `Remove ${booking.service_name || "this package"} from the bundle? The rest of your bundle is unaffected.`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="md" disabled={busy} onClick={() => onRemove(booking)}>
                {busy
                  ? awaiting
                    ? "Cancelling…"
                    : "Removing…"
                  : awaiting
                    ? "Cancel request"
                    : "Remove"}
              </Button>
              <Button variant="ghost" size="md" onClick={onClosePanel}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {/* On the row, because "I have a question about the photographer"
                starts at the photographer — not at a tab listing every chat
                you're in.

                It used to open the plan's group chat, which has every vendor on
                it: the question was right, the room was wrong. This opens the
                thread with that one vendor. The group chat is still a click
                away at the top of the page, where it's about the whole plan. */}
            <MessageVendorButton bookingId={booking.booking_id} />
            {booking.service_category && !awaiting ? (
              <Button variant="ghost" size="md" onClick={() => onSwap(booking)}>
                Swap package
              </Button>
            ) : null}
            <Button
              variant="quiet"
              size="md"
              onClick={() => onOpenPanel(booking.booking_id, "remove")}
            >
              {awaiting ? "Cancel request" : "Remove"}
            </Button>
          </div>
        )
      ) : null}

      {/* Escrow release */}
      {held ? (
        <div className="mt-3 border-t border-line-soft pt-3">
          {youConfirmed ? (
            // Which half is outstanding, rather than an assumption about it.
            // Written unconditionally, this named the vendor as the holdup on a
            // booking whose vendor had confirmed thirty seconds earlier — their
            // GPS check-in is their confirmation, so on the day it is routinely
            // the first of the two to land. What holds the money then is the
            // transfer itself, and telling the client to wait on someone who is
            // already done sends them to chase the wrong person.
            <p className="text-xs text-ink-soft">
              {booking.vendor_confirmed_at
                ? `Confirmed by both of you. ${booking.vendor_name || "Your vendor"}'s payment is on its way — it can take a little while to land.`
                : "You've confirmed. The vendor still needs to confirm before the payment is released."}
            </p>
          ) : !canConfirm ? (
            // The date named is the one being waited for — the last day, for a
            // booking that spans several. Quoting the start date told a client
            // with a Friday-to-Sunday booking they could confirm on the Friday.
            <p className="text-xs text-ink-soft">
              {eventHasStarted(booking)
                ? `You can confirm as soon as ${booking.vendor_name || "your vendor"} checks in at the venue — you don't have to wait for the booking to run out.`
                : `You can confirm after the event${
                    prettyDate(lastDay(booking)) ? ` (${prettyDate(lastDay(booking))})` : ""
                  }. Funds are never released before then.`}
            </p>
          ) : (
            // Said before it happens, not after. The money moves on its own a
            // week past the event, and a client who finds that out from a
            // receipt has been surprised by their own payment — so the date is
            // on the screen, next to the button that would settle it sooner,
            // together with the one thing that stops it.
            //
            // The condition leads, because it is a real one: auto-release also
            // needs the vendor to have confirmed. Written the old way — "if you
            // do nothing, this releases on {date}" — it promised a date that
            // never arrives for a plan whose vendor stays quiet, and implied
            // the client's inaction alone was enough.
            <p className="text-xs text-ink-soft">
              {prettyDate(autoReleaseOn(booking))
                ? `Confirming pays ${booking.vendor_name || "your vendor"} now. Once they've confirmed too, this releases on its own from ${prettyDate(autoReleaseOn(booking))} even if you don't — raise an issue before then if something went wrong.`
                : `Confirming pays ${booking.vendor_name || "your vendor"} now.`}
            </p>
          )}

          {openPanel === "refund" ? (
            <div className="rounded-lg bg-panel p-3">
              <p className="text-xs text-ink-soft">
                Request a full refund of {money(booking.price)}? This cancels the
                booking with this vendor. Only the rest of your bundle is unaffected.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="md" disabled={busy} onClick={() => onRefund(booking)}>
                  {busy ? "Requesting…" : "Confirm refund"}
                </Button>
                <Button variant="ghost" size="md" onClick={onClosePanel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : openPanel === "dispute" ? (
            <div className="rounded-lg bg-panel p-3">
              <p className="text-xs text-ink-soft">
                Tell us what went wrong. This freezes only this booking&apos;s payment
                for our team to review — the rest of your bundle carries on.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="What happened?"
                className="mt-2 w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="md"
                  disabled={busy}
                  onClick={() => onDispute(booking, reason)}
                >
                  {busy ? "Submitting…" : "Submit report"}
                </Button>
                <Button variant="ghost" size="md" onClick={onClosePanel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {refundable ? (
                <>
                  {/* Named, because it expires. The window runs from paid_at —
                      with a card on file, a moment the client didn't choose and
                      may never have seen — and the button used to vanish
                      without ever having said it was going to. */}
                  {refundLeft ? (
                    <span className="mr-auto text-xs text-ink-faint">
                      Full refund available for another {refundLeft}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => onOpenPanel(booking.booking_id, "refund")}
                  >
                    Request refund
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="md"
                onClick={() => onOpenPanel(booking.booking_id, "dispute")}
              >
                Report a problem
              </Button>
              {canConfirm ? (
                <Button disabled={busy} onClick={() => onConfirm(booking)}>
                  {busy ? "Confirming…" : "Confirm & release"}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* What just happened, on the card it happened to. */}
      {note ? <NoteLine note={note} className="mt-3" /> : null}

      {/* Review — once the client has paid (or funds released) they can rate it */}
      {booking.status === "payment_confirmed" ||
      booking.payment_status === "paid" ||
      booking.payment_status === "released" ? (
        <ReviewPanel bookingId={booking.booking_id} />
      ) : null}
    </Card>
  );
}

/**
 * The card the backend charges as each vendor accepts.
 *
 * Shown on a sent plan as well as a draft. It used to live inside the draft
 * banner, which disappears the moment you send — so from then on the card that
 * would be charged, automatically, for every acceptance was unnamed and
 * unchangeable. A stale card meant failed charges the client couldn't fix, and
 * removing one wasn't possible from the web at all until Remove was added
 * alongside Change.
 *
 * Nothing here charges anything; the backend does that, on acceptance.
 */
function CardOnFile({
  card,
  busy,
  removing,
  onAdd,
  onRemove,
  sent,
}: {
  card: SavedCard | null;
  busy: boolean;
  removing: boolean;
  onAdd: () => void;
  onRemove: () => void;
  sent: boolean;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const named = card?.has_card
    ? `${card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : "Card"}${
        card.last4 ? ` ending ${card.last4}` : ""
      }`
    : null;

  return (
    <div className="mt-4 rounded-xl bg-ground-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {named ? (
            <>
              <span className="font-medium text-ink">{named}</span>
              {sent
                ? " — charged automatically as each vendor accepts. You won't be asked again."
                : " — charged as each vendor accepts, never for one who declines."}
            </>
          ) : sent
            ? "No card on file, so you'll be asked to pay each booking yourself as vendors accept."
            : "Add a card and each vendor is paid as they accept. Without one you'll be asked to pay each booking yourself."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="md" disabled={busy || removing} onClick={onAdd}>
            {busy ? "Opening…" : named ? "Change card" : "Add a card"}
          </Button>
          {/* Removing was never possible from the web at all until now — this
              is the way back to "no card on file" once one's been added. */}
          {named ? (
            <Button
              variant="quiet"
              size="md"
              disabled={busy || removing}
              onClick={() => setConfirmingRemove(true)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {confirmingRemove ? (
        <div className="mt-3 rounded-lg bg-panel p-3">
          <p className="text-xs text-ink-soft">
            Remove this card? You&apos;ll be asked to pay each booking yourself
            as vendors accept, instead of being charged automatically.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="md"
              disabled={removing}
              onClick={() => {
                setConfirmingRemove(false);
                onRemove();
              }}
            >
              {removing ? "Removing…" : "Remove card"}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setConfirmingRemove(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={muted ? "text-ink-faint" : "text-ink"}>{value}</p>
    </div>
  );
}

/**
 * The event — everything it records, in one place, editable.
 *
 * Event and bundle are one thing to whoever's planning; "bundle" is the
 * backend's word for it. This panel shows the event's side of that pair.
 *
 * It used to show date, location and guests only, because that's all a bundle's
 * embedded `event` summary carries; budget, description, and what the host said
 * they needed lived on a separate /event page reached by a second button. The
 * dashboard now opens straight here, so the full event is loaded alongside and
 * shown together.
 *
 * `full` is the real EventItem when it could be fetched (there is no
 * GET /events/{id} — the list is the source), and null when it couldn't. The
 * summary always exists, so the panel degrades to what it always showed rather
 * than to nothing.
 *
 * Only non-empty fields are sent (PATCH is exclude_unset), so saving never
 * blanks a value.
 */
/**
 * Who's coming, in one line, with the way through to the list.
 *
 * The guest list is its own page — it gets worked over months, in short bursts,
 * and it isn't about vendors. What belongs here is the one number that changes
 * a decision: how the replies sit against the count the vendors were booked
 * against. Reports it; changes nothing. A caterer holding two hundred is
 * holding a promise, and no RSVP arriving on a Tuesday should move it.
 */
function GuestsRow({
  eventId,
  bundleId,
  plannedFor,
}: {
  eventId: string;
  bundleId: string;
  plannedFor?: number | null;
}) {
  const [list, setList] = useState<GuestList | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGuestList(eventId)
      .then((data) => !cancelled && setList(data))
      .catch(() => {
        /* The list is an extra, not the page. Silence beats an error here. */
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const href = `/guests?event=${eventId}&bundle=${bundleId}`;
  const started = (list?.guests.length ?? 0) > 0;

  // The biggest gathering, named as such.
  //
  // This was the same max, reported as "N coming" — the largest single
  // function's number presented as the celebration's, which is a different
  // claim and usually a smaller one. A celebration is several gatherings with
  // different lists, and there is no single honest total: summing them
  // double-counts everyone invited to more than one.
  const biggest = list
    ? list.headcount.reduce(
        (best, h) => (h.attending > (best?.attending ?? -1) ? h : best),
        null as (typeof list.headcount)[number] | null,
      )
    : null;
  const attending = biggest?.attending ?? 0;
  const manyFunctions = (list?.headcount.length ?? 0) > 1;
  const waiting = list ? list.headcount.reduce((n, h) => n + h.no_reply, 0) : 0;
  const gap = plannedFor && plannedFor > 0 ? attending - plannedFor : null;

  return (
    <div className="mt-4 border-t border-line-soft pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint">
            Guest list
          </p>
          {started ? (
            <p className="text-ink">
              <span className="tabular-nums">{attending}</span> coming
              {manyFunctions && biggest?.name ? (
                <span className="text-ink-soft"> to {biggest.name}</span>
              ) : null}
              {waiting > 0 ? (
                <span className="text-ink-soft">
                  {" "}
                  · <span className="tabular-nums">{waiting}</span> yet to reply
                </span>
              ) : null}
              {gap != null && gap < 0 && waiting === 0 ? (
                <span className="text-ink-soft">
                  {" "}
                  · <span className="tabular-nums">{Math.abs(gap)}</span> under the{" "}
                  <span className="tabular-nums">{plannedFor}</span> you booked for
                </span>
              ) : null}
              {gap != null && gap > 0 ? (
                <span className="text-ink-soft">
                  {" "}
                  · <span className="tabular-nums">{gap}</span> over the{" "}
                  <span className="tabular-nums">{plannedFor}</span> you booked for
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-ink-faint">
              Nobody invited yet — send a link and let people reply.
            </p>
          )}
        </div>
        <LinkButton href={href} variant="ghost" size="md">
          {started ? "Open guest list" : "Start a guest list"}
        </LinkButton>
      </div>
    </div>
  );
}

function CelebrationPanel({
  summary,
  full,
  bookings,
  bundleId,
  onSaved,
}: {
  summary: BundleEventInfo;
  full: EventItem | null;
  bookings: BundleBooking[];
  bundleId: string;
  onSaved: () => void | Promise<void>;
}) {
  // A booked venue is where the event is, and it knows its own address; asking
  // for it again is asking the client to copy out something the plan contains.
  const venueLocations = bookings
    .filter((b) => b.service_category === "venue" && !isDeadBooking(b))
    .map((b) => b.location);
  const venueAddress = addressFromVenue(venueLocations);
  const venueZip = zipFromVenue(venueLocations);
  const dateIso = full?.date_iso ?? summary.date_iso;
  const hasDate = Boolean(dateIso && dateIso !== "TBD");
  const location = full?.location ?? summary.location;
  const guestCount = full?.guest_count ?? summary.guest_count;
  const budget = full?.budget ?? null;

  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(hasDate ? (dateIso as string) : "");
  // Filled in, not merely suggested — a hint you still have to retype isn't
  // autofill. The venue's whole address where there is one; otherwise whatever
  // was saved before, with the venue's postcode filling a blank.
  const [addr, setAddr] = useState<Address>(() => {
    if (venueAddress) return venueAddress;
    const parsed = parseAddress(location);
    return parsed.zip || !venueZip ? parsed : { ...parsed, zip: venueZip };
  });
  const [showGaps, setShowGaps] = useState(false);
  const [guests, setGuests] = useState(guestCount != null ? String(guestCount) : "");
  const [spend, setSpend] = useState(budget != null ? String(budget) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The date, address and headcount stop being editable here once a vendor has
  // been asked to hold them. Budget stays: no vendor is ever shown it.
  const live = bookings.filter((b) => !isDeadBooking(b));
  const committed = planIsCommitted(live);

  async function save() {
    setBusy(true);
    setError(null);
    // A half-written address is worse than none: vendors are sent to it. So an
    // incomplete one isn't saved — but it no longer holds the rest of the form
    // hostage. The budget is never shown to a vendor, and refusing to record
    // what someone means to spend because they haven't found the venue's
    // postcode yet is a gate with nothing behind it.
    const addressReady = isCompleteAddress(addr);
    const addressStarted = Boolean(formatAddress(addr).trim());
    if (!committed && addressStarted && !addressReady) setShowGaps(true);

    const updates: Partial<EventCreateInput> = {};
    if (spend) updates.budget = Number(spend);
    if (!committed) {
      if (date) updates.date_iso = date;
      if (addressReady) updates.location = formatAddress(addr);
      if (guests) updates.guest_count = Number(guests);
      // The address as a point, so a plan held somewhere the client arranged
      // themselves can still be checked into. Silent when it can't be resolved —
      // the address is what was asked for, and the pin is the app's problem.
      if (addressReady) Object.assign(updates, await addressPin(addr));
    }
    try {
      if (Object.keys(updates).length > 0) await updateEvent(summary.event_id, updates);
      // The same values onto the bookings, because those are what a vendor is
      // sent and what the send check reads. Without this the two cards
      // disagreed: a headcount typed here updated the event and left every
      // booking as it was, so the card above went on asking for a number the
      // client had just supplied. Only while nothing is committed — past that
      // these fields aren't shown at all.
      if (!committed) {
        await Promise.all(
          live.map((b) =>
            updateBooking(b.booking_id, {
              ...(date ? { date_iso: date } : {}),
              ...(addressReady ? { location: formatAddress(addr) } : {}),
              ...(guests ? { guest_count: Number(guests) } : {}),
            }),
          ),
        );
      }
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your changes. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-4 border-t border-line-soft pt-4">
        <p className="mb-3 text-sm font-medium text-ink-soft">Event details</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!committed ? (
            <>
              <Field
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Field
                label="Guests"
                type="number"
                min={1}
                placeholder="200"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
              />
            </>
          ) : null}
          <Field
            label="Budget"
            type="number"
            min={0}
            placeholder="40000"
            hint="What you're aiming to spend across every vendor."
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
          />
        </div>

        {!committed ? (
          <div className="mt-4 border-t border-line-soft pt-4">
            <p className="mb-3 text-sm font-medium text-ink-soft">Where it&apos;s happening</p>
            <AddressFields
              value={addr}
              onChange={setAddr}
              showGaps={showGaps}
              zipHint={venueZip && venueZip === addr.zip ? venueZip : null}
            />
          </div>
        ) : (
          // Said plainly rather than by disabling four inputs nobody can use.
          // The date and address are what the vendors agreed to hold; changing
          // them is cancelling a request and making a new one, which is a
          // decision rather than an edit.
          //
          // Naming something the client can actually do. This said "cancel the
          // requests affected and book again" — but a paid booking has no
          // cancel button, and the server refuses to remove one anyway, so the
          // one instruction on screen pointed at a control that isn't there.
          // See RESCHEDULE_PROPOSAL.md for the flow this is standing in for.
          <p className="mt-4 border-t border-line-soft pt-4 text-sm text-ink-soft">
            Your vendors have this plan&apos;s date, address and headcount, so
            those are settled. An unpaid request can be cancelled and booked
            again. Once a booking is paid, message the vendor to agree a change —
            or report a problem on it if they can&apos;t accommodate one.
          </p>
        )}
        {error ? (
          <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}
        {/* No delete here. Deleting is one action on one thing, and it lives
            in the header beside the name — a second one down here, worded as
            though the event were separable from its bookings, is exactly the
            split this page no longer has. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="md" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save details"}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    // No card of its own: this renders inside the plan's summary card, whose
    // border is the one the reader sees. A second border here drew a seam
    // through one answer.
    <div className="mt-4 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Detail
            label="Date"
            value={prettyDate(dateIso) ?? "Not set"}
            muted={!hasDate}
          />
          <Detail label="Location" value={location || "Not set"} muted={!location} />
          <Detail
            label="Guests"
            value={guestCount != null ? String(guestCount) : "Not set"}
            muted={guestCount == null}
          />
          <Detail
            label="Budget"
            value={budget != null ? money(budget) : "Not set"}
            muted={budget == null}
          />
        </div>
        <Button variant="ghost" size="md" onClick={() => setEditing(true)}>
          Edit details
        </Button>
      </div>

      {full?.description ? (
        <p className="mt-4 border-t border-line-soft pt-3 text-sm text-ink-soft">
          {full.description}
        </p>
      ) : null}

      <GuestsRow
        eventId={summary.event_id}
        bundleId={bundleId}
        plannedFor={guestCount}
      />

      {full?.services_needed?.length ? (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint">
            You said you needed
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {full.services_needed.map((c) => (
              <span
                key={c}
                className="rounded-full border border-card-edge bg-ground-2 px-2.5 py-0.5 text-xs text-ink-soft"
              >
                {categoryLabel(c)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BundleInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const bundleId = params.get("id");

  const [bundle, setBundle] = useState<BundleDetail | null>(null);
  // The event in full, and any other bundles filed under it. Both are extras:
  // the page works without either, so a failure here doesn't block the plan.
  const [event, setEvent] = useState<EventItem | null>(null);
  const [siblings, setSiblings] = useState<BundleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  // A message about the whole plan — sending, renaming, swapping.
  const [notice, setNotice] = useState<Note | null>(null);
  // The card we'll charge as vendors accept. Fetched for a plan that can be
  // sent, because that's the only screen where it changes what happens next.
  const [card, setCard] = useState<SavedCard | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);
  // A message about one booking, shown on that booking's own card. Confirming,
  // paying, refunding and disputing all happen on a card that may be well down
  // a long page; putting their answers at the top meant pressing Confirm and
  // watching nothing happen, with the reply — success or failure — scrolled out
  // of sight above.
  const [rowNote, setRowNote] = useState<(Note & { bookingId: string }) | null>(null);
  // The plan's group chat. Created by the backend when the plan is sent, and
  // until now reachable only by finding it in the Messages tab and guessing
  // which of "Group · 4 people" was this wedding.
  const [chatId, setChatId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<BundleBooking | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/bundle${bundleId ? `?id=${bundleId}` : ""}`);
    }
  }, [authLoading, user, router, bundleId]);

  const load = useCallback(async () => {
    if (!bundleId || !user) return;
    try {
      const detail = await getBundle(bundleId);
      setBundle(detail);

      // Silent on failure: with no card the plan still sends, and each booking
      // is payable by hand exactly as it was before.
      void getSavedCard()
        .then(setCard)
        .catch(() => {});

      // Likewise the chat: a draft has none, and a failure just means the link
      // doesn't appear. Nothing on this page depends on it.
      void getBundleConversation(bundleId)
        .then((c) => setChatId(c?.conversation_id ?? null))
        .catch(() => {});

      // There is no GET /events/{id}, so the list is the source of the event's
      // full record — budget, description, and what they said they needed, none
      // of which the bundle's embedded summary carries.
      const eventId = detail.event_id ?? detail.event?.event_id ?? null;
      if (eventId) {
        void listEvents()
          .then((all) => setEvent(all.find((e) => e.event_id === eventId) ?? null))
          .catch(() => {});
        void listBundles()
          .then((all) =>
            setSiblings(
              all.filter((b) => b.bundle_id !== detail.bundle_id && b.event_id === eventId),
            ),
          )
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this bundle.");
    } finally {
      setLoading(false);
    }
  }, [bundleId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // A conversation's offer card links here with #booking-<id> to land on the
  // specific booking rather than the top of the plan. The hash is in the URL
  // before that row exists — this page loads its data after mount — so the
  // browser's own anchor-scroll fires too early and finds nothing; this does
  // it once the booking is actually in the DOM.
  useEffect(() => {
    if (!bundle) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [bundle]);

  /** Run an escrow action, then refresh so the new state is authoritative. */
  async function run(
    booking: BundleBooking,
    action: () => Promise<unknown>,
    success: string,
    failure: string,
  ) {
    setBusyId(booking.booking_id);
    setNotice(null);
    setRowNote(null);
    try {
      await action();
      setPanel(null);
      setRowNote({ bookingId: booking.booking_id, text: success, ok: true });
      await load();
    } catch (err) {
      setRowNote({
        bookingId: booking.booking_id,
        text: err instanceof ApiError ? err.message : failure,
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  }

  /**
   * One name, written to both records.
   *
   * The backend keeps an event and a bundle, but to whoever's planning they are
   * a single thing — the bundle is the backend's word for it. Renaming only the
   * bundle left the event still called what the builder generated, and the
   * dashboard reads the event's name, so the change appeared to do nothing.
   */
  async function saveName() {
    if (!bundleId || !newName.trim()) return;
    const name = newName.trim();
    const eventId = bundle?.event_id ?? bundle?.event?.event_id ?? null;
    setBundleBusy(true);
    try {
      await renameBundle(bundleId, name);
      if (eventId) await updateEvent(eventId, { name });
      setRenaming(false);
      await load();
    } catch (err) {
      setNotice({ text: err instanceof ApiError ? err.message : "Couldn't rename this event.", ok: false });
    } finally {
      setBundleBusy(false);
    }
  }

  /**
   * Delete the whole thing — bundle and event both.
   *
   * The event is the server's job, not ours. _delete_bundle_cascade removes it
   * only once no other bundle references it; this used to call DELETE /events
   * afterwards as well, which has no such check — so deleting one of two
   * bundles filed under a celebration took the celebration with it and orphaned
   * the other, defeating a guard written to prevent exactly that. The sibling
   * links are rendered further down this very page.
   *
   * A plan holding money can't be deleted at all; the server refuses and the
   * button isn't offered. See heldOnPlan.
   */
  async function removeBundle() {
    if (!bundleId) return;
    setBundleBusy(true);
    try {
      await deleteBundle(bundleId);
      router.push("/bundles");
    } catch (err) {
      setNotice({ text: err instanceof ApiError ? err.message : "Couldn't delete this event.", ok: false });
      setBundleBusy(false);
    }
  }

  /**
   * Release the draft to its vendors.
   *
   * /bundles/{id}/select is the call that notifies them; it also discards the
   * other two options from the same generation, which is why it's right that
   * this happens once, deliberately, rather than at the moment of picking.
   */
  async function addCard() {
    setAddingCard(true);
    setNotice(null);
    try {
      const { setup_url } = await startCardSetup();
      // Left before leaving, because we don't come back through this code —
      // Stripe returns to a fixed URL on its own terms. Coming back to this
      // plan rather than the dashboard: they were in the middle of sending it.
      try {
        sessionStorage.setItem(CARD_RETURN_KEY, `/bundle?id=${bundleId}`);
      } catch {
        // Private browsing with storage disabled. The landing page falls back
        // to the dashboard, which is a worse answer but not a broken one.
      }
      window.location.href = setup_url;
    } catch (err) {
      setNotice({
        text: err instanceof ApiError ? err.message : "Couldn't open the card form.",
        ok: false,
      });
      setAddingCard(false);
    }
  }

  /** Detach the saved card. Nothing already charged is affected — this only
   *  stops the next automatic one, the same as never having added a card. */
  async function removeCard() {
    setRemovingCard(true);
    setNotice(null);
    try {
      setCard(await forgetSavedCard());
    } catch (err) {
      setNotice({
        text: err instanceof ApiError ? err.message : "Couldn't remove that card.",
        ok: false,
      });
    } finally {
      setRemovingCard(false);
    }
  }

  async function send() {
    if (!bundleId || !bundle) return;
    setBundleBusy(true);
    setNotice(null);
    try {
      await selectBundle(bundleId);
      clearAttentionCache();
      setNotice({ text: "Sent. Your vendors have been asked — you'll see their answers here.", ok: true });
      await load();
    } catch (err) {
      setNotice({ text: err instanceof ApiError ? err.message : "Couldn't send these requests. Try again.", ok: false });
    } finally {
      setBundleBusy(false);
    }
  }

  async function pay(booking: BundleBooking) {
    setBusyId(booking.booking_id);
    setNotice(null);
    try {
      const { checkout_url } = await createCheckoutSession(booking.booking_id);
      window.location.href = checkout_url;
    } catch (err) {
      setNotice({
        text: err instanceof ApiError ? err.message : "Couldn't start checkout. Try again.",
        ok: false,
      });
      setBusyId(null);
      if (err instanceof ApiError && err.status === 409) void load();
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (error || !bundle) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">{error ?? "Bundle not found."}</p>
        <LinkButton href="/bundles" variant="ghost" className="mt-5">
          Back to the dashboard
        </LinkButton>
      </div>
    );
  }

  const plan = planForBundle(bundle);
  const cash = moneyForBundle(bundle);
  // The same reading as the dashboard card this page opens from — one bundle
  // rather than a celebration's several, and the categories the client listed
  // and hasn't covered counted the same way.
  const progress = celebrationProgress(
    [bundle],
    missingCategories(event?.services_needed, [bundle]).length,
  );
  const draft = isDraftBundle(bundle);
  const heldMoney = heldOnPlan(bundle.bookings ?? []);
  // The address forms seed themselves once, from the venue when there is one.
  // Swapping the venue changes the answer but not the state React is already
  // holding, so the old address stayed on screen — and would have been saved
  // over the new one. Keying on the venue remounts them with fresh seeds, which
  // is the whole of "the location follows the venue".
  const venueKey =
    (bundle.bookings ?? [])
      .filter((b) => b.service_category === "venue" && !isDeadBooking(b))
      .map((b) => b.location ?? "")
      .join("|") || "no-venue";
  const readiness = sendReadiness(bundle);

  // The same row wherever a booking appears — the sections below differ only in
  // which bookings they hold, not in what a booking can do.
  const renderRow = (b: BundleBooking) => (
    <BookingRow
      key={b.booking_id}
      booking={b}
      event={bundle.event}
      draft={draft}
      busyId={busyId}
      note={rowNote?.bookingId === b.booking_id ? rowNote : null}
      panel={panel}
      onPay={pay}
      onOpenPanel={(bookingId, kind) => {
        setNotice(null);
        setPanel({ bookingId, kind });
      }}
      onClosePanel={() => setPanel(null)}
      onConfirm={(bk) =>
        run(
          bk,
          () => confirmBookingEvent(bk.booking_id),
          // A vendor who has checked in has already confirmed, so pressing this
          // is often the second of the two, not the first. Promising a release
          // "once the vendor confirms" in that case names a step that happened
          // before the client even opened the page.
          bk.vendor_confirmed_at
            ? "Thanks — that's both of you. The payment is on its way to the vendor."
            : "Thanks — your confirmation is recorded. The payment releases once the vendor confirms too.",
          "Couldn't confirm this booking. Please try again.",
        )
      }
      onRefund={(bk) =>
        run(
          bk,
          () => refundBooking(bk.booking_id),
          "Refund requested. It should appear on your statement within a few days.",
          "Couldn't process the refund. Please try again.",
        )
      }
      onDispute={(bk, reason) =>
        run(
          bk,
          () => disputeBooking(bk.booking_id, reason),
          "Reported. This booking's payment is frozen while our team reviews it.",
          "Couldn't submit the report. Please try again.",
        )
      }
      onSwap={(bk) => {
        setNotice(null);
        setSwapping(bk);
      }}
      onRemove={(bk) =>
        run(
          bk,
          () => removeBookingFromBundle(bundleId!, bk.booking_id),
          "Removed from your bundle.",
          "Couldn't remove that booking. Please try again.",
        )
      }
      onUpdated={() => void load()}
      onNegotiated={() => {
        setNotice({ text: "Price agreed — the booking is approved at the new price.", ok: true });
        void load();
      }}
    />
  );

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <Link href="/bundles" className="text-sm text-ink-soft hover:text-ink">
        ← Dashboard
      </Link>

      <header className="mt-5">
        {renaming ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Field
                label="Bundle name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button size="md" disabled={bundleBusy} onClick={saveName}>
              {bundleBusy ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* One name. The event's is the one shown everywhere else, so it
                wins where the two records still disagree — older bundles kept
                whatever tier name the builder gave them ("Balanced"), which is
                the backend's word for this, not the customer's. */}
            <h1 className="serif text-4xl text-maroon dark:text-gold">
              {event?.name || bundle.event_name || bundle.name}
            </h1>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setNewName(bundle.event_name || bundle.name || "");
                  setRenaming(true);
                }}
              >
                Rename
              </Button>
              {/* The group chat has existed since the moment this plan was
                  sent — the backend opens one for every vendor on it — and the
                  only way in was the Messages tab, where it appeared as "Group
                  · 4 people" beside every other plan's. */}
              {chatId ? (
                <LinkButton
                  href={`/conversation?id=${chatId}`}
                  variant="ghost"
                  size="md"
                >
                  Message vendors
                </LinkButton>
              ) : null}
              {/* Not offered at all once money is on the plan. The server
                  refuses (bundle_service.MONEY_MOVED_STATUSES), so a button
                  here could only ever produce an error — and a Delete that
                  looks available right up until you press it reads as the app
                  losing your plan, not as a rule protecting it. */}
              {!heldMoney ? (
                <Button
                  variant="quiet"
                  size="md"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {heldMoney ? (
          <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-xs text-ink-faint">
            {money(heldMoney.amount)} has been paid on this plan, so it
            can&apos;t be deleted — deleting it wouldn&apos;t return the money,
            only the record of where it went. Refund or report a problem on{" "}
            {heldMoney.count === 1 ? "that booking" : "those bookings"} first.
          </p>
        ) : null}

        {confirmDelete ? (
          <div className="mt-3 rounded-xl bg-panel p-3">
            <p className="text-sm text-ink-soft">
              Delete this event and all of its booking requests? This can&apos;t be
              undone.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="md" disabled={bundleBusy} onClick={removeBundle}>
                {bundleBusy ? "Deleting…" : "Delete event"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* Where the plan has got to. It used to be a bare vendor count, which
            is the one thing about a plan that never changes as you work
            through it — the same "6 vendors" on the day it was drafted and the
            day it was paid for. Same bar as the dashboard, from the same
            counts, so opening a card can't tell you something new. */}
        <PlanProgress progress={progress} className="mt-3 max-w-[40rem]" />

        {/* The plan at a glance: what it costs, what it is, and who's coming.
            One card, because they are one answer — as two, the figure sat in a
            box of its own above a second box holding the date and place that
            produced it, and the seam between them implied a distinction that
            doesn't exist. "2 of 5 paid" was a count; the question is how much is
            committed, how much has gone, and what's still to come. */}
        <div className="mt-4 rounded-2xl border border-card-edge bg-panel p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.16em] text-ink-faint">
                {/* A total that excludes some of the plan is not the plan's
                    total, and shouldn't be labelled as one.

                    Nothing on a draft is committed either. No vendor has been
                    asked, every figure is still the listed rate, and the whole
                    plan is the client's to change — calling that "committed"
                    described an obligation that doesn't exist yet. */}
                {draft
                  ? cash.unpricedCount > 0
                    ? "Estimate so far"
                    : "Estimate"
                  : cash.unpricedCount > 0
                    ? "Committed so far"
                    : "Committed"}
              </p>
              <p className="serif text-3xl text-ink">{money(cash.committed)}</p>
            </div>
            {cash.outstanding > 0 ? (
              <p className="text-sm text-ink-soft">
                <span className="font-semibold text-maroon dark:text-gold">
                  {money(cash.outstanding)}
                </span>{" "}
                still to pay
              </p>
            ) : null}
          </div>

          {/* Money held against a booking that isn't going ahead. It used to
              fall out of every total while its card still offered the full set
              of escrow controls — so the plan quietly forgot a sum the client
              could still see a Report a problem button for. */}
          {cash.strandedInEscrow > 0 ? (
            <p className="mt-2 rounded-lg bg-maroon/10 px-3 py-2 text-xs text-maroon dark:text-gold">
              {money(cash.strandedInEscrow)} is still held on a booking that
              isn&apos;t going ahead. Report a problem on it below so we can
              return it.
            </p>
          ) : null}

          {/* Counted, not totalled — their price is a rate, and there is no
              honest figure until a guest count lands. Saying "$38 awaiting a
              guest count" in a row of dollar totals was worse than silence. */}
          {cash.unpricedCount > 0 ? (
            <p className="mt-2 text-xs text-ink-soft">
              {cash.unpricedCount === 1
                ? "One booking isn't priced yet"
                : `${cash.unpricedCount} bookings aren't priced yet`}{" "}
              — they charge by the guest, performer, hour or day, so they
              aren&apos;t in the figure above.{" "}
              <a href="#still-needed" className="font-medium text-gold hover:underline">
                Add what&apos;s missing
              </a>
              .
            </p>
          ) : null}

          {cash.committed > 0 ? (
            <>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line-soft">
                {[
                  { value: cash.released, className: "bg-green" },
                  { value: cash.inEscrow, className: "bg-gold" },
                ].map((seg, i) =>
                  seg.value > 0 ? (
                    <div
                      key={i}
                      className={seg.className}
                      style={{ width: `${(seg.value / cash.committed) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                {[
                  { label: "In escrow", value: cash.inEscrow, tone: "text-gold" },
                  { label: "Released", value: cash.released, tone: "text-green" },
                  { label: "To pay", value: cash.outstanding, tone: "text-ink" },
                  { label: "Refunded", value: cash.refunded, tone: "text-ink-faint" },
                ]
                  .filter((row) => row.value > 0)
                  .map((row) => (
                    <div key={row.label} className="flex items-baseline gap-1.5">
                      <dt className="text-ink-faint">{row.label}</dt>
                      <dd className={`font-semibold tabular-nums ${row.tone}`}>
                        {money(row.value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </>
          ) : null}

          {/* Date, place, headcount, budget and the guest list, under the money
              they decide. These were most of a page apart — the figure at the
              top, the facts behind it below the send banner, past the vendor
              list — so "what is this plan, and what is it costing me" meant
              scrolling between two halves of one answer. */}
          {bundle.event ? (
            <CelebrationPanel
              key={venueKey}
              summary={bundle.event}
              full={event}
              bookings={bundle.bookings}
              bundleId={bundle.bundle_id}
              onSaved={load}
            />
          ) : null}

          {/* The card that gets charged, on any sent plan. It used to live
              inside the "waiting on your vendors" banner, which only appeared
              while a vendor hadn't answered — so the moment the last one did,
              the card being charged automatically became unnamed and
              unchangeable. It belongs with the rest of the money. */}
          {!draft ? (
            <CardOnFile
              card={card}
              busy={addingCard}
              removing={removingCard}
              onAdd={addCard}
              onRemove={removeCard}
              sent
            />
          ) : null}
        </div>
      </header>

      {draft ? (
        <section
          className={`mt-6 rounded-2xl border p-5 ${
            readiness.canSend
              ? "border-green/40 bg-green/[0.06]"
              : "border-gold/50 bg-gold/[0.07]"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="serif text-lg text-ink">
                {readiness.canSend ? "Ready to send" : "Required Info"}
              </h2>
              {/* What's missing is named by the fields below, which is where it
                  gets fixed — so the heading doesn't list it as well. An empty
                  plan is the exception: nothing below says anything, because
                  there's nothing to say it about. */}
              {readiness.canSend ? (
                <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
                  Sending asks each vendor to hold your date. Once it&apos;s out, a
                  request is theirs to answer — you can still cancel it, but not
                  change it.
                </p>
              ) : bundle.bookings.length === 0 ? (
                <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
                  There&apos;s nothing in this plan yet.
                </p>
              ) : null}
            </div>
          </div>

          {/* The event editor below writes to the event, and a draft from the
              builder may not have one — so the details live here, on the
              bookings, where they're always writable. */}
          <DraftDetails key={venueKey} bundle={bundle} onSaved={load} />

          <CardOnFile
            card={card}
            busy={addingCard}
            removing={removingCard}
            onAdd={addCard}
            onRemove={removeCard}
            sent={false}
          />

          {/* Last, after the fields it depends on. It used to sit above them,
              inviting you to send a plan before filling in what sending needs. */}
          <div className="mt-4 flex justify-end">
            <Button disabled={!readiness.canSend || bundleBusy} onClick={send}>
              {bundleBusy ? "Sending…" : "Send to vendors"}
            </Button>
          </div>
        </section>
      ) : (
        // Sent.
        //
        // There was a banner here saying how many vendors hadn't answered yet.
        // It's gone: the task list below already names each waiting service and
        // its vendor, one row each, and repeating the count in a coloured box at
        // the top said the same thing less specifically and further from
        // anything you could do about it. The status pill on every booking card
        // says it a third time.
        //
        // What the banner did carry that nothing else did — the card on file —
        // has moved up beside the money, where it is no longer conditional on a
        // vendor being slow to reply.
        <>
          {readiness.blocked.length > 0 ? (
            // Sent, and still short of something. Until this existed it was a
            // dead end: the editor above only ever appeared on drafts, so a
            // booking that reached its vendor without a guest count had nowhere
            // on the web to gain one.
            <section
              id="still-needed"
              className="mt-6 scroll-mt-20 rounded-2xl border border-gold/50 bg-gold/[0.07] p-5"
            >
              <DraftDetails key={venueKey} bundle={bundle} onSaved={load} sent />
            </section>
          ) : null}
        </>
      )}

      {/* The dashboard opens the first bundle, so any others under the same
          event would otherwise be unreachable from here. Rare: the builder
          generates three drafts and selecting one discards the rest, so an
          event normally has exactly one. */}
      {siblings.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-faint">Also under this event:</span>
          {siblings.map((b) => (
            <Link
              key={b.bundle_id}
              href={`/bundle?id=${b.bundle_id}`}
              className="rounded-full border border-card-edge px-3 py-1 text-ink-soft transition hover:border-gold/60 hover:text-ink"
            >
              {b.name || "Bundle"} · {b.booking_count}{" "}
              {b.booking_count === 1 ? "vendor" : "vendors"}
            </Link>
          ))}
        </div>
      ) : null}

      {notice ? <NoteLine note={notice} className="mt-6" /> : null}

      {/* What's outstanding, before the ledger of who's on the team. Same rules
          as the "Needs you" badge — see lib/planning. */}
      {plan.tasks.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-card-edge bg-card p-5">
          <h2 className="serif text-lg text-ink">
            {plan.tasks.length} {plan.tasks.length === 1 ? "thing needs" : "things need"} you
          </h2>
          <ul className="mt-3 grid gap-2">
            {plan.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-2.5 rounded-xl bg-panel px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                    task.tone === "urgent" ? "bg-maroon dark:bg-gold" : "bg-gold/60"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{task.title}</span>
                  {taskDetail(task) ? (
                    <span className="block text-xs text-ink-soft">{taskDetail(task)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Two columns from lg up: the plan on the left, the things you consult
          about it on the right.

          The run sheet is deliberately NOT in the rail. Its rows are an 80px
          time column, a 32px avatar and then a service name, a vendor and an
          address — inside a 320px rail that leaves about 144px for all three,
          and a schedule is one of the few things here that genuinely reads
          better wide. The two panels beside it are a sentence and a button
          each, which is exactly what a rail is for. */}
      <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <RunSheet bundle={bundle} />

          {/* The team, split by where each vendor actually stands: on it, still
              deciding, or gone. One flat list made a declined vendor look the
              same as a booked one until you read its status pill. */}
      {plan.booked.length > 0 ? (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">Booked · {plan.booked.length}</h2>
          <div className="grid gap-3">{plan.booked.map(renderRow)}</div>
        </section>
      ) : null}

      {plan.awaiting.length > 0 ? (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">
            {draft ? "In this plan" : "Awaiting the vendor"} · {plan.awaiting.length}
          </h2>
          <p className="mb-3 text-sm text-ink-soft">
            {draft
              ? "Nobody has been asked yet — sending does that."
              : "Requested — nothing to do until they answer."}
          </p>
          <div className="grid gap-3">{plan.awaiting.map(renderRow)}</div>
        </section>
      ) : null}

      {plan.closed.length > 0 ? (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">Not going ahead · {plan.closed.length}</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Declined, cancelled, or refunded. Swap in a replacement from the Marketplace.
          </p>
          <div className="grid gap-3">{plan.closed.map(renderRow)}</div>
        </section>
      ) : null}

      {bundle.bookings.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-card-edge bg-panel p-6 text-center text-ink-soft">
          No vendors in this bundle yet.
        </p>
      ) : null}
        </div>

        {/* Sticky, so a plan with a dozen vendors doesn't scroll these away. */}
        <div className="mt-6 grid gap-4 lg:sticky lg:top-20 lg:mt-0">
          {/* Only on a sent plan. A draft's dates are still directly editable,
              and the server refuses a proposal against one. */}
          {!draft ? (
            <DateChangePanel
              bundleId={bundle.bundle_id}
              bookings={bundle.bookings ?? []}
              onChanged={load}
            />
          ) : null}

          <VenueCheckIn bookings={bundle.bookings} onCheckedIn={load} />
        </div>
      </div>

      {swapping ? (
        <ServiceSwapPanel
          booking={swapping}
          bundleId={bundleId!}
          eventName={bundle.event_name || bundle.name || "My Event"}
          onClose={() => setSwapping(null)}
          onSwapped={async () => {
            setSwapping(null);
            setNotice({ text: "Package swapped — your date, time, and guest count carried over.", ok: true });
            await load();
          }}
        />
      ) : null}

      <p className="mt-8 rounded-2xl border border-card-edge bg-panel p-5 text-center text-sm text-ink-soft">
        Each vendor is paid separately. Your money is held in escrow and only
        released after the event, once you and the vendor both confirm.
      </p>
    </div>
  );
}

export default function BundlePage() {
  return (
    <ClientOnlyRoute>
      <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
        <BundleInner />
      </Suspense>
    </ClientOnlyRoute>
  );
}
