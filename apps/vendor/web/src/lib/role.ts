"use client";

// Where a signed-in account belongs. What it is comes with the account (GET
// /me's is_vendor and signup_side — accountSide, useAccountSide), so nothing
// here asks the backend "is this a vendor" any more: that second request,
// answered after the page had drawn, is what showed vendors the client app
// and clients the vendor one around signing in.

import type { User } from "@jorna/shared/lib/auth";
import { accountSide } from "@jorna/shared/lib/accountSide";
import { listBundles, listEvents } from "./jorna";
import { clientAppUrl } from "./clientApp";

/**
 * Where someone lands after signing in when nothing asked for a particular
 * page. One sign-in serves both sides (2026-10-29), so it goes by the account:
 *
 *  - a vendor: their dashboard;
 *  - a vendor in setup (signed up as a vendor, no profile yet): onboarding,
 *    whichever sign-in link they used;
 *  - an account from before sign-ups recorded their side, signing in from the
 *    vendor side (`role` "vendor" — For vendors, a vendor sign-up's "Sign in"):
 *    onboarding too, since there's nothing else to tell it by;
 *  - anyone else is a client: their dashboard once they've started planning
 *    (any plan or event), the Plan wizard before that — in the client app,
 *    so the answer is an absolute URL (see goTo).
 */
export async function defaultLanding(user: User, role?: string | null): Promise<string> {
  // Unknown only when an older backend's vendor check failed (shared auth's
  // loadMe): the dashboard, which does its own check and offers setup when
  // there's no profile, so a vendor on a bad connection isn't sent elsewhere.
  if (user.is_vendor === undefined) return "/overview";
  const side = accountSide(user);
  if (side === "vendor") return "/overview";
  if (side === "vendor-setup") return "/vendor-onboarding";
  if (role === "vendor" && user.signup_side == null) return "/vendor-onboarding";
  return clientLanding();
}

/** A client's home: their dashboard once they've started planning, else the
 *  Plan wizard. If the lookup fails, the wizard — one tab from the dashboard. */
export async function clientLanding(): Promise<string> {
  try {
    const [bundles, events] = await Promise.all([listBundles(), listEvents()]);
    return clientAppUrl(bundles.length > 0 || events.length > 0 ? "/bundles" : "/plan");
  } catch {
    return clientAppUrl("/plan");
  }
}

/**
 * Go to a landing: a page in this app by the router, anywhere else — the
 * client app's /client pages, an absolute URL — by a full page load, since
 * this app's router would put its own /app base path in front of them.
 */
export function goTo(router: { push: (href: string) => void; replace: (href: string) => void }, dest: string, replace = false) {
  if (dest.startsWith("http") || dest.startsWith("/client/")) {
    if (replace) window.location.replace(dest);
    else window.location.assign(dest);
  } else if (replace) {
    router.replace(dest);
  } else {
    router.push(dest);
  }
}
