import { describe, expect, it } from "vitest";
import { locationProblem, parseAddress } from "./address";

describe("parseAddress", () => {
  it("keeps a venue name with its street (web #164)", () => {
    expect(parseAddress("Royal Albert's Palace, 1050 King Georges Post Rd, Fords, NJ 08863")).toEqual({
      line1: "Royal Albert's Palace, 1050 King Georges Post Rd",
      line2: "",
      city: "Fords",
      state: "NJ",
      zip: "08863",
    });
  });

  it("puts only a unit on line 2", () => {
    expect(parseAddress("12 Maple Ave, Suite 4, Chicago, IL 60601")).toMatchObject({
      line1: "12 Maple Ave", line2: "Suite 4", city: "Chicago",
    });
    expect(parseAddress("12 Maple Ave, #5, Chicago, IL 60601")).toMatchObject({ line1: "12 Maple Ave", line2: "#5" });
    expect(parseAddress("Pines Manor, 2085 Lincoln Hwy, Floor 2, Edison, NJ")).toMatchObject({
      line1: "Pines Manor, 2085 Lincoln Hwy", line2: "Floor 2", city: "Edison", state: "NJ",
    });
  });

  it("still reads a plain street and a lone city as before", () => {
    expect(parseAddress("12 Maple Ave, Chicago, IL 60601")).toMatchObject({ line1: "12 Maple Ave", line2: "", city: "Chicago" });
    expect(parseAddress("Chicago")).toMatchObject({ line1: "", city: "Chicago" });
    expect(parseAddress("12 Maple Ave")).toMatchObject({ line1: "12 Maple Ave", city: "" });
  });
});

describe("locationProblem", () => {
  it("allows blank and TBD, refuses a city alone, takes a full address", () => {
    expect(locationProblem("")).toBeNull();
    expect(locationProblem("TBD")).toBeNull();
    expect(locationProblem("Chicago, IL")).toMatch(/street, city, state and ZIP/);
    expect(locationProblem("12 Maple Ave, Suite 4, Evanston, IL 60201")).toBeNull();
  });
});
