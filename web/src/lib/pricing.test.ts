import { describe, expect, it } from "vitest";
import { crossesMidnight, estimateTotal, hoursBetween, quantityPhrase } from "./pricing";

describe("estimateTotal", () => {
  it("returns null (not zero) when the multiplying quantity is unknown", () => {
    // null means "can't be worked out yet" — rendering it as $0 would be a lie.
    expect(estimateTotal({ price: 40, price_unit: "per person" }, {})).toBeNull();
    expect(estimateTotal({ price: 40, price_unit: "per person" }, { guests: 0 })).toBeNull();
  });

  it("multiplies rate by the matching quantity for each unit kind", () => {
    expect(estimateTotal({ price: 40, price_unit: "per person" }, { guests: 150 })).toBe(6000);
    expect(estimateTotal({ price: 1000, price_unit: "per day" }, { days: 2 })).toBe(2000);
    expect(estimateTotal({ price: 200, price_unit: "per hour" }, { hours: 5 })).toBe(1000);
  });

  it("rejects an hours quantity over 24, matching the backend's booking-window limit", () => {
    expect(estimateTotal({ price: 200, price_unit: "per hour" }, { hours: 25 })).toBeNull();
  });

  it("returns the rate unchanged for flat/event pricing regardless of quantity", () => {
    expect(estimateTotal({ price: 500, price_unit: "event" }, { guests: 300 })).toBe(500);
  });

  it("treats a non-positive rate as unpriced, except a $0 flat rate", () => {
    expect(estimateTotal({ price: 0, price_unit: "per person" }, { guests: 10 })).toBeNull();
    expect(estimateTotal({ price: 0, price_unit: "event" }, {})).toBe(0);
  });
});

describe("hoursBetween / crossesMidnight", () => {
  it("computes a same-day window normally", () => {
    expect(hoursBetween("18:00", "23:00")).toBe(5);
    expect(crossesMidnight("18:00", "23:00")).toBe(false);
  });

  it("treats an end time at or before the start as the next day, not a negative window", () => {
    // 8 PM to 1 AM is five hours, not minus nineteen.
    expect(hoursBetween("20:00", "01:00")).toBe(5);
    expect(crossesMidnight("20:00", "01:00")).toBe(true);
  });

  it("reads an identical start/end time as a full 24-hour day, not a zero-length window", () => {
    expect(hoursBetween("09:00", "09:00")).toBe(24);
  });
});

describe("quantityPhrase", () => {
  it("pluralizes based on the actual count", () => {
    expect(quantityPhrase("person", { guests: 1 })).toBe("1 guest");
    expect(quantityPhrase("person", { guests: 2 })).toBe("2 guests");
    expect(quantityPhrase("hour", { hours: 1 })).toBe("1 hour");
  });

  it("has no phrase for flat/event pricing", () => {
    expect(quantityPhrase("event", {})).toBeNull();
  });
});
