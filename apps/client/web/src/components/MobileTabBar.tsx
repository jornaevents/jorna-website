"use client";

// The phone's four tabs along the bottom (Jorna-Client design): My Events,
// Explore, Messages, Account. Hidden from desk: up, where SiteHeader shows
// the same tabs. Four fit one row with a label each — the old hamburger
// menu (MobileNavMenu) was for seven, which didn't.
//
// The spacer keeps the page's last line out from under the bar.

import Link from "next/link";
import { CLIENT_TABS, NavBadge, useAppNav } from "./nav";

export function MobileTabBar() {
  const { items, isActive, badgeFor } = useAppNav();
  if (!items) return null;
  return (
    <>
      <div aria-hidden="true" className="h-[calc(72px+env(safe-area-inset-bottom))] desk:hidden" />
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-card px-1 pt-[7px] pb-[max(7px,env(safe-area-inset-bottom))] desk:hidden"
      >
        {CLIENT_TABS.map((item) => {
          const active = isActive(item);
          const badge = badgeFor(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={badge > 0 ? `${item.label}, ${badge} ${item.label === "Messages" ? "unread" : "waiting"}` : undefined}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold transition ${
                active ? "text-maroon dark:text-gold" : "text-ink-soft"
              }`}
            >
              <span className="relative">
                {item.icon}
                <NavBadge count={badge} className="absolute -top-[7px] left-3 h-4 min-w-4 text-[0.6rem]" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
