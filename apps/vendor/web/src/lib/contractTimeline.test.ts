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
