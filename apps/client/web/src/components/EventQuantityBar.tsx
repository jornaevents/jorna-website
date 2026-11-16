"use client";

import type { EventInputs } from "@/lib/eventQuantity";

/**
 * "Your event": the quantities a per-person, per-day, per-hour or per-performer
 * price multiplies by. Every field is optional. Performers is rare (dance
 * troupes, dhol groups), so the caller shows it only when something on the page
 * is priced that way.
 *
 * Styled after the Jorna-Client design's search panel: one white card, small
 * labels over borderless inputs, cells split by hairlines. The hairlines are
 * the grid's own background showing through a 1px gap, so they stay right
 * whether the cells sit in one row (laptop) or two (phone).
 */
export function EventQuantityBar({
  value,
  onChange,
  showPerformers,
  hint = "Fill in what you know and prices show the estimated total.",
}: {
  value: EventInputs;
  onChange: (next: EventInputs) => void;
  showPerformers: boolean;
  hint?: string;
}) {
  const set = (key: keyof EventInputs) => (e: { target: { value: string } }) =>
    onChange({ ...value, [key]: e.target.value });
  const performers = showPerformers || value.performers !== "";
  const filled = Object.values(value).some((v) => v !== "");
  return (
    <section aria-label="Your event" className="mt-4 rounded-2xl bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-bold text-ink">Your event</p>
          <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>
        </div>
        {filled ? (
          <button
            type="button"
            onClick={() => onChange({ guests: "", days: "", hours: "", performers: "" })}
            className="shrink-0 text-sm font-semibold text-gold hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div
        className={`mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line ${
          performers ? "sm:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        <Cell label="Guests" unit="guests" min={1} max={5000} step={1} placeholder="200" value={value.guests} onChange={set("guests")} />
        <Cell label="Days" unit="days" min={1} max={60} step={1} placeholder="2" value={value.days} onChange={set("days")} />
        {/* Three cells on a two-column phone grid: the third takes the row. */}
        <Cell label="Hours" unit="hrs" wide={!performers} decimal min={0.5} max={24} step={0.5} placeholder="6" value={value.hours} onChange={set("hours")} />
        {performers ? (
          <Cell label="Performers" unit="people" min={1} max={100} step={1} placeholder="4" value={value.performers} onChange={set("performers")} />
        ) : null}
      </div>
    </section>
  );
}

function Cell({
  label,
  unit,
  decimal,
  wide,
  value,
  onChange,
  ...rest
}: {
  label: string;
  unit: string;
  decimal?: boolean;
  wide?: boolean;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  min: number;
  max: number;
  step: number;
  placeholder: string;
}) {
  return (
    <label className={`group grid ${wide ? "col-span-2 sm:col-span-1" : ""} cursor-text gap-1 bg-card px-4 py-3 transition-colors focus-within:bg-ground-2`}>
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-soft group-focus-within:text-gold">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <input
          type="number"
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={onChange}
          {...rest}
          className="w-full min-w-0 bg-transparent text-lg font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="shrink-0 text-sm text-ink-soft">{unit}</span>
      </span>
    </label>
  );
}
