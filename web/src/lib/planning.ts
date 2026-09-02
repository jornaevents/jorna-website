"use client";

// What a celebration still needs, derived from the bundle the app already has.
//
// This is the one place the "what's outstanding" rules live. The dashboard, the
// bundle page, and lib/attention all read it, so the tab-bar badge and the
// planning checklist can't drift apart — which is the failure lib/attention was
// already written to avoid, back when it was the only caller.
//
// Every booking rule mirrors a backend guard, so a task never points at an
// action the server must reject.

import {
  canConfirmBooking,
  priceUnitKind,
  priceUnitLabel,
  type BundleBooking,
  type BundleDetail,
  type BundleEventInfo,
} from "./types";
import { isCompleteLocation } from "./address";

// Every kind here is something the client can go and do. There used to be one
// that wasn't — "vendor-reply", a sent request the vendor hadn't answered — and
// it read "nothing to do until they answer" inside a list headed "6 things need
// you". Six rows, six vendors, not one of them an action. A checklist that
// counts things you cannot act on is a checklist people stop opening.
//
// Nothing is lost by dropping it: a plan page lists those bookings under
// "Awaiting the vendor", each with its own status, which is where someone
// looking for them would look.
export type TaskKind =
  /** The event itself is missing a date, place, or headcount. */
  | "event-detail"
  /** Priced per guest/day, so the total isn't known yet and can't be charged. */
  | "quantity"
  | "payment"
  | "confirm";

/**
 * The kinds lib/attention surfaces as "Needs you".
 *
 * Narrower than TaskKind still: putting event-detail gaps in the badge would
 * make it count things that were never in it — this list is what the badge
 * already meant, held steady while the rules themselves moved here.
 */
export const ATTENTION_KINDS: TaskKind[] = ["quantity", "payment", "confirm"];

export interface PlanTask {
  id: string;
  kind: TaskKind;
  title: string;
  /** The vendor it concerns, when it concerns one. */
  vendor?: string;
  /** Trailing explanation, no leading punctuation. */
  note?: string;
  tone: "urgent" | "normal";
  cta: string;
  bookingId?: string;
}

export interface BundlePlan {
  tasks: PlanTask[];
  /** Vendors actually on the team — accepted, or already paid for. */
  booked: BundleBooking[];
  /** Requested, no answer yet. */
  awaiting: BundleBooking[];
  /** Declined, cancelled, or refunded — kept so the page can explain a gap. */
  closed: BundleBooking[];
  paidCount: number;
  /** Bookings that still count toward the plan (everything but `closed`). */
  liveCount: number;
  /** Whether the event has a venue to check into. */
  canCheckIn: boolean;
}

const DEAD_STATUSES = ["rejected", "cancelled"];

/** Mirrors the backend's _DEAD_* — a booking that no longer counts. */
export function isDeadBooking(b: BundleBooking): boolean {
  return (
    DEAD_STATUSES.includes(b.status) || (b.payment_status ?? "unpaid") === "refunded"
  );
}

/**
 * Does this account have a live financial relationship as a customer — an open
 * request, an accepted booking, money still in escrow, a dispute? Used to
 * decide whether it's safe to convert straight to a vendor account: an
 * account can only be one or the other (see /vendor-onboarding), and
 * converting out from under an open booking would strand it with no client
 * nav left to manage it from.
 *
 * A dead booking (rejected/cancelled/refunded) or a released one (paid out,
 * nothing left owing) doesn't block — that's history, not something in
 * flight.
 */
export function hasActiveBookings(bundles: BundleDetail[]): boolean {
  return bundles.some((bundle) =>
    bundle.bookings.some(
      (b) => !isDeadBooking(b) && (b.payment_status ?? "unpaid") !== "released",
    ),
  );
}

/**
 * Does the event still have a venue to check into? Mirrors the backend's source
 * of truth (the bundle's live venue booking) rather than any cached coords — a
 * rejected or refunded venue stops anchoring, and check-in 400s. (A disputed
 * venue still anchors, which falls out of the same rule.)
 */
export function hasLiveVenue(bookings: BundleBooking[]): boolean {
  return bookings.some((b) => b.service_category === "venue" && !isDeadBooking(b));
}

