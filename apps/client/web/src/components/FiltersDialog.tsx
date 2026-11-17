"use client";

// Explore's filters, in a dialog rather than a panel that pushed the results
// down the page. Centered on a wide screen, a sheet from the bottom on a phone.
// Every control applies as it changes — the results behind it update live —
// so the footer button only closes, and says how many vendors it's showing.

import type { ReactNode } from "react";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { Button } from "@jorna/shared/components/ui";

export function FiltersDialog({
  count,
  loading,
  canClear,
  onClear,
  onClose,
  children,
}: {
  count: number;
  loading: boolean;
  canClear: boolean;
  onClear: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useOverlay<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-ground outline-none shadow-[0_0_60px_rgba(67,27,24,0.25)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Filters</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-soft hover:text-ink">
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <Button variant="quiet" onClick={onClear} disabled={!canClear}>
            Clear all
          </Button>
          <Button onClick={onClose}>
            {loading ? "Searching…" : count === 1 ? "Show 1 vendor" : `Show ${count} vendors`}
          </Button>
        </div>
      </div>
    </div>
  );
}
