// A contract or attached document opened by its token: the client's side,
// in the vendor app's link page and the client app alike (backend
// DECISIONS #13, #48). The token is the credential; these calls don't need
// a session, though a signed-in client's goes along.

import { API_BASE, apiFetch } from "./api";
import type {
  Clause,
  ContractTerms,
  FieldAnswer,
  FieldNegotiationState,
  Installment,
  LayoutBlock,
  LineItem,
  NegotiationDraft,
  ProposalHistory,
  ProposalStatus,
  TermsChanges,
  TermsVersion,
} from "./contractTypes";

/** The backend's contract_status (DECISIONS.md #15 there). "expired" is a
 *  sent/viewed offer whose date hold has lapsed — derived there, never stored. */
export type ContractLifecycle =
  | "draft"
  | "sent"
  | "viewed"
  /** The client signed; it waits on the vendor's countersignature (#34). */
  | "awaiting_vendor"
  | "signed"
  | "declined"
  | "voided"
  | "expired";

// ── Documents attached to a booking (backend 0067, DECISIONS #21) ─────

/** An addendum or cancellation agreement: text only, signed on its own link,
 *  never changing the booking's price, date or hold. */
export type AttachedDocumentKind = "addendum" | "cancellation";

export interface AttachedDocument {
  document_id: string;
  booking_id: string;
  kind: AttachedDocumentKind;
  title: string;
  sections: Clause[];
  /** An addendum's priced changes (backend DECISIONS #38). */
  line_items?: { name: string; unit_price_cents: number; quantity: number }[] | null;
  removed_line_ids?: string[] | null;
  changes?: {
    added: { name: string; quantity: number; unit_price_cents: number; total_cents: number }[];
    removed: string[];
    total_before: number | null;
    total_after: number | null;
  } | null;
  /** awaiting_vendor: the client signed, the vendor hasn't yet (#34). */
  status: "draft" | "sent" | "viewed" | "awaiting_vendor" | "signed" | "declined" | "voided";
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  /** The client's own signature; signed_at is set only once the vendor has
   *  countersigned too (backend DECISIONS #34). Absent from an older backend. */
  client_signed_at?: string | null;
  vendor_signer_name?: string | null;
  vendor_signed_at?: string | null;

  declined_at: string | null;
  decline_reason: string | null;
  /** Why the vendor wouldn't countersign (backend DECISIONS #37). */
  vendor_decline_reason?: string | null;
  voided_at: string | null;
  signed_snapshot_sha256: string | null;
  created_at: string | null;
  updated_at: string | null;
  vendor_display_name: string | null;
  client_name: string | null;
  date_iso: string | null;
  location: string | null;
  /** The vendor's view only — the couple's link is the token. */
  token?: string;
  vendor_esign_consent?: VendorEsignConsent;
  /** The couple's view only (backend DECISIONS #27). */
  esign_consent?: EsignConsent;
  signing_code_required?: boolean;
}

/** The e-records consent the signing page shows, word for word, and sends
 *  back by version (backend DECISIONS #27). */
export interface EsignConsent {
  version: string;
  text: string;
}

/** The same words for the vendor's countersignature, asked only until
 *  they've agreed to this version once (backend DECISIONS #34). */
export interface VendorEsignConsent extends EsignConsent {
  given: boolean;
}

/** What a signature by link sends besides the name (backend DECISIONS #27). */
export interface SigningProof {
  code: string;
  consent: true;
  consent_version: string;
}

export interface SigningCodeSent {
  /** Masked, e.g. "p••••@example.com". */
  sent_to: string;
  expires_in_minutes: number;
}

/** The public, no-login view of a guest booking — GET/PATCH
 *  /guest-bookings/{token}, POST .../sign. Includes the vendor's payment
 *  handle (how the client actually pays) instead of contract_token (the
 *  token is already the credential the client used to get here). */
/** The contract link's message thread (backend DECISIONS #41). */
export interface LinkMessage {
  message_id: string;
  from: "you" | "vendor";
  sender_name: string;
  content: string;
  kind: string;
  created_at: string;
}

export interface LinkThread {
  vendor_name: string;
  items: LinkMessage[];
}

