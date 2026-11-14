// Small pieces of the Jorna-Client design that several redesigned pages share
// (client redesign, from PR 2): the pill badge and the thin progress bar.
// Colours come from the shared tokens, so they follow the theme.

import type { ReactNode } from "react";

export type Tone = "gold" | "green" | "maroon" | "neutral";

const TONES: Record<Tone, string> = {
  gold: "bg-[#f5e7bd] text-[#5e420a]",
  green: "bg-green/[0.13] text-green",
  maroon: "bg-maroon/10 text-maroon",
  neutral: "bg-ink-soft/10 text-ink-soft",
};

export function Badge({ children, tone = "gold" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex w-max shrink-0 items-center gap-1.5 rounded-full px-[9px] py-[5px] text-[0.72rem] font-bold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** `value` of `max`, as a 5px bar. An empty track when there's nothing to count. */
export function MiniProgress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-[5px] w-full rounded-full bg-panel">
      <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
    </div>
  );
}
