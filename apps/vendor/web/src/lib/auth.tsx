"use client";

// Auth lives in @jorna/shared/lib/auth, shared with the client app. This
// wrapper adds what's this app's own: the caches to clear with the session,
// and that signing out lands on /login with a full page load.

import { AuthProvider as SharedAuthProvider } from "@jorna/shared/lib/auth";
import { clearAttentionCache } from "./attention";
import { clearDataCache } from "./dataCache";
import { clearRoleCache } from "./role";

export { hasStoredSession, useAuth } from "@jorna/shared/lib/auth";

// Module-level so it's one stable function: the provider's clear() depends on it.
function clearCaches() {
  clearAttentionCache();
  clearRoleCache();
  clearDataCache();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider onSessionCleared={clearCaches} logoutTo="/login">
      {children}
    </SharedAuthProvider>
  );
}
