"use client";

// A new contract, or one being edited — components/contract-editor/
// ContractEditor, where the editor and its URL parameters are described.

import { Suspense } from "react";
import { ContractEditor } from "@/components/contract-editor/ContractEditor";

export default function NewContractPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ContractEditor />
    </Suspense>
  );
}
