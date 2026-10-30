"use client";

// For vendors — from the Figma "Jorna — For vendors" frame (2026-10), the page
// the Welcome screen's "Continue as a vendor" leads to. Its actions stay in
// this app: sign-up goes to vendor registration, or straight to onboarding
// for someone already signed in.
//
// The storefront, bookings and contract panels are the design's illustrations
// of the workspace, labelled as such — not screenshots, and simpler than the
// real dashboard's sidebar on purpose.

import { useAuth } from "@/lib/auth";
import {
  Display,
  Eyebrow,
  Feature,
  LandingFooter,
  LandingNav,
  LandingShell,
  Lede,
  Photo,
  PillLink,
  Questions,
  SectionIntro,
  SmartLink,
  Steps,
  wrap,
} from "@/components/landing/ui";

const FAQ = [
  {
    q: "What can I showcase on my storefront?",
    a: "Present your portfolio alongside your services and products. Describe what you offer, the celebrations you work on and the locations you serve.",
  },
  {
    q: "How can relevant clients discover my business?",
    a: "Your work and offering help clients explore vendors for their celebration. Details such as category, location and event needs give your business useful context.",
  },
  {
    q: "Can I manage bookings on Jorna?",
    a: "Yes. Keep your event bookings together and see the client, celebration details and associated contract status in your workspace.",
  },
  {
    q: "Can I create my own booking contracts?",
    a: "Yes. Create and manage contracts for your bookings, including the agreed services or products, price and deposit terms. Review the details with your client before signing.",
  },
  {
    q: "When should clients pay a deposit?",
    a: "Agree on the price and deposit in the signed booking contract before the client pays. Keep the agreed terms with the booking so both sides have a clear reference.",
  },
];

const BOOKINGS = [
  { day: "14", who: "Ananya & Rohan", what: "Wedding reception", where: "200 guests · New Jersey", status: "Signed", tone: "bg-(--l-sage-bg) text-(--l-sage)", selected: true },
  { day: "21", who: "Meera & Arjun", what: "Sangeet", where: "180 guests · New York", status: "Awaiting signature", tone: "bg-(--l-gold-pale) text-(--l-maroon)" },
  { day: "28", who: "Sana & Zain", what: "Mehndi", where: "80 guests · New Jersey", status: "Draft", tone: "bg-(--l-ground) text-(--l-maroon)" },
];