export interface GuestBooking {
  booking_id: string;
  /** Older backends send neither (backend DECISIONS #27). */
  esign_consent?: EsignConsent;
  signing_code_required?: boolean;
  vendor_display_name: string | null;
  vendor_venmo_handle: string | null;
  vendor_zelle_contact: string | null;
  service_name: string | null;
  date_iso: string;
  date_end: string | null;
  time_start: string;
  time_end: string;
  location: string;
  guest_count: number | null;
  amount_cents: number;
  deposit_percent: number | null;
  deposit_amount_cents: number | null;
  cancellation_window_hours: number | null;
  overtime_rate_cents: number | null;
  addon_rate_cents: number | null;
  contract_terms: ContractTerms | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  signer_name: string | null;
  signed_at: string | null;
  /** The client's own signature; signed_at is set only once the vendor has
   *  countersigned too (backend DECISIONS #34). Absent from an older backend. */
  client_signed_at?: string | null;
  vendor_signer_name?: string | null;
  vendor_signed_at?: string | null;
  payment_status: string;
  /** "rejected" once voided or declined — the link still opens, but
   *  nothing on it can be acted on. */
  status?: string;
  /** "vendor_declined_signature" when the vendor wouldn't countersign;
   *  their reason is vendor_decline_note. */
  rejected_reason?: string | null;
  vendor_decline_note?: string | null;
  contract_status?: ContractLifecycle | null;
  /** Until when the vendor is holding this date for the client. */
  hold_expires_at?: string | null;
  line_items?: LineItem[] | null;
  subtotal_cents?: number;
  discount_cents?: number | null;
  payment_schedule?: Installment[] | null;
  terms_clauses?: Clause[] | null;
  document_title?: string | null;
  document_layout?: LayoutBlock[] | null;
  /** Sent back with the signature; a stale one is refused. */
  revision?: number | null;
  signed_snapshot_sha256?: string | null;
  deposit_marked_paid_at: string | null;
  deposit_confirmed_received_at: string | null;
  /** The latest change proposal's status (backend DECISIONS #23). */
  proposal_status?: ProposalStatus | null;
}

export interface GuestBookingDetailsInput {
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  location?: string | null;
  guest_count?: number | null;
}

export type PaidVia = "venmo" | "zelle" | "other";

export const KIND_LABEL: Record<AttachedDocumentKind, string> = {
  addendum: "Service addendum",
  cancellation: "Cancellation agreement",
};

export function guestContractPdfUrl(token: string): string {
  return `${API_BASE}/guest-bookings/${token}/pdf`;
}

export function guestDocumentPdfUrl(token: string): string {
  return `${API_BASE}/guest-documents/${token}/pdf`;
}

// ── Negotiation drafts (backend 0069, DECISIONS #24) ─────────────────

export interface DraftInput {
  base_revision: number;
  changes: Partial<TermsVersion>;
  message?: string | null;
  proposal_id?: string | null;
}

export function getGuestProposals(token: string): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/guest-bookings/${token}/proposals`);
}

/** Client: suggest changes to the version they're reading. 409s if the
 *  vendor has edited since. */
export function proposeGuestChanges(
  token: string,
  baseRevision: number,
  changes: TermsChanges,
  message: string | null,
): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/guest-bookings/${token}/proposals`, {
    method: "POST",
    body: { base_revision: baseRevision, changes, message },
  });
}

export function withdrawGuestProposal(token: string, proposalId: string): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/guest-bookings/${token}/proposals/${proposalId}/withdraw`, { method: "POST" });
}

export function getGuestNegotiation(token: string): Promise<FieldNegotiationState> {
  return apiFetch<FieldNegotiationState>(`/guest-bookings/${token}/negotiation`);
}

export function sendGuestNegotiation(
  token: string,
  baseRound: number,
  answers: FieldAnswer[],
  message: string | null,
): Promise<FieldNegotiationState> {
  return apiFetch<FieldNegotiationState>(`/guest-bookings/${token}/negotiation/send`, {
    method: "POST",
    body: { base_round: baseRound, answers, message },
  });
}

export function saveGuestNegotiationDraft(token: string, answers: FieldAnswer[], message: string | null): Promise<unknown> {
  return apiFetch(`/guest-bookings/${token}/negotiation/draft`, { method: "PUT", body: { answers, message } });
}

export function saveGuestDraft(token: string, draft: Omit<DraftInput, "proposal_id">): Promise<NegotiationDraft> {
  return apiFetch<NegotiationDraft>(`/guest-bookings/${token}/proposals/draft`, { method: "PUT", body: draft });
}

export function dropGuestDraft(token: string): Promise<void> {
  return apiFetch<void>(`/guest-bookings/${token}/proposals/draft`, { method: "DELETE" });
}

/** preview: the vendor's own "View as client" — doesn't mark it viewed. */
export function getGuestBooking(token: string, preview = false): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}${preview ? "?preview=true" : ""}`);
}

