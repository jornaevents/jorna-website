"use client";

// Which set of tabs you get: vendors see a seller's app, everyone else is
// steered into becoming one (this is the vendor app — clients have
// jornaevents.com/client).
//
// "Has a vendor profile" (getMyVendor != null) is the same signal iOS uses
// (vendorID != nil). Cached because several components ask at once.

import { getMyVendor, listBundles, listEvents } from "./jorna";
import { clientAppUrl } from "./clientApp";
import { ROLE_HINT_KEY } from "@jorna/shared/lib/sessionKeys";

const TTL_MS = 60_000;
let cache: { at: number; isVendor: boolean } | null = null;
let inflight: Promise<boolean | null> | null = null;

/** true/false, or null when the backend couldn't say (network, 5xx). One retry;
 *  a failure is never cached, so it can't pin a real vendor as "not a vendor". */
function vendorStatus(): Promise<boolean | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.isVendor);
  if (inflight) return inflight;
  inflight = getMyVendor()
    .catch(() => getMyVendor())
    .then(
      (v) => {
        cache = { at: Date.now(), isVendor: v != null };
        try {
          localStorage.setItem(ROLE_HINT_KEY, v != null ? "vendor" : "client");
        } catch {
          /* storage disabled — Welcome just takes the slower way round */
        }
        return v != null;
      },
      () => null,
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** For chrome decisions (which nav to draw): an unknown answer reads as "not a vendor". */
export async function loadIsVendor(): Promise<boolean> {
  return (await vendorStatus()) ?? false;
}

/**
 * Where someone lands after signing in when nothing asked for a particular
 * page. One sign-in serves both sides since the client app moved onto this
 * site (2026-10-29), so it goes by the account:
 *
 *  - a vendor: their dashboard;
 *  - no vendor profile, signing in from the vendor side (`role` "vendor" —
 *    For vendors, a vendor sign-up's "Sign in"): onboarding, to finish setup;
 *  - anyone else is a client: their dashboard once they've started planning
 *    (any plan or event), the Plan wizard before that — in the client app,
 *    so the answer is an absolute URL (see goTo).
 *
 * When the vendor check itself fails, the dashboard: it does its own check
 * and offers setup when there's no profile, so a vendor on a bad connection
 * isn't sent elsewhere.
 */
export async function defaultLanding(role?: string | null): Promise<string> {
  const isVendor = await vendorStatus();
  if (isVendor !== false) return "/overview";
  if (role === "vendor") return "/vendor-onboarding";
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

/** Called when a session ends, so the next sign-in doesn't inherit this role. */
export function clearRoleCache() {
  cache = null;
}
