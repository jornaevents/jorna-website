"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { MobileNavMenu } from "./MobileNavMenu";
import { MESSAGES, NavBadge, NEEDS_YOU, useAppNav } from "./nav";
import { Button, LinkButton } from "./ui";

// The top bar: wordmark, then the primary navigation, then the auth action.
//
// A row of links beside the wordmark is what a website looks like, so that's
// what desktop gets. Phones get MobileNavMenu's hamburger button instead,
// grouped with the auth action below — both read components/nav, so the two
// can't drift.
//
// Text-only, no icons, on the desktop row: next to text they'd just read as
// clutter. MobileNavMenu's sheet has the room to show them.
export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const { desktopItems: items, attention, messagesUnread, home, isActive } = useAppNav();

  return (
    <header className="sticky top-0 z-20 border-b border-line-soft bg-ground/85 backdrop-blur">
      <div className="mx-auto flex w-[min(var(--container-wide),100%-2rem)] items-center justify-between gap-3 py-3 md:gap-6">
        {/* The wordmark goes Home — the ordinary thing a logo does. It points at
            /home rather than "/", which is the app entry that only redirects
            here anyway; for a vendor, home is their dashboard. */}
        <Link href={home} className="serif shrink-0 text-2xl text-maroon dark:text-gold">
          Jorna
        </Link>

        {/* Signed out, the header was the wordmark and two buttons — which on a
            page that now reads as a marketing site left nothing to navigate
            with. These are the parts of it a visitor can actually reach: the
            marketplace is public, and the rest are sections of the home page. */}
        {!items && !loading ? (
          <nav
            className="hidden min-w-0 flex-1 items-center justify-end gap-5 md:flex lg:gap-6"
            aria-label="About Jorna"
          >
            {[
              { href: "/marketplace", label: "Browse vendors" },
              { href: "/home#how", label: "How it works" },
              { href: "/home#vendors", label: "For vendors" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 whitespace-nowrap text-sm font-medium text-ink-soft transition hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {items ? (
          <nav
            // gap-x tightens and the row is allowed to wrap: a vendor gets
            // nine links here, and a header that overflows would put the
            // last of them off the side of the page.
            className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-1 md:flex lg:gap-x-5"
            aria-label="Primary"
          >
            {items.map((item) => {
              const active = isActive(item);
              const badge =
                item.href === NEEDS_YOU.href
                  ? attention
                  : item.href === MESSAGES.href
                    ? messagesUnread
                    : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    badge > 0
                      ? `${item.label}, ${badge} ${item.href === MESSAGES.href ? "unread" : "waiting"}`
                      : undefined
                  }
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition ${
                    active ? "text-gold" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {item.label}
                  <NavBadge count={badge} />
                </Link>
              );
            })}
          </nav>
        ) : null}

        <nav className="flex shrink-0 items-center gap-2">
          <MobileNavMenu />
          {loading ? null : user ? (
            <Button variant="ghost" onClick={logout}>
              Sign out
            </Button>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost">
                Sign in
              </LinkButton>
              {/* Paired with "Sign in", so it says what it does. It used to read
                  "Try it now" and point at /plan — but /plan turns a guest away
                  to sign in, so the invitation was answered by a login wall.
                  ?mode=register opens the form it advertises; the post-auth
                  landing is unchanged (login defaults `next` to /plan). */}
              <LinkButton href="/login?mode=register">Get started</LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
