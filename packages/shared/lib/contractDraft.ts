// The contract builder's working copy: what the vendor is writing, in form
// terms (dollars as strings, blank allowed), plus the pure conversions to
// and from what the backend stores (backend 0065, its DECISIONS.md #16).
//
// Kept apart from the page so the arithmetic — totals, schedule presets, the
// "does the schedule add up" check — is unit-tested rather than trusted to a
// click-through. The backend re-checks all of it; this is so the vendor sees
// the problem while typing instead of after pressing Send.

import type {
  BlockType,
  Clause,
  ContractCreateInput,
  ContractTerms,
  DueType,
  Installment,
  InstallmentInput,
  LineItemInput,
  LayoutBlock,
  LayoutBlockInput,
  LineItem,
  LineItemKind,
  LineUnit,
  TermsChanges,
  TermsVersion,
} from "./contractTypes";

// What this file reads from each app's own (wider, and not yet shared) types:
// only these fields, so either app's ServiceItem, VendorDetail, VendorBooking
// or Contract fits as it is.

/** A package from the vendor's listing, and its add-ons. */
export interface PackageSource {
  service_id: string;
  name: string;
  price: number;
  price_unit?: string | null;
  add_ons?: { id?: string; name: string; price: number; price_unit: string }[] | null;
  /** "Hours included" on the package. */
  duration_minutes?: number | null;
}

/** The vendor's saved default clauses. */
export interface VendorDefaultsSource {
  default_contract_terms?: ContractTerms | null;
}

/** A marketplace request being answered with a contract. */
export interface RequestSource {
  client_name?: string | null;
  date_iso?: string | null;
  date_end?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  guest_count?: number | null;
  service_id?: string | null;
  service_name?: string | null;
  price_unit?: string | null;
  price: number;
  price_pending_quantity?: boolean | null;
}

export interface LineDraft {
  key: string;
  /** The saved line's id, kept across edits so two versions can be compared
   *  line by line (lib/contractDiff). Absent on a line added here. */
  id?: string;
  kind: LineItemKind;
  serviceId: string | null;
  addonId: string | null;
  name: string;
  unit: LineUnit;
  /** Dollars, as typed. */
  price: string;
  quantity: string;
  /** Carried through from the saved line; the editor doesn't show it. */
  description?: string | null;
}

export interface InstallmentDraft {
  key: string;
  /** The saved payment's id — see LineDraft.id. */
  id?: string;
  label: string;
  /** Dollars, as typed. */
  amount: string;
  dueType: DueType;
  dueDate: string;
  dueDays: string;
}

export interface ClauseDraft {
  key: string;
  title: string;
  body: string;
}

export interface Draft {
  /** The agreement's heading; blank reads as "<package> agreement". */
  title: string;
  /** The document's block order. Terms blocks point at clauses by key —
   *  the clause holds the text. See layoutOf. */
  layout: LayoutBlock[];
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  dateIso: string;
  multiDay: boolean;
  dateEnd: string;
  timeStart: string;
  timeEnd: string;
  location: string;
  guestCount: string;
  lines: LineDraft[];
  /** Dollars, as typed. */
  discount: string;
  schedule: InstallmentDraft[];
  clauses: ClauseDraft[];
  /** Days, as typed — the backend keeps hours. */
  cancellationDays: string;
  /** Dollars per hour, as typed. */
  overtimeRate: string;
  holdDays: string;
}

let seq = 0;
/** A React key for a row the vendor added — never sent to the backend. */
export function newKey(): string {
  seq += 1;
  return `k${Date.now().toString(36)}${seq}`;
}

export function emptyDraft(): Draft {
  return {
    title: "",
    layout: defaultLayout(),
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    dateIso: "",
    multiDay: false,
    dateEnd: "",
    timeStart: "",
    timeEnd: "",
    location: "",
    guestCount: "",
    lines: [],
    discount: "",
    schedule: [],
    clauses: [],
    cancellationDays: "",
    overtimeRate: "",
    holdDays: "",
  };
}

