"use client";

// Home — the marketing screen, ported from the Figma Make design
// ("Design Revision Request", 2026-07-26). The job is to explain what Jorna is
// and push the bundle builder; browsing moved to the Marketplace tab, which is
// what freed Home up to be this.
//
// Ported rather than dropped in. The Make export is a standalone Vite app that
// writes every colour as an inline `style={{ color: 'var(--text-secondary)' }}`.
// Its token *values* match globals.css exactly, but the names don't, so the
// sections below use the app's Tailwind utilities (text-ink-soft, bg-panel,
// border-card-edge …) instead. One design system, not two agreeing by luck.
//
// Two things are deliberately not carried over:
//
//   - The design's navbar and footer. The app already has SiteHeader and
//     SiteFooter in the layout; a second set would double up.
//   - "Trusted by hosts planning over 2,400 celebrations" and similar. Nobody
//     could point at a source for those numbers, and an unverifiable usage
//     claim on a live commercial site isn't worth the exposure.
//
// The vendor showcase is real — live rows from /vendors/search. The bundle
// showcase is not, and says so: the three tiers are a real product feature but
// the vendors and prices in them are illustrative.
//
// Images live in web/public/img rather than being hotlinked off Unsplash's CDN,
// which is where the Make export pointed them. A commercial front page whose
// hero depends on someone else's uptime is a bad trade for the bytes saved.
//
// The /app prefix is written out because basePath doesn't rewrite a plain <img
// src>. Putting them in the repo's own public/ and asking for "/img/..." works
// in production, where Cloudflare serves that at the root, and 404s in `next
// dev`, which doesn't — so they go in the app's public/ and carry the prefix,
// and both behave the same.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { searchVendors } from "@/lib/jorna";
import { CELEBRATIONS } from "@/lib/celebrations";
import type { VendorSearchItem } from "@/lib/types";
import { LinkButton } from "@/components/ui";
import { VendorCard, VendorCardSkeleton } from "@/components/VendorCard";
import {
  CELEBRATION_ICONS,
  IconArrow,
  IconCalendar,
  IconCelebration,
  IconCheck,
  IconLock,
  IconShield,
  IconUsers,
} from "@/components/marketing/icons";

const STEPS = [
  {
    n: "01",
    icon: IconCalendar,
    title: "Describe your celebration",
    body: "Your city, date, guest count, budget, and the vibe you want — elegant, traditional, modern, or a mix. It takes about two minutes.",
  },
  {
    n: "02",
    icon: IconUsers,
    title: "Compare three complete teams",
    body: "Jorna builds a Budget, Balanced, and Top Rated team for your event — venue, catering, photography, and every other category you need, side by side.",
  },
  {
    n: "03",
    icon: IconShield,
    title: "Book and pay safely",
    body: "Pick a team, adjust it, then pay into escrow. Your money is held until the event happens and both sides confirm.",
  },
];

interface ExampleBundle {
  tier: string;
  label: string;
  total: string;
  highlight?: boolean;
  rows: { category: string; name: string; price: string; unit: string }[];
}

// Illustrative — see the header comment and the caption under the cards. The
// three tiers are what the builder really produces; the vendors in them aren't
// real listings, and the section says so rather than implying otherwise.
const EXAMPLE_BUNDLES: ExampleBundle[] = [
  {
    tier: "Bundle 01",
    label: "Budget-Friendly",
    total: "$14,200",
    rows: [
      { category: "Venue", name: "A neighbourhood banquet hall", price: "$4,500", unit: "per event" },
      { category: "Catering", name: "Everyday South Asian menu", price: "$38", unit: "per person" },
      { category: "Photography", name: "Solo photographer, 6 hours", price: "$2,200", unit: "per event" },
      { category: "DJ", name: "DJ with basic sound", price: "$900", unit: "per event" },
      { category: "Mehndi", name: "Bridal mehndi artist", price: "$350", unit: "per event" },
    ],
  },
  {
    tier: "Bundle 02",
    label: "Balanced",
    total: "$26,800",
    highlight: true,
    rows: [
      { category: "Venue", name: "Mid-size hall with décor included", price: "$8,500", unit: "per event" },
      { category: "Catering", name: "Extended menu with live stations", price: "$62", unit: "per person" },
      { category: "Photography", name: "Photo and video, full day", price: "$3,800", unit: "per event" },
      { category: "DJ", name: "DJ, MC, and lighting", price: "$1,600", unit: "per event" },
      { category: "Mehndi", name: "Bridal plus guest mehndi", price: "$700", unit: "per event" },
    ],
  },
  {
    tier: "Bundle 03",
    label: "Top Rated",
    total: "$48,500",
    rows: [
      { category: "Venue", name: "Premium venue, highest rated", price: "$18,000", unit: "per event" },
      { category: "Catering", name: "Chef-led menu, tasting included", price: "$95", unit: "per person" },
      { category: "Photography", name: "Cinematic film and photography", price: "$7,200", unit: "per event" },
      { category: "DJ", name: "Full production and staging", price: "$3,200", unit: "per event" },
      { category: "Mehndi", name: "Award-winning bridal artist", price: "$1,400", unit: "per event" },
    ],
  },
];

