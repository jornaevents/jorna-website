"use client";

// /browse was the marketing home. It was named for what the page used to do —
// browse vendors — and kept the name after browsing moved to the Marketplace
// tab, so the route said one thing and the page did another.
//
// It's /home now. This stays as a redirect: the root shim pointed here, the
// header wordmark pointed here, and anything already bookmarked or linked still
// does. A signed-in client came to browse, so they go to the Marketplace — the
// marketing home would be a step backwards (#164).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LinkButton } from "@jorna/shared/components/ui";

export default function BrowseRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/marketplace" : "/home");
  }, [router, user, loading]);

  return (
    <div className="py-20 text-center">
      <p className="text-ink-soft">Taking you home…</p>
      <LinkButton href="/home" variant="ghost" className="mt-5">
        Go to Jorna
      </LinkButton>
    </div>
  );
}
