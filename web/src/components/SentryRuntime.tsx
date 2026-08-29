"use client";

// Mounted app-wide (in the root layout). initSentry() runs at module
// evaluation time, not on mount, so it fires as early as possible —
// including for errors thrown while the rest of the app is still mounting.
// No-op unless NEXT_PUBLIC_SENTRY_DSN is set (see docs/ARCHITECTURE.md).

import { initSentry } from "@/lib/sentry";

initSentry();

export function SentryRuntime() {
  return null;
}
