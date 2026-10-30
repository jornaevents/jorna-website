"use client";

// Home is a pitch, and anyone signed in has already bought it. Typing
// jornaevents.com sends them straight to their own dashboard rather than to
// marketing copy: a vendor's here, a client's in the client app (since the
// client app moved onto this site, 2026-10-29 — clientLanding). Signed-out
// visitors get Home.
//
// Unlike ClientOnlyRoute, this never blanks the page for a signed-out
// visitor, including in the static export: Home's pre-rendered HTML carries
// its real copy (it's the site's root and what search engines read), and
// rendering "Loading…" at build time would replace that with nothing.
// Content is held back only once there's reason to think the visitor might
// be a vendor — a stored token before /me settles, or a known user before
// the role check does — which only ever happens in a browser.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { hasStoredSession, useAuth } from "@/lib/auth";
import { clientLanding, loadIsVendor } from "@/lib/role";

const noSubscribe = () => () => {};

export function VendorHomeRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const storedSession = useSyncExternalStore(noSubscribe, hasStoredSession, () => false);
  const [isVendor, setIsVendor] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    loadIsVendor().then((v) => !cancelled && setIsVendor(v));
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  useEffect(() => {
    if (isVendor === true) router.replace("/overview");
    if (isVendor === false) clientLanding().then((url) => window.location.replace(url));
  }, [isVendor, router]);

  // Signed in either way means leaving, so the page is held until then.
  const deciding = user ? true : loading && storedSession;
  if (deciding) return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  return <>{children}</>;
}
