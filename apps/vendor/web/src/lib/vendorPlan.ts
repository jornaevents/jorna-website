"use client";

// The vendor's side of the planning rules — what needs them, where their money
// is, what's on today, and why they aren't getting booked.
//
// Same arrangement as lib/planning on the client side: the rules live here, and
// both the dashboard and lib/attention's badge read them, so the two can't tell
// a vendor different things. Every rule mirrors a backend guard.

import { describeDue } from "@jorna/shared/lib/contractDraft";
import {
  eventIsOver,
  type AvailabilitySlot,
  type Earnings,
  type ServiceItem,
  type StripeStatus,
  type VendorBooking,
  type VendorDetail,
} from "./types";

export type VendorTaskKind =
  /** No Stripe: they can be booked and still never be paid. */
  | "stripe"
  /** A client is waiting on a yes or no. */
  | "request"
  /** A client has offered a different price and nobody has answered. */
  | "negotiation"
  /** A client wants to move the date and it's the vendor's turn to say. */
  | "date-change"
  /** Their own payout is blocked on this. */
  | "confirm"
  | "check-in"
  /** The client asked for changes to a contract; the vendor's turn. */
  | "changes"
  /** The client says a payment is sent; the vendor confirms it arrived. */
  | "payment"
  /** A signed contract's payment is past due. */
  | "overdue";