/**
 * Gaps in the event itself.
 *
 * The date and the place are wanted whatever is booked. A guest count is not:
 * it only blocks a total when something is charged per person, and asking for
 * one on a plan of flat-rate bookings is a task with nothing behind it — you
 * can't clear it by acting, because nothing was waiting on it.
 */
function eventTasks(
  event: BundleEventInfo | null | undefined,
  bookings: BundleBooking[],
): PlanTask[] {
  if (!event) return [];
  const missing: PlanTask[] = [];
  const add = (field: string, title: string, note: string) =>
    missing.push({
      id: `event-${field}`,
      kind: "event-detail",
      title,
      note,
      tone: "normal",
      cta: "Add",
    });

  if (!event.date_iso || event.date_iso === "TBD") {
    add("date", "Set your event date", "Vendors can't hold a slot without one.");
  }
  if (!event.location) {
    add("location", "Add where it's happening", "Used to match vendors near you.");
  }
  // Only what's live: a declined per-person booking isn't waiting on anything.
  const perPerson = bookings.filter(
    (b) => !isDeadBooking(b) && priceUnitKind(b.price_unit) === "person",
  );
  if (event.guest_count == null && perPerson.length > 0) {
    const names = perPerson
      .map((b) => b.service_name)
      .filter((n): n is string => Boolean(n));
    add(
      "guests",
      "Add your guest count",
      names.length === 1
        ? `${names[0]} is priced per person, so its total can't be worked out without one.`
        : `${perPerson.length} of your bookings are priced per person, so their totals can't be worked out without one.`,
    );
  }
  return missing;
}

/** Days until an event; negative once past, null when there's no date. */
export function daysUntil(iso?: string | null): number | null {
  if (!iso || iso === "TBD") return null;
  const day = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(day)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((day - today.getTime()) / 86_400_000);
}

/**
 * Order celebrations by date, anchored on today.
 *
 * Upcoming first, soonest at the top; then finished ones, most recent first;
 * then anything undated, since there is nothing to place it against. A plain
 * ascending sort on the date reads as "date order" but puts last year's wedding
 * above the one three weeks out, which is the wrong end of the list to be
 * looking at on a planning screen.
 *
 * Returns a comparator result; ties fall through to the caller.
 */
export function compareByDate(aIso?: string | null, bIso?: string | null): number {
  const a = daysUntil(aIso);
  const b = daysUntil(bIso);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const aPast = a < 0;
  const bPast = b < 0;
  if (aPast !== bPast) return aPast ? 1 : -1;
  // Upcoming: soonest first. Past: most recent first — so both read as
  // "closest to now at the top".
  return aPast ? b - a : a - b;
}

/**
 * How close the event has to be before an outstanding task counts as urgent.
 *
 * The same unpaid booking is background noise three months out and a real
 * problem three days out, and a checklist that never changes its mind stops
 * being read. Confirming after the event is urgent regardless — that one is
 * holding up someone else's money.
 */
const URGENT_WITHIN_DAYS: Partial<Record<TaskKind, number>> = {
  payment: 21,
  quantity: 30,
  "event-detail": 45,
};

function sharpen(task: PlanTask, days: number | null): PlanTask {
  if (task.tone === "urgent" || days == null || days < 0) return task;
  const window = URGENT_WITHIN_DAYS[task.kind];
  if (window == null || days > window) return task;

  const clause =
    days === 0
      ? "The event is today."
      : days === 1
        ? "The event is tomorrow."
        : `Only ${days} days to go.`;
  const base = task.note?.trim();
  return {
    ...task,
    tone: "urgent",
    // The existing note is a sentence, so end it before starting another —
    // joining them raw produced "…until they answer. only 12 days to go."
    note: base ? `${base.replace(/\.?$/, ".")} ${clause}` : clause,
  };
}

