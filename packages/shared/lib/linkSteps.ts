// The client's contract link as steps: email, their details, the contract,
// then signing (or sending changes back). Which one a visit starts on is
// decided here so the page and its tests agree.
//
// Nothing here is a credential — the link's token still is (backend
// DECISIONS #13), and the emailed code is still asked at signing. The steps
// only make sure the vendor has somewhere to reach the client, and who
// they are, before the client reads, negotiates or signs.

export type LinkStep = "email" | "details" | "review" | "sign";

export const CONTRACT_STEPS: { key: LinkStep; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "details", label: "Details" },
  { key: "review", label: "Review" },
  { key: "sign", label: "Sign" },
];

export const DOCUMENT_STEPS: { key: LinkStep; label: string }[] = [
  { key: "review", label: "Review" },
  { key: "sign", label: "Sign" },
];

const KEY = (token: string) => `jorna_link_steps:${token}`;

/** Whether this browser already went through email and details for this
 *  link. Storage can be blocked; then every visit starts at the email step,
 *  prefilled, which costs a click per step and nothing else. */
export function rememberedDetails(token: string): boolean {
  try {
    return localStorage.getItem(KEY(token)) === "details";
  } catch {
    return false;
  }
}

export function rememberDetails(token: string): void {
  try {
    localStorage.setItem(KEY(token), "details");
  } catch {
    /* storage blocked — see rememberedDetails */
  }
}

/** Where a visit starts. Remembering only skips ahead while what the steps
 *  collected is still on the contract — a vendor can clear it. */
export function startingStep(
  booking: { guest_email?: string | null; guest_name?: string | null },
  remembered: boolean,
): LinkStep {
  if (!remembered || !booking.guest_email?.trim()) return "email";
  if (!booking.guest_name?.trim()) return "details";
  return "review";
}

/** Loose on purpose: the backend and the emailed code are the real check.
 *  This only catches a typo before the vendor sees it. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