/** The illustrated workspace's top bar, with one tab picked out. */
function WorkspaceHeader({ active }: { active: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="l-serif text-[28px] font-semibold text-(--l-maroon)">Jorna</span>
        <span className="flex items-center gap-2.5 text-[11px] text-(--l-ink-soft)">
          Saffron &amp; Silk
          <span className="grid size-7 place-items-center rounded-full bg-(--l-blush) text-[9px] text-(--l-maroon)">SS</span>
        </span>
      </div>
      <div className="flex gap-[26px] border-b border-(--l-line) pb-3.5 text-[11px]">
        {["Overview", "Storefront", "Bookings", "Contracts"].map((tab) => (
          <span key={tab} className={tab === active ? "font-semibold text-(--l-maroon)" : "text-(--l-ink-soft)"}>
            {tab}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The sand tray an illustration sits in, with its caption underneath. */
function Illustration({ caption, tone = "sand", children }: { caption: string; tone?: "sand" | "blush"; children: React.ReactNode }) {
  return (
    <figure className={`flex flex-col gap-[18px] rounded-xl p-4 sm:p-7 ${tone === "sand" ? "bg-(--l-sand)" : "bg-(--l-blush)"}`}>
      <div aria-hidden="true" className="flex flex-col gap-5 overflow-hidden rounded-lg bg-(--l-paper) p-5 shadow-(--l-shadow) sm:p-6">
        {children}
      </div>
      <figcaption className="text-center text-[10px] text-(--l-ink-soft)">{caption}</figcaption>
    </figure>
  );
}

export default function ForVendorsPage() {
  const { user } = useAuth();
  const join = user ? "/vendor-onboarding" : "/login?mode=register&role=vendor";

  return (
    <LandingShell>
      <LandingNav
        audience="For vendors"
        links={[
          { label: "Your storefront", href: "#storefront" },
          { label: "Business tools", href: "#business-tools" },
          { label: "For clients", href: "/for-clients" },
        ]}
        signIn="/login?role=vendor"
        getStarted="/login?mode=register&role=vendor"
        action={{ label: "Join as a vendor", href: join }}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className={`${wrap} flex flex-col gap-14 pb-16 pt-12 lg:flex-row lg:items-center lg:gap-[70px] lg:pt-[68px]`}>
        <div className="flex flex-col items-start gap-7 lg:w-[650px] lg:shrink-0">
          <Eyebrow>For the people who make it happen</Eyebrow>
          <Display as="h1" size="xl" lines={["Your craft,", "in the spotlight.", "Your business,", "in one place."]} />
          <Lede>
            A home for your South Asian event business. Showcase your services and products, connect with relevant
            clients, and manage your bookings and contracts with Jorna.
          </Lede>
          <div className="flex flex-wrap items-center gap-[22px]">
            <PillLink href={join}>Create your storefront</PillLink>
            <SmartLink href="#business-tools" className="text-[13px] text-(--l-maroon) underline underline-offset-4">
              Explore the workspace
            </SmartLink>
          </div>
        </div>
        <div className="relative lg:h-[610px] lg:w-[560px] lg:shrink-0">
          <Photo
            name="candlelit-florals"
            alt="A candlelit reception table with marigolds, roses and dahlias"
            className="h-[360px] w-full rounded-lg lg:h-[540px] lg:w-[510px]"
          />
          <div className="relative -mt-20 ml-6 flex flex-col gap-4 rounded-lg bg-(--l-paper) p-[18px] shadow-(--l-shadow) sm:ml-24 lg:absolute lg:left-[120px] lg:top-[385px] lg:m-0 lg:w-[440px]">
            <div className="flex items-center gap-[18px]">
              <Photo name="regional-feast" className="h-[100px] w-[108px] shrink-0 rounded-[5px]" />
              <div className="flex flex-col gap-2">
                <p className="text-[9px] uppercase text-(--l-gold)">Catering · New York</p>
                <p className="l-serif text-[32px] leading-none text-(--l-maroon)">Saffron &amp; Silk</p>
                <p className="text-[11px] leading-[1.6] text-(--l-ink-soft)">Regional menus. Thoughtful hospitality.</p>
              </div>
            </div>
            <p className="flex justify-between border-t border-(--l-line) pt-3">
              <span className="text-[9px] text-(--l-ink-soft)">Illustrative vendor storefront</span>
              <span className="text-[11px] text-(--l-maroon)">View portfolio ↗</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Tools strip ──────────────────────────────────────────────── */}
      <section className="border-y border-(--l-line)">
        <div className={`${wrap} flex flex-col gap-4 py-7 lg:flex-row lg:items-center lg:justify-between`}>
          <p className="text-[10px] uppercase text-(--l-ink-soft)">From first impression to signed booking</p>
          <ul className="flex flex-wrap gap-x-10 gap-y-2 lg:contents">
            {["Your storefront", "Your bookings", "Your contracts"].map((name) => (
              <li key={name} className="l-serif text-[26px] text-(--l-maroon) lg:text-[29px]">
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Storefront ───────────────────────────────────────────────── */}
      <section id="storefront" className={`${wrap} flex scroll-mt-4 flex-col gap-14 py-20 lg:flex-row lg:items-center lg:gap-[90px] lg:py-[104px]`}>
        <div className="flex flex-col gap-[26px] lg:w-[480px] lg:shrink-0">
          <Eyebrow>A first impression that feels like you</Eyebrow>
          <Display lines={["Let your work", "tell your story."]} />
          <Lede>
            Give clients more than a name in a directory. Bring your portfolio, services and products together in a
            storefront that shows what you do best.
          </Lede>
          <Feature title="A portfolio with personality">
            Show the details, atmosphere and celebrations that define your work.
          </Feature>
          <Feature title="Services and products, clearly presented">
            Explain your packages, individual offerings and event-ready products.
          </Feature>
          <Feature title="The right context for an inquiry">
            Share your category, location and the celebrations you work on.
          </Feature>
        </div>
        <div className="flex-1">
          <Illustration caption="Illustrative workspace and offerings">
            <WorkspaceHeader active="Storefront" />
            <div className="flex items-center justify-between gap-3">
              <span className="l-serif text-[26px] text-(--l-maroon) sm:text-[32px]">Your storefront</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-(--l-line) px-3.5 py-2 text-[10px] text-(--l-maroon)">
                Edit profile ↗
              </span>
            </div>
            <Photo name="regional-feast" className="h-[172px] w-full rounded-[5px]" />
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-[7px]">
                <span className="l-serif text-[30px] leading-none text-(--l-maroon)">Saffron &amp; Silk</span>
                <span className="text-[11px] text-(--l-ink-soft)">Catering · New York &amp; New Jersey</span>
              </div>
              <span className="text-[10px] uppercase text-(--l-gold)">Portfolio ↗</span>
            </div>
            <div className="flex gap-6 border-b border-(--l-line) pb-3 text-[11px]">
              <span className="font-semibold text-(--l-maroon)">Services &amp; products</span>
              <span className="text-(--l-ink-soft)">Portfolio</span>
              <span className="text-(--l-ink-soft)">About</span>
            </div>
            <div className="flex flex-col gap-4">
              {[
                ["Service", "Wedding catering", "Regional menus · Per guest"],
                ["Service", "Chai & dessert station", "An evening addition · Per event"],
                ["Product", "Celebration sweet boxes", "A thoughtful take-home gift · Per box"],
              ].map(([kind, name, detail]) => (
                <div key={name} className="flex items-center gap-4">
                  <div className="flex flex-1 flex-col gap-[5px]">
                    <span className="text-[8px] uppercase text-(--l-gold)">{kind}</span>
                    <span className="text-[12px] font-medium text-(--l-ink)">{name}</span>
                    <span className="text-[10px] text-(--l-ink-soft)">{detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </Illustration>
        </div>
      </section>

      {/* ── Discovery ────────────────────────────────────────────────── */}
      <section className="bg-(--l-maroon)">
        <div className={`${wrap} flex flex-col gap-14 py-20 lg:flex-row lg:items-center lg:gap-[100px] lg:py-24`}>
          <div className="relative lg:h-[470px] lg:w-[590px] lg:shrink-0">
            <Photo
              name="garden-ceremony"
              alt="A garden wedding ceremony under a floral mandap, guests seated on the lawn"
              className="h-[320px] w-full rounded-lg lg:h-[420px] lg:w-[500px]"
            />
            <div className="relative -mt-20 ml-6 flex flex-col gap-[18px] rounded-lg bg-(--l-paper) p-[26px] shadow-(--l-shadow) sm:ml-24 lg:absolute lg:left-[180px] lg:top-[248px] lg:m-0 lg:w-[410px]">
              <p className="text-[9px] uppercase text-(--l-gold)">An illustrative client brief</p>
              <p className="l-serif text-[30px] leading-[1.1] text-(--l-maroon)">A wedding that feels like home.</p>
              <p className="text-[12px] leading-[1.7] text-(--l-ink-soft)">
                New Jersey · 200 guests
                <br />
                Regional catering · Family traditions
                <br />
                Garden ceremony &amp; evening reception
              </p>
              <p className="text-[11px] text-(--l-maroon)">Your offering, with the right context.</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-[26px]">
            <Eyebrow light>More than being seen</Eyebrow>
            <Display light lines={["Be discovered for", "what makes your", "work yours."]} />
            <Lede light>
              Connect your work with clients planning South Asian celebrations. A clear offering helps them understand
              how you could fit into their day — and their vendor team.
            </Lede>
            <Feature light title="Show up with purpose">
              Give clients the location, category and offering details they need to explore your work.
            </Feature>
            <Feature light title="From individual vendor to celebration team">
              Clients can discover your business while exploring vendors and comparing assembled teams.
            </Feature>
          </div>
        </div>
      </section>

      {/* ── Bookings ─────────────────────────────────────────────────── */}
      <section id="business-tools" className={`${wrap} flex scroll-mt-4 flex-col gap-11 py-20 lg:py-[104px]`}>
        <SectionIntro
          eyebrow="Your business, beautifully organized"
          lines={["Less scattered admin.", "A clearer view of what’s next."]}
          body="Keep your bookings and event details together. See who you’re working with, what’s planned and where each contract stands."
        />
        <Illustration caption="Illustrative vendor workspace · Sample bookings and contract terms">
          <WorkspaceHeader active="Bookings" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-[7px]">
              <span className="l-serif text-[30px] text-(--l-maroon) sm:text-[36px]">Your upcoming celebrations</span>
              <span className="text-[11px] text-(--l-ink-soft)">June 2027 · Bookings overview</span>
            </div>
            <span className="rounded-full bg-(--l-maroon) px-[18px] py-3 text-[11px] text-(--l-ground)">+ New booking</span>
          </div>
          <div className="flex flex-col gap-[30px] lg:flex-row">
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex justify-between px-[18px] py-2.5 text-[9px] uppercase text-(--l-ink-soft)">
                <span>Celebration</span>
                <span>Contract status</span>
              </div>
              {BOOKINGS.map((b) => (
                <div
                  key={b.who}
                  className={`flex items-center gap-[18px] rounded-md p-[18px] ${
                    b.selected ? "border border-(--l-line) bg-(--l-ground)" : "border-b border-(--l-line) bg-(--l-paper)"
                  }`}
                >
                  <div className="flex w-[42px] shrink-0 flex-col items-center gap-[3px]">
                    <span className="text-[9px] text-(--l-gold)">JUN</span>
                    <span className="l-serif text-[32px] leading-none text-(--l-maroon)">{b.day}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-(--l-ink)">{b.who}</span>
                    <span className="text-[11px] text-(--l-ink-soft)">{b.what}</span>
                    <span className="text-[10px] text-(--l-ink-soft)">{b.where}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-[11px] py-[7px] text-[10px] ${b.tone}`}>{b.status}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-5 rounded-lg bg-(--l-ground) p-6 lg:w-[354px] lg:shrink-0">
              <span className="text-[9px] uppercase text-(--l-gold)">Booking details</span>
              <span className="l-serif text-[31px] leading-none text-(--l-maroon)">Ananya &amp; Rohan</span>
              <p className="text-[12px] leading-[1.8] text-(--l-ink-soft)">
                Wedding reception · June 14, 2027
                <br />
                200 guests · New Jersey
                <br />
                Regional wedding catering
              </p>
              <dl className="flex flex-col gap-3.5 border-t border-(--l-line) pt-[18px] text-[11px]">
                {[
                  ["Contract", "Signed by both parties"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-(--l-ink-soft)">{label}</dt>
                    <dd className="text-(--l-ink)">{value}</dd>
                  </div>
                ))}
              </dl>
              <span className="text-[12px] text-(--l-maroon) underline underline-offset-4">View booking contract →</span>
            </div>
          </div>
        </Illustration>
      </section>

      {/* ── Contracts ────────────────────────────────────────────────── */}
      <section className="bg-(--l-paper)">
        <div className={`${wrap} flex flex-col gap-14 py-20 lg:flex-row lg:items-center lg:gap-[90px] lg:py-[104px]`}>
          <div className="lg:w-[700px] lg:shrink-0">
            <Illustration tone="blush" caption="Illustrative contract editor · Sample services and terms">
              <WorkspaceHeader active="Contracts" />
              <div className="flex items-center justify-between gap-4">
                <span className="l-serif text-[28px] text-(--l-maroon) sm:text-[32px]">Wedding catering agreement</span>
                <span className="rounded-full bg-(--l-ground) px-[11px] py-[7px] text-[10px] text-(--l-maroon)">Draft</span>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  ["Business", "Saffron & Silk"],
                  ["Client", "Ananya & Rohan"],
                  ["Celebration", "June 14, 2027 · Wedding reception · 200 guests"],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-[7px]">
                    <span className="text-[8px] uppercase text-(--l-gold)">{label}</span>
                    <span className="rounded-[5px] border border-(--l-line) p-3 text-[11px] text-(--l-ink)">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-[8px] uppercase text-(--l-gold)">Services &amp; products</span>
                <div className="flex flex-col gap-1.5 border-y border-(--l-line) py-3">
                  <span className="text-[12px] font-medium text-(--l-ink)">Regional wedding catering</span>
                  <span className="text-[10px] text-(--l-ink-soft)">200 guests · Menu &amp; service as agreed</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[8px] uppercase text-(--l-gold)">Deposit terms</span>
                <span className="text-[11px] leading-[1.7] text-(--l-ink-soft)">
                  Deposit after both parties sign. The rest due May 31, 2027, as agreed in this contract.
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-(--l-maroon)">Save draft</span>
                <span className="rounded-full bg-(--l-maroon) px-[18px] py-3 text-[11px] text-(--l-ground)">Review contract ↗</span>
              </div>
            </Illustration>
          </div>
          <div className="flex flex-1 flex-col gap-[26px]">
            <Eyebrow>Clear terms. A thoughtful start.</Eyebrow>
            <Display lines={["Your work deserves", "a clear agreement."]} />
            <Lede>
              Create and manage contracts for your bookings. Put the scope, price and deposit in writing, so you and your
              client know exactly what’s agreed.
            </Lede>
            <Feature title="Create the agreement">
              Set out the celebration details, services and products included in the booking.
            </Feature>
            <Feature title="Make prices and deposits explicit">
              Agree on the amount and deposit terms with your client before payment.
            </Feature>
            <Feature title="Keep the signed version close">
              Manage draft and signed contracts alongside the booking they belong to.
            </Feature>
            <p className="l-serif text-[28px] italic leading-[1.15] text-(--l-maroon)">Agree first. Sign first. Then pay.</p>
          </div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────── */}
      <section className={`${wrap} flex flex-col gap-12 py-20 lg:py-24`}>
        <SectionIntro
          eyebrow="From your first hello to the event itself"
          lines={["One home for the work", "behind the celebration."]}
          body="A considered way to present your business and keep the next steps organized, without losing the personal touch."
        />
        <Steps
          steps={[
            {
              title: "Make it yours",
              body: "Create your storefront. Add a portfolio, your services and products, and the details that help clients understand your business.",
            },
            {
              title: "Find your fit",
              body: "Be part of vendor discovery and team comparisons. Discuss the celebration and shape an offering that fits the client’s needs.",
            },
            {
              title: "Bring it together",
              body: "Manage the booking, create the contract and agree on the price and deposit. Keep the signed terms with the event.",
            },
          ]}
        />
      </section>

      <Questions
        lines={["Your business.", "Your questions."]}
        body="A little more detail about bringing your event business to Jorna."
        items={FAQ}
      />

      {/* ── Closing ──────────────────────────────────────────────────── */}
      <section className="bg-(--l-maroon)">
        <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
          <div className="flex flex-col items-start gap-[26px] px-(--l-pad) py-16 lg:w-[800px] lg:shrink-0 lg:py-[76px]">
            <Eyebrow light>For the people who make it happen</Eyebrow>
            <Display light size="lg" lines={["Make room for", "your next chapter."]} />
            <Lede light>
              Show the work you’re proud of. Connect with clients. Bring your bookings and contracts into one home.
            </Lede>
            <PillLink href={join} tone="cream">
              Create your vendor storefront
            </PillLink>
          </div>
          <Photo
            name="candlelit-florals"
            alt="A candlelit reception table set with flowers"
            className="h-[420px] w-full lg:h-auto lg:min-h-[590px] lg:min-w-0 lg:flex-1"
          />
        </div>
      </section>

      <LandingFooter
        tagline="Your celebration, brought together."
        groups={[
          {
            title: "Your business",
            links: [
              { label: "Your storefront", href: "#storefront" },
              { label: "Bookings overview", href: "#business-tools" },
              { label: "Create contracts", href: join },
            ],
          },
          {
            title: "Explore Jorna",
            links: [
              { label: "For clients", href: "/for-clients" },
              { label: "About us", href: "/help/" },
            ],
          },
          { title: "The essentials", links: [{ label: "Help & FAQs", href: "/help/" }] },
        ]}
      />
    </LandingShell>
  );
}