/** What one booking still needs. At most one task each, most pressing first. */
function bookingTask(b: BundleBooking): PlanTask | null {
  const pay = b.payment_status ?? "unpaid";
  const service = b.service_name || "a package";
  const vendor = b.vendor_name || "the vendor";

  // Money is held and the event is over — the client's confirm is the only
  // thing between the vendor and their payout. Gated on the booking's LAST day,
  // like the backend's event_confirmable_date.
  if (pay === "paid" && !b.customer_confirmed_at && canConfirmBooking(b)) {
    return {
      id: `confirm-${b.booking_id}`,
      kind: "confirm",
      title: `Confirm ${service} happened`,
      vendor,
      note: "this releases their payment.",
      tone: "urgent",
      cta: "Confirm",
      bookingId: b.booking_id,
    };
  }

  // Approved and waiting on payment. Mirrors the checkout guard twice over: a
  // total still pending a quantity can't be paid, so it gets a task about the
  // quantity rather than a Pay button — and a charge already in flight isn't
  // waiting on the client at all.
  //
  // `processing` used to be in this condition, which made it the only place in
  // the app that read a payment in flight as unpaid. Everywhere else already
  // agreed it isn't: the plan page's Pay button excludes it (a second charge
  // for one booking is how a client pays twice), the status line says "Payment
  // processing", and both the money figures and the progress bar count it as
  // gone. So the task list — and the "Needs you" badge behind it — was telling
  // a client to do the one thing every other screen is built to prevent.
  if (b.status === "approved" && pay === "unpaid") {
    if (b.price_pending_quantity) {
      const quantityGap =
        priceUnitKind(b.price_unit) === "performer" ? "a performer count" : "a guest count or dates";
      return {
        id: `quantity-${b.booking_id}`,
        kind: "quantity",
        title: `${service} needs ${quantityGap}`,
        vendor,
        note: `it's priced ${priceUnitLabel(b.price_unit) || "per unit"}, so its total can't be worked out until then.`,
        tone: "normal",
        cta: "View",
        bookingId: b.booking_id,
      };
    }
    return {
      id: `pay-${b.booking_id}`,
      kind: "payment",
      title: `Pay for ${service}`,
      vendor,
      tone: "normal",
      cta: "Pay",
      bookingId: b.booking_id,
    };
  }

  // A sent request the vendor hasn't answered is deliberately not a task. It is
  // theirs to act on, not the client's, and the plan page already lists it under
  // "Awaiting the vendor".
  return null;
}

/** Everything outstanding on one bundle, plus how its bookings sort out. */
export function planForBundle(bundle: BundleDetail): BundlePlan {
  const bookings = bundle.bookings ?? [];

  const booked: BundleBooking[] = [];
  const awaiting: BundleBooking[] = [];
  const closed: BundleBooking[] = [];
  for (const b of bookings) {
    if (isDeadBooking(b)) closed.push(b);
    else if (b.status === "pending" || b.status === "negotiation_ongoing") awaiting.push(b);
    else booked.push(b);
  }

  const days = daysUntil(bundle.event?.date_iso);
  const tasks = [
    ...eventTasks(bundle.event, bookings),
    ...bookings
      .filter((b) => !isDeadBooking(b))
      .map(bookingTask)
      .filter((t): t is PlanTask => t !== null),
  ].map((t) => sharpen(t, days));
  // Urgent first; otherwise the order they were derived in.
  tasks.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "urgent" ? -1 : 1));

  return {
    tasks,
    booked,
    awaiting,
    closed,
    paidCount: bookings.filter((b) => ["paid", "released"].includes(b.payment_status ?? ""))
      .length,
    liveCount: bookings.length - closed.length,
    canCheckIn: hasLiveVenue(bookings),
  };
}

/** A task's supporting line. `where` names the bundle, for feeds that mix several. */
export function taskDetail(task: PlanTask, where?: string): string {
  const lead = [task.vendor, where].filter(Boolean).join(" · ");
  if (!task.note) return lead;
  return lead ? `${lead} — ${task.note}` : task.note;
}

// ── Money ────────────────────────────────────────────────────────────
//
// "2 of 5 paid" is a count, and the question a host actually has is about
// money: how much have I committed, how much is already gone, and what's still
// coming. Every figure here comes off the bookings.

export interface MoneyBreakdown {
  /** Everything still live — what the celebration will cost as booked. */
  committed: number;
  /** Paid, held by Jorna, not yet the vendor's. */
  inEscrow: number;
  /** Paid out. */
  released: number;
  /** Approved and payable, not yet paid. */
  outstanding: number;
  /**
   * Bookings approved but not yet priceable — a rate with no quantity to
   * multiply. A **count, not an amount**: their `price` is a per-head or
   * per-hour rate, and adding rates to totals is what made "Committed $5,240"
   * out of a celebration costing four times that. There is no honest figure to
   * report until a guest count lands, so this reports the gap instead.
   */
  unpricedCount: number;
  refunded: number;
  /**
   * Money still held against a booking that is otherwise dead — cancelled or
   * rejected while paid.
   *
   * Not reachable today: BookingStatus has no "cancelled" member and nothing
   * sets one, so the constant both sides carry is defensive. But the
   * dead-booking bail-out below runs *after* the refunded case and before every
   * sum, so the day it does become reachable, paid escrow would drop out of
   * `committed` and `inEscrow` while the booking's own card still rendered the
   * full escrow block. Counted rather than silently skipped.
   */
  strandedInEscrow: number;
}