export interface VendorTask {
  id: string;
  kind: VendorTaskKind;
  title: string;
  detail: string;
  cta: string;
  tone: "alarm" | "urgent" | "normal";
  bookingId?: string;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function plainMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** "2026-09-05" → "5 Sep 2026". A raw ISO date in a sentence reads like a log line. */
function niceDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ── Getting paid at all ──────────────────────────────────────────────

/**
 * Stripe's field names, in words a vendor standing in their kitchen can act on.
 *
 * Several keys are one real-world errand — a date of birth arrives as three
 * separate fields, an address as four — so they map to the same phrase and the
 * caller dedupes. Anything unmapped degrades to a readable version of the key
 * rather than being dropped: a vendor told "Stripe still needs your
 * business_profile.mcc" can at least search for it, where a vendor told nothing
 * has to guess.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.id_number": "your ID number",
  "individual.ssn_last_4": "the last 4 digits of your SSN",
  "individual.verification.document": "a photo of your ID",
  "individual.verification.additional_document": "a second form of ID",
  "individual.dob.day": "your date of birth",
  "individual.dob.month": "your date of birth",
  "individual.dob.year": "your date of birth",
  "individual.first_name": "your name",
  "individual.last_name": "your name",
  "individual.email": "your email address",
  "individual.phone": "your phone number",
  "individual.address.line1": "your address",
  "individual.address.city": "your address",
  "individual.address.state": "your address",
  "individual.address.postal_code": "your address",
  external_account: "your bank account",
  "business_profile.url": "your website",
  "business_profile.mcc": "your business category",
  "company.tax_id": "your tax ID",
  "tos_acceptance.date": "your acceptance of Stripe's terms",
  "tos_acceptance.ip": "your acceptance of Stripe's terms",
};

export function requirementLabel(key: string): string {
  return REQUIREMENT_LABELS[key] ?? key.split(".").pop()!.replace(/_/g, " ");
}

/** "a", "a and b", "a, b and c" — a sentence, not a bullet list. */
function sentenceList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export type PaymentsState =
  /** Couldn't be read. An unknown isn't an alarm. */
  | "unknown"
  | "ready"
  /** No Stripe account at all. */
  | "not-started"
  /** They opened Stripe's form and didn't reach the end. */
  | "unfinished"
  /** They finished it, and Stripe has since asked for more. */
  | "needs-more"
  /** Stripe is verifying. Nothing for them to do but wait. */
  | "under-review";

export interface PaymentsSetup {
  state: PaymentsState;
  /** Whether money can reach them right now. */
  ready: boolean;
  title: string;
  detail: string;
  cta: string;
  /** "needs-more" and a lapsed account are alarms; waiting on Stripe isn't. */
  tone: "alarm" | "normal";
}

/**
 * The one reading of a vendor's payment setup, for every screen that mentions it.
 *
 * There were four, and they all assumed the only way to be unpayable was never
 * to have finished — because that was the only way the old completeness flag
 * could be false. It can now go false on an account that was live for months,
 * when Stripe withdraws a payout capability and asks for something new. Told
 * "payment setup incomplete", that vendor goes looking for a setup step they
 * finished long ago and finds nothing wrong.
 */
export function paymentsSetup(status: StripeStatus | null): PaymentsSetup {
  if (!status) {
    return {
      state: "unknown",
      ready: false,
      title: "Payment setup",
      detail: "We couldn't reach Stripe just now.",
      cta: "Check payment setup",
      tone: "normal",
    };
  }

  if (status.stripe_onboarding_complete) {
    return {
      state: "ready",
      ready: true,
      title: "Payments are set up",
      detail: "You're ready to be booked and paid.",
      cta: "Manage payments",
      tone: "normal",
    };
  }

  if (!status.stripe_account_id) {
    return {
      state: "not-started",
      ready: false,
      title: "Set up payments",
      detail:
        "Clients can't pay you until Stripe has your details — a booking can be accepted, but checkout will refuse. It takes a few minutes.",
      cta: "Set up payments",
      tone: "alarm",
    };
  }

  if (!status.details_submitted) {
    return {
      state: "unfinished",
      ready: false,
      title: "Finish your payment setup",
      detail:
        "You started with Stripe but didn't get to the end. Until you do, a client can book you and checkout will refuse.",
      cta: "Continue payment setup",
      tone: "alarm",
    };
  }

  const owed = Array.from(
    new Set((status.requirements_due ?? []).map(requirementLabel)),
  );

  if (owed.length) {
    return {
      state: "needs-more",
      ready: false,
      title: "Stripe needs one more thing",
      detail: `Your details are in, but Stripe still wants ${sentenceList(owed)}. Until it has that, nothing can be paid out to you.`,
      cta: "Give Stripe what it needs",
      tone: "alarm",
    };
  }

  if (status.pending_verification) {
    return {
      state: "under-review",
      ready: false,
      title: "Stripe is checking your details",
      // Nothing is asked of them, because nothing they can do would help. A
      // vendor sent to press a button would come back to the same screen.
      detail:
        "Nothing for you to do — payouts open when Stripe finishes. Bookings you accept in the meantime can't be paid for yet.",
      cta: "Check with Stripe",
      tone: "normal",
    };
  }

  // Payouts are off and Stripe hasn't named a reason we can act on. Say the
  // consequence, which is the part that's certainly true.
  return {
    state: "needs-more",
    ready: false,
    title: "Payouts are on hold",
    detail:
      "Stripe isn't paying out on your account at the moment. Opening it will show you what it needs.",
    cta: "Open Stripe",
    tone: "alarm",
  };
}

/** A booking that no longer counts toward anything. */
export function isDeadVendorBooking(b: VendorBooking): boolean {
  return (
    ["rejected", "cancelled"].includes(b.status) ||
    (b.payment_status ?? "unpaid") === "refunded"
  );
}

// ── Pipeline (kanban) ──────────────────────────────────────────────────
//
// A pure derived function over already-fetched bookings, same philosophy as
// vendorTasks/vendorEvents above — not a stored field, so nothing has to
// keep a "stage" column in sync with status/payment_status/timestamps by
// hand. Backend mirror: Desiconnect's docs/DECISIONS.md #13.

export type PipelineStage =
  | "inquiry"
  | "awaiting_client"
  | "confirmed"
  | "deposit_received"
  | "done";

/**
 * Where one booking sits on the pipeline. Assumes a *live* booking —
 * filter with `!isDeadVendorBooking(b)` first; a rejected/cancelled/
 * refunded booking doesn't belong on the kanban at all, not even in
 * "Inquiry". Evaluated top-to-bottom, first match wins:
 *
 * 1. Done — everything owed has been confirmed received. Deliberately does
 *    NOT auto-advance just because the event date passed: a vendor who
 *    forgot to confirm should see a stale-looking card, not a booking that
 *    silently vanished with money unconfirmed (a deliberate accuracy-over-
 *    tidiness tradeoff, not an oversight).
 * 2. Deposit received — a deposit is configured and confirmed, but the
 *    booking isn't fully Done yet. Only exists for a booking that has
 *    deposit_percent set at all; one with none skips straight from
 *    Confirmed to Done.
 * 3/4. A guest/contract booking (has a contract_token) is created already
 *    BookingStatus "approved" — there's no vendor accept/decline step in
 *    that flow, the vendor is both author and approver of their own offer
 *    — so status alone can't distinguish "sent, waiting on the client" from
 *    "the deal is real" the way it does for an ordinary booking. The
 *    client's e-signature is what actually means "confirmed" here:
 *    Confirmed once signed_at is set, Awaiting client until then.
 * 3'. An ordinary, marketplace-sourced booking (no contract_token) has no
 *    signature step at all — BookingStatus "approved" (the vendor's own
 *    accept decision) is what "Confirmed" means for it instead.
 * 5. Inquiry — everything else: a pending/negotiating ordinary booking, or
 *    any booking predating this pipeline that doesn't fit the above
 *    (bucketed here so nothing already in the system goes unclassified).
 */
export function pipelineStage(b: VendorBooking): PipelineStage {
  const hasDeposit = b.deposit_percent != null;
  const depositConfirmed = Boolean(b.deposit_confirmed_received_at);
  // "confirmed_paid" is the manual track's terminal state (the only live
  // track with escrow disabled); "released" is its Stripe-track equivalent,
  // kept for a booking predating the MVP's manual-only switch.
  const fullyPaid = b.payment_status === "confirmed_paid" || b.payment_status === "released";

  if ((!hasDeposit || depositConfirmed) && fullyPaid) return "done";
  if (hasDeposit && depositConfirmed) return "deposit_received";

  if (b.contract_token) {
    return b.signed_at ? "confirmed" : "awaiting_client";
  }
  return b.status === "approved" ? "confirmed" : "inquiry";
}

export interface PipelineStats {
  openInquiries: number;
  awaitingClient: number;
  depositsOwedCents: number;
  confirmedEvents: number;
}

/** The dashboard's stat tiles — reducers over the same derived stages, not
 *  a separate backend aggregation call. */
export function pipelineStats(bookings: VendorBooking[]): PipelineStats {
  const live = bookings.filter((b) => !isDeadVendorBooking(b));
  let openInquiries = 0;
  let awaitingClient = 0;
  let depositsOwedCents = 0;
  let confirmedEvents = 0;

  for (const b of live) {
    const stage = pipelineStage(b);
    if (stage === "inquiry") openInquiries += 1;
    if (stage === "awaiting_client") awaitingClient += 1;
    if (stage === "confirmed" || stage === "deposit_received") confirmedEvents += 1;
    if (
      b.deposit_percent != null &&
      !b.deposit_confirmed_received_at &&
      b.deposit_amount_cents
    ) {
      depositsOwedCents += b.deposit_amount_cents;
    }
  }

  return { openInquiries, awaitingClient, depositsOwedCents, confirmedEvents };
}

// ── Contracts list ─────────────────────────────────────────────────────

/**
 * Where one contract stands, in the finer grain /contracts needs. The
 * pipeline's five stages answer "how far along is this deal"; a contracts
 * list is where a vendor goes to chase one, so it also has to say *whose
 * move it is* — "Confirmed" alone doesn't tell them whether the client
 * owes a deposit or has already said they sent it.
 *
 * Same timestamps pipelineStage reads, same "done" rule, so a contract can't
 * read Paid here while sitting in a different column on the board.
 */
export type ContractStatus =
  | "draft"
  | "changes_waiting"
  | "awaiting_signature"
  | "expired"
  | "declined"
  | "deposit_due"
  | "confirm_deposit"
  | "balance_due"
  | "confirm_payment"
  | "paid"
  | "cancelled";

/** Whether an addendum or cancellation agreement can be attached: the
 *  booking is agreed — a signed contract, or a marketplace booking accepted
 *  before contracts — and not dead. Mirrors the backend's document_service
 *  check (its DECISIONS #21), which has the last word. */
export function canAttachDocument(b: VendorBooking): boolean {
  if (isDeadVendorBooking(b)) return false;
  if (b.contract_token) return Boolean(b.signed_at);
  return b.status === "approved" || b.status === "payment_confirmed";
}

export function contractStatus(b: VendorBooking): ContractStatus {
  if (b.contract_status === "declined") return "declined";
  if (isDeadVendorBooking(b)) return "cancelled";
  if (pipelineStage(b) === "done") return "paid";

  // Whether the client has opened it is b.viewed_at — a detail on the row,
  // not a status of its own: either way it's waiting on them.
  if (!b.signed_at) {
    if (b.contract_status === "draft") return "draft";
    // The client asked for changes and it's the vendor's turn to answer —
    // not "awaiting signature" (web #151): field by field, or an open
    // proposal on the older flow.
    if (changesWaiting(b) > 0) return "changes_waiting";
    if (b.contract_status === "expired") return "expired";
    return "awaiting_signature";
  }

  // A payment schedule (backend 0065) can have a middle payment the client
  // has sent while the rest aren't — the mirrored deposit/balance fields
  // below can't say so, so read the installments themselves.
  const schedule = b.payment_schedule;
  if (schedule?.length) {
    const waiting = schedule.find((i) => i.marked_paid_at && !i.confirmed_at);
    if (waiting) return schedule.length > 1 && waiting === schedule[0] ? "confirm_deposit" : "confirm_payment";
    const next = schedule.find((i) => !i.confirmed_at);
    if (!next) return "paid";
    return schedule.length > 1 && next === schedule[0] ? "deposit_due" : "balance_due";
  }

  if (b.deposit_percent != null && !b.deposit_confirmed_received_at) {
    return b.deposit_marked_paid_at ? "confirm_deposit" : "deposit_due";
  }
  return b.payment_status === "marked_paid" ? "confirm_payment" : "balance_due";
}

/** How many of the client's changes wait on the vendor's answer: the
 *  field-by-field count, or one for an open proposal. */
export function changesWaiting(b: Pick<VendorBooking, "negotiation" | "proposal_status" | "signed_at">): number {
  if (b.signed_at) return 0;
  if (b.negotiation) return b.negotiation.waiting_vendor;
  return b.proposal_status === "open" ? 1 : 0;
}

/** The statuses where the vendor, not the client, owes the next move — a
 *  payment to confirm, changes to answer, or an offer to send or resend (or
 *  let go). */
export function contractNeedsVendor(status: ContractStatus): boolean {
  return (
    status === "changes_waiting" ||
    status === "confirm_deposit" ||
    status === "confirm_payment" ||
    status === "expired" ||
    status === "draft"
  );
}

/**
 * What the vendor still has to do.
 *
 * Stripe comes first and usually alone in its tone: every other task is a job
 * to get on with, that one is money quietly not arriving. Pass `stripe` as null
 * when it couldn't be checked — an unknown isn't an alarm, and isn't a task.
 *
 * The wording is paymentsSetup's, not this function's, so the badge, the
 * dashboard and the earnings page can't describe the same account differently.
 */
export function vendorTasks(
  bookings: VendorBooking[],
  stripe: StripeStatus | null,
): VendorTask[] {
  const tasks: VendorTask[] = [];

  const payments = paymentsSetup(stripe);
  if (stripe && !payments.ready) {
    tasks.push({
      id: "stripe",
      kind: "stripe",
      title: payments.title,
      detail: payments.detail,
      cta: payments.cta,
      tone: payments.tone,
    });
  }

  for (const b of bookings) {
    if (isDeadVendorBooking(b)) continue;
    const service = b.service_name || "a package";
    const client = b.client_name || "A client";

    // Someone is waiting on an answer.
    if (b.status === "pending") {
      tasks.push({
        id: `request-${b.booking_id}`,
        kind: "request",
        title: `${client} wants to book ${service}`,
        detail: niceDate(b.date_iso)
          ? `For ${niceDate(b.date_iso)} · ${plainMoney(b.price)}`
          : "Date to be confirmed",
        cta: "Answer",
        tone: "urgent",
        bookingId: b.booking_id,
      });
      continue;
    }

    // A contract's changes, waiting on the vendor's answer (web #151).
    const changes = changesWaiting(b);
    if (b.contract_token && changes > 0) {
      tasks.push({
        id: `changes-${b.booking_id}`,
        kind: "changes",
        title: `${client} asked for ${changes === 1 ? "a change" : `${changes} changes`}`,
        detail: niceDate(b.date_iso) ? `${service} · ${niceDate(b.date_iso)}` : service,
        cta: "Answer",
        tone: "urgent",
        bookingId: b.booking_id,
      });
      continue;
    }

    // Money on a signed contract: a payment the client says is sent, then
    // one past due (web #170 — Overview said nothing while Bookings said
    // "Your move").
    for (const p of paymentsToConfirm(b)) {
      const what = p.kind === "installment" ? p.label : p.kind === "deposit" ? "the deposit" : "the balance";
      tasks.push({
        id: `payment-${b.booking_id}-${p.kind === "installment" ? p.installmentId : p.kind}`,
        kind: "payment",
        title: `${client} says they've sent ${what}`,
        detail: p.amountCents != null ? `${money(p.amountCents)} · confirm it arrived` : "Confirm it arrived",
        cta: "Confirm",
        tone: "urgent",
        bookingId: b.booking_id,
      });
    }
    for (const i of overdueInstallments(b)) {
      tasks.push({
        id: `overdue-${b.booking_id}-${i.id}`,
        kind: "overdue",
        title: `${client}'s ${i.label.toLowerCase()} is overdue`,
        detail: `${money(i.amount_cents)} · was due ${niceDate(i.due_on) ?? i.due_on}`,
        cta: "Open",
        tone: "urgent",
        bookingId: b.booking_id,
      });
    }

    // An offer on the table, and it's this vendor's turn to answer it — it
    // was reachable only from /my-bookings, so a vendor who never opened that
    // tab had a sale sitting unanswered with nothing anywhere telling them.
    // Gated on negotiation_awaiting_role rather than the booking's status
    // alone: status stays "negotiation_ongoing" through the whole back-and-
    // forth, including while it's the *vendor's own* counter still sitting
    // unanswered — which isn't "review this", it's "wait for them to answer",
    // same shape of non-actionable task the client side already learned not
    // to show (see the removed "vendor-reply" kind in lib/planning.ts).
    if (b.negotiation_awaiting_role === "vendor") {
      tasks.push({
        id: `offer-${b.booking_id}`,
        kind: "negotiation",
        title: `${client} made an offer on ${service}`,
        detail: niceDate(b.date_iso)
          ? `For ${niceDate(b.date_iso)} · listed at ${plainMoney(b.price)}`
          : `Listed at ${plainMoney(b.price)}`,
        cta: "Review offer",
        tone: "urgent",
        bookingId: b.booking_id,
      });
      continue;
    }

    // A date move waiting on this vendor. Deliberately not `continue`d: a paid
    // booking can owe both an answer on the new date and a confirmation, and
    // they are different jobs.
    //
    // Whose turn it is has no flag of its own — a repriced amount means the
    // vendor has already answered and the client is being asked to accept the
    // new total, which is exactly what awaitingClientConsent reads.
    const cr = b.change_request;
    if (cr && cr.status === "pending" && cr.repriced_amount_cents == null) {
      tasks.push({
        id: `move-${cr.change_request_id}`,
        kind: "date-change",
        title: `${client} wants to move ${service}`,
        detail: niceDate(cr.date_iso)
          ? `To ${niceDate(cr.date_iso)}${niceDate(b.date_iso) ? ` — was ${niceDate(b.date_iso)}` : ""}`
          : "They've proposed a new date.",
        cta: "Answer",
        tone: "urgent",
        bookingId: b.booking_id,
      });
    }

    // Paid, but the vendor's half of the release is outstanding — this is their
    // own money waiting. Mirrors lib/attention, which had these rules first.
    if ((b.payment_status ?? "unpaid") === "paid" && !b.vendor_confirmed_at) {
      // The anchor the server will actually measure against — a booked venue's
      // pin, or the event's own address when the plan has no venue. Gating on
      // venue_latitude alone meant a wedding in a family hall offered nobody a
      // check-in, so the vendor's payout waited on a confirmation that had no
      // way of being given.
      const atVenue = b.checkin_latitude != null && b.checkin_longitude != null;
      const canAct = atVenue || eventIsOver(b);
      if (canAct) {
        tasks.push({
          id: `release-${b.booking_id}`,
          kind: atVenue ? "check-in" : "confirm",
          title: atVenue
            ? `Check in at the venue for ${service}`
            : `Confirm ${service} happened`,
          detail: `${client} — your payout is waiting on this.`,
          cta: atVenue ? "Check in" : "Confirm",
          tone: "urgent",
          bookingId: b.booking_id,
        });
      }
    }
  }

  const rank = { alarm: 0, urgent: 1, normal: 2 };
  tasks.sort((a, b) => rank[a.tone] - rank[b.tone]);
  return tasks;
}

// ── Money ────────────────────────────────────────────────────────────

export interface VendorMoney {
  releasedCents: number;
  inEscrowCents: number;
  upcomingCents: number;
  upcomingCount: number;
  disputedCents: number;
  refundedCents: number;
  /** Venmo/Zelle money the vendor has confirmed receiving — self-reported,
   *  never seen by Jorna, so kept apart from releasedCents. */
  paidDirectlyCents: number;
  /** Clients say they've paid directly; the vendor hasn't confirmed yet. */
  awaitingConfirmationCents: number;
  awaitingConfirmationCount: number;
  feesCents: number;
  /**
   * The platform's actual cut, as a percentage, worked out from what it has
   * taken. The API publishes no rate — only a per-booking `platform_fee_cents`
   * — so a hardcoded "10%" would be a guess that goes quietly wrong the day it
   * changes. Null until there's a booking to derive it from.
   */
  feePercent: number | null;
}

export function vendorMoney(e: Earnings | null): VendorMoney | null {
  if (!e) return null;
  const gross = (e.history ?? []).reduce((n, h) => n + (h.amount_cents ?? 0), 0);
  const fees = (e.history ?? []).reduce((n, h) => n + (h.platform_fee_cents ?? 0), 0);
  return {
    releasedCents: e.total_released_cents ?? 0,
    inEscrowCents: e.in_escrow_cents ?? 0,
    upcomingCents: e.upcoming_cents ?? 0,
    upcomingCount: e.upcoming_count ?? 0,
    disputedCents: e.disputed_cents ?? 0,
    refundedCents: e.refunded_cents ?? 0,
    paidDirectlyCents: e.self_reported_cents ?? 0,
    awaitingConfirmationCents: e.self_reported_pending_cents ?? 0,
    awaitingConfirmationCount: e.self_reported_pending_count ?? 0,
    feesCents: e.platform_fees_cents ?? 0,
    feePercent: gross > 0 ? Math.round((fees / gross) * 1000) / 10 : null,
  };
}

export { money as centsToMoney };

// ── Events ───────────────────────────────────────────────────────────
//
// A vendor's work arrives as bookings, but it happens as celebrations. Booked
// for a wedding weekend, they have three: mehndi on the Friday, sangeet on the
// Saturday, reception on the Sunday — one client, one venue, one weekend, and
// on a flat list three unrelated rows, potentially in three different sections
// depending on what each one happened to need.
//
// Grouping needs nothing from the backend. create_booking makes a bundle when
// the client doesn't name one, so every booking has a bundle_id, and the vendor
// payload already carries it alongside event_name.

export interface VendorEventMoney {
  /** Approved, not yet paid. */
  upcoming: number;
  /** Paid, held by Jorna — not theirs yet. */
  inEscrow: number;
  released: number;
  /** Priced per guest/hour/day with the quantity still unknown. Counted, not
   *  summed: there is no honest total for a rate. */
  unpricedCount: number;
}

export interface VendorEvent {
  /** The bundle. Always present — see the note above. */
  id: string;
  name: string;
  clientName: string | null;
  /** First and last day across the bookings; null while everything is TBD. */
  dateIso: string | null;
  endIso: string | null;
  /** Live bookings, in the order they happen. */
  bookings: VendorBooking[];
  /** Declined, cancelled or refunded — kept so a gap can be explained. */
  closed: VendorBooking[];
  /** This event's share of the vendor's task list. */
  tasks: VendorTask[];
  money: VendorEventMoney;
  isToday: boolean;
  isPast: boolean;
}

function eventMoney(bookings: VendorBooking[]): VendorEventMoney {
  const sum: VendorEventMoney = {
    upcoming: 0,
    inEscrow: 0,
    released: 0,
    unpricedCount: 0,
  };
  for (const b of bookings) {
    if (b.price_pending_quantity) {
      sum.unpricedCount += 1;
      continue;
    }
    const pay = b.payment_status ?? "unpaid";
    const price = b.price ?? 0;
    if (pay === "paid" || pay === "disputed") sum.inEscrow += price;
    else if (pay === "released") sum.released += price;
    else if (b.status === "approved" || b.status === "payment_confirmed") {
      sum.upcoming += price;
    }
  }
  return sum;
}

/** The real dates in a list, ISO-sorted. ISO strings compare correctly as text. */
function realDates(values: (string | null | undefined)[]): string[] {
  return values.filter((d): d is string => Boolean(d) && d !== "TBD").sort();
}

/**
 * The vendor's bookings as the celebrations they belong to.
 *
 * Ordered by what it costs to miss: anything owing an action first, then by
 * when it happens, with events already past at the end. A vendor opening this
 * on a phone between jobs should find the thing that needs them at the top
 * without reading past six cards that don't.
 *
 * `tasks` is threaded through rather than recomputed so the cards and the
 * "Needs you" list can't disagree about what is outstanding — the same reason
 * lib/attention reads vendorTasks instead of deriving its own.
 */
export function vendorEvents(
  bookings: VendorBooking[],
  tasks: VendorTask[] = [],
): VendorEvent[] {
  const byBooking = new Map<string, VendorTask[]>();
  for (const t of tasks) {
    if (!t.bookingId) continue;
    const list = byBooking.get(t.bookingId);
    if (list) list.push(t);
    else byBooking.set(t.bookingId, [t]);
  }

  const groups = new Map<string, VendorBooking[]>();
  for (const b of bookings) {
    // A booking with no bundle shouldn't exist, but a null key would collapse
    // every such booking into one imaginary shared event — far worse than
    // giving each its own card.
    const key = b.bundle_id || `booking:${b.booking_id}`;
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }

  const events: VendorEvent[] = [];
  for (const [id, all] of groups) {
    const live = all.filter((b) => !isDeadVendorBooking(b));
    const closed = all.filter((b) => isDeadVendorBooking(b));
    // Everything dead is history, not an event they still have.
    if (live.length === 0) continue;

    live.sort((a, b) => {
      const byDate = (a.date_iso ?? "").localeCompare(b.date_iso ?? "");
      return byDate !== 0 ? byDate : (a.time_start ?? "").localeCompare(b.time_start ?? "");
    });

    // First day of the celebration, and the last day anything on it runs to —
    // a marquee hired Friday-to-Sunday ends the event later than the reception
    // that starts and finishes on the Saturday.
    const starts = realDates(live.map((b) => b.date_iso));
    const ends = realDates(live.map((b) => b.date_end || b.date_iso));
    const dateIso = starts[0] ?? null;
    const endIso = ends[ends.length - 1] ?? dateIso;
    const last = daysUntil(endIso);

    events.push({
      id,
      name: live.find((b) => b.event_name)?.event_name || "A celebration",
      clientName: live.find((b) => b.client_name)?.client_name ?? null,
      dateIso,
      endIso,
      bookings: live,
      closed,
      tasks: live.flatMap((b) => byBooking.get(b.booking_id) ?? []),
      money: eventMoney(live),
      isToday: live.some((b) => daysUntil(b.date_iso) === 0),
      isPast: last != null && last < 0,
    });
  }

  return events.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
    const aNeeds = a.tasks.length > 0;
    const bNeeds = b.tasks.length > 0;
    if (aNeeds !== bNeeds) return aNeeds ? -1 : 1;
    // Undated last within its group: it can't be planned around.
    if (!a.dateIso) return b.dateIso ? 1 : 0;
    if (!b.dateIso) return -1;
    return a.isPast
      ? b.dateIso.localeCompare(a.dateIso)
      : a.dateIso.localeCompare(b.dateIso);
  });
}

