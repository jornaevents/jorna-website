"use client";

// The client app's root (/client/ and /client/home/) — no longer a page of its
// own. It used to be a second landing page ("Your entire celebration team,
// matched in minutes") beside the site's real one; since the client app moved
// onto jornaevents.com (2026-10-29), a signed-out visitor is sent to For
// clients, the client landing page, and a signed-in client to their dashboard
// (clientLanding: their plans, or the Plan wizard before they have any).

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { clientLanding } from "@/lib/landing";
import { vendorSiteUrl } from "@/lib/vendorSite";

export default function HomePage() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.replace(vendorSiteUrl("/for-clients"));
      return;
    }
    let cancelled = false;
    clientLanding().then((path) => !cancelled && window.location.replace(`/client${path}/`));
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  return <p className="py-20 text-center text-ink-soft">One moment…</p>;
}
