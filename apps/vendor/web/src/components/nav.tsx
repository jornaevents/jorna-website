"use client";

// The app's primary navigation, defined once and rendered twice: as links in
// the header on desktop (SiteHeader), and as a hamburger-triggered menu on
// phones (MobileNavMenu). Only one is visible at a time — the split is CSS,
// so both mount.
//
//   Client: Home · Builder · Market · Dashboard · Needs you · Messages · Profile
//   Vendor: Dashboard · Needs you · Messages · Profile
//
// Role is "has a vendor profile" (getMyVendor != null), the same signal iOS uses
// (vendorID != nil). Shown only to a signed-in user; the whole app lives under
// basePath "/app", which next/link applies to these hrefs.
//
// Two independent badges: Needs You counts exactly what /activity lists (both
// read lib/attention, whose short TTL cache means navigating around doesn't
// re-derive it each time); Messages counts unread messages, straight from
// /conversations/unread-count — a new message isn't a task the way the
// Needs-You items are, so it gets its own number rather than folding in.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadAttention } from "@/lib/attention";
import { getUnreadCount } from "@/lib/jorna";
import { loadIsVendor } from "@/lib/role";
import { clientAppUrl } from "@/lib/clientApp";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: string[];
}

export const I = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  build: (
    <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3L12 3ZM18 14l.9 2.1 2.1.9-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z" />
  ),
  marketplace: (
    <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5v9.5h16V9.5M4 9.5a2.5 2.5 0 0 0 5 0M9 9.5a2.5 2.5 0 0 0 5 0M14 9.5a2.5 2.5 0 0 0 5 0" />
  ),
  dashboard: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5" />,
  messages: <path d="M4 5h16v11H9l-5 4V5Z" />,
  profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />,
  needsYou: (
    <path d="M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6ZM10 19a2 2 0 0 0 4 0" />
  ),
  pipeline: <path d="M4 4h4v16H4V4Zm6 0h4v10h-4V4Zm6 0h4v13h-4V4Z" />,
  clients: (
    <path d="M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 8.2a3 3 0 1 1 0 5.9M16.3 14.6c2.7.4 4.7 2.4 4.7 5.4" />
  ),
  leads: <path d="M4 4.5h16l-6.2 8v6.4l-3.6 1.6v-8L4 4.5Z" />,
  calendar: (
    <path d="M4 5.5h16v15H4v-15Zm0 4.5h16M8 3v4M16 3v4" />
  ),
  document: (
    <path d="M6 3h9l3 3v15H6V3Zm9 0v3h3M9 12h6M9 16h6" />
  ),
  earnings: <path d="M4 6.5h16v11H4v-11Zm8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7 9.5v5M17 9.5v5" />,
  gear: (
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.07-.4.1-.8.1-1.2Z" />
  ),
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

export const NEEDS_YOU: NavItem = {
  href: "/activity",
  label: "Needs you",
  icon: icon(I.needsYou),
  match: ["/activity"],
};

export const MESSAGES: NavItem = {
  href: "/messages",
  label: "Messages",
  icon: icon(I.messages),
  match: ["/messages"],
};

// Every real login in this app is a vendor now — the marketplace/booking-
// request flow this used to serve (Builder, Market, a bundles dashboard) was
// deleted when this repo forked from jorna-website (see docs/DECISIONS.md).
// What's left is the narrow signed-in-but-not-yet-selling gap: someone who's
// created an account but hasn't finished vendor-onboarding, or is still
// signed in during that flow. Route them at that, not at three dead links.
export const NO_VENDOR_TABS: NavItem[] = [
  { href: "/home", label: "Home", icon: icon(I.home), match: ["/home"] },
  // Signed-in only, on purpose — a visitor who hasn't planned anything yet
  // sees "How it works"/"For clients" on Home instead (SiteHeader's
  // signed-out nav). The marketplace is for someone already planning a
  // celebration, not a general storefront advertised to a stranger.
  // It lives in the client app (book.jornaevents.com); /browse here only
  // redirects to Home.
  {
    href: clientAppUrl("/marketplace"),
    label: "Browse vendors",
    icon: icon(I.marketplace),
    match: ["/browse"],
  },
  {
    href: "/vendor-onboarding",
    label: "Get started",
    icon: icon(I.build),
    match: ["/vendor-onboarding"],
  },
  NEEDS_YOU,
  MESSAGES,
  { href: "/profile", label: "Profile", icon: icon(I.profile), match: ["/profile"] },
];

// No Home tab. /home is a marketing page written to sell the bundle builder to
// someone planning an event — every button on it leads somewhere a vendor is
// now turned away from. A seller's home is the dashboard: what's been requested
// of them, when they're working, and what they're owed.
export const VENDOR_TABS: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: icon(I.dashboard),
    // Every seller page hangs off the dashboard now, reached through the
    // vendor sidebar, so they all keep this tab current. They used to light Profile, back when
    // Profile was the only tab that owned them — two tabs matching the same
    // path would light both.
    // Browsing is in here too, now that Home is gone: a vendor reading the
    // marketplace or another listing shouldn't leave the whole bar unlit.
    // "/vendor" is safe beside "/vendor-profile" — isActive matches a whole
    // segment, so the shorter one can't swallow the longer.
    match: [
      "/overview",
      "/my-bookings",
      "/my-calendar",
      "/my-earnings",
      "/vendor-profile",
      "/vendor",
      "/home",
      "/browse",
      "/leads",
      "/contracts",
      "/settings",
    ],
  },
  NEEDS_YOU,
  MESSAGES,
  { href: "/profile", label: "Profile", icon: icon(I.profile), match: ["/profile"] },
];