// ── Dates ───────────────────────────────────────────────────────────

/** Days until an ISO date; negative once past, null when unusable. */
export function daysUntil(iso?: string | null): number | null {
  if (!iso || iso === "TBD") return null;
  const day = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(day)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((day - today.getTime()) / 86_400_000);
}

/**
 * What's ahead, for the calendar's side list.
 *
 * Deliberately its own thing rather than a filter over the dashboard's events:
 * this one keeps "pending" bookings, and dropping them showed on the calendar
 * as a hole — a day tinted gold with "Tentative" in the legend beside it, and
 * nothing in the list to click. Everything the grid marks is here, carrying
 * which of the two it is so the list and the tint agree.
 *
 * Anchored on the last day, so a booking running across today is still ahead of
 * you rather than behind.
 */
export function upcomingOnCalendar(
  bookings: VendorBooking[],
): { booking: VendorBooking; dateIso: string; status: DayStatus; isToday: boolean }[] {
  return bookings
    .filter((b) => !isDeadVendorBooking(b))
    .map((b) => ({
      booking: b,
      dateIso: b.date_iso ?? "",
      status: statusOfBooking(b),
      isToday: daysUntil(b.date_iso) === 0,
      lastDay: daysUntil(b.date_end || b.date_iso),
    }))
    .filter(
      (j) =>
        j.dateIso &&
        j.dateIso !== "TBD" &&
        j.status !== "free" &&
        j.lastDay != null &&
        j.lastDay >= 0,
    )
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .map(({ booking, dateIso, status, isToday }) => ({
      booking,
      dateIso,
      status,
      isToday,
    }));
}

