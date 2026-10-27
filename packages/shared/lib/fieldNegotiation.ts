// Field-by-field negotiation (backend 0072, its DECISIONS.md #26): the pure
// pieces both sides' workspaces share — how a field's value reads, which
// words of the contract page it highlights, and what the total would come to
// if this send's answers settle. The rules themselves (turns, who may change
// what) are the server's; this file only draws them.

import { fromContract, type Draft } from "./contractDraft";
import type { FieldAnswer, NegotiationFieldView, TermsVersion } from "./contractTypes";

export type InputKind = "date" | "time" | "text" | "count" | "money" | "hours" | "bool" | "schedule" | "newline";

export function kindOf(key: string): InputKind {
  if (key === "event.date") return "date";
  if (key === "event.time") return "time";
  if (key === "event.location") return "text";
  if (key === "event.guests") return "count";
  if (key === "discount" || key === "policy.overtime" || key.endsWith(".price")) return "money";
  if (key === "policy.cancellation") return "hours";
  if (key.endsWith(".included")) return "bool";
  if (key === "schedule") return "schedule";
  if (key.startsWith("line:new:")) return "newline";
  return "count"; // line:<id>.quantity
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

function day(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function clock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

/** A field's value in plain words, as the card and the summary print it. */
export function display(key: string, value: unknown): string {
  if (value === null || value === undefined) return "Not set";
  switch (kindOf(key)) {
    case "date": {
      const v = value as { date_iso: string; date_end: string | null };
      return v.date_end && v.date_end !== v.date_iso ? `${day(v.date_iso)} – ${day(v.date_end)}` : day(v.date_iso);
    }
    case "time": {
      const v = value as { time_start: string; time_end: string };
      return `${clock(v.time_start)} – ${clock(v.time_end)}`;
    }
    case "money":
      return money(Number(value));
    case "hours": {
      const days = Math.round(Number(value) / 24);
      return `${days} day${days === 1 ? "" : "s"}`;
    }
    case "bool":
      return value ? "Included" : "Left out";
    case "schedule":
      return (value as { label: string; amount_cents: number }[])
        .map((i) => `${i.label} ${money(i.amount_cents)}`)
        .join(" · ");
    case "newline": {
      const v = value as { name?: string; quantity?: number; unit_price_cents?: number };
      return `${v.name ?? "Item"} × ${v.quantity ?? 1}${v.unit_price_cents != null ? ` at ${money(v.unit_price_cents)}` : ""}`;
    }
    default:
      return String(value);
  }
}

/** The ids ContractPaper marks for a field, so its value lights up where it
 *  prints. A new item isn't on the page until it settles. */
export function paperIds(key: string): string[] {
  // A new item: previewTerms puts it on the page with id "new:…".
  if (key.startsWith("line:new:")) return [key];
  if (key === "event.date") return ["event.date", "event.dateEnd"];
  if (key === "event.time") return ["event.start", "event.end"];
  if (key === "event.location") return ["event.venue"];
  if (key === "event.guests") return ["event.guests"];
  if (key === "discount" || key.startsWith("policy.")) return [key];
  const line = /^line:(.+)\.(quantity|price|included)$/.exec(key);
  if (line) return [line[2] === "included" ? `line:${line[1]}` : `line:${line[1]}.${line[2]}`];
  const clause = /^clause:(.+)\.included$/.exec(key);
  if (clause) return [`clause:${clause[1]}`];
  return [];
}

/** The agreed terms as a draft ContractPaper can draw. */
export function paperDraft(terms: TermsVersion): Draft {
  return fromContract({
    ...terms,
    deposit_percent: null,
    contract_terms: null,
    guest_name: null,
    guest_email: null,
    guest_phone: null,
  });
}

/** What the value would be if this answer settles: accepted → theirs, kept →
 *  the agreed one, anything else → the value sent. */
export function answerValue(field: NegotiationFieldView, answer: FieldAnswer): unknown {
  if (answer.action === "accept") return field.proposed;
  if (answer.action === "keep") return field.value;
  return answer.value;
}

/** The contract total if every answer in this send settled — a preview for
 *  the footer, not a promise: the other side still has to agree to changes. */
export function estimateTotal(terms: TermsVersion, fields: NegotiationFieldView[], answers: FieldAnswer[]): number {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const over = new Map<string, unknown>();
  for (const a of answers) {
    const f = byKey.get(a.key);
    over.set(a.key, f ? answerValue(f, a) : a.value);
  }
  let subtotal = 0;
  for (const line of terms.line_items ?? []) {
    if (over.get(`line:${line.id}.included`) === false) continue;
    const qty = Number(over.get(`line:${line.id}.quantity`) ?? line.quantity);
    const price = Number(over.get(`line:${line.id}.price`) ?? line.unit_price_cents);
    subtotal += Math.round(qty * price);
  }
  for (const [key, value] of over) {
    if (!key.startsWith("line:new:") || !value) continue;
    const v = value as { quantity?: number; unit_price_cents?: number };
    subtotal += Math.round((v.quantity ?? 1) * (v.unit_price_cents ?? 0));
  }
  const discount = Number(over.has("discount") ? over.get("discount") : (terms.discount_cents ?? 0));
  return subtotal - discount;
}

export const centsToDollars = (cents: unknown) => (cents == null ? "" : String(Number(cents) / 100));
export const dollarsToCents = (raw: string) => Math.round(Number(raw) * 100);
export const hoursToDays = (hours: unknown) => (hours == null ? "" : String(Math.round(Number(hours) / 24)));
export const daysToHours = (raw: string) => Math.round(Number(raw)) * 24;

/** Fields the reader has to answer this turn. */
export function waitingOn(fields: NegotiationFieldView[], side: "client" | "vendor"): NegotiationFieldView[] {
  return fields.filter((f) => f.state === (side === "client" ? "waiting_client" : "waiting_vendor"));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The answers worth sending: a field opened with "Change" but left as it was
 *  isn't a change (web #168 sent "Guest count 150 → 150"). */
export function effectiveAnswers(fields: NegotiationFieldView[], answers: FieldAnswer[]): FieldAnswer[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return answers.filter((a) => {
    const f = byKey.get(a.key);
    return !(f && (a.action === "change" || a.action === "reopen") && same(a.value, f.value));
  });
}

/** What's wrong with a value the reader typed, in the server's terms, or
 *  null. The server refuses the same (backend DECISIONS #28). */
export function valueProblem(key: string, value: unknown): string | null {
  const k = kindOf(key);
  if (key === "event.guests") {
    const n = Number(value);
    if (value != null && !(Number.isInteger(n) && n >= 1 && n <= 100_000)) return "A guest count is a whole number from 1 to 100,000.";
  } else if (k === "count") {
    if (!(Number(value) > 0)) return "A quantity has to be above zero.";
  } else if (k === "money") {
    if (value == null || Number.isNaN(Number(value)) || Number(value) < 0) return "Enter an amount of $0 or more.";
    if (key.endsWith(".price") && Number(value) === 0) return "A price has to be above $0 — leave the item out instead.";
  }
  return null;
}

/** "Send 2 answers", "Send 3 changes", "Send 2 answers and 1 change" — what
 *  the reader is actually doing (web #168: a client's first asks said
 *  "Send 0 answers"). */
export function sendLabel(answers: FieldAnswer[]): string {
  const answered = answers.filter((a) => a.action === "accept" || a.action === "counter" || a.action === "keep").length;
  const changed = answers.length - answered;
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (!answers.length) return "Send";
  if (!changed) return `Send ${n(answered, "answer")}`;
  if (!answered) return `Send ${n(changed, "change")}`;
  return `Send ${n(answered, "answer")} and ${n(changed, "change")}`;
}

/** The agreed terms with this send's answers in, so the contract on the left
 *  reads as it would if they're agreed (web #153). The other side's open asks
 *  stay as they are; only what the reader is doing is applied. */
export function previewTerms(terms: TermsVersion, fields: NegotiationFieldView[], answers: FieldAnswer[]): TermsVersion {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: TermsVersion = { ...terms, line_items: [...(terms.line_items ?? [])], terms_clauses: [...(terms.terms_clauses ?? [])] };
  const dropLines = new Set<string>();
  const dropClauses = new Set<string>();
  for (const a of answers) {
    const f = byKey.get(a.key);
    const v = f ? answerValue(f, a) : a.value;
    if (v === undefined) continue;
    const line = /^line:(.+)\.(quantity|price|included)$/.exec(a.key);
    const clause = /^clause:(.+)\.included$/.exec(a.key);
    if (a.key === "event.date" && v) Object.assign(out, v as object);
    else if (a.key === "event.time" && v) Object.assign(out, v as object);
    else if (a.key === "event.location") out.location = String(v ?? "");
    else if (a.key === "event.guests") out.guest_count = v as number | null;
    else if (a.key === "discount") out.discount_cents = v as number | null;
    else if (a.key === "policy.cancellation") out.cancellation_window_hours = v as number | null;
    else if (a.key === "policy.overtime") out.overtime_rate_cents = v as number | null;
    else if (a.key === "schedule") out.payment_schedule = v as TermsVersion["payment_schedule"];
    else if (a.key.startsWith("line:new:") && v) {
      const n = v as { name?: string; quantity?: number; unit_price_cents?: number; service_id?: string; addon_id?: string };
      const qty = n.quantity ?? 1;
      const price = n.unit_price_cents ?? 0;
      out.line_items!.push({
        id: a.key.slice("line:".length),
        kind: n.addon_id ? "addon" : "package",
        service_id: n.service_id ?? null,
        addon_id: n.addon_id ?? null,
        name: n.name ?? "Item",
        description: null,
        unit: "item",
        unit_price_cents: price,
        quantity: qty,
        total_cents: Math.round(qty * price),
      });
    } else if (line) {
      const [, id, part] = line;
      if (part === "included") {
        if (v === false) dropLines.add(id);
      } else {
        out.line_items = out.line_items!.map((l) => {
          if (l.id !== id) return l;
          const next = { ...l, [part === "price" ? "unit_price_cents" : "quantity"]: Number(v) };
          return { ...next, total_cents: Math.round(next.unit_price_cents * next.quantity) };
        });
      }
    } else if (clause && v === false) dropClauses.add(clause[1]);
  }
  out.line_items = out.line_items!.filter((l) => !dropLines.has(l.id));
  out.terms_clauses = out.terms_clauses!.filter((c) => !dropClauses.has(c.key));
  out.amount_cents = estimateTotal(terms, fields, answers);
  // The schedule follows the total as the backend's follow_total does, so
  // the preview never shows $1,200 of payments on a $500 total (2026-10-26).
  if (!answers.some((x) => x.key === "schedule")) out.payment_schedule = followTotal(out.payment_schedule, out.amount_cents);
  return out;
}

/** The schedule rescaled to a new total, in proportion, with the remainder
 *  on the last payment — backend field_negotiation_service.follow_total. */
export function followTotal(schedule: TermsVersion["payment_schedule"], total: number): TermsVersion["payment_schedule"] {
  if (!schedule?.length) return schedule;
  const old = schedule.reduce((sum, i) => sum + i.amount_cents, 0) || 1;
  if (old === total) return schedule;
  let running = 0;
  return schedule.map((i, idx) => {
    if (idx === schedule.length - 1) return { ...i, amount_cents: total - running };
    const amount = Math.max(1, Math.round((i.amount_cents * total) / old));
    running += amount;
    return { ...i, amount_cents: amount };
  });
}
