"use client";

// A new contract, or one being edited — components/contract-editor/
// ContractEditor, where the editor and its URL parameters are described.

import { Suspense } from "react";
import { ContractEditor } from "@/components/contract-editor/ContractEditor";
import { ContractEditorSkeleton } from "@/components/vendor/ContractSkeletons";

export default function NewContractPage() {
  return (
    <Suspense fallback={<ContractEditorSkeleton />}>
      <ContractEditor />
    </Suspense>
  );
}
