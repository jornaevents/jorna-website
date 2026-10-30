// The entry flow's shared pieces — Get started, vendor sign-in/sign-up and
// onboarding — from the Figma Make "Jorna-Vendor" file (EntryFlow.tsx). Colors
// and type come from app/entry.css's .entry scope. These screens draw their own
// top bar, so ChromeGate hides SiteHeader/SiteFooter on their routes.

import Link from "next/link";
import type { ReactNode } from "react";
import { dmSans, manrope } from "@/lib/vendorFonts";
import { JornaMark } from "@/components/JornaMark";
import "@/app/entry.css";

export type FlowIconName =
  | "arrow"
  | "calendar"
  | "check"
  | "contract"
  | "heart"
  | "package"
  | "payments"
  | "search"
  | "sparkles"
  | "storefront"
  | "upload";

const PATHS: Record<FlowIconName, ReactNode> = {
  arrow: <path d="m9 18 6-6-6-6" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  contract: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h5" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z" />
  ),
  package: <path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10" />,
  payments: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  sparkles: (
    <path d="m12 3-1.2 3.2L8 7.5l2.8 1.3L12 12l1.2-3.2L16 7.5l-2.8-1.3zM5.5 13l-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8zM18 14l-.9 2.6-2.6.9 2.6.9L18 21l.9-2.6 2.6-.9-2.6-.9z" />
  ),
  storefront: (
    <>
      <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
      <path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M8 20v-5h8v5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 14v5h14v-5" />
    </>
  ),
};

export function FlowIcon({ name, size = 20 }: { name: FlowIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The app icon's mark, then the wordmark. Links home. */
export function JornaLogo() {
  return (
    <Link href="/" aria-label="Jorna home" className="flex items-center gap-2.5 text-(--e-burgundy)">
      <JornaMark className="h-9" />
      <strong className="e-ui text-[21px] tracking-[-0.04em]">Jorna</strong>
    </Link>
  );
}

/** Every entry screen: the scope, its fonts, and a top bar with the logo. */
export function EntryShell({ topRight, children }: { topRight?: ReactNode; children: ReactNode }) {
  return (
    <div className={`entry ${dmSans.variable} ${manrope.variable} flex flex-col`}>
      <header className="flex min-h-[70px] items-center justify-between gap-4 border-b border-(--e-line) bg-(--e-paper)/90 px-4 py-3 sm:px-7">
        <JornaLogo />
        {topRight}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

const BUTTON =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[11px] px-5 text-[14px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45";
export const primaryButton = `${BUTTON} bg-(--e-burgundy) text-white shadow-[0_8px_18px_rgba(100,31,52,.18)] enabled:hover:-translate-y-px enabled:hover:shadow-[0_11px_24px_rgba(100,31,52,.24)]`;
export const secondaryButton = `${BUTTON} border border-[#d7cec2] bg-(--e-paper) text-(--e-burgundy) hover:border-[#baa985] hover:bg-[#fffaf0]`;
export const textButton = "text-[14px] font-bold text-(--e-burgundy) hover:underline underline-offset-2";

/** A labelled field: label above, control (passed in) below, then an optional hint. */
export function EntryField({
  label,
  optional = false,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-[#625b55]">
        {label}
        {optional ? <span className="font-medium text-(--e-muted)"> (optional)</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-(--e-muted)">{hint}</p> : null}
    </div>
  );
}

/** An input with a fixed prefix in its own cell — "@" for handles, "$" for prices. */
export function Prefixed({ prefix, children }: { prefix: string; children: ReactNode }) {
  return (
    <div className="e-input flex !p-0 items-stretch overflow-hidden">
      <span className="grid place-items-center border-r border-[#e6ded4] bg-[#faf7f2] px-3 text-[15px] text-[#7a7169]">
        {prefix}
      </span>
      {children}
    </div>
  );
}

/** A selectable pill (services, event types). */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition ${
        selected
          ? "border-[#b78a36] bg-[#f8edcf] text-[#704f12]"
          : "border-[#ddd4c9] bg-[#fbfaf7] text-[#6f6861] hover:border-[#cdb87a]"
      }`}
    >
      {selected ? <FlowIcon name="check" size={13} /> : null}
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-[#fbe9e7] px-3 py-2 text-[13px] font-semibold text-[#9b3c37]">
      {children}
    </p>
  );
}
