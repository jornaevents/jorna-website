"use client";

// /profile was the client's hub: links to the dashboard, Needs you, Settings
// and Blocked, with Sign out and Delete account. The four-tab navigation and
// the single Account page (client redesign PR 8) cover all of it, so this
// only sends old links on.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account");
  }, [router]);
  return <p className="py-20 text-center text-ink-soft">Opening your account…</p>;
}
