import { describe, expect, it } from "vitest";
import { signerMatches } from "./signerName";

describe("signerMatches", () => {
  it.each([
    ["Asha Mehta", true],
    ["  asha   MEHTA ", true],
    ["Asha R. Mehta", true],
    ["Asha Rani Mehta", true],
    ["Bob Smith", false],
    ["Asha", false],
    ["Mehta Asha", false],
  ])("%s against Asha Mehta → %s", (typed, matches) => {
    expect(signerMatches(typed, "Asha Mehta")).toBe(matches);
  });

  it("has nothing to warn about without both names", () => {
    expect(signerMatches("Bob Smith", null)).toBe(true);
    expect(signerMatches("", "Asha Mehta")).toBe(true);
  });
});