// ── Listing health ───────────────────────────────────────────────────

export interface HealthIssue {
  id: string;
  issue: string;
  /** What it costs them — the reason to bother fixing it. */
  consequence: string;
  cta: string;
  href: string;
  severity: "critical" | "warning";
}

/**
 * Concrete reasons a vendor isn't getting booked. Not a score: every row is a
 * thing that is switched off, and the consequence is the one it actually has.
 */
export function listingHealth(opts: {
  vendor: VendorDetail | null;
  services: ServiceItem[];
  availability: AvailabilitySlot[];
}): HealthIssue[] {
  const { vendor, services, availability } = opts;
  const issues: HealthIssue[] = [];

  // No Stripe row. It was here and in vendorTasks, both worded by paymentsSetup
  // — so the dashboard printed the same sentence twice, once as an alarm at the
  // top and again in a list further down. The alarm is the one worth keeping:
  // being unable to be paid at all is not the same kind of problem as a listing
  // with no photo, and burying it among those flattened it.

  if (services.length === 0) {
    issues.push({
      id: "no-services",
      issue: "You have no packages listed",
      consequence: "There's nothing for a host to book, so you won't appear in search.",
      cta: "Add a package",
      href: "/vendor-profile#services",
      severity: "critical",
    });
  }

  if (availability.length === 0) {
    issues.push({
      id: "no-availability",
      issue: "No weekly hours set",
      consequence:
        "Hosts filtering by a date can't tell whether you're free, so you're easy to skip.",
      cta: "Set hours",
      href: "/vendor-profile",
      severity: "warning",
    });
  }

  const noPhotos = services.filter((s) => !s.media?.length);
  if (noPhotos.length > 0) {
    const first = noPhotos[0].name || "A package";
    issues.push({
      id: "no-photos",
      issue:
        noPhotos.length === 1
          ? `“${first}” has no photos`
          : `${noPhotos.length} packages have no photos`,
      consequence: "A listing with no photo is the one people scroll past.",
      cta: "Add photos",
      href: "/vendor-profile#services",
      severity: "warning",
    });
  }

  if (vendor && !vendor.bio?.trim()) {
    issues.push({
      id: "no-bio",
      issue: "Your profile has no bio",
      consequence: "Hosts choosing between two vendors read this first.",
      cta: "Write one",
      href: "/vendor-profile",
      severity: "warning",
    });
  }

  if (vendor && !vendor.pfp_url) {
    issues.push({
      id: "no-profile-photo",
      issue: "No profile photo",
      consequence: "You show up as a monogram everywhere clients see your name.",
      cta: "Add one",
      href: "/account",
      severity: "warning",
    });
  }

  if (vendor && vendor.travel_radius_miles == null && !vendor.open_to_long_distance) {
    issues.push({
      id: "no-radius",
      issue: "No travel radius set",
      consequence: "Hosts searching by distance may never see you.",
      cta: "Set radius",
      href: "/vendor-profile",
      severity: "warning",
    });
  }

  return issues;
}

