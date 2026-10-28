import { describe, expect, it } from "vitest";
import { offerTarget } from "./offerTarget";

describe("offerTarget", () => {
  const bookingThread = { booking_id: "b1", bundle_id: "plan1" };
  const questionThread = { booking_id: null, bundle_id: null };

  it("an offer from before offers carried their booking uses the thread's", () => {
    expect(offerTarget({}, bookingThread)).toEqual({ bookingId: "b1", bundleId: "plan1" });
    expect(offerTarget(null, bookingThread)).toEqual({ bookingId: "b1", bundleId: "plan1" });
    expect(offerTarget(undefined, bookingThread)).toEqual({ bookingId: "b1", bundleId: "plan1" });
  });

  it("an offer in a question thread uses the booking it carries", () => {
    expect(offerTarget({ booking_id: "b2", bundle_id: "plan2" }, questionThread)).toEqual({
      bookingId: "b2",
      bundleId: "plan2",
    });
  });

  it("the offer's own booking wins over the thread's", () => {
    expect(offerTarget({ booking_id: "b2", bundle_id: "plan2" }, bookingThread)).toEqual({
      bookingId: "b2",
      bundleId: "plan2",
    });
  });

  it("never pairs an offer's booking with another booking's plan", () => {
    expect(offerTarget({ booking_id: "b2" }, bookingThread)).toEqual({ bookingId: "b2", bundleId: null });
  });

  it("borrows the thread's plan when it's the same booking", () => {
    expect(offerTarget({ booking_id: "b1" }, bookingThread)).toEqual({ bookingId: "b1", bundleId: "plan1" });
  });

  it("a booking with no plan has no plan", () => {
    expect(offerTarget({ booking_id: "b2", bundle_id: null }, questionThread)).toEqual({ bookingId: "b2", bundleId: null });
  });

  it("ignores ids that aren't strings or are empty", () => {
    expect(offerTarget({ booking_id: "", bundle_id: "plan2" }, bookingThread)).toEqual({ bookingId: "b1", bundleId: "plan1" });
    expect(offerTarget({ booking_id: 42 }, bookingThread)).toEqual({ bookingId: "b1", bundleId: "plan1" });
    expect(offerTarget({ booking_id: "b2", bundle_id: 7 }, questionThread)).toEqual({ bookingId: "b2", bundleId: null });
  });

  it("with no thread and no booking, there is nothing to point at", () => {
    expect(offerTarget({}, null)).toEqual({ bookingId: null, bundleId: null });
    expect(offerTarget({}, questionThread)).toEqual({ bookingId: null, bundleId: null });
  });
});
