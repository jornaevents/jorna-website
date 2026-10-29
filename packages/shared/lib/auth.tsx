"use client";

// Auth state for both web apps (moved here from each app's lib/auth.tsx,
// which now wrap it with their own caches and sign-out destination). Email/password authenticates directly against the
// backend (/auth/login, /auth/register) which issues Jorna's own JWT + refresh
// token; those are persisted in localStorage and attached to every API call via
// the api client. Google OAuth goes through Supabase, then exchanges its token
// for a Jorna session via adoptSession (see /auth/callback and lib/supabase).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, configureTokens, type TokenPair } from "./api";

export interface User {
  user_id: string;
  email: string;
  username: string;
  f_name?: string | null;
  l_name?: string | null;
  phone?: string | null;
  location?: string | null;
  pfp_url?: string | null;
}

const ACCESS_KEY = "jorna_access";
const REFRESH_KEY = "jorna_refresh";

/** A token as every tab currently sees it. Storage is the one copy all tabs
 *  share; the fallback is only for when there's no storage to read (server
 *  render, or storage blocked). */
function stored(key: string, fallback: string | null): string | null {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem(key);
  } catch {
    return fallback;
  }
}

/** This tab's copy of the tokens — stored()'s fallback when storage can't be
 *  read. */
const memory: { access: string | null; refresh: string | null } = { access: null, refresh: null };

function persistTokens(pair: TokenPair | null) {
  memory.access = pair?.access_token ?? null;
  memory.refresh = pair?.refresh_token ?? null;
  if (typeof window === "undefined") return;
  if (pair) {
    localStorage.setItem(ACCESS_KEY, pair.access_token);
    localStorage.setItem(REFRESH_KEY, pair.refresh_token);
  } else {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

/** What losing the session does; AuthProvider swaps in its full clear-out. */
let onAuthLost: () => void = () => persistTokens(null);

// Wire the api client to token storage when this module loads, not in
// AuthProvider's effect. Children's effects run before their provider's, so
// on a hard page load the first requests went out with no token — a vendor
// reloading /leads got "Not authenticated".
configureTokens({
  // Read from storage, not this tab's copy: another tab that refreshed
  // rotated the refresh token, and replaying the old one signs the
  // user out everywhere (the backend treats it as a stolen token).
  getAccess: () => stored(ACCESS_KEY, memory.access),
  getRefresh: () => stored(REFRESH_KEY, memory.refresh),
  onRefreshed: (pair) => persistTokens(pair),
  onAuthLost: () => onAuthLost(),
});

/**
 * Whether this browser holds a session token, read synchronously — before
 * AuthProvider's `/me` round-trip settles `user`. Lets a page that behaves
 * differently for signed-in visitors hold its content back from the first
 * frame instead of flashing the signed-out version. Only a hint: the token
 * may turn out to be dead, so `useAuth()` stays the source of truth.
 */
export function hasStoredSession(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(ACCESS_KEY) != null;
}

interface RegisterInput {
  email: string;
  password: string;
  /** Optional since backend #154: derived from the email when left out, as the
   *  vendor sign-up does. Age, location, gender and language likewise. */
  username?: string;
  f_name: string;
  l_name: string;
  age?: number;
  location?: string;
  // Where that location is, when the city picker recognised it. A vendor with
  // no coordinates can't be placed relative to an event, and an unplaceable
  // vendor is left out of search results and of generated bundles — so this is
  // the difference between being findable and not.
  latitude?: number | null;
  longitude?: number | null;
  gender?: string;
  language?: string;
  phone?: string;
  // Set when completing a Google sign-up: links the new account to the Supabase
  // identity. The backend proves ownership from the token (matching sub + email).
  supabase_user_id?: string;
  supabase_access_token?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Adopt a Jorna token pair obtained outside the password flow (Google). */
  adoptSession: (pair: TokenPair) => Promise<void>;
  /** End the session. With a destination (`to`, else the provider's
   *  `logoutTo`) it leaves with a full page load, so no page's "signed out →
   *  /login?next=<this page>" redirect can run first and hand the next person
   *  to sign in this one's page. Without one it only clears the session and
   *  the caller navigates. */
  logout: (to?: string) => void;
  /** Set the current user directly (e.g. after editing the profile). */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  onSessionCleared,
  logoutTo,
}: {
  children: React.ReactNode;
  /** Clear the app's own caches derived from the session (attention badges,
   *  the cached role), so the next person on this browser doesn't inherit them. */
  onSessionCleared?: () => void;
  /** Where logout() goes when the caller doesn't say, under /app. Unset:
   *  logout() only clears the session. */
  logoutTo?: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((pair: TokenPair | null) => persistTokens(pair), []);

  const clear = useCallback(() => {
    persist(null);
    setUser(null);
    // Anything derived from the session goes with it, or the next person to
    // sign in on this browser inherits the previous one's badge and tabs for
    // as long as the caches live. Also covers onAuthLost below, which is a
    // session ending too.
    onSessionCleared?.();
  }, [persist, onSessionCleared]);

  // Losing the session clears everything derived from it, not just tokens.
  useEffect(() => {
    onAuthLost = clear;
    return () => {
      onAuthLost = () => persistTokens(null);
    };
  }, [clear]);

  // Hydrate from storage on first load: if we have a token, fetch the profile.
  useEffect(() => {
    const a = typeof window !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null;
    const r = typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
    memory.access = a;
    memory.refresh = r;
    // With no token there's nothing to fetch, but loading still ends when a
    // promise settles, as it does after /me — never synchronously in this
    // effect. The tokens above are read synchronously either way, so a page's
    // first requests still carry them.
    const me = a ? apiFetch<User>("/me").then(setUser).catch(() => clear()) : Promise.resolve();
    void me.finally(() => setLoading(false));
  }, [clear]);

  const afterTokens = useCallback(async (pair: TokenPair) => {
    persist(pair);
    const me = await apiFetch<User>("/me");
    setUser(me);
  }, [persist]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const pair = await apiFetch<TokenPair>("/auth/login", {
        method: "POST",
        auth: false,
        body: { identifier, password },
      });
      await afterTokens(pair);
    },
    [afterTokens],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      // /auth/register creates the account but returns only {user_id, email} —
      // it doesn't issue tokens. Establish the session by logging in after, with
      // the credentials just set (works for Google sign-ups too: the linked
      // account still has this password).
      await apiFetch<{ user_id: string; email: string }>("/auth/register", {
        method: "POST",
        auth: false,
        body: input,
      });
      const pair = await apiFetch<TokenPair>("/auth/login", {
        method: "POST",
        auth: false,
        body: { identifier: input.email, password: input.password },
      });
      await afterTokens(pair);
    },
    [afterTokens],
  );

  // Persist a token pair we already hold (e.g. from /auth/google/lookup) and
  // load the profile — the Google equivalent of finishing login().
  const adoptSession = useCallback(
    async (pair: TokenPair) => {
      await afterTokens(pair);
    },
    [afterTokens],
  );

  const logout = useCallback(
    (to?: string) => {
      clear();
      const dest = to ?? logoutTo;
      if (dest) window.location.replace(`/app${dest}`);
    },
    [clear, logoutTo],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, adoptSession, logout, setUser }),
    [user, loading, login, register, adoptSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
