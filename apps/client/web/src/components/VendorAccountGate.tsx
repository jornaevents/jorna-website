"use client";

// This app is the buying half of Jorna; vendors work on jornaevents.com.
//
// A vendor account that signs in here is told where its pages are, once, for
// every page — header and tab bar included, so nothing of the client app shows
// around the notice. What the account is comes with the account (GET /me,
// useAccountSide), so there's no moment where it's unknown but the client app
// is drawn anyway: while the session loads, a signed-in browser sees a plain
// loading line, never one side and then the other.
//
// Signed-out visitors and the sign-in pages pass straight through — a vendor
// has to be able to sign out, or in as someone else. So does a browser with no
// stored session while auth loads: that's the static export, whose HTML must
// keep its real content, and a visitor who isn't signed in.

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { hasStoredSession, useAccountSide, useAuth } from "@/lib/auth";
import { vendorSiteUrl } from "@/lib/vendorSite";
import { Button, Card } from "@jorna/shared/components/ui";

const OPEN_TO_ANYONE = ["/login", "/auth", "/forgot-password", "/reset-password"];

const noSubscribe = () => () => {};

export function VendorAccountGate({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const side = useAccountSide();
  const storedSession = useSyncExternalStore(noSubscribe, hasStoredSession, () => false);
  const pathname = usePathname() ?? "";

  const open = OPEN_TO_ANYONE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (open) return <>{children}</>;

  if (side === null) {
    if (!storedSession) return <>{children}</>;
    return (
      <main className="flex-1">
        <p className="py-20 text-center text-ink-soft">Loading…</p>
      </main>
    );
  }

  if (side !== "vendor" && side !== "vendor-setup") return <>{children}</>;

  // A vendor who hasn't finished setting up is sent to finish, not to a
  // dashboard that would only send them there.
  const setup = side === "vendor-setup";
  return (
    <main className="flex-1">
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20">
        <Card className="p-8 text-center">
          <h1 className="serif text-3xl text-maroon dark:text-gold">This is a vendor account</h1>
          <p className="mt-3 text-ink-soft">
            {setup
              ? "You signed up to sell on Jorna. Finish setting up your listing on jornaevents.com — this site is where clients plan and book."
              : "Your dashboard, bookings, contracts and listing are on jornaevents.com — this site is where clients plan and book."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <a
              href={vendorSiteUrl(setup ? "/vendor-onboarding" : "/overview")}
              className="inline-flex items-center rounded-full bg-maroon px-5 py-2.5 font-semibold text-ground hover:brightness-110"
            >
              {setup ? "Finish setting up" : "Go to jornaevents.com"}
            </a>
            <Button variant="ghost" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
