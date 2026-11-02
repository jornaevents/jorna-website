// Where vendors work: jornaevents.com, a separate app (the jorna-vendor
// repo). This site only ever links there — for a vendor account that signs
// in here, and for anyone who wants to sell rather than book.
//
// NEXT_PUBLIC_VENDOR_APP_URL overrides the default, the same variable
// lib/contract reads for the signing page.

import { withTrailingSlash } from "@jorna/shared/lib/paths";

const VENDOR_APP_ORIGIN = process.env.NEXT_PUBLIC_VENDOR_APP_URL ?? "https://jornaevents.com";

/**
 * The site's one sign-in page (in the vendor app), coming back to `next` — a
 * path in this app, like "/bundle?id=b1" — afterwards. Linked to directly,
 * not through this app's /login, which only hands off there: a stop on the
 * way that showed "Taking you to sign in…". Same format as that hand-off.
 */
export function signInUrl(next?: string | null): string {
  if (!next) return vendorSiteUrl("/login");
  const q = new URLSearchParams({ next: `/client${withTrailingSlash(next)}` });
  return vendorSiteUrl(`/login?${q.toString()}`);
}

/** An app path on the vendor site, e.g. "/overview". */
export function vendorSiteUrl(path: string): string {
  return `${VENDOR_APP_ORIGIN}/app${withTrailingSlash(path.startsWith("/") ? path : `/${path}`)}`;
}