/** The client's thread with their vendor, by the contract link (backend
 *  0083, DECISIONS #41). Reading it marks it read, so the vendor's preview
 *  never calls this. */
export function getLinkMessages(token: string): Promise<LinkThread> {
  return apiFetch<LinkThread>(`/guest-bookings/${token}/messages`);
}

export function sendLinkMessage(token: string, content: string): Promise<LinkThread> {
  return apiFetch<LinkThread>(`/guest-bookings/${token}/messages`, { method: "POST", body: { content } });
}

/** An addendum or cancellation agreement, by its own link. */
export function getGuestDocument(token: string, preview = false): Promise<AttachedDocument> {
  return apiFetch(`/guest-documents/${token}${preview ? "?preview=true" : ""}`);
}

export function signGuestDocument(
  token: string,
  signerName: string,
  proof?: SigningProof | null,
): Promise<AttachedDocument> {
  return apiFetch(`/guest-documents/${token}/sign`, {
    method: "POST",
    body: { signer_name: signerName, ...(proof ?? {}) },
  });
}

/** Email the client the 6-digit code they sign with (backend DECISIONS #27). */
export function requestGuestSigningCode(token: string): Promise<SigningCodeSent> {
  return apiFetch(`/guest-bookings/${token}/signing-code`, { method: "POST" });
}

export function requestDocumentSigningCode(token: string): Promise<SigningCodeSent> {
  return apiFetch(`/guest-documents/${token}/signing-code`, { method: "POST" });
}

export function declineGuestDocument(token: string, reason: string | null): Promise<AttachedDocument> {
  return apiFetch(`/guest-documents/${token}/decline`, { method: "POST", body: { reason } });
}

/** The client turns the offer down; frees the vendor's date. */
export function declineGuestBooking(token: string, reason: string | null): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/decline`, {
    method: "POST",
    body: { reason },
  });
}

export function fillGuestBookingDetails(
  token: string,
  details: GuestBookingDetailsInput,
): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}`, { method: "PATCH", body: details });
}

/** revision: the version the client was shown — the backend 409s if the
 *  vendor has edited since. */
export function signGuestBooking(
  token: string,
  signerName: string,
  revision?: number | null,
  /** Field-by-field contracts: sign while changes are waiting, taking the
   *  vendor's and dropping your own (backend DECISIONS #26). */
  asIs = false,
  /** The emailed code and the consent box (backend DECISIONS #27). */
  proof?: SigningProof | null,
): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/sign`, {
    method: "POST",
    body: {
      signer_name: signerName,
      ...(revision != null ? { revision } : {}),
      ...(asIs ? { as_is: true } : {}),
      ...(proof ?? {}),
    },
  });
}

/** Client: one scheduled payment is sent. Returns the refreshed booking. */
export function guestMarkInstallmentPaid(
  token: string,
  installmentId: string,
  paidVia?: PaidVia,
): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/payments/${installmentId}/mark-paid`, {
    method: "POST",
    body: paidVia ? { paid_via: paidVia } : undefined,
  });
}

/** Take back the client's own "I've sent this", until the vendor confirms
 *  it (backend DECISIONS #37). */
export function guestUnmarkInstallment(token: string, installmentId: string): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/payments/${installmentId}/unmark`, { method: "POST" });
}

export function guestMarkFullPaid(
  token: string,
): Promise<{ message: string; payment_status: string }> {
  return apiFetch(`/guest-bookings/${token}/mark-paid`, { method: "POST" });
}

export function guestMarkDepositPaid(
  token: string,
): Promise<{ message: string; deposit_marked_paid_at: string }> {
  return apiFetch(`/guest-bookings/${token}/mark-deposit-paid`, { method: "POST" });
}