/**
 * Every seller destination, for the desktop header only.
 *
 * A vendor page used to carry two navigations: this bar with one Dashboard tab
 * in it, and a second strip of six directly underneath — the same word twice,
 * a hand's width apart. The header has room for the lot on a desktop, so it
 * takes the lot. (The second strip, VendorNav, is gone entirely since every
 * seller page moved behind VendorSidebar.)
 *
 * Phones keep VENDOR_TABS. Nine icons across 390px is 43px each, and the tab
 * bar's own note puts the floor at about 68 — there, the two navigations are at
 * opposite ends of the screen and don't read as a repetition anyway.
 *
 * Their work first, then the account. "Vendor Profile" rather than a second "Profile":
 * the two went to different pages under one word, and which one you got
 * depended on which bar you happened to click.
 */
export const VENDOR_DESKTOP_TABS: NavItem[] = [
  {
    href: "/overview",
    label: "Overview",
    icon: icon(I.dashboard),
    // Just itself here. The phone bar's Dashboard stands in for every seller
    // page because it's the only seller tab there; up here each page has a tab
    // of its own to light.
    match: ["/overview", "/home", "/browse"],
  },
  {
    href: "/my-bookings",
    label: "Bookings",
    icon: icon(I.pipeline),
    match: ["/my-bookings"],
  },
  {
    href: "/leads",
    label: "Leads",
    icon: icon(I.leads),
    match: ["/leads"],
  },
  {
    href: "/contracts",
    label: "Contracts",
    icon: icon(I.document),
    match: ["/contracts"],
  },
  {
    href: "/my-calendar",
    label: "Calendar",
    icon: icon(I.calendar),
    match: ["/my-calendar"],
  },
  {
    href: "/my-earnings",
    label: "Earnings",
    icon: icon(I.dashboard),
    match: ["/my-earnings"],
  },
  {
    href: "/vendor-profile",
    label: "Vendor Profile",
    icon: icon(I.profile),
    // Services live on this page, so there is no separate tab for them.
    // "/vendor" is the public listing view — the same thing a client sees, so
    // it belongs here rather than leaving the bar unlit.
    match: ["/vendor-profile", "/vendor", "/browse"],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: icon(I.gear),
    match: ["/settings"],
  },
  NEEDS_YOU,
  MESSAGES,
  { href: "/profile", label: "Profile", icon: icon(I.profile), match: ["/profile"] },
];

/**
 * The items to show, the badge count, and which one is current.
 * `items` is null for a signed-out visitor — browsing, "Get started", login.
 *
 * `desktopItems` differs only for a vendor, and only because the header has
 * room the phone bar doesn't.
 */
export function useAppNav(): {
  items: NavItem[] | null;
  desktopItems: NavItem[] | null;
  attention: number;
  messagesUnread: number;
  home: string;
  isActive: (item: NavItem) => boolean;
} {
  const { user, loading } = useAuth();
  const pathname = usePathname() ?? "";
  // Each value is kept with the user it was loaded for, and only counts for
  // that user: signing out (or someone else signing in) shows the empty
  // default at once, with no effect needed to reset it.
  const [isVendorFor, setIsVendorFor] = useState<{ userId: string; value: boolean } | null>(null);
  const [attention, setAttention] = useState<{ userId: string; value: number } | null>(null);
  const [messagesUnread, setMessagesUnread] = useState<{ userId: string; value: number } | null>(null);

  // Re-check on navigation, not just on sign-in: this bar is part of the
  // persistent layout, mounted once per session — unlike ClientOnlyRoute,
  // which re-derives isVendor on every protected page it wraps, this effect
  // would otherwise never run again after the first check. A client who
  // completes vendor-onboarding mid-session (create_vendor calls
  // clearRoleCache()) would keep seeing the client tabs until they signed
  // out and back in. Cheap: lib/role's own TTL cache makes most of these a
  // no-op, same as the attention/messagesUnread effects below.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadIsVendor().then((v) => !cancelled && setIsVendorFor({ userId: user.user_id, value: v }));
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

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
  const isVendor = mine<boolean | null>(isVendorFor, null);
  const signedOut = loading || !user;
  return {
    items: signedOut ? null : isVendor ? VENDOR_TABS : NO_VENDOR_TABS,
    desktopItems: signedOut ? null : isVendor ? VENDOR_DESKTOP_TABS : NO_VENDOR_TABS,
    attention: mine(attention, 0),
    messagesUnread: mine(messagesUnread, 0),
    // Where the wordmark goes. A logo goes home, and home for a seller is their
    // dashboard — not the page selling the builder to everyone else.
    home: isVendor ? "/overview" : "/home",
    isActive: (item) =>
      item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)),
  };
}

/** The count bubble on Needs you or Messages. Nothing when there's nothing waiting. */
export function NavBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`min-w-[1.05rem] rounded-full bg-maroon px-1 text-center text-[0.6rem] font-bold leading-[1.05rem] text-ground dark:bg-gold ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