/**
 * Where a plan's money is.
 *
 * Only resolved totals are added up. A booking still pending a quantity carries
 * a *rate* in `price` — the backend says so explicitly with
 * `price_pending_quantity` — and summing $38 per head into a column of totals
 * is how a $20,000 celebration reported "$5,240 committed", and how a budget
 * bar reassured a host who was comfortably over. Those bookings are counted,
 * not totalled, and the caller says so.
 */
export function moneyForBundle(bundle: BundleDetail): MoneyBreakdown {
  const sum: MoneyBreakdown = {
    committed: 0,
    inEscrow: 0,
    released: 0,
    outstanding: 0,
    unpricedCount: 0,
    refunded: 0,
    strandedInEscrow: 0,
  };

  for (const b of bundle.bookings ?? []) {
    const pay = b.payment_status ?? "unpaid";
    const price = b.price ?? 0;

    if (pay === "refunded") {
      sum.refunded += price;
      continue;
    }
    // Dead, but the money isn't. Skipping outright dropped it from every total
    // while the booking's card went on offering escrow controls for it.
    if (isDeadBooking(b)) {
      if (pay === "paid" || pay === "disputed" || pay === "processing") {
        sum.strandedInEscrow += price;
      }
      continue;
    }

    // A rate is not a total, and there is no third thing it could be. It can't
    // join any of the sums below — including `committed`, which is the one that
    // fed the budget comparison.
    if (b.price_pending_quantity) {
      sum.unpricedCount += 1;
      continue;
    }

    sum.committed += price;
    if (pay === "paid" || pay === "disputed") sum.inEscrow += price;
    else if (pay === "released") sum.released += price;
    else if (b.status === "approved") sum.outstanding += price;
  }
  return sum;
}

// ── Progress ─────────────────────────────────────────────────────────
//
// How far along the celebration is, counted in arrangements rather than in
// dollars.
//
// The dashboard used to draw the money above as a bar, which read as progress
// and wasn't:
//
//   - The venue is most of the bill. Paying it filled most of the bar while
//     five vendors sat unanswered; sorting five smaller ones barely moved it.
//   - Nothing still to be booked was in the denominator, so a wedding needing
//     six categories with one venue paid drew a *full* bar.
//   - The two states most in need of the client — a vendor who hasn't replied,
//     and a booking that can't be priced — belonged to no segment at all, so
//     the bar was silent about exactly what it should have been loudest about.
//
// So: one unit per thing that has to be sorted, each in exactly one stage,
// including the ones nobody has started. Every rule reads a helper this file
// already has rather than re-deriving it — a bar that disagreed with the task
// list printed underneath it would be worse than no bar.

/**
 * The stages one arrangement passes through, in the order it passes through
 * them. `problem` is the exception: it sits beside `paid` rather than after it,
 * because disputed money has stopped moving forward.
 */
export const PROGRESS_STAGES = [
  /** A category the client said they need that nothing live covers yet. */
  "toBook",
  /** In a draft — chosen, but no vendor has been asked. */
  "chosen",
  /** Sent, and the vendor hasn't answered. */
  "awaiting",
  /** Accepted by the vendor, not yet paid. */
  "accepted",
  /** Paid, held in escrow. */
  "paid",
  /** Paid and disputed: held, and going nowhere until someone rules on it. */
  "problem",
  /** The client has confirmed it happened, or the money has been released. */
  "done",
] as const;

export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export interface ProgressBreakdown {
  /** How many units sit in each stage. Sums to `total`. */
  stages: Record<ProgressStage, number>;
  /** Everything the celebration still has to get through, done included. */
  total: number;
}

function noProgress(): Record<ProgressStage, number> {
  return {
    toBook: 0,
    chosen: 0,
    awaiting: 0,
    accepted: 0,
    paid: 0,
    problem: 0,
    done: 0,
  };
}

