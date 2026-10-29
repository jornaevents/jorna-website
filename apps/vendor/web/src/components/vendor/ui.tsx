"use client";

// The vendor app's shared pieces, from the Figma Make design: page header,
// stat tile, status pill, filter tabs, list table and side drawer. Colours
// come from the --color-* / --pill-* tokens vendor-shell.css defines, so each
// piece has a dark variant without its own dark: classes. Cards are
// @jorna/shared's Card — the shell's tokens already give it the design's
// hairline edge and soft shadow.

import Link from "next/link";
import type { ReactNode } from "react";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { Icon, type IconName } from "@/components/vendor/Icon";

// ── Page header ──────────────────────────────────────────────────────

export const primaryClass =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-[11px] bg-maroon px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(91,27,43,0.2)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** The one primary button a page header carries ("New contract", "New lead", …). */
export function PrimaryAction({
  href,
  onClick,
  children,
  icon = "plus",
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  icon?: IconName;
}) {
  const body = (
    <>
      <Icon name={icon} size={16} />
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={primaryClass}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={primaryClass}>
      {body}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="serif mt-1 text-[1.7rem] leading-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-faint">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

// ── Status pill ──────────────────────────────────────────────────────

export type Tone = "green" | "amber" | "grey" | "red" | "maroon";

const toneStyle = (tone: Tone) => ({
  color: `var(--pill-${tone}-ink)`,
  background: `var(--pill-${tone}-bg)`,
});

/** Booking/contract/lead state. `dot` adds the design's leading dot (Leads' labels). */
export function StatusPill({ tone, dot, children }: { tone: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      style={toneStyle(tone)}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-bold"
    >
      {dot ? <i aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────

export function StatTile({
  icon,
  tone = "grey",
  label,
  value,
  note,
  href,
}: {
  icon?: IconName;
  tone?: Tone;
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      {icon ? (
        <span style={toneStyle(tone)} className="grid size-10 shrink-0 place-items-center rounded-xl">
          <Icon name={icon} />
        </span>
      ) : null}
      <span className="grid min-w-0">
        <small className="text-xs font-semibold text-ink-faint">{label}</small>
        <strong className="serif mt-0.5 text-[1.6rem] leading-none text-ink">{value}</strong>
      </span>
      {note ? <span className="ml-auto text-right text-xs text-ink-faint">{note}</span> : null}
    </>
  );
  const cls =
    "flex min-h-[6.5rem] items-center gap-3.5 rounded-[15px] border border-card-edge bg-card px-5 py-4 shadow-[var(--shadow-card)]";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-line`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ── Filter tabs ──────────────────────────────────────────────────────

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Booking stage"). */
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-0.5 overflow-x-auto rounded-[9px] bg-panel p-[3px]">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-xs font-semibold transition sm:flex-none ${
              selected ? "bg-card text-ink shadow-[0_2px_7px_rgba(45,40,35,0.07)] ring-1 ring-card-edge" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-[5px] bg-ink/[0.06] px-1 text-[0.65rem]">
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── List table ───────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** A CSS grid track for this column, e.g. "minmax(160px,1.4fr)" or "auto". */
  width: string;
  /** Hide below this breakpoint; the design drops detail columns as it narrows. */
  hideBelow?: "sm" | "md" | "lg";
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
};

/**
 * The design's tables are rows on a grid, not <table>s: each row is one
 * clickable target, and narrow screens drop whole columns. Columns hidden at a
 * breakpoint also leave the grid template there, via one template per
 * breakpoint built from the same column list.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  onRowClick,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  const template = (bp: "base" | "sm" | "md" | "lg") => {
    const order = ["sm", "md", "lg"];
    return columns
      .filter((c) => !c.hideBelow || (bp !== "base" && order.indexOf(bp) >= order.indexOf(c.hideBelow)))
      .map((c) => c.width)
      .join(" ");
  };
  const style = {
    "--cols": template("base"),
    "--cols-sm": template("sm"),
    "--cols-md": template("md"),
    "--cols-lg": template("lg"),
  } as React.CSSProperties;
  const grid =
    "grid items-center gap-3.5 [grid-template-columns:var(--cols)] sm:[grid-template-columns:var(--cols-sm)] md:[grid-template-columns:var(--cols-md)] lg:[grid-template-columns:var(--cols-lg)]";

  if (rows.length === 0) {
    return <p className="py-14 text-center text-sm text-ink-faint">{empty ?? "Nothing here yet."}</p>;
  }

  return (
    <div style={style}>
      <div
        className={`${grid} px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-ink-faint`}
        aria-hidden="true"
      >
        {columns.map((c) => (
          <span key={c.key} className={c.hideBelow ? HIDE[c.hideBelow] : undefined}>
            {c.header}
          </span>
        ))}
      </div>
      <ul>
        {rows.map((row) => {
          const cells = columns.map((c) => (
            <span key={c.key} className={`min-w-0 ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}>
              {c.cell(row)}
            </span>
          ));
          const cls = `${grid} w-full border-t border-line-soft px-3 py-3 text-left text-sm text-ink-soft transition hover:bg-panel/50`;
          const href = rowHref?.(row);
          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className={cls}>
                  {cells}
                </Link>
              ) : onRowClick ? (
                <button type="button" onClick={() => onRowClick(row)} className={cls}>
                  {cells}
                </button>
              ) : (
                <div className={cls}>{cells}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────

/**
 * A panel that slides in from the right over the page — a lead's details and
 * actions. Full-screen on a phone. Not portalled: it renders inside
 * .vendor-shell so it keeps the shell's tokens and fonts.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useOverlay<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-[#2a0c19]/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-ground shadow-[-20px_0_60px_rgba(42,12,25,0.18)] outline-none sm:w-[min(32rem,100%)] sm:border-l sm:border-card-edge"
      >
        <div className="flex items-start gap-3 border-b border-line-soft px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 className="serif text-xl text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-[10px] border border-line text-ink-soft transition hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-line-soft px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
