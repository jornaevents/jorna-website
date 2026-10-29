"use client";

// Which set of tabs you get: vendors see a seller's app, everyone else is
// steered into becoming one (this is the vendor app — clients have
// jornaevents.com/client).
//
// "Has a vendor profile" (getMyVendor != null) is the same signal iOS uses
// (vendorID != nil). Cached because several components ask at once.

import { getMyVendor } from "./jorna";

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
 * page: a vendor's dashboard, or vendor onboarding for an account with no
 * vendor profile yet. It used to be the client home, from when this app
 * served both sides — which, on the vendor app, read as "signing in took me
 * to the client view".
 *
 * When the check itself fails, the dashboard: it does its own check and
 * offers setup when there's no profile, so a vendor on a bad connection
 * isn't sent through onboarding.
 */
export async function defaultLanding(): Promise<string> {
  const isVendor = await vendorStatus();
  return isVendor === false ? "/vendor-onboarding" : "/overview";
}

/** Called when a session ends, so the next sign-in doesn't inherit this role. */
export function clearRoleCache() {
  cache = null;
}
