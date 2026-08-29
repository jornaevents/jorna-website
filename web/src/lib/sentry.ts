// Client-side error monitoring. No-op unless NEXT_PUBLIC_SENTRY_DSN is set,
// so local dev and any deploy that hasn't configured a DSN run exactly as
// before — mirrors the backend's Sentry pattern (Desiconnect/server/app/observability.py).
import * as Sentry from "@sentry/browser";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // No request/session data beyond what Sentry captures by default from the
    // browser (URL, user agent) — no cookies, no form contents.
    sendDefaultPii: false,
  });
}
