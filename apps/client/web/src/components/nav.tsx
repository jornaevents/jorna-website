"use client";

// The app's primary navigation, defined once and rendered twice: as links in
// the header on desktop (SiteHeader), and as a hamburger-triggered menu on
// phones (MobileNavMenu). Only one is visible at a time — the split is CSS,
// so both mount.
//
//   Home · Builder · Market · Dashboard · Needs you · Messages · Profile
//
// Clients only: vendors work on jornaevents.com, and a vendor account signed
// in here sees VendorAccountGate instead of the app. Shown only to a
// signed-in user; the whole app lives under basePath "/client", which next/link
// applies to these hrefs.
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

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: string[];
}

const I = {
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

export const CLIENT_TABS: NavItem[] = [
  { href: "/home", label: "Home", icon: icon(I.home), match: ["/home", "/browse"] },
  { href: "/plan", label: "Builder", icon: icon(I.build), match: ["/plan"] },
  {
    href: "/marketplace",
    label: "Market",
    icon: icon(I.marketplace),
    // A package and the form that adds it to a plan are both still shopping.
    match: ["/marketplace", "/vendor", "/service", "/book"],
  },
  {
    href: "/bundles",
    label: "Dashboard",
    icon: icon(I.dashboard),
    match: ["/bundles", "/bundle", "/events", "/event"],
  },
  NEEDS_YOU,
  MESSAGES,
  { href: "/profile", label: "Profile", icon: icon(I.profile), match: ["/profile"] },
];

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
    home: "/home",
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
