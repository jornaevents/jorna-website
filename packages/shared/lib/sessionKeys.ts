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

/** The same, but kept when the session ends: what the last account to sign
 *  in on this device was. Only ever picks how a loading screen looks (the
 *  vendor app's vendorishBoot), never where anyone goes. */
export const LAST_ROLE_KEY = "jorna_last_role";

/** "vendor" while a Google sign-in started from the vendor side is away at
 *  Google (the vendor app's lib/supabase). */
export const OAUTH_ROLE_KEY = "jorna_oauth_role";
