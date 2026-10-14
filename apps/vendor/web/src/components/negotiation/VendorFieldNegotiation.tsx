"use client";

// The vendor's side of field-by-field negotiation (backend DECISIONS #26):
// the shared workspace, sending through the vendor's routes. Chosen by
// VendorNegotiation for contracts the server negotiates this way.

import { useState, type ReactNode } from "react";
import { saveContractNegotiationDraft, sendContractNegotiation } from "@/lib/jorna";
import type { FieldNegotiationState } from "@jorna/shared/lib/contractTypes";
import { FieldNegotiationWorkspace } from "@jorna/shared/components/negotiation/FieldNegotiationWorkspace";

export function VendorFieldNegotiation({
  bookingId,
  initial,
  title,
  clientName,
  vendorName,
  onClose,
  onDone,
  headerActions,
}: {
  bookingId: string;
  initial: FieldNegotiationState;
  title: string;
  clientName: string;
  vendorName: string;
  onClose?: () => void;
  onDone: (message: string) => void;
  headerActions?: ReactNode;
}) {
  const [state, setState] = useState(initial);

  return (
    <FieldNegotiationWorkspace
      key={state.round}
      state={state}
      title={title}
      vendorName={vendorName}
      clientName={clientName}
      onClose={onClose}
      headerActions={headerActions}
      onSaveDraft={async (answers, message) => {
        await saveContractNegotiationDraft(bookingId, answers, message);
      }}
      onSend={async (answers, message) => {
        const next = await sendContractNegotiation(bookingId, state.round, answers, message);
        setState(next);
        onDone(
          next.can_sign
            ? `Nothing's waiting now — ${clientName} can sign.`
            : // Only what the server says happened (#155).
              `Round ${next.round} is with ${clientName}.${
                next.email_sent === true
                  ? " We emailed them."
                  : next.email_sent === false
                    ? " We couldn't email them — send them the contract link yourself."
                    : ""
              }`,
        );
      }}
    />
  );
}