export function toCents(dollars: string): number {
  const n = Number(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toDollars(cents: number): string {
  return (Math.round(cents) / 100).toString();
}

export function money(cents: number): string {
  const amount = (Math.abs(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "−" : ""}$${amount}`;
}

// ── Items ────────────────────────────────────────────────────────────

/** A package's add-on and package units map onto a line's; a package's
 *  "performer" unit is counted like an item. */
function lineUnit(unit: string | null | undefined): LineUnit {
  return unit === "person" || unit === "hour" || unit === "day" ? unit : unit === "event" || !unit ? "event" : "item";
}

export function packageLine(service: PackageSource): LineDraft {
  // The hours the package includes are part of what's sold, so they go in
  // the contract with it (the backend keeps the line's description).
  const hours = service.duration_minutes ? Math.round((service.duration_minutes / 60) * 10) / 10 : null;
  return {
    key: newKey(),
    kind: "package",
    serviceId: service.service_id,
    addonId: null,
    name: service.name,
    unit: lineUnit(service.price_unit),
    price: service.price.toString(),
    quantity: "1",
    ...(hours ? { description: `${hours} hour${hours === 1 ? "" : "s"} included` } : {}),
  };
}

export function addonLine(service: PackageSource, addonId: string): LineDraft | null {
  const addon = service.add_ons?.find((a) => a.id === addonId);
  if (!addon) return null;
  return {
    key: newKey(),
    kind: "addon",
    serviceId: service.service_id,
    addonId,
    name: addon.name,
    unit: lineUnit(addon.price_unit),
    price: addon.price.toString(),
    quantity: "1",
  };
}

export function customLine(): LineDraft {
  return {
    key: newKey(),
    kind: "custom",
    serviceId: null,
    addonId: null,
    name: "",
    unit: "item",
    price: "",
    quantity: "1",
  };
}

/** A custom row added and left empty. It isn't part of the contract: it's
 *  neither flagged nor sent. It used to be removed when the vendor clicked
 *  away, and the rows below jumping up swallowed that click. */
export function isBlankLine(line: LineDraft): boolean {
  return line.kind === "custom" && !line.name.trim() && !line.price.trim();
}

export function lineTotalCents(line: LineDraft): number {
  const qty = Number(line.quantity);
  return Number.isFinite(qty) && qty > 0 ? Math.round(toCents(line.price) * qty) : 0;
}

export function subtotalCents(draft: Draft): number {
  return draft.lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
}

export function totalCents(draft: Draft): number {
  return subtotalCents(draft) - toCents(draft.discount);
}

/** Whether the draft has a package — the backend needs one. */
export function hasPackage(draft: Draft): boolean {
  return draft.lines.some((l) => l.kind === "package");
}

// ── Schedule ─────────────────────────────────────────────────────────

export type SchedulePreset = "full" | "deposit_balance" | "three";

/**
 * A starting schedule for the current total. Amounts are split in cents and
 * the rounding remainder lands on the last payment, so the preset always
 * adds up exactly — the one thing the backend is strict about.
 */
/** `balanceDays`: when the final balance falls due, in days before the
 *  event — the vendor's usual (Vendor.default_payment_plan), else 14. Same
 *  shapes as the backend's "Send with my usual terms" (_default_schedule). */
export function presetSchedule(
  preset: SchedulePreset,
  total: number,
  depositPercent = 50,
  balanceDays = 14,
): InstallmentDraft[] {
  const row = (label: string, cents: number, dueType: DueType, dueDays = ""): InstallmentDraft => ({
    key: newKey(),
    label,
    amount: toDollars(cents),
    dueType,
    dueDate: "",
    dueDays,
  });
  if (preset === "full") return [row("Payment in full", total, "on_signing")];
  if (preset === "deposit_balance") {
    const deposit = Math.round((total * depositPercent) / 100);
    return [
      row("Deposit", deposit, "on_signing"),
      row("Final balance", total - deposit, "before_event", String(balanceDays)),
    ];
  }
  const first = Math.round(total / 3);
  return [
    row("Deposit", first, "on_signing"),
    row("Second payment", first, "before_event", String(Math.max(60, balanceDays + 30))),
    row("Final balance", total - 2 * first, "before_event", String(balanceDays)),
  ];
}

export function scheduledCents(draft: Draft): number {
  return draft.schedule.reduce((sum, i) => sum + toCents(i.amount), 0);
}

/** Put whatever the schedule is short (or over) by on its last payment. */
export function balanceLastPayment(draft: Draft): InstallmentDraft[] {
  if (draft.schedule.length === 0) return draft.schedule;
  const gap = totalCents(draft) - scheduledCents(draft);
  return draft.schedule.map((i, idx) =>
    idx === draft.schedule.length - 1 ? { ...i, amount: toDollars(toCents(i.amount) + gap) } : i,
  );
}

// ── Terms ────────────────────────────────────────────────────────────

/** The cancellation section: the one keyed "cancellation", else the first
 *  titled that way (a template's or an older contract's). In the editor the
 *  window lives inside it, its sentence written from the days. */
export const CANCELLATION_KEY = "cancellation";

export function cancellationClause(draft: Pick<Draft, "clauses">): ClauseDraft | undefined {
  return (
    draft.clauses.find((c) => c.key === CANCELLATION_KEY) ??
    draft.clauses.find((c) => /^cancell?ation\b/i.test(c.title.trim()))
  );
}

/** The sentence the contract prints for a window: the same words as the
 *  client's copy (ContractPaper), the signing page and the PDF. */
export function cancellationSentence(days: string | number): string {
  return `Cancelling within ${days} days of the event may forfeit what's been paid.`;
}

/** The draft with a cancellation section to hold its window, added before
 *  the signature when there's a window and no section yet (an older
 *  contract, the vendor's default, a package's own). The editor only: a
 *  window-only section isn't sent (toDocument), so terms compared elsewhere
 *  don't change. */
export function withCancellationSection(draft: Draft): Draft {
  if (!draft.cancellationDays.trim() || cancellationClause(draft)) return draft;
  return { ...draft, ...insertClause(draft, { title: "Cancellation", body: "" }, undefined, CANCELLATION_KEY) };
}

/** The draft as it's sent and as the client reads it. A cancellation
 *  section that's only the window isn't a section of its own: the window is
 *  cancellation_window_hours, which every copy prints. */
export function asSent(draft: Draft): Draft {
  const c = cancellationClause(draft);
  if (!c || c.body.trim()) return draft;
  const clauses = draft.clauses.filter((x) => x !== c);
  return { ...draft, clauses, layout: reconcileLayout(draft.layout, clauses) };
}

/** What a suggested section leaves for the vendor to fill in. */
export const BLANK = "___";

/** The vendor's saved equipment/travel defaults, as clauses. */
export function defaultClauses(vendor: VendorDefaultsSource | null): ClauseDraft[] {
  const terms = vendor?.default_contract_terms;
  const out: ClauseDraft[] = [];
  if (terms?.equipment_power) out.push({ key: "equipment_power", title: "Equipment & power", body: terms.equipment_power });
  if (terms?.travel) out.push({ key: "travel", title: "Travel", body: terms.travel });
  for (const c of terms?.custom ?? []) {
    if (c.label && c.value) out.push({ key: newKey(), title: c.label, body: c.value });
  }
  return out;
}

// ── The document's layout (backend 0067) ─────────────────────────────

/** The blocks every agreement has, once each. Terms sections are the only
 *  ones a vendor adds or removes. */
export const STRUCTURED: Exclude<BlockType, "terms">[] = ["parties", "event", "items", "schedule", "signature"];

/** Who, when, what, how it's paid, then the terms, then signatures — the
 *  order a written agreement usually takes. */
export function defaultLayout(clauseKeys: string[] = []): LayoutBlock[] {
  return [
    { id: "parties", type: "parties" },
    { id: "event", type: "event" },
    { id: "items", type: "items" },
    { id: "schedule", type: "schedule" },
    ...clauseKeys.map((id) => ({ id, type: "terms" as const })),
    { id: "signature", type: "signature" },
  ];
}

/**
 * The layout as it should be drawn: one terms block per clause, none for a
 * clause that's gone, each structured block once. A clause the layout
 * doesn't place yet (a template's, the vendor's defaults) goes just before
 * the signature. Clauses are the truth for what terms exist; the layout
 * only says where they sit.
 */
export function reconcileLayout(layout: LayoutBlock[], clauses: { key: string }[]): LayoutBlock[] {
  const keys = new Set(clauses.map((c) => c.key));
  const seen = new Set<string>();
  const out: LayoutBlock[] = [];
  for (const b of layout) {
    const tag = b.type === "terms" ? `terms:${b.id}` : b.type;
    if (seen.has(tag) || (b.type === "terms" && !keys.has(b.id))) continue;
    seen.add(tag);
    out.push(b);
  }
  for (const type of STRUCTURED) {
    if (!seen.has(type)) {
      const sig = out.findIndex((b) => b.type === "signature");
      out.splice(type === "signature" || sig < 0 ? out.length : sig, 0, { id: type, type });
    }
  }
  for (const c of clauses) {
    if (seen.has(`terms:${c.key}`)) continue;
    const sig = out.findIndex((b) => b.type === "signature");
    out.splice(sig < 0 ? out.length : sig, 0, { id: c.key, type: "terms" });
  }
  return out;
}

export function layoutOf(draft: Draft): LayoutBlock[] {
  return reconcileLayout(draft.layout, draft.clauses);
}

/** Move a block up (-1) or down (+1); at either end it stays put. */
export function moveBlock(draft: Draft, id: string, delta: -1 | 1): LayoutBlock[] {
  const layout = layoutOf(draft);
  const from = layout.findIndex((b) => b.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** A new terms section at a position in the document (default: before the
 *  signature). */
export function insertClause(
  draft: Draft,
  clause: Omit<ClauseDraft, "key">,
  at?: number,
  key: string = newKey(),
): Partial<Draft> {
  const layout = layoutOf(draft);
  const sig = layout.findIndex((b) => b.type === "signature");
  const pos = at ?? (sig < 0 ? layout.length : sig);
  return {
    clauses: [...draft.clauses, { ...clause, key }],
    layout: [...layout.slice(0, pos), { id: key, type: "terms" }, ...layout.slice(pos)],
  };
}

// ── What goes to the backend ─────────────────────────────────────────

export type Step = "client" | "event" | "items" | "payments" | "terms" | "review";

/** Everything wrong with the draft that would stop it being sent, tagged
 *  with the step that fixes it, in the order the steps come in. */
export function problemsByStep(draft: Draft, today: string): { step: Step; message: string }[] {
  const out: { step: Step; message: string }[] = [];
  const add = (step: Step, message: string) => {
    if (!out.some((p) => p.message === message)) out.push({ step, message });
  };
  if (!draft.dateIso) add("event", "Pick the event date.");
  else if (draft.dateIso < today) add("event", "The event date is in the past.");
  if (draft.multiDay && draft.dateEnd && draft.dateEnd < draft.dateIso) add("event", "The end date is before the start date.");
  if (!draft.timeStart || !draft.timeEnd) add("event", "Add a start and end time.");
  if (!hasPackage(draft)) add("items", "Add at least one of your packages.");
  for (const l of draft.lines) {
    if (isBlankLine(l)) continue;
    if (!l.name.trim()) add("items", "Every line needs a name.");
    if (!(Number(l.quantity) > 0)) add("items", `“${l.name || "A line"}” needs a quantity above zero.`);
  }
  const total = totalCents(draft);
  const noTotal = draft.lines.length > 0 && total <= 0;
  if (noTotal) {
    const discount = toCents(draft.discount);
    add(
      "items",
      discount > 0 && discount >= subtotalCents(draft)
        ? `The discount (${money(discount)}) is as much as the items (${money(subtotalCents(draft))}). The total has to be more than $0.`
        : "The total after the discount must be more than $0.",
    );
  }
  // With no total there's nothing to schedule: fixing the total is the one
  // thing to do, not "add a payment".
  if (!noTotal) {
    if (draft.schedule.length === 0) add("payments", "Add at least one payment to the schedule.");
    else if (scheduledCents(draft) !== total) {
      add("payments", `The payments add up to ${money(scheduledCents(draft))}, but the total is ${money(total)}.`);
    }
  }
  for (const i of draft.schedule) {
    const name = i.label.trim() || "A payment";
    if (!i.label.trim()) add("payments", "Every payment needs a name.");
    if (!(toCents(i.amount) > 0)) add("payments", `“${name}” needs an amount above $0.`);
    if (i.dueType === "date" && !i.dueDate) add("payments", `“${name}” needs a due date.`);
    if (i.dueType === "before_event" && (i.dueDays === "" || !(Number(i.dueDays) >= 0))) {
      add("payments", `“${name}” needs how many days before the event it's due.`);
    }
    const due = dueDateOf(i, draft.dateIso);
    if (due && due < today) {
      add("payments", `“${name}” would be due ${prettyDate(due)}, which has passed. Pick a later date, or fewer days before the event.`);
    }
  }
  const cancellation = cancellationClause(draft);
  for (const c of draft.clauses) {
    // The cancellation section can be the window alone: its sentence is written from it.
    const bodyOptional = c === cancellation && Boolean(draft.cancellationDays.trim());
    if (!c.title.trim() || (!c.body.trim() && !bodyOptional)) add("terms", "Every clause needs a title and some text.");
    if (c.body.includes(BLANK)) add("terms", `Fill in the blank (${BLANK}) in “${c.title.trim() || "a section"}”.`);
  }
  const hold = draft.holdDays.trim();
  if (hold && !(Number.isInteger(Number(hold)) && Number(hold) >= 1 && Number(hold) <= 60)) {
    add("review", "Hold the date for between 1 and 60 days.");
  }
  return out;
}

/** The day a dated payment falls on, as YYYY-MM-DD: its own date, or so many
 *  days before the event. Null for "when they sign", or with no event date to
 *  count back from. The backend's contract_document.scheduled_date. */
export function dueDateOf(i: Pick<InstallmentDraft, "dueType" | "dueDate" | "dueDays">, eventDate: string): string | null {
  if (i.dueType === "date") return i.dueDate || null;
  if (i.dueType !== "before_event" || !eventDate || i.dueDays === "" || !(Number(i.dueDays) >= 0)) return null;
  const [y, m, d] = eventDate.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d - Number(i.dueDays)));
  return Number.isNaN(at.getTime()) ? null : at.toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Worth a second look but fine to send: shown, never blocking. */
export function warningsByStep(draft: Draft): { step: Step; message: string }[] {
  const out: { step: Step; message: string }[] = [];
  const last = draft.multiDay && draft.dateEnd ? draft.dateEnd : draft.dateIso;
  for (const i of draft.schedule) {
    const due = dueDateOf(i, draft.dateIso);
    if (last && due && due > last) {
      out.push({
        step: "payments",
        message: `“${i.label.trim() || "A payment"}” is due ${prettyDate(due)}, after the event. That's fine for a balance on delivery.`,
      });
    }
  }
  return out;
}

export function problems(draft: Draft, today: string): string[] {
  return problemsByStep(draft, today).map((p) => p.message);
}

/** "Sat, Oct 12, 2030 · 7:00 PM – 11:00 PM" — an event's when, as people
 *  read it, from the stored YYYY-MM-DD and 24-hour HH:MM. Parts that aren't
 *  set are left out rather than shown as blanks. */
export function describeWhen(
  dateIso?: string | null,
  dateEnd?: string | null,
  timeStart?: string | null,
  timeEnd?: string | null,
): string {
  const day = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };
  const time = (hhmm: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
    if (!m) return hhmm;
    const h = Number(m[1]);
    return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
  };
  const dates = dateIso && dateIso !== "TBD"
    ? dateEnd && dateEnd !== dateIso ? `${day(dateIso)} – ${day(dateEnd)}` : day(dateIso)
    : "No date yet";
  return timeStart && timeEnd ? `${dates} · ${time(timeStart)} – ${time(timeEnd)}` : dates;
}

/** "Due when signed", "Due Jun 1, 2030", "Due 14 days before the event". */
export function describeDue(i: {
  due_type: DueType;
  due_date?: string | null;
  due_days?: number | null;
  due_on?: string | null;
}): string {
  const pretty = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (i.due_type === "on_signing") return i.due_on ? `Due ${pretty(i.due_on)} (on signing)` : "Due when signed";
  if (i.due_type === "date") return i.due_date ? `Due ${pretty(i.due_date)}` : "Due on a date";
  const days = i.due_days ?? 0;
  const rule = days === 0 ? "on the event day" : `${days} day${days === 1 ? "" : "s"} before the event`;
  return i.due_on ? `Due ${pretty(i.due_on)} (${rule})` : `Due ${rule}`;
}

/** The document half of a create/update — shared by both, so an edit sends
 *  exactly what a create would. */
export function toDocument(draft: Draft) {
  const lines: LineItemInput[] = draft.lines.filter((l) => !isBlankLine(l)).map((l) => ({
    ...(l.id ? { id: l.id } : {}),
    ...(l.description ? { description: l.description } : {}),
    kind: l.kind,
    service_id: l.serviceId,
    addon_id: l.addonId,
    name: l.name.trim(),
    unit: l.unit,
    unit_price_cents: toCents(l.price),
    quantity: Number(l.quantity),
  }));
  const schedule: InstallmentInput[] = draft.schedule.map((i) => ({
    ...(i.id ? { id: i.id } : {}),
    label: i.label.trim(),
    amount_cents: toCents(i.amount),
    due_type: i.dueType,
    due_date: i.dueType === "date" ? i.dueDate : null,
    due_days: i.dueType === "before_event" ? Number(i.dueDays) : null,
  }));
  draft = asSent(draft);
  const layout = layoutOf(draft);
  const byKey = new Map(draft.clauses.map((c) => [c.key, c]));
  // In the document's order, so a client reading clauses sees the same.
  const clauses: Clause[] = layout
    .filter((b) => b.type === "terms" && byKey.has(b.id))
    .map((b) => {
      const c = byKey.get(b.id)!;
      return { key: c.key, title: c.title.trim(), body: c.body.trim() };
    });
  const clauseOf = new Map(clauses.map((c) => [c.key, c]));
  const documentLayout: LayoutBlockInput[] = layout.map((b) =>
    b.type === "terms" ? { id: b.id, type: "terms", title: clauseOf.get(b.id)?.title, body: clauseOf.get(b.id)?.body } : b,
  );
  return {
    document_title: draft.title.trim() || null,
    document_layout: documentLayout,
    guest_name: draft.clientName.trim() || null,
    guest_email: draft.clientEmail.trim() || null,
    guest_phone: draft.clientPhone.trim() || null,
    location: draft.location.trim() || null,
    guest_count: Number(draft.guestCount) > 0 ? Number(draft.guestCount) : null,
    date_iso: draft.dateIso,
    date_end: draft.multiDay && draft.dateEnd ? draft.dateEnd : null,
    time_start: draft.timeStart,
    time_end: draft.timeEnd,
    line_items: lines,
    discount_cents: toCents(draft.discount) || 0,
    payment_schedule: schedule,
    terms_clauses: clauses,
    cancellation_window_hours: draft.cancellationDays ? Number(draft.cancellationDays) * 24 : null,
    overtime_rate_cents: draft.overtimeRate ? toCents(draft.overtimeRate) : null,
  } satisfies ContractCreateInput;
}

/** What fromContract reads: a vendor's Contract, the client's
 *  GuestBooking, or either with a proposal's terms laid over it. */
export interface ContractTermsSource {
  date_iso: string;
  date_end: string | null;
  time_start: string;
  time_end: string;
  location: string;
  guest_count: number | null;
  amount_cents: number;
  deposit_percent: number | null;
  cancellation_window_hours: number | null;
  overtime_rate_cents: number | null;
  contract_terms: ContractTerms | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  line_items?: LineItem[] | null;
  discount_cents?: number | null;
  terms_clauses?: Clause[] | null;
  document_title?: string | null;
  document_layout?: LayoutBlock[] | null;
  payment_schedule?: (Omit<Installment, "due_on" | "marked_paid_at" | "confirmed_at"> & Partial<Installment>)[] | null;
}

export function fromContract(c: ContractTermsSource): Draft {
  const lines: LineDraft[] = (c.line_items ?? []).map((l) => ({
    key: newKey(),
    id: l.id,
    description: l.description,
    kind: l.kind,
    serviceId: l.service_id,
    addonId: l.addon_id,
    name: l.name,
    unit: l.unit,
    price: toDollars(l.unit_price_cents),
    quantity: String(l.quantity),
  }));
  const schedule: InstallmentDraft[] = c.payment_schedule?.length
    ? c.payment_schedule.map((i) => ({
        key: newKey(),
        id: i.id,
        label: i.label,
        amount: toDollars(i.amount_cents),
        dueType: i.due_type,
        dueDate: i.due_date ?? "",
        dueDays: i.due_days != null ? String(i.due_days) : "",
      }))
    : presetSchedule(
        c.deposit_percent ? "deposit_balance" : "full",
        c.amount_cents,
        c.deposit_percent ?? 50,
      );
  const legacy: ClauseDraft[] = [];
  if (c.contract_terms?.equipment_power) legacy.push({ key: "equipment_power", title: "Equipment & power", body: c.contract_terms.equipment_power });
  if (c.contract_terms?.travel) legacy.push({ key: "travel", title: "Travel", body: c.contract_terms.travel });
  const clauses: ClauseDraft[] = c.terms_clauses?.length
    ? c.terms_clauses.map((t) => ({ key: t.key, title: t.title, body: t.body }))
    : legacy;
  return {
    title: c.document_title ?? "",
    layout: reconcileLayout(c.document_layout ?? defaultLayout(clauses.map((x) => x.key)), clauses),
    clientName: c.guest_name ?? "",
    clientEmail: c.guest_email ?? "",
    clientPhone: c.guest_phone ?? "",
    dateIso: c.date_iso,
    multiDay: Boolean(c.date_end && c.date_end !== c.date_iso),
    dateEnd: c.date_end ?? "",
    timeStart: c.time_start,
    timeEnd: c.time_end,
    location: c.location === "TBD" ? "" : c.location,
    guestCount: c.guest_count ? String(c.guest_count) : "",
    lines,
    discount: c.discount_cents ? toDollars(c.discount_cents) : "",
    schedule,
    clauses,
    cancellationDays: c.cancellation_window_hours != null ? String(Math.round(c.cancellation_window_hours / 24)) : "",
    overtimeRate: c.overtime_rate_cents != null ? toDollars(c.overtime_rate_cents) : "",
    holdDays: "",
  };
}

/**
 * A signed-in client's request, as the start of the proposal that accepts
 * it. When and where are the client's — the builder shows them but doesn't
 * send them. The package line carries the request's total when it's known;
 * a per-guest or per-hour one whose count isn't known yet starts at the
 * rate with the quantity blank, for the vendor to fill in.
 */
export function fromRequest(b: RequestSource): Draft {
  const pending = Boolean(b.price_pending_quantity);
  return {
    ...emptyDraft(),
    clientName: b.client_name ?? "",
    dateIso: b.date_iso ?? "",
    dateEnd: b.date_end ?? "",
    multiDay: Boolean(b.date_end && b.date_end !== b.date_iso),
    timeStart: b.time_start ?? "",
    timeEnd: b.time_end ?? "",
    location: b.location === "TBD" ? "" : (b.location ?? ""),
    guestCount: b.guest_count ? String(b.guest_count) : "",
    lines: b.service_id
      ? [
          {
            key: newKey(),
            kind: "package",
            serviceId: b.service_id,
            addonId: null,
            name: b.service_name ?? "Package",
            unit: pending ? lineUnit(b.price_unit) : "event",
            price: String(b.price),
            quantity: pending ? (b.guest_count ? String(b.guest_count) : "") : "1",
          },
        ]
      : [],
  };
}

// ── Templates ────────────────────────────────────────────────────────

/**
 * What a template keeps: the reusable part of a contract — no client, no
 * date. The schedule is kept as shares of the total rather than dollars,
 * so a template made on a $2,000 contract fits a $5,000 one.
 */
export interface TemplateBody {
  version: 1;
  title?: string;
  /** Block order by type; each "terms" takes the next clause in order. */
  layout?: BlockType[];
  lines?: Omit<LineDraft, "key">[];
  discount?: string;
  schedule?: { label: string; percent: number; dueType: DueType; dueDays: string }[];
  clauses?: Omit<ClauseDraft, "key">[];
  cancellationDays?: string;
  overtimeRate?: string;
  holdDays?: string;
}

function withoutKey<T extends { key: string }>(row: T): Omit<T, "key"> {
  const copy: Partial<T> = { ...row };
  delete copy.key;
  return copy as Omit<T, "key">;
}

export function toTemplate(draft: Draft): TemplateBody {
  const total = totalCents(draft);
  const layout = layoutOf(draft);
  const byKey = new Map(draft.clauses.map((c) => [c.key, c]));
  const ordered = layout.filter((b) => b.type === "terms" && byKey.has(b.id)).map((b) => byKey.get(b.id)!);
  return {
    version: 1,
    title: draft.title,
    layout: layout.map((b) => b.type),
    lines: draft.lines.map(withoutKey),
    discount: draft.discount,
    schedule:
      total > 0
        ? draft.schedule.map((i) => ({
            label: i.label,
            percent: (toCents(i.amount) / total) * 100,
            // A fixed date means nothing on the next contract.
            dueType: i.dueType === "date" ? "before_event" : i.dueType,
            dueDays: i.dueType === "date" ? "14" : i.dueDays,
          }))
        : [],
    clauses: ordered.map(withoutKey),
    cancellationDays: draft.cancellationDays,
    overtimeRate: draft.overtimeRate,
    holdDays: draft.holdDays,
  };
}

/** Lay a template over the draft: it replaces what it has, and leaves the
 *  client and the date alone. Lines whose package is gone are dropped. */
export function applyTemplate(draft: Draft, body: TemplateBody, services: { service_id: string }[]): Draft {
  const live = new Set(services.map((s) => s.service_id));
  const next: Draft = { ...draft };
  if (body.lines?.length) {
    next.lines = body.lines
      .filter((l) => l.kind === "custom" || (l.serviceId && live.has(l.serviceId)))
      .map((l) => ({ ...l, key: newKey() }));
  }
  if (body.discount != null) next.discount = body.discount;
  if (body.title) next.title = body.title;
  if (body.clauses?.length) next.clauses = body.clauses.map((c) => ({ ...c, key: newKey() }));
  if (body.layout?.length) {
    // Terms blocks take the template's clauses in order; any left over (or
    // the draft's own, when the template has none) land before the signature.
    const keys = next.clauses.map((c) => c.key);
    let t = 0;
    const blocks: LayoutBlock[] = [];
    for (const type of body.layout) {
      if (type !== "terms") blocks.push({ id: type, type });
      else if (t < keys.length) blocks.push({ id: keys[t++], type: "terms" });
    }
    next.layout = reconcileLayout(blocks, next.clauses);
  } else {
    next.layout = reconcileLayout(next.layout, next.clauses);
  }
  if (body.cancellationDays != null) next.cancellationDays = body.cancellationDays;
  if (body.overtimeRate != null) next.overtimeRate = body.overtimeRate;
  if (body.holdDays != null) next.holdDays = body.holdDays;
  if (body.schedule?.length) {
    const total = totalCents(next);
    const rows = body.schedule.map((s) => ({
      key: newKey(),
      label: s.label,
      amount: toDollars(Math.round((total * s.percent) / 100)),
      dueType: s.dueType,
      dueDate: "",
      dueDays: s.dueDays,
    }));
    next.schedule = rows;
    next.schedule = balanceLastPayment(next);
  }
  return next;
}

// ── Change proposals (backend DECISIONS #23) ─────────────────────────

/** The terms a draft says, in the shape a revision or proposal has — what
 *  the comparison shows before anything is sent. Lines and payments a
 *  client added here get their draft key as an id, so they line up with
 *  themselves; the server gives them their own. */
export function draftTerms(draft: Draft): TermsVersion {
  const doc = toDocument(draft);
  return {
    date_iso: doc.date_iso,
    date_end: doc.date_end,
    time_start: doc.time_start,
    time_end: doc.time_end,
    location: doc.location || "TBD",
    guest_count: doc.guest_count,
    line_items: draft.lines.map((l, i) => {
      const input = doc.line_items[i];
      return {
        id: l.id ?? l.key,
        kind: input.kind,
        service_id: input.service_id ?? null,
        addon_id: input.addon_id ?? null,
        name: input.name ?? "",
        description: l.description ?? null,
        unit: input.unit ?? "event",
        unit_price_cents: input.unit_price_cents,
        quantity: input.quantity,
        total_cents: lineTotalCents(l),
      };
    }),
    discount_cents: doc.discount_cents || null,
    amount_cents: totalCents(draft),
    payment_schedule: doc.payment_schedule.length
      ? doc.payment_schedule.map((p, i) => ({
          id: draft.schedule[i].id ?? draft.schedule[i].key,
          label: p.label,
          amount_cents: p.amount_cents,
          due_type: p.due_type,
          due_date: p.due_date ?? null,
          due_days: p.due_days ?? null,
        }))
      : null,
    terms_clauses: doc.terms_clauses.length ? doc.terms_clauses : null,
    cancellation_window_hours: doc.cancellation_window_hours,
    overtime_rate_cents: doc.overtime_rate_cents,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What a client's proposal sends: only the parts of the draft that differ
 *  from the version they were shown, so an untouched section can't change
 *  by being round-tripped through the form. */
export function proposalChanges(draft: Draft, base: TermsVersion): TermsChanges {
  const next = draftTerms(draft);
  const doc = toDocument(draft);
  const out: TermsChanges = {};
  const scalar = [
    "date_iso", "date_end", "time_start", "time_end", "location", "guest_count",
    "discount_cents", "terms_clauses", "cancellation_window_hours", "overtime_rate_cents",
  ] as const;
  for (const f of scalar) {
    if (!same(next[f], base[f])) (out as Record<string, unknown>)[f] = next[f];
  }
  const lineKey = (l: LineItem) => [l.id, l.kind, l.service_id, l.addon_id, l.name, l.unit, l.unit_price_cents, l.quantity];
  if (!same((next.line_items ?? []).map(lineKey), (base.line_items ?? []).map(lineKey))) {
    out.line_items = doc.line_items;
  }
  if (!same(next.payment_schedule, base.payment_schedule)) out.payment_schedule = doc.payment_schedule;
  // A total that moved needs the schedule sent with it, even if the client
  // only touched the lines and the plan followed on its own.
  if ((out.line_items || "discount_cents" in out) && doc.payment_schedule.length) {
    out.payment_schedule = doc.payment_schedule;
  }
  return out;
}
