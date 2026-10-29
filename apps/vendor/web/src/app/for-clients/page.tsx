"use client";

// For clients — from the Figma "Jorna — For clients" frame (2026-10), the
// page the Welcome screen's "Continue as a client" leads to. Every action
// goes to the client app (book.jornaevents.com), where planning happens.
//
// The vendors, offerings and contract shown are the design's illustrations,
// labelled as such on the page — not live listings and not live prices.

import { useAuth } from "@/lib/auth";
import { clientAppUrl } from "@/lib/clientApp";
import {
  Arrow,
  Display,
  Eyebrow,
  Feature,
  LandingFooter,
  LandingNav,
  Lede,
  Photo,
  PillLink,
  Questions,
  SectionIntro,
  SmartLink,
  Steps,
  wrap,
  LandingShell,
} from "@/components/landing/ui";

const CATEGORIES = [
  { label: "All vendors", category: null },
  { label: "Venues", category: "venue" },
  { label: "Catering", category: "catering" },
  { label: "Photography", category: "photography" },
  { label: "Décor & florals", category: "floral_decor" },
  { label: "Music & entertainment", category: "dj" },
  { label: "Beauty", category: "makeup" },
];

const VENDORS = [
  { photo: "garden-ceremony", category: "Venues", place: "New Jersey", name: "The Marigold House", detail: "Garden ceremonies · Up to 350 guests" },
  { photo: "regional-feast", category: "Catering", place: "New York", name: "Saffron & Silk", detail: "Regional menus · Family-style feasts" },
  { photo: "couple-archway", category: "Photography", place: "New York", name: "Rang Studio", detail: "Candid moments · Timeless storytelling" },
];

const OFFERINGS = [
  {
    photo: "garden-ceremony",
    title: "Garden ceremony venue",
    detail: "Outdoor spaces · Up to 350 guests",
    includes: ["Ceremony lawn and garden access", "Flexible layout for mandap and seating", "Vendor coordination support included"],
    total: "$6,500",
  },
  {
    photo: "candlelit-florals",
    title: "Regional buffet catering",
    detail: "Family-style service · 200 guests",
    includes: ["Custom menu consultation", "Service staff and equipment included", "Dietary options and timing coordination"],
    total: "$12,000",
  },
  {
    photo: "lake-mandap",
    title: "Documentary wedding photography",
    detail: "Candid coverage · 8 hours",
    includes: ["Ceremony and reception coverage", "Edited gallery and digital delivery", "Timeline coordination and on-site support"],
    total: "$4,800",
  },
];

const FAQ = [
  {
    q: "How does Jorna help me find vendor offerings?",
    a: "Describe your celebration, location, guest count, style and budget. Jorna helps you discover individual offerings from vendors, so you can browse, compare and choose the services and products that fit your vision.",
  },
  {
    q: "Can I plan a mehndi, sangeet and wedding with Jorna?",
    a: "Yes. Share the celebrations you’re planning and the needs of each event. You can browse offerings for each one and choose the services and products that fit each occasion.",
  },
  {
    q: "Can I discover vendor offerings myself?",
    a: "Yes. Explore vendors by category, look through their work and review their services and products. You can browse offerings directly and choose the ones that fit your celebration.",
  },
  {
    q: "When are prices and deposits agreed with each vendor?",
    a: "Before you pay. Review what’s included, agree on the price and deposit with each vendor, and sign a booking contract with each vendor before making a payment.",
  },
  {
    q: "What should I have ready to start finding offerings?",
    a: "Start with your event type, location, approximate dates, guest count and budget. Bring your ideas, traditions and any requirements that matter to you, so you can find the right offerings.",
  },
];

const marketplace = (category?: string | null) =>
  clientAppUrl(category ? `/marketplace?category=${category}` : "/marketplace");

