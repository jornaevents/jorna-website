"use client";

// Hides the shared marketing/marketplace chrome (SiteHeader + SiteFooter)
// wherever VendorSidebar is drawn instead. Two kinds of route get the sidebar:
//
//   - The vendor-only routes under app/(vendor)/ — always, by pathname.
//   - Messages (/messages, /conversation), which clients use too. Those pages
//     can't live in the (vendor) route group, so they get the sidebar only
//     when the viewer is a vendor (VendorShellIfVendor), and the header is
//     hidden here on the same condition. Without this, a vendor opening
//     Messages from the sidebar dropped out of their app into the client
//     header and had no sidebar to get back with.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { loadIsVendor } from "@/lib/role";

const VENDOR_SHELL_PREFIXES = [
  "/overview",
  "/my-bookings",
  "/my-calendar",
  "/my-earnings",
  "/contracts",
  "/leads",
  "/vendor-profile",
  "/settings",
];

const SHARED_SHELL_PREFIXES = ["/messages", "/conversation"];

// The landing pages draw their own header and footer from the Figma design
// (components/landing/ui.tsx), and so do the entry flow's screens — Get
// started, sign-in/sign-up, vendor onboarding (components/entry/ui.tsx) — so
// the shared ones step aside there too.
const LANDING_PATHS = ["/", "/home", "/for-clients", "/for-vendors", "/get-started", "/login", "/vendor-onboarding"];

export function isLandingPath(pathname: string | null): boolean {
  const path = pathname && pathname !== "/" ? pathname.replace(/\/$/, "") : pathname;
  return LANDING_PATHS.includes(path ?? "");
}

const under = (prefixes: string[], pathname: string | null) =>
  prefixes.some((p) => pathname === p || pathname?.startsWith(`${p}/`));

export function isVendorShellPath(pathname: string | null): boolean {
  return under(VENDOR_SHELL_PREFIXES, pathname);
}

/** Null while the viewer's role is still being looked up. Keyed on the user
 *  so a sign-in as someone else can't briefly inherit the last answer. */
function useIsVendor(): boolean | null {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<{ userId: string; isVendor: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadIsVendor().then((isVendor) => !cancelled && setRole({ userId: user.user_id, isVendor }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return null;
  if (!user) return false;
  return role?.userId === user.user_id ? role.isVendor : null;
}

/**
 * Whether this page is drawn inside VendorSidebar: true/false, or null while
 * a shared route is still finding out who's looking. Callers treat null as
 * "not decided" rather than guessing, so neither chrome flashes in and back
 * out again.
 */
export function useVendorShell(): boolean | null {
  const pathname = usePathname();
  const isVendor = useIsVendor();
  if (isVendorShellPath(pathname)) return true;
  if (under(SHARED_SHELL_PREFIXES, pathname)) return isVendor;
  return false;
}

export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shell = useVendorShell();
  if (shell !== false || isLandingPath(pathname)) return null;
  return <>{children}</>;
}
