import { describe, expect, it } from "vitest";
import { ATTENTION_KINDS, bookingGaps, moneyForBundle, planForBundle, requiredFields } from "./planning";
import type { BundleBooking, BundleDetail } from "./types";

function booking(overrides: Partial<BundleBooking> = {}): BundleBooking {
  return {
    booking_id: "b1",
    status: "pending",
    date_iso: "2026-06-01",
    location: "123 Main St, Springfield, IL 62704",
    time_start: "18:00",
    time_end: "22:00",
    price: 100,
    ...overrides,
  };
}

function gapFields(b: BundleBooking) {
  return bookingGaps(b).map((g) => g.field);
}

describe("bookingGaps — price-unit-driven quantity (unchanged default behavior)", () => {
  it("requires a guest count only when priced per person", () => {
    expect(gapFields(booking({ price_unit: "person" }))).toContain("guests");
    expect(gapFields(booking({ price_unit: "event" }))).not.toContain("guests");
  });

  it("requires a performer count only when priced per performer", () => {
    expect(gapFields(booking({ price_unit: "performer" }))).toContain("performers");
    expect(gapFields(booking({ price_unit: "event" }))).not.toContain("performers");
  });

  it("has no gap once the matching count is filled in", () => {
    expect(gapFields(booking({ price_unit: "person", guest_count: 80 }))).not.toContain("guests");
    expect(
      gapFields(booking({ price_unit: "performer", performer_count: 4 })),
    ).not.toContain("performers");
  });
});

describe("bookingGaps — opt-in required fields", () => {
  it("requires a guest count on a flat-priced service that opted in", () => {
    expect(
      gapFields(booking({ price_unit: "event", require_guest_count: true })),
    ).toContain("guests");
  });

  it("requires a performer count on a flat-priced service that opted in", () => {
    expect(
      gapFields(booking({ price_unit: "event", require_performer_count: true })),
    ).toContain("performers");
  });

  it("is satisfied once the opted-in count is filled in, same as a price-driven one", () => {
    expect(
      gapFields(
        booking({ price_unit: "event", require_guest_count: true, guest_count: 50 }),
      ),
    ).not.toContain("guests");
  });

  it("reports both gaps when a service opts into both, independent of price unit", () => {
    const gaps = gapFields(
      booking({
        price_unit: "event",
        require_guest_count: true,
        require_performer_count: true,
      }),
    );
    expect(gaps).toContain("guests");
    expect(gaps).toContain("performers");
  });

  it("never removes the price-unit-driven requirement — the flags are additive only", () => {
    // A per-person service still needs a guest count even if require_guest_count
    // is left unset/false; there is no way to opt back out of it.
    expect(
      gapFields(booking({ price_unit: "person", require_guest_count: false })),
    ).toContain("guests");
  });
});

describe("requiredFields — what a package's page tells a client before they start a request", () => {
  it("always includes date, location, and hours regardless of price unit", () => {
    for (const price_unit of ["event", "person", "hour", "day", "performer"]) {
      const fields = requiredFields({ price_unit });
      expect(fields).toContain("date");
      expect(fields).toContain("location");
      expect(fields).toContain("hours");
    }
  });

  it("adds guests only for per-person pricing or the opt-in flag", () => {
    expect(requiredFields({ price_unit: "person" })).toContain("guests");
    expect(requiredFields({ price_unit: "event" })).not.toContain("guests");
    expect(requiredFields({ price_unit: "event", require_guest_count: true })).toContain(
      "guests",
    );
  });

  it("adds performers only for per-performer pricing or the opt-in flag", () => {
    expect(requiredFields({ price_unit: "performer" })).toContain("performers");
    expect(requiredFields({ price_unit: "event" })).not.toContain("performers");
    expect(
      requiredFields({ price_unit: "event", require_performer_count: true }),
    ).toContain("performers");
  });

  it("matches bookingGaps' notion of what's required, for the same inputs", () => {
    // requiredFields answers "what's in play"; bookingGaps layers "is it
    // actually filled in" on top — but for a blank booking (nothing filled
    // in) every field requiredFields names should show up as a gap too.
    const shape = { price_unit: "event", require_guest_count: true, require_performer_count: true };
    const blank = booking({ ...shape, date_iso: "", location: "", time_start: "", time_end: "" });
    expect(gapFields(blank).sort()).toEqual(requiredFields(shape).sort());
  });
});

