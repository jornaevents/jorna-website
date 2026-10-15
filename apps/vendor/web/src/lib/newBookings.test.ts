import { describe, expect, it } from "vitest";
import { isNewBooking } from "./newBookings";

describe("isNewBooking", () => {
  const signed = { signed_at: "2030-05-02T12:00:00Z", vendor_seen_at: null, status: "approved" as const };

  it("is a signed booking the vendor hasn't opened", () => {
    expect(isNewBooking(signed)).toBe(true);
    expect(isNewBooking({ ...signed, vendor_seen_at: "2030-05-02T13:00:00Z" })).toBe(false);
  });

  it("isn't an offer still waiting for a signature, or a voided booking", () => {
    expect(isNewBooking({ ...signed, signed_at: null })).toBe(false);
    expect(isNewBooking({ ...signed, status: "rejected" })).toBe(false);
  });

  it("isn't anything, from a backend that doesn't know the field", () => {
    expect(isNewBooking({ signed_at: signed.signed_at, status: "approved" })).toBe(false);
  });
});