// ── Calendar ─────────────────────────────────────────────────────────
//
// A month of the vendor's work. Bookings carry a date, a start and end time,
// and optionally a date_end, so a multi-day job belongs to every day it covers
// rather than only the one it started on.

/**
 * A day's state, matching the iOS calendar (VendorCalendarView.swift):
 * approved and payment_confirmed read as booked, pending and
 * negotiation_ongoing as tentative, rejected shows as nothing at all.
 */
export type DayStatus = "booked" | "tentative" | "free";

export interface CalendarDay {
  dateIso: string;
  /** Day of the month, 1-31. */
  day: number;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  status: DayStatus;
  /** Busy in the vendor's connected Google Calendar, with nothing booked here. */
  googleBusy: boolean;
  bookings: VendorBooking[];
}

/** iOS maps booking status onto the calendar's three states this way. */
export function statusOfBooking(b: VendorBooking): DayStatus {
  if (b.status === "approved" || b.status === "payment_confirmed") return "booked";
  if (b.status === "pending" || b.status === "negotiation_ongoing") return "tentative";
  return "free";
}

/** Booked wins over tentative on a day that holds both. */
export function dayStatus(bookings: VendorBooking[]): DayStatus {
  let seen: DayStatus = "free";
  for (const b of bookings) {
    const s = statusOfBooking(b);
    if (s === "booked") return "booked";
    if (s === "tentative") seen = "tentative";
  }
  return seen;
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Inclusive ISO days from `start` to `end`, capped so a bad range can't run away. */
function spanDays(start: string, end?: string | null): string[] {
  if (!end || end === "TBD" || end === start) return [start];
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return [start];
  }
  const days: string[] = [];
  for (const d = new Date(from); d <= to && days.length < 62; d.setDate(d.getDate() + 1)) {
    days.push(isoOf(d));
  }
  return days;
}

