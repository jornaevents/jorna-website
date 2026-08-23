"use client";

// The phone half of the primary navigation: a hamburger button in the header
// that opens a bottom sheet listing every destination. Replaced a sticky
// bottom tab bar — a client's 7 destinations (see nav.tsx) squeezed into one
// row ran each label under the ~68px floor a label needs, and splitting into
// two rows fit but read as cluttered. A menu opened on demand has no such
// ceiling, and it's what SiteHeader already hides behind on desktop.
//
// The items themselves, the role that picks them, and the badge all live in
// components/nav.

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { NavBadge, NEEDS_YOU, useAppNav } from "./nav";
import { Card } from "./ui";
import { useOverlay } from "./useOverlay";

export function MobileNavMenu() {
  const { items, attention, isActive } = useAppNav();
  const [open, setOpen] = useState(false);
  const sheetRef = useOverlay<HTMLDivElement>(open, () => setOpen(false));

  if (!items) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex size-11 items-center justify-center text-ink-soft transition hover:text-ink md:hidden"
        aria-label="Menu"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="size-6"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {attention > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 size-2 rounded-full bg-maroon dark:bg-gold"
          />
        ) : null}
      </button>

      {open
        ? createPortal(
            // Portalled to <body>: SiteHeader's backdrop-blur gives it a
            // backdrop-filter, which makes it a containing block for any
            // `position: fixed` descendant — this sheet would size itself
            // against the ~70px header box instead of the viewport otherwise,
            // pinning it near the top of the screen with only its last row
            // (Profile) inside the visible area.
            <div
              className="fixed inset-0 z-50 flex items-end bg-black/40 md:hidden"
              onClick={() => setOpen(false)}
            >
              {/* Stops the backdrop's close-on-click from also firing for
                  clicks inside the sheet. */}
              <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                tabIndex={-1}
                className="w-full outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                <Card className="max-h-[85vh] w-full overflow-y-auto rounded-b-none">
                  <div className="flex items-center justify-between gap-3 border-b border-line-soft p-4">
                    <span className="serif text-lg text-ink">Menu</span>
                    <button
                      onClick={() => setOpen(false)}
                      className="text-sm text-ink-faint hover:text-ink"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <nav
                    className="flex flex-col p-2"
                    style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
                    aria-label="Primary"
                  >
                    {items.map((t) => {
                      const active = isActive(t);
                      const badge = t.href === NEEDS_YOU.href ? attention : 0;
                      return (
                        <Link
                          key={t.href}
                          href={t.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[0.95rem] font-semibold transition ${
                            active
                              ? "bg-maroon text-ground dark:bg-gold dark:text-[#2A0C19]"
                              : "text-ink-soft hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                          }`}
                        >
                          {t.icon}
                          {t.label}
                          <NavBadge
                            count={badge}
                            // NavBadge is maroon-on-ground / gold-on-ground by default, which
                            // vanishes against this row's own maroon/gold fill once active —
                            // invert it so "Needs you" stays legible while you're on it.
                            className={`ml-auto ${active ? "!bg-ground !text-maroon dark:!bg-[#2A0C19] dark:!text-gold" : ""}`}
                          />
                        </Link>
                      );
                    })}
                  </nav>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
