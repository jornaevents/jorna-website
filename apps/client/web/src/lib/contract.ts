// Contracts are signed on the vendor site's no-login page, not here: an
// accepted request becomes a contract the client reads and signs at
// jornaevents.com/app/booking-link (backend DECISIONS.md #17). This app
// links there to sign, then shows the signed contract (/contract) and its
// payments itself.
//
// NEXT_PUBLIC_VENDOR_APP_URL overrides the default, the same
// env-with-fallback pattern as lib/api.ts.

import { eventIsOver, type BundleBooking, type Installment } from "./types";

const VENDOR_APP_ORIGIN = process.env.NEXT_PUBLIC_VENDOR_APP_URL ?? "https://jornaevents.com";

export function contractSignUrl(token: string): string {
  return `${VENDOR_APP_ORIGIN}/app/booking-link/?t=${encodeURIComponent(token)}`;
}

/** The same page, opened straight into "Propose changes" (backend
 *  DECISIONS #23). */
export function contractProposeUrl(token: string): string {
  return `${contractSignUrl(token)}&propose=1`;
}

/** This app's own read-only page for a contract. */
export function contractViewPath(token: string): string {
  return `/contract?t=${encodeURIComponent(token)}`;
}

/** Where a booking's contract stands, as far as the client has anything to
 *  do: "sign" (it's waiting on them), "expired" (it lapsed unsigned),
 *  "awaiting_vendor" (they signed; nothing is owed until the vendor signs
 *  too, backend DECISIONS #34), or null — no contract, or nothing left to
 *  sign. */
export function contractStep(b: BundleBooking): "sign" | "expired" | "awaiting_vendor" | null {
  if (!b.contract_token || b.signed_at) return null;
  if (b.contract_status === "awaiting_vendor") return "awaiting_vendor";
  if (b.contract_status === "sent" || b.contract_status === "viewed") return "sign";
  if (b.contract_status === "expired") return "expired";
  return null;
}

/**
 * Where a booking is in its lifecycle, named the way the vendor's app names
 * it (2026-10 lifecycle plan): Requested → Contract to review (or, while
 * negotiating, Changes proposed / New version to review) → Signed · deposit
 * due → Confirmed → Completed. Null for anything off that path —
 * declined, voided, expired, a draft — and for a booking from before
 * contracts, whose escrow-era states the caller still describes itself.
 *
 * "Deposit due" mirrors the vendor's bookingTab: a schedule of more than one
 * payment whose first isn't confirmed received yet. A single-payment
 * contract has no deposit step and goes straight to Confirmed.
 */
export type BookingStage =
  | "requested"
  | "contract_to_review"
  | "changes_proposed"
  | "new_version"
  | "awaiting_vendor"
  | "deposit_due"
  | "confirmed"
  | "completed";

export function bookingStage(
  b: Partial<
    Pick<
      BundleBooking,
      | "status" | "contract_token" | "contract_status" | "signed_at" | "payment_schedule" | "date_iso" | "date_end"
      | "proposal_status"
    >
  > & { timezone?: string | null },
): BookingStage | null {
  if (b.status === "rejected" || b.status === "cancelled") return null;
  if (b.contract_token && b.signed_at) {
    if (eventIsOver(b)) return "completed";
    const schedule = b.payment_schedule ?? [];
    return schedule.length > 1 && !schedule[0].confirmed_at ? "deposit_due" : "confirmed";
  }
  if (b.contract_token) {
    if (b.contract_status === "awaiting_vendor") return "awaiting_vendor";
    if (b.contract_status !== "sent" && b.contract_status !== "viewed") return null;
    // Negotiation (DECISIONS #23): the client's proposal is with the vendor,
    // or the vendor has answered it with a version to read.
    if (b.proposal_status === "open") return "changes_proposed";
    if (b.proposal_status === "accepted" || b.proposal_status === "revised") return "new_version";
    return "contract_to_review";
  }
  return b.status === "pending" ? "requested" : null;
}

/** Requested is said in full: "Awaiting vendor" alone left a host wondering
 *  whether the request went anywhere. */
export const STAGE_LABELS: Record<BookingStage, string> = {
  requested: "Requested — awaiting the vendor",
  contract_to_review: "Contract to review",
  changes_proposed: "Changes proposed",
  new_version: "New version to review",
  awaiting_vendor: "Signed · waiting for the vendor to sign",
  deposit_due: "Signed · deposit due",
  confirmed: "Confirmed",
  completed: "Completed",
};

/** "received" and "sent" are settled from the client's side; the other three
 *  are still theirs to pay, by when. */
export type PaymentState = "received" | "sent" | "overdue" | "due" | "upcoming";

export interface PaymentRow {
  installment: Installment;
  state: PaymentState;
  /** The date it's due, "YYYY-MM-DD" — null until the contract is signed. */
  due: string | null;
}

/** Today as a UTC calendar day: the backend's due dates and reminders are
 *  UTC days (DECISIONS.md #18), so "due today" has to be read the same way. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Each payment on a signed contract and where it stands. Empty when the
 *  booking has no schedule (it pays in one go) or nothing is owed yet.
 *  Takes a plan's booking or a contract read by its link alike. */
export function paymentRows(
  b: Pick<BundleBooking, "signed_at" | "payment_schedule">,
  today: string = utcToday(),
): PaymentRow[] {
  if (!b.signed_at || !b.payment_schedule?.length) return [];
  return b.payment_schedule.map((installment) => {
    const due = installment.effective_due ?? null;
    let state: PaymentState;
    if (installment.confirmed_at) state = "received";
    else if (installment.marked_paid_at) state = "sent";
    else if (due && today > due) state = "overdue";
    else if (due && today === due) state = "due";
    else state = "upcoming";
    return { installment, state, due };
  });
}

/** The first payment the client still has to send, or null. */
export function nextPayment(
  b: Pick<BundleBooking, "signed_at" | "payment_schedule">,
  today: string = utcToday(),
): PaymentRow | null {
  return paymentRows(b, today).find((r) => r.state !== "received" && r.state !== "sent") ?? null;
}

/** Exact money for a payment: cents are shown when there are any, since
 *  "send $1,333" for a $1,333.33 installment is a wrong instruction. */
export function centsMoney(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "2030-04-17" → "17 Apr 2030", in the reader's locale. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The line under a payment: what the client needs to know about it now. */
export function describePayment(row: PaymentRow, vendor: string): string {
  switch (row.state) {
    case "received":
      return `Received by ${vendor}`;
    case "sent":
      return `Sent — waiting for ${vendor} to confirm`;
    case "overdue":
      return `Was due ${shortDate(row.due!)}`;
    case "due":
      return "Due today";
    default:
      return row.due ? `Due ${shortDate(row.due)}` : "Due once signed";
  }
}
