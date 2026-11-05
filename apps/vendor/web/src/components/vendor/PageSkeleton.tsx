// A vendor page's shape while its data loads, in place of a bare "Loading…".
// The real header shows at once — its words don't depend on the data, and
// each page passes the same HEADER it renders with, so the two can't drift —
// and the body is placeholders the size of what's coming, so nothing jumps
// when it lands. Built from the same measurements as components/vendor/ui
// (StatTile, the list cards) and OverviewSkeleton.

import type { ReactNode } from "react";
import { PageHeader } from "@/components/vendor/ui";

export interface PageHeading {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export function PageSkeleton({
  heading,
  label,
  className,
  children,
}: {
  heading: PageHeading;
  /** What a screen reader hears, e.g. "Loading your bookings…". */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <PageHeader {...heading} />
      <SkeletonBody label={label}>{children}</SkeletonBody>
    </div>
  );
}

/** Placeholders announced once, as one status, and hidden from the tree. */
export function SkeletonBody({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function Bar({ className }: { className: string }) {
  return <div className={`rounded-full bg-line-soft ${className}`} />;
}

/** The row of StatTiles at the top of Leads and Bookings. */
export function SkeletonTiles({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex min-h-[6.5rem] items-center gap-3.5 rounded-[15px] border border-card-edge bg-card px-5 py-4 shadow-[var(--shadow-card)]"
        >
          <div className="size-10 shrink-0 rounded-xl bg-line" />
          <div className="grid gap-2">
            <Bar className="h-3 w-20" />
            <div className="h-6 w-10 rounded-md bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A list card: its eyebrow, title and filter tabs, then rows. */
export function SkeletonList({ rows = 5, className = "mt-4" }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)] ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="grid gap-2">
          <Bar className="h-2.5 w-20" />
          <div className="h-5 w-36 rounded-md bg-line" />
        </div>
        <div className="h-9 w-64 max-w-full rounded-full bg-line-soft" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-line-soft py-4">
          <div className="size-9 shrink-0 rounded-full bg-line" />
          <div className="grid min-w-0 flex-1 gap-2">
            <Bar className="h-3.5 w-1/3" />
            <Bar className="h-3 w-1/2" />
          </div>
          <div className="hidden h-6 w-20 rounded-full bg-line-soft sm:block" />
        </div>
      ))}
    </div>
  );
}

/** A plain card with a heading and a few lines. */
export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)] ${className}`}>
      <div className="h-5 w-40 rounded-md bg-line" />
      <div className="mt-4 grid gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} className={`h-3.5 ${["w-3/4", "w-2/3", "w-1/2", "w-3/5"][i % 4]}`} />
        ))}
      </div>
    </div>
  );
}
