"use client";

// Contract and document PDFs (backend DECISIONS #22). The vendor's need their
// session, so they're fetched and saved from a blob; the couple's are plain
// links — the token in the URL is their whole credential, as on the page.

import { apiDownload } from "@jorna/shared/lib/api";

async function save(path: string, fallbackName: string): Promise<void> {
  const { blob, filename } = await apiDownload(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the save before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadContractPdf(bookingId: string): Promise<void> {
  return save(`/contracts/${bookingId}/pdf`, "contract.pdf");
}

export function downloadDocumentPdf(documentId: string): Promise<void> {
  return save(`/contract-documents/${documentId}/pdf`, "document.pdf");
}

export { guestContractPdfUrl, guestDocumentPdfUrl } from "@jorna/shared/lib/guestBooking";