function bundle(bookings: BundleBooking[]): BundleDetail {
  return {
    bundle_id: "bun1",
    user_id: "u1",
    name: "Test Plan",
    status: "sent",
    bookings,
    booking_count: bookings.length,
    total_estimated_cost: 0,
  };
}

describe("moneyForBundle — where a plan's money actually is", () => {
  it("counts an approved, unpaid booking as outstanding (baseline, unchanged)", () => {
    const cash = moneyForBundle(bundle([booking({ status: "approved" })]));
    expect(cash.outstanding).toBe(100);
    expect(cash.released).toBe(0);
    expect(cash.committed).toBe(100);
  });

  it("treats a manual (Venmo/Zelle) booking both sides confirmed as released, not outstanding", () => {
    // This is the actual bug: once a client sends payment directly and the
    // vendor confirms receiving it, the plan kept reporting the full price
    // as still owed — confirmed_paid has no Stripe escrow leg to land in,
    // but it's exactly as settled as `released` is for an escrow booking.
    const cash = moneyForBundle(
      bundle([booking({ status: "approved", payment_status: "confirmed_paid" })]),
    );
    expect(cash.outstanding).toBe(0);
    expect(cash.released).toBe(100);
    expect(cash.committed).toBe(100);
  });

  it("counts neither outstanding nor released while a manual payment is sent but not yet confirmed", () => {
    // The client has already sent it — showing "still to pay" would be just
    // as wrong here as after confirmation, but the vendor hasn't confirmed
    // receipt yet either, so it isn't `released` quite yet.
    const cash = moneyForBundle(
      bundle([booking({ status: "approved", payment_status: "marked_paid" })]),
    );
    expect(cash.outstanding).toBe(0);
    expect(cash.released).toBe(0);
    expect(cash.committed).toBe(100);
  });

  it("counts neither outstanding nor inEscrow while a Stripe charge is still processing", () => {
    const cash = moneyForBundle(
      bundle([booking({ status: "approved", payment_status: "processing" })]),
    );
    expect(cash.outstanding).toBe(0);
    expect(cash.inEscrow).toBe(0);
    expect(cash.committed).toBe(100);
  });

  it("still counts paid and released Stripe bookings in their usual buckets", () => {
    const cash = moneyForBundle(
      bundle([
        booking({ booking_id: "b1", status: "approved", payment_status: "paid" }),
        booking({ booking_id: "b2", status: "approved", payment_status: "released" }),
      ]),
    );
    expect(cash.inEscrow).toBe(100);
    expect(cash.released).toBe(100);
    expect(cash.outstanding).toBe(0);
  });
});

function isoDaysFromNow(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe("bookingGaps — a date that's set but already gone", () => {
  it("flags a past date as a gap, distinct from an unset one", () => {
    const gaps = bookingGaps(booking({ date_iso: isoDaysFromNow(-1) }));
    expect(gaps.map((g) => g.field)).toContain("date");
    expect(gaps.find((g) => g.field === "date")?.label).toBe(
      "a date that hasn't already passed",
    );
  });

  it("does not flag today or a future date", () => {
    expect(gapFields(booking({ date_iso: isoDaysFromNow(0) }))).not.toContain("date");
    expect(gapFields(booking({ date_iso: isoDaysFromNow(30) }))).not.toContain("date");
  });
});

describe("planForBundle — negotiation task", () => {
  it("surfaces a task when it's the client's turn to answer an open offer", () => {
    const plan = planForBundle(
      bundle([
        booking({
          status: "negotiation_ongoing",
          negotiation_awaiting_role: "client",
        }),
      ]),
    );
    expect(plan.tasks.map((t) => t.kind)).toContain("negotiation");
    expect(ATTENTION_KINDS).toContain("negotiation");
  });

  it("does not surface a task for the client's own unanswered offer", () => {
    // negotiation_awaiting_role: "vendor" means the client already moved and
    // is waiting — the same non-actionable shape the removed "vendor-reply"
    // kind used to show, which is exactly what this field exists to avoid.
    const plan = planForBundle(
      bundle([
        booking({
          status: "negotiation_ongoing",
          negotiation_awaiting_role: "vendor",
        }),
      ]),
    );
    expect(plan.tasks.map((t) => t.kind)).not.toContain("negotiation");
  });

  it("does not surface a task once the negotiation has settled", () => {
    const plan = planForBundle(
      bundle([booking({ status: "approved", negotiation_awaiting_role: null })]),
    );
    expect(plan.tasks.map((t) => t.kind)).not.toContain("negotiation");
  });
});
