"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@jorna/shared/components/ui";
import { AccountSettings } from "@/components/AccountSettings";

export default function AccountPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/account");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-10">
      <h1 className="serif text-3xl text-maroon dark:text-gold">Account settings</h1>

      <div className="mt-7">
        <AccountSettings loginNext="/account" />
      </div>

      <div className="mt-8">
        <Button variant="quiet" onClick={() => logout()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
