"use client";

// Welcome — the site's front door, from the Figma "Jorna — Welcome and choose
// your path" frame (2026-10). It asks one question, client or vendor, and
// sends each to the page made for them (/for-clients, /for-vendors). Those
// two carry the explaining Home used to do (see docs/DECISIONS.md).
//
// The design animates in: the wordmark arrives large in the middle of the
// screen and settles into the header, then the rest fades up. That's CSS in
// app/landing.css (played once, skipped for reduced motion), so the static
// export still carries every word for search engines.
//
// Images live in web/public/img/landing — see the old Home's note on why
// they're served from the app's own public/ with the /app prefix written out.

import Link from "next/link";
import { VendorHomeRedirect } from "@/components/VendorHomeRedirect";
import { JornaMark } from "@/components/JornaMark";
import { Arrow, LandingShell, Photo, wrap } from "@/components/landing/ui";

const PATHS = [
  {
    href: "/for-clients",
    photo: "lake-mandap",
    eyebrow: "For clients",
    title: "I’m planning a celebration",
    body: "Bring your South Asian celebration to life. Find the right vendor team for your wedding, sangeet, mehndi and every moment in between.",
    points: "Discover vendors · Find your team · Plan with confidence",
    action: "Continue as a client",
  },
  {
    href: "/for-vendors",
    photo: "candlelit-florals",
    eyebrow: "For vendors",
    title: "I make celebrations happen",
    body: "A home for your event business. Showcase your services, connect with clients, and keep your bookings and contracts beautifully organized.",
    points: "Showcase services · Manage bookings · Keep contracts together",
    action: "Continue as a vendor",
  },
];

// Signed-in vendors skip this page for their dashboard — see
// VendorHomeRedirect. Wrapping here rather than in app/page.tsx covers every
// address Home is served at (/, /app/, /app/home/).
export default function HomePage() {
  return (
    <VendorHomeRedirect>
      <Welcome />
    </VendorHomeRedirect>
  );
}

function Welcome() {
  return (
    <LandingShell>
      <header className="l-intro-rule border-b border-(--l-line)">
        <div className={`${wrap} flex h-[76px] items-center justify-between lg:h-[100px]`}>
          <Link href="/" className="l-intro-mark l-serif inline-flex items-center gap-2.5 text-[34px] font-semibold text-(--l-maroon) lg:gap-3 lg:text-[42px]">
            <JornaMark className="h-9 lg:h-11" />
            Jorna
          </Link>
          {/* One sign-in for both sides: it sends each account to its own
              dashboard (lib/role defaultLanding). */}
          <p className="l-intro-fade flex items-center gap-2 text-[13px]">
            <span className="hidden text-(--l-ink-soft) sm:inline">Already part of Jorna?</span>
            <Link href="/login" className="font-medium text-(--l-maroon) underline underline-offset-4">
              Sign in
            </Link>
            {/* "Get started" opens the chooser (Figma Make entry flow, 2026-10). */}
            <Link
              href="/get-started"
              className="ml-2 rounded-full bg-(--l-maroon) px-4 py-2 font-medium text-(--l-ground) transition hover:bg-[#561623] sm:ml-4"
            >
              Get started
            </Link>
          </p>
        </div>
      </header>

      <div className="flex-1">
        <section className={`l-intro-fade ${wrap} flex flex-col items-center gap-3 pb-[34px] pt-11 text-center`}>
          <p className="flex items-center gap-3.5 text-[11px] font-semibold uppercase text-(--l-gold)">
            <span aria-hidden="true" className="h-px w-8 bg-(--l-gold)" />
            Welcome to Jorna
            <span aria-hidden="true" className="h-px w-8 bg-(--l-gold)" />
          </p>
          <h1 className="l-serif text-[clamp(40px,4.75vw,68px)] font-medium leading-[1.05] text-(--l-maroon)">
            Every celebration starts with a connection.
          </h1>
          <p className="text-[15px] leading-[1.8] text-(--l-ink-soft)">
            Tell us what brings you here. We’ll help you find your way.
          </p>
        </section>

        <div className={`l-intro-fade ${wrap} grid gap-8 md:grid-cols-2`}>
          {PATHS.map((path) => (
            <section
              key={path.href}
              className="flex flex-col overflow-hidden rounded-lg border border-(--l-line) bg-(--l-paper)"
            >
              <Photo name={path.photo} className="h-[218px] w-full" />
              <div className="flex flex-1 flex-col gap-4 p-8">
                <p className="text-[11px] font-semibold uppercase text-(--l-gold)">{path.eyebrow}</p>
                <h2 className="l-serif text-[clamp(32px,2.8vw,40px)] font-medium leading-[1.05] text-(--l-maroon)">
                  {path.title}
                </h2>
                <p className="text-[14px] leading-[1.75] text-(--l-ink-soft)">{path.body}</p>
                <p className="text-[11px] leading-[1.6] text-(--l-ink-soft)">{path.points}</p>
                <Link
                  href={path.href}
                  className="mt-auto flex h-[54px] w-full items-center justify-between rounded-full bg-(--l-maroon) px-[26px] text-[14px] font-medium text-(--l-ground) transition hover:bg-[#561623]"
                >
                  {path.action}
                  <Arrow light />
                </Link>
              </div>
            </section>
          ))}
        </div>

        <p className={`l-intro-fade ${wrap} flex items-center justify-center gap-3.5 pb-[30px] pt-[26px]`}>
          <span aria-hidden="true" className="h-px w-9 shrink-0 bg-(--l-gold)" />
          <span className="l-serif text-center text-[22px] italic text-(--l-maroon) md:text-[24px]">
            Your traditions. Your people. A little more joy.
          </span>
          <span aria-hidden="true" className="h-px w-9 shrink-0 bg-(--l-gold)" />
        </p>
      </div>

      <footer className="l-intro-fade border-t border-(--l-line)">
        <div className={`${wrap} flex min-h-[65px] flex-col justify-center gap-2 py-4 sm:flex-row sm:items-center sm:justify-between`}>
          <p className="text-[11px] text-(--l-ink-soft)">© {new Date().getFullYear()} Jorna. Made for moments that matter.</p>
          <p className="text-[10px] uppercase text-(--l-gold)">Rooted in tradition. Made for you.</p>
        </div>
      </footer>
    </LandingShell>
  );
}
