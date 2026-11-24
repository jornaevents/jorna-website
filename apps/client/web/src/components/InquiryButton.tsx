"use client";

import { useState } from "react";
import { Button, Card } from "@jorna/shared/components/ui";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { InquiryForm, type InquiryPrefill } from "@/components/InquiryForm";
import type { AgreedPrefill } from "@jorna/shared/lib/agreedInChat";

/** "Send an inquiry" on a vendor's page: the inquiry form in a sheet. Anyone
 *  can fill it in; sending needs a client account (backend DECISIONS #45). */
export function InquiryButton({
  vendorId,
  vendorName,
  variant = "ghost",
  size,
  label = "Get quote",
  prefill,
  className,
}: {
  vendorId: string;
  vendorName: string;
  variant?: "primary" | "ghost";
  size?: "md" | "lg";
  label?: string;
  /** Opened from a package's page: that package comes picked. */
  prefill?: InquiryPrefill;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <InquirySheet vendorId={vendorId} vendorName={vendorName} prefill={prefill} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export function InquirySheet({
  vendorId,
  vendorName,
  prefill,
  agreed,
  onSent,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
  prefill?: InquiryPrefill;
  agreed?: AgreedPrefill | null;
  onSent?: (conversationId: string | null) => void;
  onClose: () => void;
}) {
  const panelRef = useOverlay<HTMLDivElement>(true, onClose);
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Send ${vendorName} an inquiry`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 text-left outline-none sm:items-center sm:p-4"
    >
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-b-none sm:rounded-b-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line-soft bg-card p-4">
          <div>
            <h2 className="serif text-xl text-ink">Send {vendorName} an inquiry</h2>
            <p className="mt-0.5 text-xs text-ink-faint">It goes straight to them, and they reply in your messages.</p>
          </div>
          <button onClick={onClose} className="text-sm text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="relative p-4 sm:p-5">
          <InquiryForm vendorId={vendorId} vendorName={vendorName} prefill={prefill} agreed={agreed} onSent={onSent} />
        </div>
      </Card>
    </div>
  );
}
