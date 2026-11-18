// What a signed-in account is, read from the account itself (GET /me's
// is_vendor and signup_side, backend DECISIONS #53) — so both apps know which
// screens to draw the moment they know who's signed in. Before this each page
// asked /vendors/me after it had drawn, and showed the client app while it
// waited: the flash of the wrong side people saw around signing in.

/** The account fields this reads. */
export interface AccountRole {
  /** The account has a vendor profile. Absent only from a backend older
   *  than #53, which auth fills in from /vendors/me (shared/lib/auth). */
  is_vendor?: boolean;
  /** Which sign-up made the account. Null for older accounts and iOS. */
  signup_side?: "client" | "vendor" | null;
}

/**
 * - `"vendor"`: has a vendor profile.
 * - `"vendor-setup"`: signed up as a vendor but hasn't reached onboarding's
 *   first step, so no profile yet. Belongs in onboarding, not the client app.
 * - `"client"`: anyone else.
 */
export type AccountSide = "vendor" | "vendor-setup" | "client";

export function accountSide(user: AccountRole): AccountSide {
  if (user.is_vendor) return "vendor";
  if (user.signup_side === "vendor") return "vendor-setup";
  return "client";
}
