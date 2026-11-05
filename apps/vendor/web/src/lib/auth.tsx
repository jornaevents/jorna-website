"use client";

// Auth lives in @jorna/shared/lib/auth, shared with the client app. This
// wrapper adds what's this app's own: the caches to clear with the session,
// and that signing out lands on /login with a full page load.

import { useLayoutEffect } from "react";
import { AuthProvider as SharedAuthProvider, useAuth } from "@jorna/shared/lib/auth";
import { clearAttentionCache } from "./attention";
import { clearDataCache, setDataCacheOwner } from "./dataCache";
import { clearRoleCache } from "./role";

export { hasStoredSession, useAuth } from "@jorna/shared/lib/auth";

// Module-level so it's one stable function: the provider's clear() depends on it.
function clearCaches() {
  clearAttentionCache();
  clearRoleCache();
  clearDataCache();
}

/** Tells lib/dataCache whose session this is, so answers kept across a
 *  reload are only ever shown to the person they were read for. A layout
 *  effect: it runs before any page's load effect, so a reload's first reads
 *  already find them. */
function DataCacheOwner() {
  const { user, loading } = useAuth();
  const userId = user?.user_id ?? null;
  useLayoutEffect(() => {
    if (!loading) setDataCacheOwner(userId);
  }, [loading, userId]);
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider onSessionCleared={clearCaches} logoutTo="/login">
      <DataCacheOwner />
      {children}
    </SharedAuthProvider>
  );
}
