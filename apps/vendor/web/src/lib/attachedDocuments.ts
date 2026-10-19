// Addenda and cancellation agreements (backend DECISIONS #21): text-only
// documents attached to a signed booking. What one starts from, and how its
// state reads. Signing one changes nothing on the booking — the wording here
// says so, because a couple might otherwise expect it to.

import type { AttachedDocument, AttachedDocumentKind } from "./types";

export const KIND_LABEL: Record<AttachedDocumentKind, string> = {
  addendum: "Service addendum",
  cancellation: "Cancellation agreement",
};

export interface SectionDraft {
  key: string;
  title: string;
  body: string;
}

/** A starting point the vendor rewrites — never sent as-is without a look. */
export function starterSections(kind: AttachedDocumentKind, eventDate: string | null): Omit<SectionDraft, "key">[] {
  const on = eventDate ? ` for ${eventDate}` : "";
  if (kind === "addendum") {
    return [
      {
        title: "What changes",
        body: `This addendum changes our signed agreement${on} as follows: `,
      },
      {
        title: "Everything else stays the same",
        body: "All other terms of the original agreement remain in effect.",
      },
    ];
  }
  return [
    {
      title: "Cancellation",
      body: `Both parties agree to cancel the booking${on}.`,
    },
    {
      title: "Payments and refunds",
      body: "Payments made so far are handled as follows: ",
    },
    {
      title: "Release",
      body: "Once this is signed, neither party owes the other anything further for this booking, except as stated above.",
    },
  ];
}

export type DocumentTone = "green" | "amber" | "grey" | "red";

export function documentStatus(d: AttachedDocument): { label: string; tone: DocumentTone } {
  switch (d.status) {
    case "draft":
      return { label: "Draft", tone: "grey" };
    case "sent":
      return { label: "Sent", tone: "amber" };
    case "viewed":
      return { label: "Viewed", tone: "amber" };
    case "awaiting_vendor":
      return { label: "Your signature", tone: "red" };
    case "signed":
      return { label: "Signed", tone: "green" };
    case "declined":
      return { label: "Declined", tone: "red" };
    case "voided":
      return { label: "Void", tone: "grey" };
  }
}
