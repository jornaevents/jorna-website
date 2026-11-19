// The client's inquiry note as an optional section of the contract
// (Contract Builder from Chat, A7), behind SPECIAL_REQUESTS_ENABLED until
// legal has OK'd it. The vendor adds it, then keeps, edits or removes it like
// any other section: nothing reaches the contract without them choosing it.

import type { ClauseDraft, Draft } from "@jorna/shared/lib/contractDraft";

export const SPECIAL_REQUESTS_TITLE = "Special requests";

/** The section, in the client's own words. Null for an empty note. */
export function specialRequestsClause(note: string | null | undefined): Omit<ClauseDraft, "key"> | null {
  const body = (note ?? "").trim();
  return body ? { title: SPECIAL_REQUESTS_TITLE, body } : null;
}

/** Whether the contract already has it, so it isn't offered twice. */
export function hasSpecialRequests(draft: Draft): boolean {
  return draft.clauses.some((c) => c.title.trim().toLowerCase() === SPECIAL_REQUESTS_TITLE.toLowerCase());
}
