// What the event workspace's Overview says about each vendor and about the
// celebration as a whole (client redesign PR 4). Pure, over lib/contract's
// bookingStage and payment rows — the same lifecycle the vendor's app names —
// so the two sides can't describe one booking differently.

import {
  bookingStage,
  centsMoney,
  contractStep,
  describePayment,
  nextPayment,
  paymentRows,
} from "@/lib/contract";
import { isDeadBooking, isDraftBundle } from "@/lib/planning";
import type { Celebration } from "@/lib/myEvents";
import type { BundleBooking, BundleDetail } from "@/lib/types";
import type { Tone } from "@/components/kit";

export interface VendorRow {
  booking: BundleBooking;
  bundleId: string;
  /** The one word for where it stands. */
  status: string;
  tone: Tone;
  /** Price, and the next thing about its money. */
  detail: string;
  /** The single next step, and what it opens. */
  action: "Send request" | "Review" | "Pay now" | "View";
  target: "plan" | "contract" | "drawer";
  /** How far along the eight-step line it is (0 = find one … 7 = done). */
  step: number;
}

/** The progress line in the vendor drawer. */
export const VENDOR_STEPS = ["Find one", "Ready to send", "Requested", "Contract sent", "Changes", "Signed", "Paid", "Done"];

function price(b: BundleBooking): string | null {
  if (b.amount_cents != null) return centsMoney(b.amount_cents);
  if (b.price_pending_quantity || !b.price) return null;
  return `$${Math.round(b.price).toLocaleString()}`;
}

/** One live booking as the Overview lists it. Null for a booking that's over
 *  as far as the plan goes (declined, cancelled, refunded). */
export function vendorRow(booking: BundleBooking, bundle: BundleDetail): VendorRow | null {
  if (isDeadBooking(booking)) return null;
  const base = { booking, bundleId: bundle.bundle_id };
  const cost = price(booking);
  const say = (rest: string) => [cost, rest].filter(Boolean).join(" · ");
  const stage = bookingStage(booking);

  if (stage === "completed") {
    return { ...base, status: "Done", tone: "green", detail: say("Event complete"), action: "View", target: "drawer", step: 7 };
  }
  if (stage === "deposit_due" || stage === "confirmed") {
    const next = nextPayment(booking);
    const rows = paymentRows(booking);
    const allIn = rows.length > 0 && rows.every((r) => r.state === "received");
    if (next?.state === "overdue" || next?.state === "due") {
      const owed = `${centsMoney(next.installment.amount_cents)} ${next.state === "overdue" ? "overdue" : "due today"}`;
      return { ...base, status: "Booked", tone: "maroon", detail: say(owed), action: "Pay now", target: "drawer", step: 5 };
    }
    const line = allIn
      ? "Paid in full"
      : next
        ? `${next.installment.label} ${describePayment(next, booking.vendor_name ?? "the vendor").toLowerCase()}`
        : rows.length > 0
          ? "Payment sent"
          : "Signed";
    return { ...base, status: "Booked", tone: "green", detail: say(line), action: "View", target: "drawer", step: allIn ? 6 : 5 };
  }
  if (stage === "awaiting_vendor") {
    return { ...base, status: "Signed", tone: "neutral", detail: say("waiting for the vendor to sign"), action: "View", target: "drawer", step: 5 };
  }
  if (stage === "new_version") {
    return { ...base, status: "Changes received", tone: "gold", detail: say("a new version to review"), action: "Review", target: "contract", step: 4 };
  }
  if (stage === "changes_proposed") {
    return { ...base, status: "Changes sent", tone: "neutral", detail: say("with the vendor"), action: "View", target: "contract", step: 4 };
  }
  if (stage === "contract_to_review") {
    return { ...base, status: "Contract ready", tone: "gold", detail: say("awaiting your signature"), action: "Review", target: "contract", step: 3 };
  }
  if (contractStep(booking) === "expired") {
    return { ...base, status: "Contract expired", tone: "maroon", detail: say("ask the vendor to resend it"), action: "View", target: "plan", step: 3 };
  }
  if (isDraftBundle(bundle)) {
    return { ...base, status: "Ready to send", tone: "gold", detail: say("not sent yet"), action: "Send request", target: "plan", step: 1 };
  }
  if (stage === "requested") {
    return { ...base, status: "Requested", tone: "neutral", detail: say("waiting on the vendor"), action: "View", target: "drawer", step: 2 };
  }
  // Agreed before contracts existed (the escrow-era path): the plan still
  // describes its payment state.
  return { ...base, status: "Booked", tone: "green", detail: say(""), action: "View", target: "plan", step: 5 };
}

export function vendorRows(c: Celebration): VendorRow[] {
  return c.bundles.flatMap((bundle) =>
    (bundle.bookings ?? []).map((b) => vendorRow(b, bundle)).filter((r): r is VendorRow => r !== null),
  );
}

export interface OverviewTotals {
  signed: number;
  /** Contracts waiting on the client's signature or review. */
  toSign: number;
  /** Cents the vendors have confirmed receiving. */
  paidCents: number;
  /** Cents on signed contracts not yet sent. */
  owedCents: number;
  overdue: number;
}

export function overviewTotals(rows: VendorRow[]): OverviewTotals {
  const t: OverviewTotals = { signed: 0, toSign: 0, paidCents: 0, owedCents: 0, overdue: 0 };
  for (const { booking } of rows) {
    if (booking.signed_at) t.signed += 1;
    else if (contractStep(booking) === "sign") t.toSign += 1;
    for (const r of paymentRows(booking)) {
      if (r.state === "received") t.paidCents += r.installment.amount_cents;
      else if (r.state !== "sent") {
        t.owedCents += r.installment.amount_cents;
        if (r.state === "overdue") t.overdue += 1;
      }
    }
  }
  return t;
}
