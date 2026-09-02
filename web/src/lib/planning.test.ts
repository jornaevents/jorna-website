import { describe, expect, it } from "vitest";
import { bookingGaps } from "./planning";
import type { BundleBooking } from "./types";

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
