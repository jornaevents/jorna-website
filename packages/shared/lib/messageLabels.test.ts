import { describe, expect, it } from "vitest";
import { LABEL_TEXT, LABEL_TONE, knownLabel, type MessageLabel } from "./messageLabels";

const STAGES: MessageLabel[] = ["inquiry", "negotiation", "booked", "closed"];

describe("message labels", () => {
  it("names every stage in the vendor's Leads and Bookings words", () => {
    expect(STAGES.map((s) => LABEL_TEXT[s])).toEqual(["Inquiry", "Negotiation", "Booked", "Closed"]);
  });

  it("colours them as the vendor's Messages does", () => {
    expect(LABEL_TONE).toEqual({ inquiry: "amber", negotiation: "maroon", booked: "green", closed: "grey" });
  });
});

describe("knownLabel", () => {
  const label = (stage: string) => ({ stage: stage as MessageLabel, booking_id: "b1", service_name: "Gold" });

  it.each(STAGES)("keeps %s", (stage) => {
    expect(knownLabel(label(stage))).toEqual(label(stage));
  });

  it("drops a stage this app doesn't know, rather than show a blank pill", () => {
    expect(knownLabel(label("deposit_due"))).toBeNull();
    // Not one inherited from Object.prototype either.
    expect(knownLabel(label("toString"))).toBeNull();
  });

  it("is null when there's no label", () => {
    expect(knownLabel(null)).toBeNull();
    expect(knownLabel(undefined)).toBeNull();
  });
});
