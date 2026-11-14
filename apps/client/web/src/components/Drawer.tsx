"use client";

// A panel that slides over the page from the right (the Jorna-Client design's
// drawers: a vendor in an event, editing an event). On a phone it's the full
// width. Closes on Escape or a click outside (useOverlay locks the page behind
// it and keeps focus inside).

import type { ReactNode } from "react";
import { useOverlay } from "@jorna/shared/components/useOverlay";

export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useOverlay<HTMLElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[460px] overflow-y-auto bg-ground p-6 outline-none shadow-[0_0_60px_rgba(67,27,24,0.25)]"
      >
        <button type="button" onClick={onClose} className="mb-4 text-sm font-semibold text-ink-soft hover:text-ink">
          Close
        </button>
        {children}
      </aside>
    </div>
  );
}
