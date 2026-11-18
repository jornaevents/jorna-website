import { describe, expect, it } from "vitest";
import { accountSide } from "./accountSide";

describe("accountSide", () => {
  it("is a vendor whenever there's a vendor profile, whichever sign-up made the account", () => {
    expect(accountSide({ is_vendor: true, signup_side: "vendor" })).toBe("vendor");
    expect(accountSide({ is_vendor: true, signup_side: "client" })).toBe("vendor");
    expect(accountSide({ is_vendor: true, signup_side: null })).toBe("vendor");
  });

  it("is a vendor in setup when the vendor sign-up made it but there's no profile yet", () => {
    expect(accountSide({ is_vendor: false, signup_side: "vendor" })).toBe("vendor-setup");
  });

  it("is a client otherwise, including older accounts with no recorded side", () => {
    expect(accountSide({ is_vendor: false, signup_side: "client" })).toBe("client");
    expect(accountSide({ is_vendor: false, signup_side: null })).toBe("client");
    expect(accountSide({})).toBe("client");
  });
});