const ESCROW_STAGES = [
  { label: "Unpaid", status: "Pending", desc: "Not yet charged", tone: "maroon" },
  { label: "In escrow", status: "In escrow", desc: "Securely held", tone: "gold" },
  { label: "Released", status: "Released", desc: "After you confirm", tone: "green" },
  { label: "Refunded", status: "Refunded", desc: "If something goes wrong", tone: "maroon" },
] as const;

const TRUST_POINTS = [
  {
    icon: IconLock,
    title: "Your money is held, not spent",
    body: "When you pay, it goes into escrow — not straight to the vendor. It stays there until after the celebration, so you're never out of pocket for someone who doesn't show up.",
  },
  {
    icon: IconShield,
    title: "Vendors are paid when you confirm",
    body: "After the event you confirm it went well, and only then is the vendor paid. If something goes wrong, the money doesn't move until it's sorted.",
  },
  {
    icon: IconUsers,
    title: "Every booking in one place",
    body: "All your vendors, dates, messages, and payments sit under one event — each with a clear status, so you always know what's confirmed and what's still waiting.",
  },
];

const VENDOR_PERKS = [
  "Free to list — you only pay when you get booked",
  "Jorna matches you to hosts planning the events you serve",
  "Guaranteed payment through escrow on every booking",
  "Set your own rates, availability, and negotiation preferences",
  "One inbox for every client conversation",
];

