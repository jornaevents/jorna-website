import { describe, expect, it } from "vitest";
import { describeEvent } from "./contractTimeline";

const at = "2030-05-02T12:00:00Z";
const details = (detail: Record<string, unknown>) =>
  describeEvent({ at, kind: "details_updated", actor: "client", detail }, {});

describe("describeEvent: the client's details", () => {
  it("names a new email, so the vendor knows where their client now is", () => {
    expect(details({ fields: ["email"], email_to: "asha.m@example.com" })).toBe(
      "Your client changed their email to asha.m@example.com",
    );
    expect(details({ fields: ["email", "phone"], email_to: "asha.m@example.com" })).toBe(
      "Your client changed their email to asha.m@example.com, and their phone",
    );
  });

  it("still reads without the new email, as an older backend sends it", () => {
    expect(details({ fields: ["email", "phone"] })).toBe("Your client changed their email and phone on the contract");
  });
});

describe("describeEvent: payments from Earnings", () => {
  const ev = (kind: string, detail: Record<string, unknown>) =>
    describeEvent({ at, kind, actor: "vendor", detail }, {});

  it("says how the client paid, and each step the vendor took back", () => {
    expect(ev("payment_marked", { label: "Deposit", amount_cents: 50000, paid_via: "zelle" })).toBe(
      "Your client says Deposit ($500.00) is sent by Zelle",
    );
    expect(ev("payment_not_received", { label: "Deposit", amount_cents: 50000, step: "unmarked" })).toBe(
      "You told your client Deposit ($500.00) hasn't arrived",
    );
    expect(ev("payment_not_received", { label: "Deposit", amount_cents: 50000, step: "unconfirmed" })).toBe(
      "You took back confirming Deposit ($500.00)",
    );
    expect(ev("payment_reminder", { label: "Balance", amount_cents: 50000, reminder: "manual" })).toBe(
      "You reminded your client Balance ($500.00) is overdue",
    );
  });
});


describe("negotiation and cancel rows (2026-10-26)", () => {
  const ev = (kind: string, actor: string, detail: Record<string, unknown>) =>
    ({ at: "2030-01-01T00:00:00Z", kind, actor, detail }) as unknown as Parameters<typeof describeEvent>[0];

  it("names what each answer was", () => {
    const row = describeEvent(
      ev("negotiation_sent", "vendor", {
        keys: ["event.guests", "policy.cancellation"],
        settled: ["event.guests"],
        answers: [
          { key: "event.guests", label: "Guest count", action: "accept", value: 180 },
          { key: "policy.cancellation", label: "Cancellation window", action: "keep", value: 720 },
        ],
      }),
      {},
    );
    expect(row).toBe("You accepted Guest count: 180, held Cancellation window at 30 days");
  });

  it("says the vendor cancelled, with their reason", () => {
    expect(describeEvent(ev("cancelled", "vendor", { reason: "Family emergency" }), {})).toBe("You cancelled the booking — “Family emergency”");
  });
});
