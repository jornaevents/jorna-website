"use client";

// Editing a template (backend DECISIONS #31): ?package=<service_id> for a
// package's own, or ?id=<template_id> for one of the vendor's — the contract
// editor in its template mode (components/contract-editor/ContractEditor).

import { Suspense } from "react";
import { ContractEditor } from "@/components/contract-editor/ContractEditor";
import { ContractEditorSkeleton } from "@/components/vendor/ContractSkeletons";

export default function EditTemplatePage() {
  return (
    <Suspense fallback={<ContractEditorSkeleton />}>
      <ContractEditor mode="template" />
    </Suspense>
  );
}
