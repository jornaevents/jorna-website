"use client";

// The app's primary navigation, defined once and rendered twice: as tabs in
// the top bar on desktop (SiteHeader), and as a tab bar along the bottom on
// phones (MobileTabBar). Only one is visible at a time — the split is CSS
// (desk:), so both mount.
//
//   My Events · Explore · Messages · Account
//
// Four tabs, from the Jorna-Client design (client redesign plan, PR 1,
// 2026-11-14). They replace Builder · Market · Dashboard · Needs you ·
// Messages · Profile: the old pages still open under the tab they belong to
// until the PR that redesigns each one replaces it.
//
// Clients only: vendors work on jornaevents.com, and a vendor account signed
// in here sees VendorAccountGate instead of the app. Shown only to a
// signed-in user; the whole app lives under basePath "/client", which next/link
// applies to these hrefs.
//
// Two independent badges: My Events counts exactly what /activity (Needs you)
// lists (both read lib/attention, whose short TTL cache means navigating
// around doesn't re-derive it each time); Messages counts unread messages, straight from
// /conversations/unread-count — a new message isn't a task the way the
// Needs-You items are, so it gets its own number rather than folding in.

import { vendorSiteUrl } from "@/lib/vendorSite";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadAttention } from "@/lib/attention";
import { getUnreadCount } from "@/lib/jorna";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: string[];
}

export const I = {
  events: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  explore: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  messages: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
};

export const icon = (d: React.ReactNode, className = "size-6") => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {d}
  </svg>
);

// Everything about a celebration: its plans, building one (Builder), the
// guest list, and what's waiting on the client (Needs you) — which is why
// this tab carries that count.
export const MY_EVENTS: NavItem = {
  href: "/bundles",
  label: "My Events",
  icon: icon(I.events),
  match: ["/bundles", "/bundle", "/events", "/event", "/plan", "/activity", "/guests"],
};

export const EXPLORE: NavItem = {
  href: "/marketplace",
  label: "Explore",
  icon: icon(I.explore),
  // A package and the form that adds it to a plan are both still shopping.
  match: ["/marketplace", "/browse", "/vendor", "/service", "/book"],
};

export const MESSAGES: NavItem = {
  href: "/messages",
  label: "Messages",
  icon: icon(I.messages),
  match: ["/messages", "/conversation"],
};

// The profile hub for now: it holds Settings, Blocked, Sign out and the link
// to Needs you until the redesigned Account page (plan PR 8).
export const ACCOUNT: NavItem = {
  href: "/profile",
  label: "Account",
  icon: icon(I.account),
  match: ["/profile", "/account", "/blocked"],
};

/** The phone's tab bar, left to right. */
export const CLIENT_TABS: NavItem[] = [MY_EVENTS, EXPLORE, MESSAGES, ACCOUNT];
/** The desktop top bar, as the design orders it; Account is the avatar beside it. */
export const DESKTOP_TABS: NavItem[] = [EXPLORE, MY_EVENTS, MESSAGES];

/**
 * The items to show, the badge count, and which one is current.
 * `items` is null for a signed-out visitor — browsing, "Get started", login.
 */
export function useAppNav(): {
  items: NavItem[] | null;
  attention: number;
  messagesUnread: number;
  home: string;
  isActive: (item: NavItem) => boolean;
  badgeFor: (item: NavItem) => number;
} {
  const { user, loading } = useAuth();
  const pathname = usePathname() ?? "";
  // Each value is kept with the user it was loaded for, and only counts for
  // that user: signing out (or someone else signing in) shows the empty
  // default at once, with no effect needed to reset it.
  const [attention, setAttention] = useState<{ userId: string; value: number } | null>(null);
  const [messagesUnread, setMessagesUnread] = useState<{ userId: string; value: number } | null>(null);

  // Re-check on navigation so the badge follows you as you act on things. Cheap:
  // lib/attention's TTL cache makes most of these a no-op, so this is roughly
  // one derivation a minute, not one per page.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadAttention()
      .then((items) => !cancelled && setAttention({ userId: user.user_id, value: items.length }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  // Same re-check-on-navigation shape as attention above, but its own request:
  // unread count isn't part of what lib/attention derives, so it can't share
  // that cache.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUnreadCount()
      .then((r) => !cancelled && setMessagesUnread({ userId: user.user_id, value: r.unread_count }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  const mine = <T,>(got: { userId: string; value: T } | null, fallback: T): T =>
    user && got?.userId === user.user_id ? got.value : fallback;

  const signedOut = loading || !user;
  return {
    items: signedOut ? null : CLIENT_TABS,
    attention: mine(attention, 0),
    messagesUnread: mine(messagesUnread, 0),
    // The wordmark: a signed-in client's dashboard, else the client landing
    // page on the main site (the old client Home is gone — app/home).
    home: signedOut ? vendorSiteUrl("/for-clients") : "/bundles",
    isActive: (item) =>
      item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)),
    badgeFor: (item) =>
      item === MY_EVENTS ? mine(attention, 0) : item === MESSAGES ? mine(messagesUnread, 0) : 0,
  };
}

/** The count bubble on My Events or Messages. Nothing when there's nothing waiting. */
export function NavBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold-bright px-1 text-[0.68rem] font-bold text-[#35101b] ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
