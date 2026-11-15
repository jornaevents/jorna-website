import { describe, expect, it } from "vitest";
import { overviewTotals, vendorRow } from "./eventOverview";
import type { BundleBooking, BundleDetail } from "./types";

const sent = { bundle_id: "b1", status: "sent", bookings: [] } as unknown as BundleDetail;
const draft = { bundle_id: "b1", status: "draft", bookings: [] } as unknown as BundleDetail;

function booking(over: Partial<BundleBooking> = {}): BundleBooking {
  return { booking_id: "bk", status: "pending", price: 2500, amount_cents: 250000, vendor_name: "Lens & Light", date_iso: "2099-06-01", ...over } as BundleBooking;
}
const installment = (over: Record<string, unknown>) => ({ id: "i1", label: "Deposit", amount_cents: 100000, due_type: "on_signing", ...over });
const signed = (schedule: unknown[]) =>
  booking({ status: "approved", contract_token: "t", contract_status: "signed", signed_at: "2026-01-01T00:00:00Z", payment_schedule: schedule } as Partial<BundleBooking>);

describe("vendorRow", () => {
  it("a booking on an unsent plan is Ready to send, sent from the plan", () => {
    expect(vendorRow(booking(), draft)).toMatchObject({ status: "Ready to send", action: "Send request", target: "plan", step: 1 });
  });

  it("a sent request waits on the vendor", () => {
    expect(vendorRow(booking(), sent)).toMatchObject({ status: "Requested", action: "View", step: 2 });
  });

  it("a contract to sign is Contract ready, reviewed on the contract", () => {
    const b = booking({ status: "approved", contract_token: "t", contract_status: "sent" } as Partial<BundleBooking>);
    expect(vendorRow(b, sent)).toMatchObject({ status: "Contract ready", tone: "gold", action: "Review", target: "contract" });
  });

  it("the vendor's answer to proposed changes is Changes received", () => {
    const b = booking({ status: "approved", contract_token: "t", contract_status: "viewed", proposal_status: "revised" } as Partial<BundleBooking>);
    expect(vendorRow(b, sent)).toMatchObject({ status: "Changes received", action: "Review", target: "contract", step: 4 });
  });

  it("an overdue payment on a signed contract is Pay now", () => {
    const b = signed([installment({ effective_due: "2020-01-01" })]);
    const row = vendorRow(b, sent)!;
    expect(row).toMatchObject({ status: "Booked", tone: "maroon", action: "Pay now", target: "drawer" });
    expect(row.detail).toBe("$2,500 · $1,000 overdue");
  });

  it("everything confirmed received is Booked, paid in full", () => {
    const b = signed([installment({ confirmed_at: "2026-01-02T00:00:00Z", marked_paid_at: "2026-01-02T00:00:00Z" })]);
    expect(vendorRow(b, sent)).toMatchObject({ status: "Booked", tone: "green", detail: "$2,500 · Paid in full", step: 6 });
  });

  it("a declined or cancelled booking isn't listed", () => {
    expect(vendorRow(booking({ status: "rejected" }), sent)).toBeNull();
    expect(vendorRow(booking({ status: "cancelled" }), sent)).toBeNull();
  });
});

describe("overviewTotals", () => {
  it("counts contracts and adds up what's paid, owed and overdue", () => {
    const rows = [
      vendorRow(signed([installment({ confirmed_at: "x", marked_paid_at: "x" }), installment({ id: "i2", amount_cents: 150000, effective_due: "2020-01-01" })]), sent)!,
      vendorRow(booking({ booking_id: "b2", status: "approved", contract_token: "t2", contract_status: "sent" } as Partial<BundleBooking>), sent)!,
    ];
    expect(overviewTotals(rows)).toEqual({ signed: 1, toSign: 1, paidCents: 100000, owedCents: 150000, overdue: 1 });
  });
});
