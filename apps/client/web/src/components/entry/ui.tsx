// The entry screens' pieces, from the vendor app's components/entry/ui.tsx —
// the site's one sign-in page and the vendor sign-up — so this app's sign-up
// looks like the page a client signs in on. Only what the sign-up uses; keep
// in step with the vendor app's copy. Colors and type are app/entry.css's.
// These screens draw their own top bar, so ChromeGate hides SiteHeader and
// SiteFooter on their routes.

import type { ReactNode } from "react";
import { dmSans, manrope } from "@/lib/entryFonts";
import { vendorSiteUrl } from "@/lib/vendorSite";
import "@/app/entry.css";

/** The app icon's mark, then the wordmark. Links to the site's front door —
 *  in the vendor app, so a plain link. */
export function JornaLogo() {
  return (
    <a href={vendorSiteUrl("/")} aria-label="Jorna home" className="flex items-center gap-2.5 text-(--e-burgundy)">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export; basePath isn't applied to a plain <img>, hence /client */}
      <img
        src="/client/img/jorna-mark-96.png"
        srcSet="/client/img/jorna-mark-192.png 2x"
        alt=""
        width={116}
        height={96}
        className="h-9 w-auto shrink-0"
      />
      <strong className="e-ui text-[21px] tracking-[-0.04em]">Jorna</strong>
    </a>
  );
}

/** Every entry screen: the scope, its fonts, and a top bar with the logo. */
export function EntryShell({ children }: { children: ReactNode }) {
  return (
    <div className={`entry ${dmSans.variable} ${manrope.variable} flex flex-col`}>
      <header className="flex min-h-[70px] items-center justify-between gap-4 border-b border-(--e-line) bg-(--e-paper)/90 px-4 py-3 sm:px-7">
        <JornaLogo />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

const BUTTON =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[11px] px-5 text-[14px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45";
export const primaryButton = `${BUTTON} bg-(--e-burgundy) text-white shadow-[0_8px_18px_rgba(100,31,52,.18)] enabled:hover:-translate-y-px enabled:hover:shadow-[0_11px_24px_rgba(100,31,52,.24)]`;
export const textButton = "text-[14px] font-bold text-(--e-burgundy) hover:underline underline-offset-2";

/** A labelled field: label above, control (passed in) below, then an optional hint. */
export function EntryField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-[#625b55]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-(--e-muted)">{hint}</p> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-[#fbe9e7] px-3 py-2 text-[13px] font-semibold text-[#9b3c37]">
      {children}
    </p>
  );
}
