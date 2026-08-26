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

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
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

/** Round-hour options for a time field, e.g. under a "Start time" input. Purely
    a shortcut — clicking one fills the field, but nothing is set until the
    client actually picks a time, so an unanswered field stays unanswered. */
const ROUND_TIMES = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];

export function roundTimeLabel(t: string) {
  const hour24 = Number(t.slice(0, 2));
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${suffix}`;
}

export function TimeQuickPicks({
  value,
  onPick,
}: {
  value: string;
  onPick: (time: string) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {ROUND_TIMES.map((t) => (
        <Chip key={t} active={value === t} onClick={() => onPick(t)}>
          {roundTimeLabel(t)}
        </Chip>
      ))}
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