/**
 * Where a celebration has got to.
 *
 * `stillToBook` is the count from `missingCategories` — passed in rather than
 * derived here because it is a property of the celebration, not of any one
 * bundle: a photographer booked in one bundle isn't missing because the other
 * doesn't have one. Without it the bar would fill up while half the plan was
 * still an intention.
 */
export function celebrationProgress(
  bundles: BundleDetail[],
  stillToBook = 0,
): ProgressBreakdown {
  const stages = noProgress();
  stages.toBook = stillToBook;

  for (const bundle of bundles) {
    // A draft's bookings are chosen, not requested — the backend doesn't tell
    // the vendor until the plan is sent, so counting them as "waiting on a
    // reply" would be waiting on someone who has never been asked.
    const draft = isDraftBundle(bundle);

    for (const b of bundle.bookings ?? []) {
      // Declined or refunded isn't work outstanding, it's work that came back.
      // It leaves the count here and reappears — if its category was one the
      // client listed — as something still to book, so a vendor dropping out
      // moves the bar backwards. That is what happened.
      if (isDeadBooking(b)) continue;

      const pay = b.payment_status ?? "unpaid";
      if (pay === "disputed") {
        // Checked before "done" so the bar can never read complete while money
        // is frozen, whatever else has happened to the booking.
        stages.problem += 1;
      } else if (pay === "released" || b.customer_confirmed_at) {
        stages.done += 1;
      } else if (pay === "paid" || pay === "processing") {
        // `processing` is a charge in flight: the client's part is over and
        // there is nothing they could do to hurry it. Counted as paid here,
        // raised as no task above, and refused a Pay button on the plan page —
        // the three now say the same thing about it.
        stages.paid += 1;
      } else if (b.status === "pending" || b.status === "negotiation_ongoing") {
        stages[draft ? "chosen" : "awaiting"] += 1;
      } else {
        // Accepted and unpaid. Including the ones priced per guest or per hour,
        // which can't be paid until a quantity lands: they're a real step of
        // this plan, and the money figures — where a rate is not a total and so
        // can't be counted at all — are the reason they were invisible.
        stages.accepted += 1;
      }
    }
  }

  return {
    stages,
    total: PROGRESS_STAGES.reduce((n, stage) => n + stages[stage], 0),
  };
}

// ── Schedule ─────────────────────────────────────────────────────────
//
// Every booking carries a required time_start/time_end and its own location,
// none of which the app showed anywhere — so a host couldn't say what time the
// photographer arrives without asking. This turns the bookings into a run
// sheet: the day, in order, with who's coming and where.

export interface ScheduleEntry {
  booking: BundleBooking;
  /** Minutes past midnight, or null when the time can't be read. */
  startMinutes: number | null;
  start: string | null;
  end: string | null;
}

export interface ScheduleDay {
  dateIso: string;
  entries: ScheduleEntry[];
  /** Vendors who have checked in at the venue. */
  arrived: number;
  /** Vendors expected — the ones a check-in could come from. */
  expected: number;
  /**
   * Whether any booking on this day carries a readable time.
   *
   * False only when none does — every one still "TBD" or blank. The day then
   * lists its vendors without clock times rather than inventing any, and the
   * run sheet says so.
   */
  timesKnown: boolean;
}

