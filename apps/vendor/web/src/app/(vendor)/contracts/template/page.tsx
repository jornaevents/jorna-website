"use client";

// Editing a template (backend DECISIONS #31): ?package=<service_id> for a
// package's own, or ?id=<template_id> for one of the vendor's — the contract
// editor in its template mode (components/contract-editor/ContractEditor).

import { Suspense } from "react";
import { ContractEditor } from "@/components/contract-editor/ContractEditor";

export default function EditTemplatePage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ContractEditor mode="template" />
    </Suspense>
  );
}
