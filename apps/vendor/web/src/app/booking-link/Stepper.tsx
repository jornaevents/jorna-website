"use client";

// Where the client is in the link's steps (lib/linkSteps). Steps already
// done can be revisited; later ones open only by finishing this one —
// except in the vendor's preview, where nothing is saved and every step is
// there to look at.

import type { LinkStep } from "@/lib/linkSteps";

export function Stepper({
  steps,
  current,
  onPick,
  openAll,
}: {
  steps: { key: LinkStep; label: string }[];
  current: LinkStep;
  onPick: (step: LinkStep) => void;
  openAll?: boolean;
}) {
  const at = steps.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Steps" className="mt-6">
      <ol className="flex items-center gap-1.5">
        {steps.map((s, i) => {
          const done = i < at;
          const here = i === at;
          const open = done || (openAll && !here);
          const dot = (
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold ${
                here
                  ? "bg-maroon text-white dark:bg-gold dark:text-ground"
                  : done
                    ? "bg-gold/20 text-gold"
                    : "bg-ground-2 text-ink-faint"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
          );
          const label = (
            <span className={`truncate text-xs ${here ? "font-semibold text-ink" : "text-ink-faint"}`}>{s.label}</span>
          );
          return (
            <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1.5">
              {open ? (
                <button
                  type="button"
                  onClick={() => onPick(s.key)}
                  className="flex min-w-0 items-center gap-1.5 hover:underline"
                >
                  {dot}
                  {label}
                </button>
              ) : (
                <span aria-current={here ? "step" : undefined} className="flex min-w-0 items-center gap-1.5">
                  {dot}
                  {label}
                </span>
              )}
              {i < steps.length - 1 ? <span aria-hidden="true" className="h-px min-w-2 flex-1 bg-line" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
