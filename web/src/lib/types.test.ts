import { describe, expect, it } from "vitest";
import { priceLine, priceQuantity, priceUnitKind, priceUnitLabel, type PricedBooking } from "./types";

describe("priceUnitKind", () => {
  it("treats an empty/missing unit as flat pricing", () => {
    expect(priceUnitKind(undefined)).toBe("event");
    expect(priceUnitKind(null)).toBe("event");
    expect(priceUnitKind("")).toBe("event");
  });

  it("recognizes the canonical units, case-insensitively and with a 'per ' prefix", () => {
    expect(priceUnitKind("Hour")).toBe("hour");
    expect(priceUnitKind("per hour")).toBe("hour");
    expect(priceUnitKind("Days")).toBe("day");
    expect(priceUnitKind("per event")).toBe("event");
  });

  it("maps free-text vendor synonyms for per-person pricing", () => {
    // Regression: a caterer priced "per head" used to be read as flat-rate,
    // which let a booking skip the guest-count gate entirely.
    expect(priceUnitKind("per head")).toBe("person");
    expect(priceUnitKind("plate")).toBe("person");
    expect(priceUnitKind("guest")).toBe("person");
    expect(priceUnitKind("pax")).toBe("person");
    expect(priceUnitKind("person")).toBe("person");
  });

  it("falls back to flat pricing for unrecognized free text", () => {
    expect(priceUnitKind("per square foot")).toBe("event");
  });
});

describe("priceUnitLabel", () => {
  it("has no label for flat or missing units", () => {
    expect(priceUnitLabel(undefined)).toBe("");
    expect(priceUnitLabel("event")).toBe("");
    expect(priceUnitLabel("flat")).toBe("");
  });

  it("normalizes to a 'per X' phrase regardless of input casing/prefix", () => {
    expect(priceUnitLabel("Hour")).toBe("per hour");
    expect(priceUnitLabel("per Person")).toBe("per person");
  });
});

describe("priceLine", () => {
  const base: PricedBooking = { price: 100, price_unit: "per person" };

  it("shows a flat-rate booking's price as an already-resolved total", () => {
    const line = priceLine({ price: 500, price_unit: "event" });
    expect(line).toEqual({ amount: 500, caption: "", isTotal: true });
  });

  it("shows the rate, not a fabricated total, while the quantity is unknown", () => {
    // guest_count is absent, so the total can't be resolved yet.
    const line = priceLine(base);
    expect(line.isTotal).toBe(false);
    expect(line.amount).toBe(100);
    expect(line.caption).toBe("per person");
  });

  it("shows the resolved total with a quantity caption once the guest count is known", () => {
    const line = priceLine({ ...base, price: 7600, guest_count: 200 });
    expect(line.isTotal).toBe(true);
    expect(line.amount).toBe(7600);
    expect(line.caption).toContain("200 guests");
  });

  it("respects an explicit price_pending_quantity flag over a derivable quantity", () => {
    // Even though guest_count is present, the backend says this total isn't
    // resolved yet — the UI must not show it as one.
    const line = priceLine({ ...base, guest_count: 200, price_pending_quantity: true });
    expect(line.isTotal).toBe(false);
  });
});

describe("priceQuantity", () => {
  it("counts nights inclusively for a day-rate booking", () => {
    const q = priceQuantity({
      price: 300,
      price_unit: "per day",
      date_iso: "2026-06-01",
      date_end: "2026-06-03",
    });
    expect(q).toEqual({ count: 3, noun: "days" });
  });

  it("counts an overnight hour window as crossing midnight, not going negative", () => {
    const q = priceQuantity({
      price: 50,
      price_unit: "per hour",
      time_start: "22:00",
      time_end: "02:00",
    });
    expect(q).toEqual({ count: 4, noun: "hours" });
  });
});
