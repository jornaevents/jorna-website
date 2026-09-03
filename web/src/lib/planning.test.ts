import { describe, expect, it } from "vitest";
import { bookingGaps, requiredFields } from "./planning";
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
