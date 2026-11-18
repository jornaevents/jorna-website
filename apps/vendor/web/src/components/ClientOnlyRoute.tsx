"use client";

// The buying half of the app, kept to the people doing the buying.
//
// The two tab bars already differ by role, but a tab bar only decides what's
// offered — the routes behind it stayed reachable by URL. A vendor could open
// the builder, generate a plan, and send booking requests to their own
// listings: supply creating its own demand, with real rows in the vendor's
// dashboard at the end of it. Nothing in the seller app should be able to do
// that, so the check belongs on the route rather than on the link.
//
// Signed-out visitors fall straight through. These pages send them to sign in
// themselves, and "are you a vendor" has no answer for someone with no account
// — asking would only add a redirect in front of the one already there.
//
// Role is the same signal as everywhere else (a vendor profile exists), read
// from the account (useAccountSide), so a guarded navigation costs no request.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccountSide } from "@/lib/auth";

export function ClientOnlyRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const side = useAccountSide();

  useEffect(() => {
    if (side === "vendor") router.replace("/overview");
  }, [side, router]);

  if (side === "signed-out") return <>{children}</>;
  if (side === null || side === "vendor") {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }
  return <>{children}</>;
}
