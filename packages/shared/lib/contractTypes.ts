// The contract's own shapes: line items, payments, clauses, the editor's
// layout, and change proposals (backend 0065, 0067, 0068). Both apps use them,
// and so does the negotiation code in this package (lib/contractDraft,
// contractDiff, negotiation; components/negotiation). Each app's lib/types
// re-exports them, so imports from "@/lib/types" keep working.

/** Free-form contract terms (equipment/power, travel, custom clauses) —
 *  narrative, never computed against, so one flexible shape rather than a
 *  column per clause. See Booking.contract_terms in the backend. */
export interface ContractTerms {
  equipment_power?: string;
  travel?: string;
  custom?: { label: string; value: string }[];
}

// ── What a contract says (backend 0065, its DECISIONS.md #16) ─────────

export type LineItemKind = "package" | "addon" | "custom";
export type LineUnit = "event" | "person" | "hour" | "day" | "item";

/** A snapshot — names and prices as quoted, not joined back to the package. */
export interface LineItem {
  id: string;
  kind: LineItemKind;
  service_id: string | null;
  addon_id: string | null;
  name: string;
  description: string | null;
  unit: LineUnit;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
}

export type DueType = "on_signing" | "date" | "before_event";

export interface Installment {
  id: string;
  label: string;
  amount_cents: number;
  due_type: DueType;
  due_date: string | null;
  due_days: number | null;
  /** The calendar date it's due — null for "on signing" until signed. */
  due_on: string | null;
  marked_paid_at: string | null;
  confirmed_at: string | null;
  /** How the client said they sent it (backend DECISIONS #33). */
  paid_via?: "venmo" | "zelle" | "other" | null;
}

export interface Clause {
  key: string;
  title: string;
  body: string;
}

/** One block of the contract editor's document. A terms block's text lives
 *  in terms_clauses under the same key; the rest are drawn from the
 *  contract's own fields. Each structured type appears at most once. */
export type BlockType = "parties" | "event" | "items" | "schedule" | "signature" | "terms";

export interface LayoutBlock {
  id: string;
  type: BlockType;
}

/** What the editor sends: a terms block carries its title and body. */
export interface LayoutBlockInput extends LayoutBlock {
  title?: string;
  body?: string;
}

export interface ContractEvent {
  at: string;
  kind: string;
  actor: "vendor" | "client" | "system";
  detail: Record<string, unknown> | null;
}

/** What's sent for a line; the server fills ids and totals. */
export interface LineItemInput {
  id?: string;
  kind: LineItemKind;
  service_id?: string | null;
  addon_id?: string | null;
  name?: string;
  description?: string | null;
  unit?: LineUnit;
  unit_price_cents: number;
  quantity: number;
}

export interface InstallmentInput {
  id?: string;
  label: string;
  amount_cents: number;
  due_type: DueType;
  due_date?: string | null;
  due_days?: number | null;
}

export interface ContractCreateInput {
  /** The one-package form; the builder sends line_items instead. */
  service_id?: string;
  date_iso: string;
  date_end?: string | null;
  time_start: string;
  time_end: string;
  amount_cents?: number;
  line_items?: LineItemInput[];
  discount_cents?: number | null;
  payment_schedule?: InstallmentInput[];
  terms_clauses?: Clause[];
  document_title?: string | null;
  document_layout?: LayoutBlockInput[];
  guest_count?: number | null;
  draft?: boolean;
  hold_days?: number | null;
  email_client?: boolean;
  deposit_percent?: number | null;
  cancellation_window_hours?: number | null;
  overtime_rate_cents?: number | null;
  addon_rate_cents?: number | null;
  contract_terms?: ContractTerms | null;
  /** Optional up front — the client can still correct them before signing. */
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  location?: string | null;
}

// ── Change proposals (backend 0068, its DECISIONS.md #23) ────────────

export type ProposalStatus = "open" | "accepted" | "declined" | "revised" | "superseded" | "withdrawn";

/** A payment as agreed: no payment marks. */
export interface InstallmentTerms {
  id: string;
  label: string;
  amount_cents: number;
  due_type: DueType;
  due_date: string | null;
  due_days: number | null;
}

/** One version of a contract's terms — a revision, or a client's proposal.
 *  What a change proposal can change, and what the comparison compares. */
export interface TermsVersion {
  date_iso: string;
  date_end: string | null;
  time_start: string;
  time_end: string;
  location: string;
  guest_count: number | null;
  line_items: LineItem[] | null;
  discount_cents: number | null;
  amount_cents: number;
  payment_schedule: InstallmentTerms[] | null;
  terms_clauses: Clause[] | null;
  cancellation_window_hours: number | null;
  overtime_rate_cents: number | null;
}

