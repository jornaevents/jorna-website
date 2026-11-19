import { describe, expect, it } from "vitest";
import { emptyDraft } from "@jorna/shared/lib/contractDraft";
import { hasSpecialRequests, specialRequestsClause } from "./specialRequests";

describe("special requests", () => {
  it("is the client's note, in their words", () => {
    expect(specialRequestsClause("  Bollywood and Punjabi, please.  ")).toEqual({ title: "Special requests", body: "Bollywood and Punjabi, please." });
  });

  it("isn't offered for an empty note", () => {
    expect(specialRequestsClause("   ")).toBeNull();
    expect(specialRequestsClause(null)).toBeNull();
  });

  it("knows when the contract already has it, whatever the case", () => {
    const draft = emptyDraft();
    expect(hasSpecialRequests(draft)).toBe(false);
    expect(hasSpecialRequests({ ...draft, clauses: [{ key: "k", title: "special requests", body: "x" }] })).toBe(true);
  });
});
