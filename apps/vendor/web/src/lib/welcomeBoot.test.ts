import { describe, expect, it } from "vitest";
import { WELCOME_BOOT_SCRIPT } from "./welcomeBoot";

/** Runs the script against a fake page; returns where it sent the visitor and
 *  whether it hid the page. */
function boot(pathname: string, store: Record<string, string>) {
  let sentTo: string | null = null;
  const dataset: Record<string, string> = {};
  const env = {
    location: { pathname, replace: (url: string) => (sentTo = url) },
    localStorage: { getItem: (k: string) => store[k] ?? null },
    document: { documentElement: { dataset } },
  };
  new Function("location", "localStorage", "document", WELCOME_BOOT_SCRIPT)(env.location, env.localStorage, env.document);
  return { sentTo, hidden: "leaving" in dataset };
}

const vendor = { jorna_access: "t", jorna_role_hint: "vendor" };

describe("welcomeBoot", () => {
  it("sends a signed-in vendor on Welcome straight to the dashboard", () => {
    for (const path of ["/", "/app", "/app/", "/app/home/"]) {
      expect(boot(path, vendor)).toEqual({ sentTo: "/app/overview/", hidden: false });
    }
  });

  it("hides Welcome for anyone else signed in, until the app decides", () => {
    expect(boot("/", { jorna_access: "t" })).toEqual({ sentTo: null, hidden: true });
    expect(boot("/", { jorna_access: "t", jorna_role_hint: "client" })).toEqual({ sentTo: null, hidden: true });
  });

  it("leaves signed-out visitors and every other page alone", () => {
    expect(boot("/", { jorna_role_hint: "vendor" })).toEqual({ sentTo: null, hidden: false });
    expect(boot("/app/for-vendors/", vendor)).toEqual({ sentTo: null, hidden: false });
    expect(boot("/app/overview/", vendor)).toEqual({ sentTo: null, hidden: false });
  });
});
