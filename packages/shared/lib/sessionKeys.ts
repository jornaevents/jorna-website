// Where the session lives in localStorage. Its own module, not auth.tsx's,
// because auth.tsx is a client module and a server component (the vendor
// app's root layout, for welcomeBoot) can't import plain values from one.

export const ACCESS_KEY = "jorna_access";
export const REFRESH_KEY = "jorna_refresh";

/** What this browser last learned the signed-in account to be ("vendor" or
 *  "client"), written by the vendor app's role check. Read before React loads
 *  (the vendor app's welcomeBoot) so a signed-in vendor never sees the
 *  Welcome page on the way to their dashboard. Goes with the session. */
export const ROLE_HINT_KEY = "jorna_role_hint";
