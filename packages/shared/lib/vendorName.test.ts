import { describe, expect, it } from "vitest";
import { vendorName } from "./vendorName";

describe("vendorName", () => {
  it("prefers the business name", () => {
    expect(vendorName({ business_name: "Saffron & Silk", f_name: "Priya", l_name: "Shah" })).toBe("Saffron & Silk");
  });
  it("falls back to the person's name, from either shape", () => {
    expect(vendorName({ business_name: "  ", f_name: "Priya", l_name: "Shah" })).toBe("Priya Shah");
    expect(vendorName({ first_name: "Priya", last_name: "Shah" })).toBe("Priya Shah");
    expect(vendorName({ f_name: "Priya", l_name: null })).toBe("Priya");
  });
  it("uses the fallback when there's nothing", () => {
    expect(vendorName(null, "this vendor")).toBe("this vendor");
    expect(vendorName({}, "Your business")).toBe("Your business");
  });
});
