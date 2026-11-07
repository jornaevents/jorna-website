import { describe, expect, it } from "vitest";
import { looksLikeEmail, startingStep } from "./linkSteps";

describe("startingStep", () => {
  const filled = { guest_email: "asha@example.com", guest_name: "Asha Mehta" };

  it("starts a first visit at the email step, even when the vendor filled it in", () => {
    expect(startingStep(filled, false)).toBe("email");
  });

  it("goes straight to the contract once this browser has done the details", () => {
    expect(startingStep(filled, true)).toBe("review");
  });

  it("goes back to whatever the vendor has since cleared", () => {
    expect(startingStep({ ...filled, guest_email: null }, true)).toBe("email");
    expect(startingStep({ ...filled, guest_name: "  " }, true)).toBe("details");
  });
});

describe("looksLikeEmail", () => {
  it("takes an ordinary address, trimmed", () => {
    expect(looksLikeEmail(" asha@example.com ")).toBe(true);
  });

  it("catches the usual typos", () => {
    expect(looksLikeEmail("asha@example")).toBe(false);
    expect(looksLikeEmail("asha example.com")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});
