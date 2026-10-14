"use client";

import { ContractPaper } from "@jorna/shared/components/negotiation/ContractPaper";
import { Drawer } from "@/components/vendor/ui";
import { asSent, type Draft } from "@jorna/shared/lib/contractDraft";

/**
 * "Preview as client": the draft as the client will read it, with the same
 * read-only page the negotiation workspace shows (ContractPaper), so what the
 * vendor checks here is what the client gets.
 */
export function ContractPreview({
  open,
  onClose,
  draft,
  title,
  vendorName,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  draft: Draft;
  title: string;
  vendorName: string;
  clientName: string;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Preview as client" subtitle="What your client reads before signing.">
      <ContractPaper draft={asSent(draft)} markOf={() => null} vendorName={vendorName} clientName={clientName} title={title} />
    </Drawer>
  );
}