export interface ChangeProposal {
  proposal_id: string;
  base_revision: number;
  status: ProposalStatus;
  message: string | null;
  response_note: string | null;
  /** The revision an Accept or Revise produced. */
  result_revision: number | null;
  created_at: string;
  responded_at: string | null;
  proposed: TermsVersion;
}

export interface ContractRevisionRow {
  revision: number;
  created_at: string;
  terms: TermsVersion;
}

/** GET …/proposals, on either side. Newest first. */
/** One side's unsaved work in the negotiation workspace (backend 0069,
 *  DECISIONS #24). `changes` holds the whole working version's terms. */
export interface NegotiationDraft {
  base_revision: number;
  changes: Partial<TermsVersion>;
  message: string | null;
  /** The open proposal a vendor's draft answers. */
  proposal_id: string | null;
  updated_at: string;
  /** The contract moved past base_revision since it was saved. */
  stale: boolean;
}

export interface ProposalHistory {
  current_revision: number | null;
  open_proposal: ChangeProposal | null;
  proposals: ChangeProposal[];
  revisions: ContractRevisionRow[];
  /** The caller's own saved draft (absent on an older backend). */
  draft?: NegotiationDraft | null;
}

/** What a client sends: any terms, minus the derived total. */
export type TermsChanges = Partial<Omit<TermsVersion, "amount_cents" | "line_items" | "payment_schedule">> & {
  line_items?: LineItemInput[];
  payment_schedule?: InstallmentInput[];
};

// ── Field-by-field negotiation (backend 0072, its DECISIONS.md #26) ──

export type NegotiationSide = "client" | "vendor";
export type FieldState = "agreed" | "waiting_vendor" | "waiting_client" | "settled";
export type FieldGroup = "event" | "items" | "prices" | "policies" | "clauses" | "schedule";
export type LockGroup = "prices" | "event" | "policies" | "clauses";
export type FieldAction = "accept" | "counter" | "keep" | "change" | "reopen";

/** One negotiable value — `event.date`, `line:<id>.price`, `clause:<key>.included`, … */
export interface NegotiationFieldView {
  key: string;
  group: FieldGroup;
  label: string;
  /** The contract's agreed value. */
  value: unknown;
  state: FieldState;
  /** What the side in `proposed_by` wants, while the field is waiting. */
  proposed: unknown;
  proposed_by: NegotiationSide | null;
  round: number | null;
  note: string | null;
  /** The reader's own latest change or counter for this field (backend #28):
   *  what they asked for, to show beside the other side's answer. */
  your_last_ask?: unknown;
  /** In a group the vendor made not negotiable. */
  locked: boolean;
  /** Whether the side reading this may propose a change to it. */
  can_change: boolean;
}

export interface FieldAnswer {
  key: string;
  action: FieldAction;
  value?: unknown;
  note?: string | null;
}

/** GET …/negotiation, and every send's reply. */
export interface FieldNegotiationState {
  mode: "fields";
  side: NegotiationSide;
  round: number;
  turn: NegotiationSide;
  revision: number | null;
  locks: LockGroup[];
  /** From round 6: suggest talking it through. */
  nudge: boolean;
  /** Whether this side may send now: their turn, or the vendor's when
   *  nothing waits on the client (backend DECISIONS #37). Older backends
   *  don't send it; the turn decides then. */
  may_send?: boolean;
  can_sign: boolean;
  waiting_count: number;
  terms: TermsVersion;
  previous_terms: TermsVersion | null;
  original_terms: TermsVersion | null;
  fields: NegotiationFieldView[];
  last_send: { round: number; side: NegotiationSide; message: string | null; answers: FieldAnswer[]; sent_at: string } | null;
  draft: { round: number; answers: FieldAnswer[]; message: string | null; updated_at: string; stale: boolean } | null;
  /** On a send's reply: whether the client was emailed about the vendor's
   *  answer; null on a client's send (backend #28). */
  email_sent?: boolean | null;
  /** What the reader may add as a new item on their turn (backend #104):
   *  public packages for the client, every live one for the vendor. */
  packages?: NegotiationPackage[];
}

export interface NegotiationPackage {
  service_id: string;
  name: string;
  price_cents: number;
  price_unit: string | null;
  add_ons: { id: string; name: string; price_cents: number }[];
}