const FAQ_ITEMS = [
  {
    q: "Are the team bundles generated by AI?",
    a: "Yes. Jorna uses your event details — city, date, guest count, budget, and vibe — to assemble and rank vendor teams. Every vendor in them is a real business with a profile you can open and check.",
  },
  {
    q: "Can I book individual vendors, or do I have to take a whole bundle?",
    a: "Both. Start from a generated bundle and swap any vendor in it, or skip bundles entirely and book one at a time from the Marketplace.",
  },
  {
    q: "What if a vendor cancels or doesn't show up?",
    a: "Because the money sits in escrow, a vendor who doesn't show up can't be paid. If one cancels, the payment is refunded rather than released.",
  },
  {
    q: "How long does money stay in escrow?",
    a: "From when you pay until after the event, once both sides confirm it went ahead. The booking shows its status the whole time, so you always know where your money is.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mb-3">{children}</p>;
}

export default function HomePage() {
  const { user, loading } = useAuth();

  const [vendors, setVendors] = useState<VendorSearchItem[] | null>(null);
  const [vendorsFailed, setVendorsFailed] = useState(false);

  // Real listings, so the one section that shows named vendors shows true ones.
  // A failure hides the section rather than leaving a hole — it's a showcase,
  // not something the page depends on.
  //
  // Pulled deep and then deduplicated by vendor: /vendors/search returns a row
  // per vendor+service pair, so the top four by rating are usually two vendors
  // twice over — and a vendor's rows share one photo, which reads as a bug.
  useEffect(() => {
    let cancelled = false;
    searchVendors({ sort_by: "rating", limit: 24 })
      .then((res) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const distinct = res.items.filter((item) => {
          if (seen.has(item.vendor_id)) return false;
          seen.add(item.vendor_id);
          return true;
        });
        setVendors(distinct.slice(0, 4));
      })
      .catch(() => !cancelled && setVendorsFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Signed-in visitors get the same page, pointed at the app rather than at a
  // sign-up they've already done.
  const primary = user
    ? { href: "/plan", label: "Build a bundle" }
    : { href: "/login?mode=register", label: "Get started — it's free" };

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft bg-gradient-to-b from-ground to-panel px-5 pb-16 pt-16 md:pb-24 md:pt-24">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <div className="max-w-2xl">
            <Eyebrow>South Asian celebrations, expertly planned</Eyebrow>
            <h1 className="serif text-4xl text-maroon dark:text-gold md:text-6xl">
              Your entire celebration team, matched in minutes.
            </h1>
            <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-ink-soft md:text-xl">
              Describe your wedding, sangeet, or mehndi. Jorna assembles three complete
              vendor teams for you to compare — venue, catering, DJ, photographer, and
              more — and holds your payments safely in escrow until the celebration is
              done.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {loading ? null : (
                <>
                  <LinkButton href={primary.href} size="lg">
                    {primary.label}
                  </LinkButton>
                  <LinkButton href="/marketplace" variant="ghost" size="lg">
                    Browse vendors
                  </LinkButton>
                </>
              )}
            </div>
          </div>

          {/* auto-rows (not h-*) fixes the row's height: a plain h-[220px] on
              the grid container leaves the implicit row auto-sized, so these
              photos (percentage-height images with no other size hint) fall
              back to their natural aspect ratio and spill past 220px into
              the "How it works" section below. Taller at md+: 220px crops to
              a near-square box at phone widths, but against the ~1248px
              desktop container it flattens these portrait shots into thin
              strips. */}
          <div className="mt-12 grid grid-cols-3 auto-rows-[220px] gap-3 md:auto-rows-[360px] md:gap-4">
            <div className="col-span-2 overflow-hidden rounded-2xl bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/app/img/mandap.jpg"
                alt="A decorated wedding mandap with a floral aisle"
                className="size-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-3 md:gap-4">
              <div className="flex-1 overflow-hidden rounded-2xl bg-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/app/img/mehndi.jpg"
                  alt="Mehndi being applied to a bride's hands"
                  className="size-full object-cover"
                />
              </div>
              <div className="flex-1 overflow-hidden rounded-2xl bg-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/app/img/jewellery.jpg"
                  alt="Gold bridal jewellery"
                  className="size-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      {/* id: the signed-out header links here. */}
      <section id="how" className="scroll-mt-20 bg-ground-2 px-5 py-20 md:py-28">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="serif text-3xl text-maroon dark:text-gold md:text-4xl">
            Plan your entire celebration in three steps.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3 md:gap-8">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="rounded-2xl border border-card-edge bg-card p-7 shadow-[var(--shadow-card)]"
              >
                <div className="mb-6 flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-panel text-maroon dark:text-gold">
                    {step.icon}
                  </span>
                  <span className="serif text-4xl leading-none text-line">{step.n}</span>
                </div>
                <h3 className="serif text-xl text-ink">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The bundle builder ───────────────────────────────────────── */}
      <section className="px-5 py-20 md:py-28">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <Eyebrow>The Jorna difference</Eyebrow>
          <h2 className="serif text-3xl text-maroon dark:text-gold md:text-4xl">
            Three complete vendor teams. Compare, choose, book.
          </h2>
          <p className="mt-4 max-w-[58ch] leading-relaxed text-ink-soft md:text-lg">
            Every bundle covers the same categories, so the comparison is fair. Each
            price carries its unit, so you always know what you&apos;re looking at.
          </p>

          <div className="mt-12 grid items-start gap-5 md:grid-cols-3 md:gap-6">
            {EXAMPLE_BUNDLES.map((bundle) => (
              <div
                key={bundle.tier}
                className={`flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5 ${
                  bundle.highlight
                    ? "bg-maroon text-ground shadow-[0_24px_48px_-16px_rgba(74,11,26,0.45)]"
                    : "border border-card-edge bg-card shadow-[var(--shadow-card)]"
                }`}
              >
                {bundle.highlight ? (
                  <p className="bg-gold py-2 text-center text-xs font-semibold uppercase tracking-[0.24em] text-ground">
                    Most popular
                  </p>
                ) : null}
                <div className="flex flex-1 flex-col p-6">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                      bundle.highlight ? "text-ground/60" : "text-ink-faint"
                    }`}
                  >
                    {bundle.tier}
                  </p>
                  <h3
                    className={`serif mt-1 text-2xl ${
                      bundle.highlight ? "text-ground" : "text-ink"
                    }`}
                  >
                    {bundle.label}
                  </h3>

                  <div className="mt-5 space-y-3">
                    {bundle.rows.map((row) => (
                      <div
                        key={row.category}
                        className={`flex items-start justify-between gap-3 border-b pb-3 ${
                          bundle.highlight ? "border-ground/15" : "border-line-soft"
                        }`}
                      >
                        <div className="min-w-0">
                          <p
                            className={`text-xs uppercase tracking-[0.14em] ${
                              bundle.highlight ? "text-ground/60" : "text-ink-faint"
                            }`}
                          >
                            {row.category}
                          </p>
                          <p
                            className={`mt-0.5 text-sm font-medium ${
                              bundle.highlight ? "text-ground" : "text-ink"
                            }`}
                          >
                            {row.name}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              bundle.highlight ? "text-ground/90" : "text-maroon dark:text-gold"
                            }`}
                          >
                            {row.price}
                          </p>
                          <p
                            className={`text-xs ${
                              bundle.highlight ? "text-ground/50" : "text-ink-faint"
                            }`}
                          >
                            {row.unit}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="flex items-baseline justify-between">
                      <span
                        className={`text-sm ${
                          bundle.highlight ? "text-ground/65" : "text-ink-faint"
                        }`}
                      >
                        Estimated total
                      </span>
                      <span
                        className={`text-2xl font-semibold tabular-nums ${
                          bundle.highlight ? "text-ground" : "text-ink"
                        }`}
                      >
                        {bundle.total}
                      </span>
                    </div>
                    <Link
                      href="/plan"
                      className={`mt-5 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold transition ${
                        bundle.highlight
                          ? "bg-ground text-maroon hover:brightness-95"
                          : "bg-maroon text-ground hover:brightness-110"
                      }`}
                    >
                      Build a team like this
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-[64ch] text-center text-sm text-ink-faint">
            An illustration of what the builder produces — the three tiers are real, the
            vendors and prices above are examples. Your bundle is built from live
            listings in your city, and totals depend on guest count and any rates you
            negotiate.
          </p>
        </div>
      </section>

      {/* ── Plan by celebration ──────────────────────────────────────── */}
      <section className="bg-panel px-5 py-14">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <p className="eyebrow mb-6 text-ink-faint">Plan by celebration</p>
          <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
            {CELEBRATIONS.map((c) => (
              <Link
                key={c.key}
                href={`/plan?event=${c.key}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-line-soft bg-card p-3 text-gold transition hover:border-gold/60 hover:bg-ground-2"
              >
                {CELEBRATION_ICONS[c.key] ?? IconCelebration}
                <span className="text-center text-xs font-medium text-ink-soft">
                  {c.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Real vendors ─────────────────────────────────────────────── */}
      {!vendorsFailed ? (
        <section className="bg-ground-2 px-5 py-20 md:py-28">
          <div className="mx-auto w-[min(var(--container-wide),100%)]">
            <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <Eyebrow>Browse vendors</Eyebrow>
                <h2 className="serif text-3xl text-maroon dark:text-gold md:text-4xl">
                  Every vendor your celebration needs.
                </h2>
              </div>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 text-sm font-medium text-maroon transition hover:text-gold dark:text-gold"
              >
                See all vendors {IconArrow}
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {vendors
                ? vendors.map((item) => (
                    <VendorCard
                      key={`${item.vendor_id}-${item.service_name ?? ""}`}
                      item={item}
                    />
                  ))
                : Array.from({ length: 4 }).map((_, i) => <VendorCardSkeleton key={i} />)}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── For vendors ──────────────────────────────────────────────── */}
      <section id="vendors" className="scroll-mt-20 px-5 py-20 md:py-28">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <div className="overflow-hidden rounded-2xl bg-maroon shadow-[0_32px_64px_-20px_rgba(74,11,26,0.4)] md:grid md:grid-cols-2">
            <div className="h-56 bg-maroon-deep md:h-auto md:min-h-[320px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/app/img/ceremony.jpg"
                alt="A wedding ceremony set up and ready for guests"
                className="size-full object-cover opacity-70"
              />
            </div>
            <div className="flex flex-col justify-center p-8 md:p-12">
              <p className="eyebrow mb-3">For vendors</p>
              <h2 className="serif text-3xl text-ground md:text-4xl">
                List your packages. Get booked. Get paid.
              </h2>
              <p className="mt-4 leading-relaxed text-ground/75">
                Jorna brings the hosts to you. No chasing leads, no awkward payment
                conversations — every booking is protected and paid through escrow once
                the event is done.
              </p>
              <ul className="mt-8 space-y-3">
                {VENDOR_PERKS.map((perk) => (
                  <li key={perk} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gold/25 text-gold">
                      {IconCheck}
                    </span>
                    <span className="text-sm text-ground/85">{perk}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href={user ? "/vendor-onboarding" : "/login?mode=register&role=vendor"}
                  className="inline-flex items-center justify-center rounded-full bg-ground px-7 py-3.5 font-semibold text-maroon transition hover:brightness-95"
                >
                  Become a vendor
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Escrow / trust ───────────────────────────────────────────── */}
      <section className="bg-panel px-5 py-20 md:py-28">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <div className="mx-auto mb-12 max-w-lg text-center">
            <Eyebrow>Protected by escrow</Eyebrow>
            <h2 className="serif text-3xl text-maroon dark:text-gold md:text-4xl">
              Safe to pay months in advance.
            </h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Booking a celebration means handing over large sums, sometimes a year
              ahead. Jorna was built specifically to make that feel safe.
            </p>
          </div>

          <div className="rounded-2xl border border-card-edge bg-card p-6 shadow-[var(--shadow-card)] md:p-8">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
              Where your money is, at every stage
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              {ESCROW_STAGES.map((stage) => (
                <div
                  key={stage.label}
                  className="rounded-xl border border-line-soft bg-panel p-4"
                >
                  <p className="text-xs text-ink-faint">{stage.label}</p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      stage.tone === "green"
                        ? "bg-green/12 text-green"
                        : stage.tone === "gold"
                          ? "bg-gold/15 text-gold"
                          : "bg-maroon/10 text-maroon dark:text-gold"
                    }`}
                  >
                    {stage.status}
                  </span>
                  <p className="mt-2 text-xs text-ink-faint">{stage.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div
                key={point.title}
                className="rounded-2xl border border-card-edge bg-card p-7 shadow-[var(--shadow-card)]"
              >
                <span className="mb-5 grid size-11 place-items-center rounded-xl bg-maroon/8 text-maroon dark:bg-gold/10 dark:text-gold">
                  {point.icon}
                </span>
                <h3 className="serif text-lg text-ink">{point.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-soft">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="bg-ground-2 px-5 py-20 md:py-28">
        <div className="mx-auto w-[min(720px,100%)]">
          <div className="mb-12 text-center">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="serif text-3xl text-maroon dark:text-gold md:text-4xl">
              Frequently asked
            </h2>
          </div>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                className="group overflow-hidden rounded-xl border border-card-edge bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-ink-faint transition group-open:rotate-180"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-5"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </summary>
                <div className="px-6 pb-5">
                  <p className="border-t border-line-soft pt-4 leading-relaxed text-ink-soft">
                    {item.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-ink-faint">
            More detail in{" "}
            {/* Outside the app, so a plain anchor — next/link would prefix "/app". */}
            <a href="/help/" className="text-gold hover:underline">
              how Jorna works
            </a>
            .
          </p>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section className="px-5 py-20">
        <div className="mx-auto w-[min(var(--container-wide),100%)]">
          <div className="rounded-2xl border border-card-edge bg-panel px-8 py-14 text-center">
            <h2 className="serif text-3xl text-maroon dark:text-gold md:text-4xl">
              Ready to plan your celebration?
            </h2>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-ink-soft">
              Tell us about your event and we&apos;ll have three complete vendor teams
              ready to compare.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {loading ? null : (
                <>
                  <LinkButton href={user ? "/plan" : primary.href} size="lg">
                    Start planning
                  </LinkButton>
                  <LinkButton href="/marketplace" variant="ghost" size="lg">
                    Browse vendors
                  </LinkButton>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