/** "18:00", "18:00:00", "6:00 PM" → minutes past midnight. Null if unreadable. */
export function parseTime(raw?: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function clock(raw?: string | null): string | null {
  const mins = parseTime(raw);
  if (mins == null) return null;
  const d = new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Every date this bundle touches, each with its bookings in time order. */
export function scheduleFor(bundle: BundleDetail): ScheduleDay[] {
  const byDate = new Map<string, BundleBooking[]>();

  for (const b of bundle.bookings ?? []) {
    if (isDeadBooking(b)) continue;
    const date = b.date_iso;
    if (!date || date === "TBD") continue;
    // A booking spanning days belongs to each of them — a three-day tent hire
    // should appear on all three, not only the day it started.
    for (const day of daysBetween(date, b.date_end)) {
      const list = byDate.get(day);
      if (list) list.push(b);
      else byDate.set(day, [b]);
    }
  }

  return [...byDate.entries()]
    .map(([dateIso, bookings]) => {
      const entries: ScheduleEntry[] = bookings
        .map((booking) => ({
          booking,
          startMinutes: parseTime(booking.time_start),
          start: clock(booking.time_start),
          end: clock(booking.time_end),
        }))
        .sort((a, b) => (a.startMinutes ?? 1e9) - (b.startMinutes ?? 1e9));

      // Do we have any real time to show?
      //
      // This used to also require the day's start times to differ from each
      // other, and not all be midnight — a guess at whether they were entered
      // or defaulted, back when a booking could only be created with a time and
      // an unanswered one therefore arrived as a default rather than as
      // nothing.
      //
      // Both halves of that premise are gone. /book no longer prefills a window,
      // and a booking can't reach a vendor without real hours — "TBD" reads as
      // unset now, and parseTime returns null for it either way. Meanwhile the
      // builder writes one window across the plan, and so does the details card,
      // so every vendor sharing a start time is what a correctly filled-in plan
      // looks like. The heuristic had come to fire on exactly the case it was
      // meant to protect: a host who set their times, sent the plan, and then
      // read "No times set on these bookings yet" on the run sheet while the
      // vendors' own dashboards showed the times back to them.
      const starts = entries.map((e) => e.startMinutes);
      const known = starts.some((s) => s != null);

      return {
        dateIso,
        entries,
        arrived: bookings.filter((b) => b.vendor_checked_in_at).length,
        expected: bookings.length,
        timesKnown: known,
      };
    })
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

/** How far ahead the run sheet starts appearing. */
export const RUN_SHEET_DAYS = 7;

/**
 * Whether the run sheet is worth showing yet.
 *
 * It's an order of the day and an arrivals board, and neither answers anything
 * in April about a wedding in September — there it's a second copy of the
 * vendor list already above it, sitting between the host and the things they
 * can act on now. A week out is when it starts being the thing you check.
 *
 * Anchored on the first day rather than the nearest one: a three-day
 * celebration becomes relevant as a whole once its opening is a week away, so
 * the mehndi doesn't appear while the reception two days later stays hidden.
 * That first day is the celebration's real start — an early mehndi can precede
 * whatever date the event record carries, and it's the day people travel for.
 *
 * Days already past keep it. Somebody working out who turned up, the morning
 * after, is asking exactly what it was built to answer.
 */
export function runSheetIsDue(days: ScheduleDay[], within = RUN_SHEET_DAYS): boolean {
  if (days.length === 0) return false;
  const n = daysUntil(days[0].dateIso);
  // An undated day can't be shown to be close, and scheduleFor drops those
  // anyway — so this only fires on a date that won't parse.
  return n != null && n <= within;
}

function isoOfLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Inclusive list of ISO days from `start` to `end`, capped so a bad range can't
 * run away.
 *
 * Builds each day from local date parts (`isoOfLocalDate`) rather than
 * `toISOString().slice(0, 10)` — that round-trips through UTC, so east of
 * Greenwich a local midnight lands on the previous UTC day and every date in
 * the range comes out one day early. Same bug already found and fixed in
 * `vendorPlan.ts`'s `spanDays`; this mirrors that fix so the client-side run
 * sheet and the vendor's calendar agree on which days a booking covers.
 */
function daysBetween(start: string, end?: string | null): string[] {
  if (!end || end === "TBD" || end === start) return [start];
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return [start];
  const days: string[] = [];
  for (const d = new Date(from); d <= to && days.length < 31; d.setDate(d.getDate() + 1)) {
    days.push(isoOfLocalDate(d));
  }
  return days;
}

// ── Categories the plan is still missing ─────────────────────────────

/**
 * Categories the host said they needed that nothing live covers.
 *
 * Read off the event's own services_needed, so this is a comparison against
 * what they asked for rather than a guess at what a wedding "should" have.
 */
export function missingCategories(
  servicesNeeded: string[] | null | undefined,
  bundles: BundleDetail[],
): string[] {
  if (!servicesNeeded?.length) return [];
  const covered = new Set<string>();
  for (const bundle of bundles) {
    for (const b of bundle.bookings ?? []) {
      if (isDeadBooking(b)) continue;
      if (b.service_category) covered.add(b.service_category.toLowerCase());
      if (b.service_subcategory) covered.add(b.service_subcategory.toLowerCase());
    }
  }
  return servicesNeeded.filter((c) => !covered.has(c.toLowerCase()));
}

// ── Is this booking fit to send to a vendor? ─────────────────────────
//
// A vendor accepting a request is agreeing to be somewhere, at a time, for a
// price. If any of those three is unknown the request isn't really a request —
// it's a question the client hasn't answered yet, and answering it is not the
// vendor's job.
//
// Which pricing detail is needed depends on the unit and nothing else: per
// person wants a headcount, per hour wants a start and end, per day wants the
// dates it spans. A flat-rate service wants none of them.

export type BookingGapField = "date" | "location" | "guests" | "hours" | "performers";

export interface BookingGap {
  field: BookingGapField;
  /** What to tell the client is missing. */
  label: string;
}

/**
 * Whether a stored answer is really an answer.
 *
 * "TBD" is what the bundle builder writes when it wasn't told — a non-empty
 * string, so every plain truthiness check read it as filled in. It means the
 * same as blank and is treated the same. Mirrors the backend's `is_unset`.
 */
export function isUnset(value?: string | null): boolean {
  const text = (value ?? "").trim();
  return !text || text.toUpperCase() === "TBD";
}

export function bookingGaps(
  b: BundleBooking,
  event?: BundleEventInfo | null,
): BookingGap[] {
  const gaps: BookingGap[] = [];

  if (isUnset(b.date_iso)) {
    gaps.push({ field: "date", label: "a date" });
  }

  // The booking's own location, or the event's — a booking made from an event
  // inherits it, and a venue brings its own.
  const where = b.location || event?.location || "";
  if (!isCompleteLocation(where)) {
    gaps.push({ field: "location", label: "a full address" });
  }

  // On every booking, whatever it costs. A vendor accepting is agreeing to be
  // somewhere at a time, and that's as true of a flat-rate DJ as an hourly one.
  //
  // This used to be asked only where the *price* depended on it, which is a
  // different question — so a per-event or per-person booking passed the gate
  // carrying "TBD" for both, and vendors were asked to hold a day with no hours
  // attached to it.
  if (isUnset(b.time_start) || isUnset(b.time_end)) {
    gaps.push({ field: "hours", label: "a start and end time" });
  }

  // The pricing unit decides which quantity is needed to compute a total —
  // but a vendor can also opt in to requiring one regardless of price unit
  // (Service.require_guest_count / require_performer_count), because "what I
  // need to decide whether to accept" isn't always the same as "what I need
  // to price it". The two reasons are independent, so both can apply to the
  // same booking at once (e.g. a flat-rate service that wants a headcount
  // AND a performer count) — this pushes both gaps when that happens.
  const kind = priceUnitKind(b.price_unit);
  if ((kind === "person" || b.require_guest_count) && !(b.guest_count ?? 0)) {
    // The booking's own count, and not the event's. Unlike the date and the
    // address, this one is arithmetic: the backend resolves the total from the
    // booking it prices, so an event-level headcount satisfied this check
    // without satisfying the backend. The plan would send, the vendor would
    // approve, and the booking arrived at checkout still flagged
    // price_pending_quantity — unpayable, and past the only screen that could
    // have fixed it.
    gaps.push({ field: "guests", label: "a guest count" });
  }
  if ((kind === "performer" || b.require_performer_count) && !(b.performer_count ?? 0)) {
    // Same reasoning as the guest count above — the booking's own count, not
    // an event-level figure, since a performer count has no event-level
    // equivalent to fall back on.
    gaps.push({ field: "performers", label: "a performer count" });
  }
  // Per day is covered by the date above; a single-day booking is a valid span,
  // so date_end being absent isn't a gap.

  return gaps;
}

// ── What a vendor has already been told ──────────────────────────────
//
// Once a request is out, the details it carried are the vendor's answer to a
// question — so the client stops being able to change them, and the server
// refuses. These read that decision rather than re-deriving it: a field the UI
// leaves editable has to be one the server will still accept.

/** Booking fields any live booking in this plan has already committed to. */
export function lockedSharedFields(bookings: BundleBooking[]): Set<string> {
  const locked = new Set<string>();
  for (const b of bookings) {
    if (isDeadBooking(b)) continue;
    for (const f of b.locked_fields ?? []) locked.add(f);
  }
  return locked;
}

/** Whether this plan's shared facts are settled — anything has gone to a vendor. */
export function planIsCommitted(bookings: BundleBooking[]): boolean {
  return lockedSharedFields(bookings).size > 0;
}

/** Ready to be somebody's job. */
export function isBookingSendable(
  b: BundleBooking,
  event?: BundleEventInfo | null,
): boolean {
  return bookingGaps(b, event).length === 0;
}

/** One sentence naming what's missing: "a date and a full address". */
export function describeGaps(gaps: BookingGap[]): string {
  const labels = gaps.map((g) => g.label);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

// ── Drafts ───────────────────────────────────────────────────────────
//
// POST /chatbot/bundles persists its three options as *draft* bundles and holds
// vendor notifications until one is selected; POST /bundles/{id}/select is what
// releases them, discards the other two, and hands back the chosen one. So a
// draft is a plan nobody outside this account knows about yet, and selecting is
// the act of sending it.

/**
 * Evidence that a vendor has already seen this booking.
 *
 * A vendor can't accept, decline, or be paid for a request that was never sent
 * to them, so any of those settles the question by itself.
 */
function showsVendorContact(b: BundleBooking): boolean {
  if (["approved", "rejected", "payment_confirmed"].includes(b.status)) return true;
  return (b.payment_status ?? "unpaid").toLowerCase() !== "unpaid";
}

/**
 * Whether this bundle is still private to the client.
 *
 * The status is the answer when it's trustworthy. It wasn't, for a long time:
 * nothing on the backend ever moved a bundle off "draft", so every bundle ever
 * created still says draft — including ones whose vendors have already
 * accepted. That made a permanent draft of every plan, which is why the page
 * went on offering to send one that had plainly been sent.
 *
 * Sending sets the status now, so new plans answer for themselves. Older ones
 * can't, so their bookings answer for them: one vendor having replied is proof
 * the plan left the building.
 *
 * What that can't recover is a plan sent before the fix that no vendor has
 * answered yet — nothing distinguishes it from one never sent. It keeps its
 * Send button, and pressing it is harmless: sending is idempotent and only
 * notifies vendors who haven't replied.
 */
export function isDraftBundle(bundle: BundleDetail): boolean {
  if ((bundle.status ?? "").trim().toLowerCase() !== "draft") return false;
  return !(bundle.bookings ?? []).some(showsVendorContact);
}

export interface SendReadiness {
  /** Bookings that can't be answered yet, with what each is missing. */
  blocked: { booking: BundleBooking; gaps: BookingGap[] }[];
  /** Every distinct thing missing across the bundle, in a stable order. */
  missing: BookingGapField[];
  canSend: boolean;
}

/**
 * Can this draft go to its vendors?
 *
 * Only live bookings count — a declined one isn't waiting on anything — and an
 * empty bundle can't be sent, because there's nobody to send it to.
 */
export function sendReadiness(bundle: BundleDetail): SendReadiness {
  const live = (bundle.bookings ?? []).filter((b) => !isDeadBooking(b));
  const blocked = live
    .map((booking) => ({ booking, gaps: bookingGaps(booking, bundle.event) }))
    .filter((r) => r.gaps.length > 0);

  const order: BookingGapField[] = ["date", "location", "guests", "performers", "hours"];
  const seen = new Set<BookingGapField>();
  for (const r of blocked) for (const g of r.gaps) seen.add(g.field);

  return {
    blocked,
    missing: order.filter((f) => seen.has(f)),
    canSend: live.length > 0 && blocked.length === 0,
  };
}

/** What the missing fields are called, for a summary line. */
export const GAP_LABELS: Record<BookingGapField, string> = {
  date: "a date",
  location: "a full address",
  guests: "a guest count",
  performers: "a performer count",
  hours: "start and end times",
};

/**
 * The drafts to discard when one of a generated set is chosen.
 *
 * /bundles/{id}/select would do this, but it also notifies vendors, and those
 * two want to happen at different moments — so the discard is done by id and
 * select is left to be the act of sending.
 *
 * Options without an id are skipped rather than guessed at: deleting the wrong
 * bundle is not recoverable.
 */
export function unchosenBundleIds(
  options: { bundle_id?: string | null }[],
  chosenId: string,
): string[] {
  return options
    .map((o) => o.bundle_id)
    .filter((id): id is string => Boolean(id) && id !== chosenId);
}
