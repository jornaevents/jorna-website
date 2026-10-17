"use client";

import { useState } from "react";
import { Button, Card } from "@jorna/shared/components/ui";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { InquiryForm } from "@/components/InquiryForm";

/** "Send an inquiry" on a vendor's page: the inquiry form in a sheet, for
 *  anyone, signed in or not. */
export function InquiryButton({
  vendorId,
  vendorName,
  variant = "ghost",
}: {
  vendorId: string;
  vendorName: string;
  variant?: "primary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        Send an inquiry
      </Button>
      {open ? <InquirySheet vendorId={vendorId} vendorName={vendorName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function InquirySheet({
  vendorId,
  vendorName,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
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
            <p className="mt-0.5 text-xs text-ink-faint">It goes straight to them, and they reply by email.</p>
          </div>
          <button onClick={onClose} className="text-sm text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="relative p-4 sm:p-5">
          <InquiryForm vendorId={vendorId} vendorName={vendorName} />
        </div>
      </Card>
    </div>
  );
}
