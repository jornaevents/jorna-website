"use client";

// Auth lives in @jorna/shared/lib/auth, shared with the client app. This
// wrapper adds what's this app's own: the caches to clear with the session,
// and that signing out lands on /login with a full page load.

import { useLayoutEffect } from "react";
import { AuthProvider as SharedAuthProvider, useAuth } from "@jorna/shared/lib/auth";
import { clearAttentionCache } from "./attention";
import { clearDataCache, setDataCacheOwner } from "./dataCache";
import { LAST_ROLE_KEY, ROLE_HINT_KEY } from "@jorna/shared/lib/sessionKeys";

export { hasStoredSession, useAccountSide, useAuth } from "@jorna/shared/lib/auth";

// Module-level so it's one stable function: the provider's clear() depends on it.
function clearCaches() {
  clearAttentionCache();
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

/** Leaves what the account is in localStorage for the scripts that run before
 *  React does (welcomeBoot, vendorishBoot). Written from the account itself,
 *  which used to be lib/role's job when it asked /vendors/me. */
function RoleHint() {
  const { user } = useAuth();
  const isVendor = user?.is_vendor;
  useLayoutEffect(() => {
    if (isVendor === undefined) return;
    try {
      localStorage.setItem(ROLE_HINT_KEY, isVendor ? "vendor" : "client");
      localStorage.setItem(LAST_ROLE_KEY, isVendor ? "vendor" : "client");
    } catch {
      /* storage disabled — Welcome just takes the slower way round */
    }
  }, [isVendor]);
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider onSessionCleared={clearCaches} logoutTo="/login">
      <DataCacheOwner />
      <RoleHint />
      {children}
    </SharedAuthProvider>
  );
}