export default function ForClientsPage() {
  const { user } = useAuth();
  // Someone already signed in goes straight to planning, not to a sign-up
  // they've done. (Signed in here isn't signed in there — see clientAppUrl —
  // but it's the best guess at who this is.)
  const start = clientAppUrl(user ? "/plan" : "/login?mode=register");

  return (
    <LandingShell>
      <LandingNav
        audience="For celebrants"
        links={[
          { label: "How it works", href: "#how-it-works" },
          { label: "Find vendors", href: marketplace() },
          { label: "For vendors", href: "/for-vendors" },
        ]}
        signIn={clientAppUrl("/login")}
        getStarted="/get-started?as=client"
        action={{ label: "Plan your celebration", href: start }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className={`${wrap} flex flex-col gap-[46px] pb-14 pt-12 lg:pt-[68px]`}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:gap-[90px]">
          <div className="flex flex-col gap-6 lg:w-[750px] lg:shrink-0">
            <Eyebrow>Your traditions. Your people. Your choices.</Eyebrow>
            <Display as="h1" size="xl" lines={["A celebration like yours.", "Vendors who get it."]} />
          </div>
          <div className="flex flex-col items-start gap-[22px] pb-1.5">
            <Lede>
              Plan your South Asian wedding, sangeet, mehndi and more. Discover vendors, browse their offerings, and
              bring every detail together with Jorna.
            </Lede>
            <PillLink href={start}>Find vendors for my celebration</PillLink>
            <SmartLink href={marketplace()} className="text-[13px] text-(--l-maroon) underline underline-offset-4">
              Or browse vendors and offerings in your own time →
            </SmartLink>
          </div>
        </div>
        <div className="flex flex-col gap-7 lg:flex-row">
          <div className="relative lg:w-[862px] lg:shrink-0">
            <Photo
              name="lake-mandap"
              alt="A floral mandap on a lakeside terrace, with guests seated in rows"
              className="h-[300px] w-full rounded-lg md:h-[470px]"
            />
            <p className="absolute bottom-[26px] left-7 flex h-[42px] items-center rounded-full bg-(--l-ground) px-[18px] text-[10px] uppercase text-(--l-maroon)">
              Every detail, beautifully yours
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-6 lg:pt-11">
            <Photo
              name="bridal-hands"
              alt="A bride's hennaed hands with gold bangles and kaleere"
              className="h-[285px] w-full rounded-lg"
            />
            <p className="flex items-center gap-4">
              <span aria-hidden="true" className="h-px w-9 shrink-0 bg-(--l-gold)" />
              <span className="l-serif text-[28px] italic leading-[1.15] text-(--l-maroon)">
                Less searching.
                <br />
                More celebrating.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Occasions strip ──────────────────────────────────────────── */}
      <section className="border-y border-(--l-line)">
        <div className={`${wrap} flex flex-col gap-6 py-8`}>
          <p className="text-[10px] uppercase text-(--l-ink-soft)">For every moment of your celebration</p>
          <ul className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 text-(--l-maroon)">
            {["Mehndi", "Sangeet", "Wedding", "Reception"].map((name) => (
              <li key={name} className="l-serif text-[28px] lg:text-[34px]">
                {name}
              </li>
            ))}
            <li className="l-serif text-[22px] italic lg:text-[25px]">And every detail in between</li>
          </ul>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className={`${wrap} flex scroll-mt-4 flex-col gap-12 py-20 lg:py-[104px]`}>
        <SectionIntro
          eyebrow="How it works"
          lines={["From a thousand ideas", "to the right vendors for you."]}
          body="You bring the vision. Jorna helps you discover vendors, browse their offerings, and book the services that fit your celebration."
        />
        <Steps
          steps={[
            {
              title: "Tell us what you’re planning",
              body: "Share your celebration, location, guest count and budget. Add your style, traditions and the details that make it personal.",
            },
            {
              title: "Discover vendors and offerings",
              body: "Browse vendors, compare their services and products, and choose the offerings that fit your vision, location and budget.",
            },
            {
              title: "Choose, book, and confirm",
              body: "Choose the offerings you want, agree on the details with each vendor, and sign a booking contract before you pay.",
            },
          ]}
        />
      </section>

      {/* ── Vendors ──────────────────────────────────────────────────── */}
      <section className="bg-(--l-paper)">
        <div className={`${wrap} flex flex-col gap-9 py-20 lg:py-24`}>
          <SectionIntro
            eyebrow="Offerings that fit your celebration"
            lines={["Your traditions. Your style.", "The offerings you need."]}
            aside={
              <span className="shrink-0">
                <PillLink href={marketplace()} tone="outline">
                  Explore offerings
                </PillLink>
              </span>
            }
          />
          <ul className="flex flex-wrap gap-2.5">
            {CATEGORIES.map((c, i) => (
              <li key={c.label}>
                <SmartLink
                  href={marketplace(c.category)}
                  className={`flex h-10 items-center rounded-full border px-[18px] text-[12px] transition ${
                    i === 0
                      ? "border-(--l-maroon) bg-(--l-maroon) text-(--l-ground)"
                      : "border-(--l-line) bg-(--l-paper) text-(--l-ink) hover:border-(--l-maroon)"
                  }`}
                >
                  {c.label}
                </SmartLink>
              </li>
            ))}
          </ul>
          <div className="grid gap-7 md:grid-cols-3">
            {VENDORS.map((v) => (
              <article key={v.name} className="flex flex-col gap-4">
                <Photo name={v.photo} className="h-[260px] w-full rounded-lg lg:h-[315px]" />
                <p className="flex justify-between">
                  <span className="text-[10px] uppercase text-(--l-gold)">{v.category}</span>
                  <span className="text-[11px] text-(--l-ink-soft)">{v.place}</span>
                </p>
                <h3 className="flex items-center justify-between gap-4">
                  <span className="l-serif text-[30px] font-medium text-(--l-maroon) lg:text-[32px]">{v.name}</span>
                  <Arrow />
                </h3>
                <p className="text-[12px] text-(--l-ink-soft)">{v.detail}</p>
              </article>
            ))}
          </div>
          <p className="flex flex-col gap-3 pt-1.5 sm:flex-row sm:justify-between">
            <span className="text-[10px] text-(--l-ink-soft)">Illustrative vendor offerings</span>
            <SmartLink href={start} className="text-[13px] text-(--l-maroon) underline underline-offset-4">
              Ready to browse more? Start with your celebration →
            </SmartLink>
          </p>
        </div>
      </section>

      {/* ── Offerings ────────────────────────────────────────────────── */}
      <section className="bg-(--l-maroon)">
        <div className={`${wrap} flex flex-col gap-10 py-20 lg:py-24`}>
          <SectionIntro
            light
            eyebrow="Explore what’s available"
            lines={["Different vendors.", "Different offerings.", "One celebration: yours."]}
            body="Browse individual offerings from vendors who understand South Asian celebrations. Choose the services and products that fit your vision, budget and guest count."
          />
          <p className="flex flex-col gap-2 border-y border-(--l-maroon-line) py-[18px] sm:flex-row sm:justify-between">
            <span className="text-[11px] uppercase text-(--l-gold-pale)">An illustrative search</span>
            <span className="text-[12px] text-(--l-ground)">Wedding &amp; reception · New Jersey · 200 guests</span>
          </p>
          <div className="grid items-start gap-6 md:grid-cols-3">
            {OFFERINGS.map((o) => (
              <article key={o.title} className="overflow-hidden rounded-lg bg-(--l-paper)">
                <Photo name={o.photo} className="h-[180px] w-full" />
                <div className="flex flex-col gap-[18px] p-6">
                  <div className="flex flex-col gap-2">
                    <h3 className="l-serif text-[30px] font-medium leading-[1.15] text-(--l-maroon)">{o.title}</h3>
                    <p className="text-[11px] text-(--l-ink-soft)">{o.detail}</p>
                  </div>
                  <ul className="flex flex-col gap-3 border-y border-(--l-line) py-4 text-[12px] text-(--l-ink)">
                    {o.includes.map((item) => (
                      <li key={item}>·&nbsp;&nbsp;{item}</li>
                    ))}
                  </ul>
                  <div className="flex items-end justify-between">
                    <p className="flex flex-col gap-1">
                      <span className="text-[10px] text-(--l-ink-soft)">Illustrative offering total</span>
                      <span className="l-serif text-[34px] text-(--l-maroon)">{o.total}</span>
                    </p>
                    <SmartLink href={marketplace()} className="text-[12px] text-(--l-maroon) hover:underline">
                      View offerings ↗
                    </SmartLink>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="text-[11px] leading-[1.6] text-(--l-blush)">
            Example offerings and prices are for illustration, not live offers. Final services, prices and deposits are
            agreed with each vendor in a signed booking contract before you pay.
          </p>
        </div>
      </section>

      {/* ── Contracts ────────────────────────────────────────────────── */}
      <section id="contracts" className={`${wrap} flex flex-col gap-14 py-20 lg:flex-row lg:items-center lg:gap-[90px] lg:py-[104px]`}>
        <div className="relative lg:h-[570px] lg:w-[600px] lg:shrink-0">
          <Photo name="candlelit-florals" className="h-[320px] w-full rounded-lg lg:h-[470px] lg:w-[480px]" />
          <div className="relative -mt-24 ml-6 flex flex-col gap-5 rounded-xl bg-(--l-paper) p-7 shadow-(--l-shadow) sm:ml-20 lg:absolute lg:left-40 lg:top-[276px] lg:m-0 lg:w-[440px]">
            <p className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase text-(--l-gold)">Booking contract</span>
              <span className="rounded-full bg-(--l-sage-bg) px-[11px] py-[7px] text-[10px] text-(--l-sage)">
                Signed by both parties
              </span>
            </p>
            <div className="flex flex-col gap-[7px]">
              <p className="l-serif text-[30px] leading-[1.2] text-(--l-maroon)">Regional buffet catering agreement</p>
              <p className="text-[11px] text-(--l-ink-soft)">Saffron &amp; Silk · Ananya &amp; Rohan</p>
              <p className="text-[11px] text-(--l-ink-soft)">June 14, 2027 · 200 guests</p>
            </div>
            <dl className="flex justify-between border-t border-(--l-line) pt-[18px]">
              {[
                ["Agreed price", "$12,500"],
                ["Deposit", "$2,500"],
                ["Remaining", "$10,000"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-2">
                  <dt className="text-[10px] text-(--l-ink-soft)">{label}</dt>
                  <dd className="l-serif text-[26px] text-(--l-maroon)">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[9px] text-(--l-ink-soft)">Illustrative booking contract · Payment follows the agreed terms</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-start gap-[26px]">
          <Eyebrow>Less uncertainty. More peace of mind.</Eyebrow>
          <Display lines={["Every offering agreed.", "Every promise", "in writing."]} />
          <Lede>
            Know what you’re booking before you pay. Services, prices and deposits are agreed in a signed booking
            contract with each vendor, so everyone starts on the same page.
          </Lede>
          <Feature title="See what each offering includes">
            Review the vendor’s services or products, event details and agreed scope.
          </Feature>
          <Feature title="Agree with each vendor. Sign first. Then pay.">
            Keep the agreed price and deposit terms in writing before making a payment.
          </Feature>
          <PillLink href={start} tone="outline">
            Start choosing offerings with confidence
          </PillLink>
        </div>
      </section>

      {/* ── Small moments ────────────────────────────────────────────── */}
      <section className="bg-(--l-blush)">
        <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row lg:items-center">
          <div className="flex flex-col gap-[26px] px-(--l-pad) py-16 lg:w-[770px] lg:shrink-0 lg:py-20">
            <Eyebrow>Thoughtfully planned. Fully present.</Eyebrow>
            <Display lines={["Be there for the", "small moments, too."]} />
            <Lede>
              The quiet before the ceremony. The dance your cousins rehearsed. The meal that feels like home. Choose the
              offerings you want, confirm the details, and bring your plans together, so you can give your attention to
              what matters.
            </Lede>
            <ul className="flex flex-col gap-[18px] pt-2 text-[13px]">
              {[
                "Offerings chosen around your celebration",
                "Bookings and contracts with each vendor kept together",
                "Clear details to come back to, whenever you need",
              ].map((line) => (
                <li key={line} className="flex gap-3.5">
                  <span aria-hidden="true" className="text-(--l-gold)">
                    —
                  </span>
                  <span className="text-(--l-ink)">{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <Photo
            name="couple-archway"
            alt="A bride and groom laughing together under a carved stone archway"
            className="h-[420px] w-full lg:h-[600px] lg:min-w-0 lg:flex-1"
          />
        </div>
      </section>

      <Questions
        lines={["Big plans.", "Good questions."]}
        body="A thoughtful start to your celebration, with the essentials of finding and booking individual offerings made clear."
        items={FAQ}
      />

      {/* ── Closing ──────────────────────────────────────────────────── */}
      <section className="bg-(--l-blush)">
        <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
          <div className="flex flex-col items-start gap-[26px] px-(--l-pad) py-16 lg:w-[800px] lg:shrink-0 lg:py-[76px]">
            <Eyebrow>The beginning of something beautiful</Eyebrow>
            <Display size="lg" lines={["Your celebration.", "Your choices.", "Let’s bring it together."]} />
            <Lede>
              Bring your traditions, your ideas and your happy chaos. Find the offerings that fit your vision, choose
              the vendors you want, and bring your celebration together.
            </Lede>
            <PillLink href={start}>Start choosing offerings for your celebration</PillLink>
          </div>
          <Photo
            name="petal-shower"
            alt="Family showering a newly married couple with rose petals"
            className="h-[420px] w-full lg:h-auto lg:min-h-[590px] lg:min-w-0 lg:flex-1"
          />
        </div>
      </section>

      <LandingFooter
        tagline="Your celebration, brought together with the right offerings."
        groups={[
          {
            title: "Your celebration",
            links: [
              { label: "Discover offerings", href: marketplace() },
              { label: "How it works", href: "#how-it-works" },
              { label: "Bookings and contracts", href: "#contracts" },
            ],
          },
          {
            title: "Explore Jorna",
            links: [
              { label: "For vendors", href: "/for-vendors" },
              { label: "About us", href: "/help/" },
            ],
          },
          { title: "The essentials", links: [{ label: "Help & FAQs", href: "/help/" }] },
        ]}
      />
    </LandingShell>
  );
}