/** Every live booking indexed by each day it covers. */
export function bookingsByDay(bookings: VendorBooking[]): Map<string, VendorBooking[]> {
  const byDay = new Map<string, VendorBooking[]>();
  for (const b of bookings) {
    if (isDeadVendorBooking(b)) continue;
    if (!b.date_iso || b.date_iso === "TBD") continue;
    for (const day of spanDays(b.date_iso, b.date_end)) {
      const list = byDay.get(day);
      if (list) list.push(b);
      else byDay.set(day, [b]);
    }
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.time_start ?? "").localeCompare(b.time_start ?? ""));
  }
  return byDay;
}

/**
 * A month as whole weeks starting Monday, so the grid is always 7 wide and the
 * columns line up with WEEKDAYS. `month` is 0-indexed, like Date.
 */
export function calendarMonth(
  bookings: VendorBooking[],
  year: number,
  month: number,
  /** ISO days the vendor's Google Calendar reports as busy. */
  googleBusyDays: Set<string> = new Set(),
): CalendarDay[] {
  const byDay = bookingsByDay(bookings);
  const todayIso = isoOf(new Date());

  const first = new Date(year, month, 1);
  // getDay() counts from Sunday; the grid starts Monday, like WEEKDAYS.
  const lead = (first.getDay() + 6) % 7;
  const cursor = new Date(year, month, 1 - lead);

  const days: CalendarDay[] = [];
  // Six weeks always covers a month, and a fixed height stops the grid jumping
  // as you page through.
  for (let i = 0; i < 42; i++) {
    const iso = isoOf(cursor);
    const dayBookings = byDay.get(iso) ?? [];
    const status = dayStatus(dayBookings);
    days.push({
      dateIso: iso,
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month,
      isToday: iso === todayIso,
      isPast: iso < todayIso,
      status,
      // Only worth saying when nothing of Jorna's own is on that day; a booked
      // day is already accounted for.
      googleBusy: status === "free" && googleBusyDays.has(iso),
      bookings: dayBookings,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ── Overview ─────────────────────────────────────────────────────────
//
// The vendor redesign's Overview page (2026-10): a summary of the other
// pages, so its numbers are reducers over the same rules they use.

/**
 * A booking's tab on the Overview card (and, from plan step 3, the Bookings
 * page): Deposit due, Confirmed, or Over, which vendors read as Deposit due,
 * Upcoming and Done (2026-10-03 copy pass). A booking exists once it's agreed —
 * a contract signed, or a marketplace request accepted — so anything before
 * that (a lead) is null, as is anything dead.
 *
 * "Over" is every event that has happened, paid or not (2026-10 lifecycle
 * plan). It used to hold one only until its money was confirmed and then
 * drop it, so a fully paid past booking vanished from every tab. Each Over
 * row says Paid or Balance due instead — see overPill.
 */
export type BookingTab = "deposit_due" | "confirmed" | "over";

export function bookingTab(b: VendorBooking): BookingTab | null {
  if (isDeadVendorBooking(b)) return null;
  const agreed = b.contract_token ? Boolean(b.signed_at) : b.status === "approved" || b.status === "payment_confirmed";
  if (!agreed) return null;
  const left = daysUntil(b.date_end || b.date_iso);
  if (left != null && left < 0) return "over";
  const status = contractStatus(b);
  return status === "deposit_due" || status === "confirm_deposit" ? "deposit_due" : "confirmed";
}

/** What an Over row's pill says: whether the money is all in. */
export function overPill(b: VendorBooking): { label: "Paid" | "Balance due"; paid: boolean } {
  const paid = pipelineStage(b) === "done";
  return { label: paid ? "Paid" : "Balance due", paid };
}

/**
 * Money the vendor confirmed receiving in the calendar month containing `now`:
 * every schedule installment confirmed that month, or — for a booking from
 * before payment schedules — its deposit. The balance on such a booking has
 * no confirmation timestamp in the payload, so it can't be placed in a month
 * and isn't counted.
 */
export function receivedThisMonthCents(bookings: VendorBooking[], now = new Date()): number {
  const inMonth = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  let total = 0;
  for (const b of bookings) {
    if (isDeadVendorBooking(b)) continue;
    if (b.payment_schedule?.length) {
      for (const i of b.payment_schedule) if (inMonth(i.confirmed_at)) total += i.amount_cents;
    } else if (inMonth(b.deposit_confirmed_received_at) && b.deposit_amount_cents) {
      total += b.deposit_amount_cents;
    }
  }
  return total;
}

/** What's owed as deposits on agreed bookings that haven't had one confirmed. */
export function depositsOwedCents(bookings: VendorBooking[]): number {
  let total = 0;
  for (const b of bookings) {
    if (bookingTab(b) !== "deposit_due") continue;
    const first = b.payment_schedule?.[0];
    if (b.payment_schedule && b.payment_schedule.length > 1 && first && !first.confirmed_at) {
      total += first.amount_cents;
    } else if (b.deposit_amount_cents && !b.deposit_confirmed_received_at) {
      total += b.deposit_amount_cents;
    }
  }
  return total;
}

/** Upcoming agreed bookings, soonest first — the Overview's "Your schedule". */
export function upcomingBookings(bookings: VendorBooking[]): VendorBooking[] {
  return bookings
    .filter((b) => {
      const tab = bookingTab(b);
      return tab === "deposit_due" || tab === "confirmed";
    })
    .filter((b) => b.date_iso && b.date_iso !== "TBD")
    .sort((a, b) => {
      const byDate = (a.date_iso ?? "").localeCompare(b.date_iso ?? "");
      return byDate !== 0 ? byDate : (a.time_start ?? "").localeCompare(b.time_start ?? "");
    });
}

/** "Today", "Tomorrow", "In 4 days", "In 3 weeks". */
export function countdownLabel(iso?: string | null): string | null {
  const days = daysUntil(iso);
  if (days == null || days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 21) return `In ${days} days`;
  if (days < 70) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

export interface LeadSummary {
  /** Everything not yet agreed: requests, offers on the table, open informal leads. */
  open: number;
  /** Of those, the ones waiting on the vendor's answer. */
  needReply: number;
}

/**
 * The Overview's lead tiles, until plan step 2 gives leads one list of their
 * own. Bookings not yet agreed (requests, negotiations, sent contracts) plus
 * the informal leads that haven't been won or lost; "need a reply" is the
 * request/offer tasks vendorTasks already derives, plus informal leads still
 * marked new.
 */
export function leadSummary(
  bookings: VendorBooking[],
  leads: { status: string; converted_booking_id: string | null }[],
): LeadSummary {
  const live = bookings.filter((b) => !isDeadVendorBooking(b));
  const pendingBookings = live.filter((b) => {
    const stage = pipelineStage(b);
    return stage === "inquiry" || stage === "awaiting_client";
  });
  const openLeads = leads.filter(
    (l) => !l.converted_booking_id && l.status !== "won" && l.status !== "lost",
  );
  const replyTasks = vendorTasks(live, null).filter(
    (t) => t.kind === "request" || t.kind === "negotiation",
  ).length;
  return {
    open: pendingBookings.length + openLeads.length,
    needReply: replyTasks + openLeads.filter((l) => l.status === "new").length,
  };
}

// ── Bookings page ────────────────────────────────────────────────────

/** The design's five steps, in order, when the last payment comes after the
 *  event (or nothing says when). */
export const BOOKING_STEPS = [
  "Contract sent",
  "Contract signed",
  "Deposit paid",
  "Event over",
  "Payment received",
] as const;

export type BookingStep = (typeof BOOKING_STEPS)[number] | "Paid in full";

/**
 * A booking's steps, in the order they happen. When the contract's last
 * payment falls due before the event, being paid in full comes before the
 * event, not after it (web #170: "Deposit paid → Event over → Payment
 * received" for a balance due two weeks out).
 */
export function bookingSteps(b: VendorBooking): BookingStep[] {
  const schedule = b.payment_schedule ?? [];
  const lastDue = schedule.length ? effectiveDue(schedule[schedule.length - 1], b.signed_at) : null;
  const start = b.date_iso && b.date_iso !== "TBD" ? b.date_iso : null;
  if (lastDue && start && lastDue <= start) {
    return ["Contract sent", "Contract signed", "Deposit paid", "Paid in full", "Event over"];
  }
  return [...BOOKING_STEPS];
}

/**
 * How many of bookingSteps(b) are done (0–5), from real data. A marketplace
 * booking accepted before contracts existed has no contract, so its first
 * two steps count as done the moment it's agreed. A booking with no deposit
 * passes that step once signed.
 */
export function bookingProgress(b: VendorBooking): number {
  const agreed = b.contract_token ? Boolean(b.signed_at) : b.status === "approved" || b.status === "payment_confirmed";
  const sent = agreed || Boolean(b.sent_at) || (b.contract_token != null && b.contract_status !== "draft");
  if (!sent) return 0;
  if (!agreed) return 1;
  const status = contractStatus(b);
  const depositDone = status !== "deposit_due" && status !== "confirm_deposit";
  if (!depositDone) return 2;
  const left = daysUntil(b.date_end || b.date_iso);
  const over = left != null && left < 0;
  const paid = pipelineStage(b) === "done" || status === "paid";
  if (bookingSteps(b)[3] === "Paid in full") {
    if (!paid) return 3;
    return over ? 5 : 4;
  }
  if (paid && over) return 5;
  return over ? 4 : 3;
}

export interface BookingMoney {
  totalCents: number | null;
  depositCents: number | null;
  depositPaid: boolean;
  /** Confirmed received so far, across installments or the legacy pair. */
  receivedCents: number;
  balanceCents: number | null;
  paidInFull: boolean;
  /** When what's left is due, in the contract's own terms ("Due May 31,
   *  2030 (14 days before the event)") — from the next unpaid payment on the
   *  schedule after the deposit. Null without a schedule, where nothing says. */
  balanceDue: string | null;
  /** When the deposit is due, while it's unpaid (#135). Null without a
   *  schedule, or once it's in. */
  depositDue: string | null;
  /** The next unpaid payment is past due (see overdueInstallments). */
  overdue: boolean;
}

/** Total, deposit and what's left, read from the payment schedule when the
 *  contract has one, else the single deposit fields. */
export function bookingMoney(b: VendorBooking): BookingMoney {
  const totalCents = b.amount_cents ?? (b.price_pending_quantity ? null : Math.round((b.price ?? 0) * 100));
  const paidInFull = pipelineStage(b) === "done";
  const schedule = b.payment_schedule ?? [];
  if (schedule.length) {
    // The signed contract is the source of truth: what's been received, and
    // when the rest is due, come from its payment schedule.
    const received = schedule.filter((i) => i.confirmed_at).reduce((n, i) => n + i.amount_cents, 0);
    const deposit = schedule.length > 1 ? schedule[0] : null;
    const unpaid = schedule.filter((i) => !i.confirmed_at);
    // The deposit has its own box: what's "remaining" is what comes after it
    // (web #170 listed the deposit under the remaining balance).
    const later = unpaid.filter((i) => i !== deposit);
    const next = later[0] ?? null;
    const overdue = overdueInstallments(b);
    return {
      totalCents,
      depositCents: deposit?.amount_cents ?? null,
      depositPaid: Boolean(deposit?.confirmed_at),
      receivedCents: received,
      balanceCents: totalCents != null ? Math.max(0, totalCents - received - (deposit && !deposit.confirmed_at ? deposit.amount_cents : 0)) : null,
      paidInFull: paidInFull || unpaid.length === 0,
      balanceDue: next
        ? `${later.length > 1 ? `${next.label} ` : ""}${describeDue(next)}${
            later.length > 1 ? `, then ${later.length - 1} more` : ""
          }`
        : null,
      depositDue: deposit && !deposit.confirmed_at ? describeDue(deposit) : null,
      overdue: (next != null && overdue.includes(next)) || (deposit != null && overdue.includes(deposit)),
    };
  }
  const depositPaid = Boolean(b.deposit_confirmed_received_at);
  const received = paidInFull ? (totalCents ?? 0) : depositPaid ? (b.deposit_amount_cents ?? 0) : 0;
  return {
    totalCents,
    depositCents: b.deposit_percent != null ? (b.deposit_amount_cents ?? null) : null,
    depositPaid,
    receivedCents: received,
    balanceCents: totalCents != null ? Math.max(0, totalCents - received) : null,
    paidInFull,
    balanceDue: null,
    depositDue: null,
    overdue: false,
  };
}

/** Today in the vendor's own timezone, YYYY-MM-DD. */
function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** When a signed contract's payment is actually due: its date, but never
 *  before the day it was signed — the backend's effective_due, which its
 *  reminders use. */
export function effectiveDue(i: { due_on?: string | null }, signedAt?: string | null): string | null {
  if (!i.due_on) return null;
  const signed = signedAt ? signedAt.slice(0, 10) : null;
  return signed && signed > i.due_on ? signed : i.due_on;
}

/** Payments on a signed contract that are past due and not yet sent. One the
 *  client marked sent is the vendor's to confirm, not overdue. */
export function overdueInstallments(b: VendorBooking, now = new Date()) {
  if (!b.signed_at || isDeadVendorBooking(b)) return [];
  const today = todayIso(now);
  return (b.payment_schedule ?? []).filter((i) => {
    const due = effectiveDue(i, b.signed_at);
    return !i.confirmed_at && !i.marked_paid_at && due != null && due < today;
  });
}

export type PaymentToConfirm =
  | { kind: "installment"; installmentId: string; label: string; amountCents: number }
  | { kind: "deposit"; amountCents: number | null }
  | { kind: "balance"; amountCents: number | null };

/** Payments the couple says they've sent that the vendor hasn't confirmed —
 *  each its own button, same calls the contract page and the old Bookings
 *  page make. */
export function paymentsToConfirm(b: VendorBooking): PaymentToConfirm[] {
  if (isDeadVendorBooking(b)) return [];
  const schedule = b.payment_schedule ?? [];
  if (schedule.length) {
    return schedule
      .filter((i) => i.marked_paid_at && !i.confirmed_at)
      .map((i) => ({ kind: "installment" as const, installmentId: i.id, label: i.label, amountCents: i.amount_cents }));
  }
  const out: PaymentToConfirm[] = [];
  if (b.deposit_marked_paid_at && !b.deposit_confirmed_received_at) {
    out.push({ kind: "deposit", amountCents: b.deposit_amount_cents ?? null });
  }
  if (b.payment_method === "manual" && b.payment_status === "marked_paid") {
    out.push({ kind: "balance", amountCents: bookingMoney(b).balanceCents });
  }
  return out;
}
