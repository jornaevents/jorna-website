"use client";

import Link from "next/link";
import { useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "quiet";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const sizes = { md: "px-5 py-2.5 text-[0.95rem]", lg: "px-7 py-3.5 text-base" };

const variants: Record<Variant, string> = {
  primary:
    "bg-maroon text-ground shadow-[0_10px_24px_-12px_rgba(107,18,38,0.7)] hover:brightness-110",
  ghost:
    "border border-card-edge text-ink hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
  quiet: "text-ink-soft hover:text-ink",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: Variant;
  size?: keyof typeof sizes;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({
  className = "",
  id,
  children,
}: {
  className?: string;
  /** For a deep link to scroll straight to one card among many — see the
   *  booking rows on /bundle, which a conversation's offer link targets. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-card-edge bg-card shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  icon,
  ...rest
}: {
  /** Omit when the caller draws its own header — e.g. a label with a control
      beside it, which can't be nested in this <label> without the click
      landing on the input. */
  label?: string;
  hint?: string;
  icon?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  // The native calendar button is hidden (globals.css), so open the picker when
  // the field is clicked. showPicker() needs the click's user gesture; typing
  // still works if it's unsupported.
  const dateLike =
    rest.type === "date" ||
    rest.type === "time" ||
    rest.type === "datetime-local" ||
    rest.type === "month" ||
    rest.type === "week";

  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      ) : null}
      <span className="relative block">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
            {icon}
          </span>
        ) : null}
        <input
          className={`w-full rounded-xl border border-card-edge bg-ground-2 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
            icon ? "pl-10 pr-3.5" : "px-3.5"
          }`}
          {...rest}
          onClick={(e) => {
            if (dateLike) {
              const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
              try {
                el.showPicker?.();
              } catch {
                /* not supported / not allowed — typing still works */
              }
            }
            rest.onClick?.(e);
          }}
        />
      </span>
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

/** Compact star rating, e.g. ★ 4.9. Renders nothing for an unrated item. */
export function Stars({ rating, className = "" }: { rating?: number | null; className?: string }) {
  if (!rating || rating <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-gold ${className}`}>
      <span aria-hidden="true">★</span>
      <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
    </span>
  );
}

/** A circular avatar: the photo when there is one, else a serif monogram. */
export function Avatar({
  src,
  name,
  size = 40,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  // Resets the failure if `src` itself changes (e.g. right after uploading a
  // new photo over an instance that already gave up on the old one) — a
  // stale `failed` would otherwise hide a perfectly good new image forever.
  const [checkedSrc, setCheckedSrc] = useState(src);
  if (src !== checkedSrc) {
    setCheckedSrc(src);
    setFailed(false);
  }
  const initial = (name?.trim()?.[0] ?? "·").toUpperCase();
  const dim = { width: size, height: size };
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        style={dim}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover ring-1 ring-card-edge"
      />
    );
  }
  return (
    <span
      style={dim}
      className="grid shrink-0 place-items-center rounded-full bg-panel serif text-gold ring-1 ring-card-edge"
    >
      {initial}
    </span>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 py-1.5 text-sm transition ${
        active
          ? "border-gold bg-gold/15 text-maroon dark:text-gold"
          : "border-card-edge bg-ground-2 text-ink-soft hover:border-gold/50"
      }`}
    >
      {children}
    </button>
  );
}

export function roundTimeLabel(t: string) {
  const hour24 = Number(t.slice(0, 2));
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${suffix}`;
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ["00", "15", "30", "45"];
type Meridiem = "AM" | "PM";

/** "" reads as noon — the picker's resting position, not an answer. Nothing is
    sent to `onChange` until the client actually moves one of the three
    controls, so an untouched field stays unanswered (see the empty-string
    contract this shares with the plain date input above it). */
function parseTime(value: string): { hour12: number; minute: string; meridiem: Meridiem } {
  if (!value) return { hour12: 12, minute: "00", meridiem: "AM" };
  const [hStr, mStr] = value.split(":");
  const hour24 = Number(hStr);
  const meridiem: Meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  // A value from before minutes were limited to quarter-hours (or one a
  // reschedule/negotiation set from the backend) snaps to the nearest step
  // for display rather than crashing on an option that doesn't exist.
  const minuteNum = Number(mStr);
  const minute = MINUTES.reduce((closest, m) =>
    Math.abs(Number(m) - minuteNum) < Math.abs(Number(closest) - minuteNum) ? m : closest,
  );
  return { hour12, minute, meridiem };
}

function formatTime(hour12: number, minute: string, meridiem: Meridiem): string {
  const hour24 = meridiem === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

/**
 * Hour + minute + AM/PM, replacing the native time input.
 *
 * A native `<input type="time">` has no way to say what it should show before
 * anyone's touched it — the browser decides, and the browser decides "right
 * now," landing on whatever minute the clock happens to be at. Almost nothing
 * on this site starts at :47. Three explicit controls fix the default at noon
 * instead, and let the client change only the part that's wrong (usually just
 * AM/PM) rather than re-entering a whole time.
 */
export function TimeField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { hour12, minute, meridiem } = parseTime(value);
  const selectClass =
    "rounded-xl border border-card-edge bg-ground-2 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";

  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      ) : null}
      <div className="flex items-center gap-1.5">
        <select
          aria-label={label ? `${label} — hour` : "Hour"}
          value={hour12}
          onChange={(e) => onChange(formatTime(Number(e.target.value), minute, meridiem))}
          className={`${selectClass} pl-3 pr-1.5`}
        >
          {HOURS_12.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-ink-faint">:</span>
        <select
          aria-label={label ? `${label} — minute` : "Minute"}
          value={minute}
          onChange={(e) => onChange(formatTime(hour12, e.target.value, meridiem))}
          className={`${selectClass} pl-3 pr-1.5`}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="ml-1 flex overflow-hidden rounded-xl border border-card-edge">
          {(["AM", "PM"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={meridiem === m}
              onClick={() => onChange(formatTime(hour12, minute, m))}
              className={`min-h-11 px-3.5 text-sm font-semibold transition ${
                meridiem === m
                  ? "bg-gold/15 text-maroon dark:text-gold"
                  : "bg-ground-2 text-ink-soft hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Rule() {
  return (
    <div className="mx-auto flex w-40 items-center gap-3">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold" />
      <span className="size-2 rotate-45 bg-gold" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold" />
    </div>
  );
}
