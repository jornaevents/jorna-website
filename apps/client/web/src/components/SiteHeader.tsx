"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { DESKTOP_TABS, NavBadge, ACCOUNT, useAppNav } from "./nav";
import { JornaMark } from "./JornaMark";
import { ThemeToggle } from "./ThemeToggle";
import { LinkButton } from "@jorna/shared/components/ui";
import { DARK_MODE_ENABLED } from "@jorna/shared/lib/flags";
import { signInUrl } from "@/lib/vendorSite";

// The top bar, from the Jorna-Client design (client redesign plan, PR 1):
// the wordmark, then — signed in — Explore, My Events and Messages as tabs
// with the current one underlined, and the account's initials, which open
// Account. On a phone the tabs move to MobileTabBar along the bottom and the
// bar keeps only the wordmark.
//
// Sign out moved off the bar: it's on Account (today the profile hub), as in
// the design.
export function SiteHeader() {
  const { user, loading } = useAuth();
  const { items, home, isActive, badgeFor } = useAppNav();
  const account = isActive(ACCOUNT);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ground/90 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] w-[min(1280px,100%-2rem)] items-center justify-between gap-3 desk:h-[76px] desk:gap-6">
        <Link href={home} className="flex shrink-0 items-center gap-2.5 font-serif text-[1.3rem] font-bold tracking-[-0.04em] text-ink">
          <JornaMark className="h-8" />
          Jorna
        </Link>

        {/* Signed out, the header was the wordmark and two buttons — which on a
            page that now reads as a marketing site left nothing to navigate
            with. These are the parts of it a visitor can actually reach: the
            marketplace is public, and the rest are sections of the home page. */}
        {!items && !loading ? (
          <nav
            className="hidden min-w-0 flex-1 items-center justify-end gap-5 desk:flex lg:gap-6"
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
          <nav className="hidden self-stretch desk:flex" aria-label="Primary">
            {DESKTOP_TABS.map((item) => {
              const active = isActive(item);
              const badge = badgeFor(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    badge > 0 ? `${item.label}, ${badge} ${item.label === "Messages" ? "unread" : "waiting"}` : undefined
                  }
                  className={`flex items-center gap-1.5 border-b-2 px-2.5 text-sm font-semibold whitespace-nowrap transition lg:px-[18px] ${
                    active
                      ? "border-maroon text-maroon dark:border-gold dark:text-gold"
                      : "border-transparent text-ink-soft hover:text-ink"
                  }`}
                >
                  {item.label}
                  <NavBadge count={badge} />
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="flex shrink-0 items-center gap-3">
          {DARK_MODE_ENABLED ? <ThemeToggle /> : null}
          {loading ? null : user ? (
            <Link
              href={ACCOUNT.href}
              aria-label="Account"
              aria-current={account ? "page" : undefined}
              className={`hidden size-9 place-items-center rounded-full border-2 bg-ink text-[0.78rem] font-bold text-ground desk:grid ${
                account ? "border-gold ring-[3px] ring-gold/15" : "border-transparent"
              }`}
            >
              {initials(user)}
            </Link>
          ) : (
            <>
              <LinkButton href={signInUrl()} variant="ghost">
                Sign in
              </LinkButton>
              {/* Paired with "Sign in", so it says what it does. ?mode=register
                  opens the form it advertises; the post-auth landing is
                  unchanged (login defaults `next` to /plan). */}
              <LinkButton href="/login?mode=register">Get started</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** "PS" for Priya Shah; the email's first letter when there's no name. */
function initials(user: { f_name?: string | null; l_name?: string | null; email?: string | null }): string {
  const first = (user.f_name ?? "").trim().charAt(0);
  const last = (user.l_name ?? "").trim().charAt(0);
  return (first + last).toUpperCase() || (user.email ?? "?").charAt(0).toUpperCase();
}
