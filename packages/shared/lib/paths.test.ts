import { describe, expect, it } from "vitest";
import { withTrailingSlash } from "./paths";

describe("withTrailingSlash", () => {
  it("adds the slash before a query or hash, and only once", () => {
    expect(withTrailingSlash("/plan")).toBe("/plan/");
    expect(withTrailingSlash("/login?mode=register")).toBe("/login/?mode=register");
    expect(withTrailingSlash("/bundle?id=b1#booking-x")).toBe("/bundle/?id=b1#booking-x");
    expect(withTrailingSlash("/inquire/?vendor=v1")).toBe("/inquire/?vendor=v1");
    expect(withTrailingSlash("/")).toBe("/");
    expect(withTrailingSlash("/a#b")).toBe("/a/#b");
  });
});
