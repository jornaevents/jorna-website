// The client (planning) app is apps/client, served beside this one on the same
// site at /client since 2026-10-29 (it was book.jornaevents.com before). This
// app's planning/booking routes (/book, /plan, /bundle, /bundles) were deleted
// when it was forked, so a link a *client* follows to them goes there instead.
//
// Absolute, not "/client/…": next/link would put this app's /app basePath in
// front of a bare path. NEXT_PUBLIC_CLIENT_APP_URL overrides the origin for
// staging and previews, where the site isn't jornaevents.com — same
// env-with-fallback pattern as lib/flags.ts.
const CLIENT_APP_ORIGIN = process.env.NEXT_PUBLIC_CLIENT_APP_URL ?? "https://jornaevents.com";

/** An absolute URL to a page in the client app, e.g. clientAppUrl("/plan").
 *  Same origin as this app, so a session carries over. */
export function clientAppUrl(path: string): string {
  return `${CLIENT_APP_ORIGIN}/client${path.startsWith("/") ? path : `/${path}`}`;
}
