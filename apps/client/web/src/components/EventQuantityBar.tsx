"use client";

import { Field } from "@jorna/shared/components/ui";
import type { EventInputs } from "@/lib/eventQuantity";

/**
 * "Your event": the quantities a per-person, per-day, per-hour or per-performer
 * price multiplies by. Every field is optional. Performers is rare (dance
 * troupes, dhol groups), so the caller shows it only when something on the page
 * is priced that way.
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
  return (
    <section aria-label="Your event" className="mt-4 rounded-2xl border border-card-edge bg-panel p-4">
      <p className="text-sm text-ink-soft">
        <strong className="text-ink">Your event</strong> · {hint}
      </p>
      <div className={`mt-3 grid grid-cols-2 gap-3 ${performers ? "sm:grid-cols-4" : "sm:grid-cols-3"} sm:max-w-2xl`}>
        <Field label="Guests" type="number" inputMode="numeric" min={1} max={5000} step={1} placeholder="e.g. 200" value={value.guests} onChange={set("guests")} />
        <Field label="Days" type="number" inputMode="numeric" min={1} max={60} step={1} placeholder="e.g. 2" value={value.days} onChange={set("days")} />
        <Field label="Hours" type="number" inputMode="decimal" min={0.5} max={24} step={0.5} placeholder="e.g. 6" value={value.hours} onChange={set("hours")} />
        {performers ? (
          <Field label="Performers" type="number" inputMode="numeric" min={1} max={100} step={1} placeholder="e.g. 4" value={value.performers} onChange={set("performers")} />
        ) : null}
      </div>
    </section>
  );
}
