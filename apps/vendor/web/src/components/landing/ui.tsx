// The landing pages' shared pieces (Welcome, For clients, For vendors), from
// the Figma "Jorna — Welcome and choose your path" file. Colors and type come
// from app/landing.css's .landing scope; nothing here reads the app's own
// theme tokens, so these pages look the same in light and dark.
//
// They draw their own header and footer — each page's differ — so ChromeGate
// hides SiteHeader/SiteFooter on these routes (isLandingPath).

import Link from "next/link";
import type { ReactNode } from "react";
import { cormorant, inter } from "@/lib/landingFonts";
import "@/app/landing.css";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className={`landing ${cormorant.variable} ${inter.variable} flex min-h-dvh flex-col`}>{children}</div>
  );
}

/** Inner width: the design's 1440 frame with 80px sides, narrowing on phones. */
export const wrap = "mx-auto w-full max-w-[1440px] px-(--l-pad)";

/**
 * A link that can leave the app. next/link prefixes the "/app" basePath onto
 * every path, which is right for pages in this app and wrong for /help/ (a
 * static page beside it) — and an absolute URL to the client app needs no
 * client-side routing either.
 */
export function SmartLink({
  href,
  className,
  children,
  ...rest
}: { href: string; className?: string; children: ReactNode } & React.AriaAttributes) {
  if (href.startsWith("http") || href.startsWith("/help")) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** The design's ↗ arrow — two colors, one shape (public/img/landing). */
export function Arrow({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see home/page.tsx on why plain <img> + /app prefix
    <img
      src={`/app/img/landing/arrow-${light ? "light" : "dark"}.svg`}
      alt=""
      width={19.5}
      height={19.5}
      className={`size-[18px] shrink-0 ${className}`}
    />
  );
}

type PillTone = "maroon" | "outline" | "cream";

const PILL: Record<PillTone, string> = {
  maroon: "bg-(--l-maroon) text-(--l-ground) hover:bg-[#561623]",
  outline: "border border-(--l-line) text-(--l-maroon) hover:border-(--l-maroon)",
  cream: "bg-(--l-ground) text-(--l-maroon) hover:bg-white",
};

/** The design's pill button: label, then the ↗ arrow. */
export function PillLink({
  href,
  tone = "maroon",
  wide = false,
  children,
}: {
  href: string;
  tone?: PillTone;
  /** Full width with the arrow pushed to the far edge (the welcome cards). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <SmartLink
      href={href}
      className={`inline-flex min-h-[54px] items-center gap-6 rounded-full px-[26px] py-2.5 text-[14px] font-medium transition ${PILL[tone]} ${
        wide ? "w-full justify-between" : ""
      }`}
    >
      {children}
      <Arrow light={tone === "maroon"} />
    </SmartLink>
  );
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.02em] ${light ? "text-(--l-gold-pale)" : "text-(--l-gold)"}`}>
      {children}
    </p>
  );
}

/** A display heading whose line breaks are the design's, kept on wide screens. */
export function Display({
  lines,
  size = "md",
  light = false,
  as: Tag = "h2",
}: {
  lines: string[];
  size?: "md" | "lg" | "xl";
  light?: boolean;
  as?: "h1" | "h2";
}) {
  const scale = size === "xl" ? "l-display-xl" : size === "lg" ? "l-display-lg" : "l-display";
  return (
    <Tag className={`l-serif ${scale} font-medium ${light ? "text-(--l-ground)" : "text-(--l-maroon)"}`}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </Tag>
  );
}

export function Lede({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[15px] leading-[1.8] ${light ? "text-(--l-blush)" : "text-(--l-ink-soft)"}`}>{children}</p>
  );
}

/** A ✧ row: a short title and a line of detail. */
export function Feature({ title, children, light = false }: { title: string; children: ReactNode; light?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <span aria-hidden="true" className={`l-serif text-[24px] leading-none ${light ? "text-(--l-gold-pale)" : "text-(--l-gold)"}`}>
        ✧
      </span>
      <div className="flex flex-col gap-1.5">
        <p className={`text-[14px] font-medium ${light ? "text-(--l-ground)" : "text-(--l-ink)"}`}>{title}</p>
        <p className={`text-[13px] leading-[1.8] ${light ? "text-(--l-blush)" : "text-(--l-ink-soft)"}`}>{children}</p>
      </div>
    </div>
  );
}

/** A heading on the left and a short paragraph beside it, bottom-aligned. */
export function SectionIntro({
  eyebrow,
  lines,
  body,
  light = false,
  aside,
}: {
  eyebrow: string;
  lines: string[];
  body?: ReactNode;
  light?: boolean;
  /** Something other than a paragraph on the right (an action). */
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-[100px]">
      <div className="flex flex-col gap-5 lg:max-w-[760px] lg:shrink-0">
        <Eyebrow light={light}>{eyebrow}</Eyebrow>
        <Display lines={lines} light={light} />
      </div>
      {body ? (
        <div className="lg:max-w-[440px]">
          <Lede light={light}>{body}</Lede>
        </div>
      ) : null}
      {aside}
    </div>
  );
}

/** Three numbered steps with a hairline over each. */
export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-10 md:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-5 border-t border-(--l-line) pt-6">
          <span className="l-serif text-[34px] italic text-(--l-gold)">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="l-serif text-[30px] font-medium leading-[1.08] text-(--l-maroon) lg:text-[32px]">{step.title}</h3>
          <p className="text-[14px] leading-[1.8] text-(--l-ink-soft)">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** The FAQ: an intro on the left, every answer shown (the design has no toggles). */
export function Questions({
  lines,
  body,
  items,
}: {
  lines: string[];
  body: string;
  items: { q: string; a: string }[];
}) {
  return (
    <section className="bg-(--l-paper)">
      <div className={`${wrap} flex flex-col gap-12 py-20 lg:flex-row lg:gap-[100px] lg:py-[104px]`}>
        <div className="flex flex-col gap-6 lg:w-[410px] lg:shrink-0">
          <Eyebrow>A little clarity</Eyebrow>
          <Display lines={lines} />
          <Lede>{body}</Lede>
          <SmartLink href="/help/" className="text-[14px] text-(--l-maroon) underline underline-offset-4">
            More in our help pages →
          </SmartLink>
        </div>
        <dl className="flex-1">
          {items.map((item) => (
            <div key={item.q} className="flex flex-col gap-3 border-t border-(--l-line) py-[22px]">
              <dt className="text-[15px] font-medium text-(--l-ink)">{item.q}</dt>
              <dd className="text-[13px] leading-[1.8] text-(--l-ink-soft)">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** A full-bleed photo that fills its box (decorative unless given alt text). */
export function Photo({ name, alt = "", className = "" }: { name: string; alt?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see home/page.tsx on why plain <img> + /app prefix
    <img src={`/app/img/landing/${name}.jpg`} alt={alt} className={`object-cover ${className}`} loading="lazy" />
  );
}

export interface NavLink {
  label: string;
  href: string;
}

/** Each landing page's header: wordmark and audience, three links, sign in, one action. */
export function LandingNav({
  audience,
  links,
  signIn,
  action,
}: {
  audience: string;
  links: NavLink[];
  signIn: string;
  action: NavLink;
}) {
  return (
    <header className="border-b border-(--l-line)">
      <div className={`${wrap} flex min-h-[76px] items-center justify-between gap-6 py-3 lg:h-[100px]`}>
        <div className="flex items-center gap-5">
          <Link href="/" className="l-serif text-[34px] font-semibold text-(--l-maroon) lg:text-[42px]">
            Jorna
          </Link>
          <span className="hidden text-[10px] uppercase text-(--l-gold) sm:inline">{audience}</span>
        </div>
        <nav aria-label={audience} className="hidden items-center gap-[30px] text-[13px] text-(--l-ink) lg:flex">
          {links.map((link) => (
            <SmartLink key={link.label} href={link.href} className="transition hover:text-(--l-maroon)">
              {link.label}
            </SmartLink>
          ))}
        </nav>
        <div className="flex items-center gap-4 lg:gap-6">
          <SmartLink href={signIn} className="text-[13px] text-(--l-ink) transition hover:text-(--l-maroon)">
            Sign in
          </SmartLink>
          <span className="hidden sm:block">
            <PillLink href={action.href}>{action.label}</PillLink>
          </span>
        </div>
      </div>
    </header>
  );
}

/** The maroon footer: brand line, three link groups, sign-off. */
export function LandingFooter({
  tagline,
  groups,
}: {
  /** The line after "Rooted in tradition. Connected by joy." */
  tagline: string;
  groups: { title: string; links: NavLink[] }[];
}) {
  return (
    <footer className="mt-auto bg-(--l-maroon)">
      <div className={`${wrap} flex flex-col gap-12 pb-[30px] pt-[60px]`}>
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex flex-col gap-4 lg:w-[440px]">
            <p className="l-serif text-[48px] text-(--l-ground)">Jorna</p>
            <p className="max-w-[330px] text-[13px] leading-[1.8] text-(--l-blush)">
              Rooted in tradition. Connected by joy.
              <br />
              {tagline}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:contents">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-4 lg:pt-3">
                <p className="text-[11px] font-semibold text-(--l-gold-pale)">{group.title}</p>
                {group.links.map((link) => (
                  <SmartLink
                    key={link.label}
                    href={link.href}
                    className="text-[12px] text-(--l-blush) transition hover:text-(--l-ground)"
                  >
                    {link.label}
                  </SmartLink>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t-[0.5px] border-(--l-maroon-line) pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-(--l-blush)">© {new Date().getFullYear()} Jorna. Made for moments that matter.</p>
          <p className="l-serif text-[22px] italic text-(--l-gold-pale)">Let the celebrating begin.</p>
        </div>
      </div>
    </footer>
  );
}
