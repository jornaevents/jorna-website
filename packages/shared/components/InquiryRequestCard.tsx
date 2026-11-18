"use client";

import type { ReactNode } from "react";

/**
 * A vendor asking the client for the inquiry form (backend DECISIONS #54),
 * drawn as a card in the thread. Every contract starts from the client's
 * inquiry, so a chat that began with a question gets this before a contract.
 *
 * `sent` is the thread's has_inquiry: once the client has sent the form, the
 * card says so instead of asking again. `action` is the client's way into the
 * form; the vendor's own copy has none. The message's text says all of this
 * too, for builds that don't know the card.
 */
export function InquiryRequestCard({
  mine,
  vendorName,
  clientName,
  sent,
  action,
}: {
  mine: boolean;
  vendorName?: string | null;
  clientName?: string | null;
  sent: boolean;
  action?: ReactNode;
}) {
  const client = clientName?.trim() || "the client";
  const vendor = vendorName?.trim() || "Your vendor";
  return (
    <div className="w-[min(360px,85vw)] rounded-2xl border border-card-edge bg-card p-4">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Inquiry form</p>
      <p className="mt-2 text-sm text-ink">
        {mine ? `You asked ${client} for their event details.` : `${vendor} asked for your event details.`}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {sent
          ? mine
            ? "They've sent them. You can send a contract now."
            : "You've sent them."
          : mine
            ? "Once they fill in the inquiry form, you can send a contract."
            : "Fill in the inquiry form so they can send you a contract."}
      </p>
      {!sent && action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
