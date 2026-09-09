import { describe, expect, it } from "vitest";
import { vendorTasks } from "./vendorPlan";
import type { VendorBooking } from "./types";

function booking(overrides: Partial<VendorBooking> = {}): VendorBooking {
  return {
    booking_id: "b1",
    user_id: "u1",
    status: "approved",
    date_iso: "2026-06-01",
    price: 100,
    ...overrides,
  };
}

describe("vendorTasks — negotiation", () => {
  it("surfaces a task when it's the vendor's turn to answer an open offer", () => {
    const tasks = vendorTasks(
      [
        booking({
          status: "negotiation_ongoing",
          negotiation_awaiting_role: "vendor",
        }),
      ],
      null,
    );
    expect(tasks.map((t) => t.kind)).toContain("negotiation");
  });

  it("does not surface a task for the vendor's own unanswered counter", () => {
    // Regression: this used to fire for ANY negotiation_ongoing booking,
    // including the vendor's own counter still sitting with the client —
    // "{client} made an offer, Review offer" shown for an offer the vendor
    // themselves just made. negotiation_awaiting_role fixes that.
    const tasks = vendorTasks(
      [
        booking({
          status: "negotiation_ongoing",
          negotiation_awaiting_role: "client",
        }),
      ],
      null,
    );
    expect(tasks.map((t) => t.kind)).not.toContain("negotiation");
  });

  it("does not surface a task once the negotiation has settled", () => {
    const tasks = vendorTasks(
      [booking({ status: "approved", negotiation_awaiting_role: null })],
      null,
    );
    expect(tasks.map((t) => t.kind)).not.toContain("negotiation");
  });
});
