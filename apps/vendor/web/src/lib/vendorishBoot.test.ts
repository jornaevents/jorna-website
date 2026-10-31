import { describe, expect, it } from "vitest";
import { VENDORISH_BOOT_SCRIPT } from "./vendorishBoot";

function boot(store: Record<string, string>) {
  const dataset: Record<string, string> = {};
  new Function("localStorage", "document", VENDORISH_BOOT_SCRIPT)(
    { getItem: (k: string) => store[k] ?? null },
    { documentElement: { dataset } },
  );
  return "vendorish" in dataset;
}

describe("vendorishBoot", () => {
  it("marks the page when this device last signed in a vendor", () => {
    expect(boot({ jorna_last_role: "vendor" })).toBe(true);
  });

  it("marks it during a Google sign-in from the vendor side", () => {
    expect(boot({ jorna_oauth_role: "vendor" })).toBe(true);
  });

  it("leaves it alone for a client or a first visit", () => {
    expect(boot({ jorna_last_role: "client" })).toBe(false);
    expect(boot({})).toBe(false);
  });
});
