"use client";

// Where a vendor-authored contract link lands (/booking-link?t=…), and an
// addendum or cancellation agreement's (?d=…). The page itself is shared with
// the client app, which opens the same contract for a signed-in client
// (backend DECISIONS #48); links sent before contracts went into the chat
// keep working here.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ContractLink } from "@jorna/shared/components/contract-link/ContractLink";
import { DocumentView } from "@jorna/shared/components/contract-link/DocumentView";

function LinkRouter() {
  const params = useSearchParams();
  const documentToken = params.get("d");
  const preview = params.get("preview") === "1";
  return documentToken ? (
    <DocumentView token={documentToken} preview={preview} />
  ) : (
    <ContractLink token={params.get("t") ?? ""} preview={preview} propose={params.get("propose") === "1"} />
  );
}

export default function BookingLinkPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <LinkRouter />
    </Suspense>
  );
}
