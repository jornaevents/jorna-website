"use client";

// The field-by-field negotiation workspace (backend 0072, its DECISIONS.md
// #26), for either side. The contract as a page on the left, with every open
// change highlighted where it prints; on the right, only what needs an
// answer, each as a labeled card — so nobody has to reread the contract to
// find what moved.
//
// The rules are the server's. This collects one send's answers — Accept,
// Counter or Keep mine for each field waiting on the reader, plus any
// changes they want — and hands them to the host, which knows which side's
// endpoint to call.

import { AddressStringFields } from "../AddressFields";
import { useState, type ReactNode } from "react";
import { ApiError } from "../../lib/api";
import type { FieldAnswer, NegotiationFieldView, FieldNegotiationState, InstallmentTerms } from "../../lib/contractTypes";
import {
  answerValue,
  centsToDollars,
  daysToHours,
  display,
  dollarsToCents,
  effectiveAnswers,
  estimateTotal,
  hoursToDays,
  kindOf,
  paperDraft,
  paperIds,
  previewTerms,
  sendLabel,
  valueProblem,
  waitingOn,
} from "../../lib/fieldNegotiation";
import { Button, TimeField } from "../ui";
import { ContractPaper, type Mark } from "./ContractPaper";
import { DateField } from "../DateField";


const inputClass =
  "w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    on ? "border-gold bg-gold/15 text-ink" : "border-card-edge text-ink-soft hover:border-gold hover:text-ink"
  }`;

const GROUP_NAMES: Record<string, string> = {
  event: "Event",
  items: "Items",
  prices: "Prices",
  policies: "Policies",
  clauses: "Sections",
};

function scheduleProblem(value: unknown, total: number): string | null {
  if (!Array.isArray(value) || value.length === 0) return "Add at least one payment to the schedule.";
  const rows = value as InstallmentTerms[];
  for (const [index, row] of rows.entries()) {
    if (!row.label?.trim()) return `Name payment ${index + 1}.`;
    if (!Number.isInteger(row.amount_cents) || row.amount_cents <= 0) return `Enter an amount above $0 for ${row.label}.`;
    if (row.due_type === "date" && !row.due_date) return `Choose a due date for ${row.label}.`;
    if (row.due_type === "before_event" && (!Number.isInteger(row.due_days) || row.due_days! < 0)) {
      return `Enter the number of days before the event for ${row.label}.`;
    }
  }
  const scheduled = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  return scheduled === total ? null : `Payments add up to ${display("discount", scheduled)}, but the total is ${display("discount", total)}.`;
}

function ScheduleInput({
  value,
  onChange,
  inputId,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  inputId?: string;
}) {
  const rows = (Array.isArray(value) ? value : []) as InstallmentTerms[];
  const update = (index: number, patch: Partial<InstallmentTerms>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="grid gap-2.5">
      {rows.map((row, index) => (
        <fieldset key={row.id} className="grid gap-2 rounded-lg border border-line-soft p-3">
          <legend className="px-1 text-xs font-semibold text-ink-soft">Payment {index + 1}</legend>
          <label className="grid gap-1 text-xs text-ink-soft">
            <span>Name</span>
            <input id={inputId ? `${inputId}-${index}-label` : undefined} aria-label={`Payment ${index + 1} name`} className={inputClass} value={row.label}
              onChange={(e) => update(index, { label: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-ink-soft">
            <span>Amount ($)</span>
            <input id={inputId ? `${inputId}-${index}-amount` : undefined} aria-label={`${row.label || `Payment ${index + 1}`} amount ($)`}
              type="number" min="0.01" step="0.01" className={inputClass} value={centsToDollars(row.amount_cents)}
              onChange={(e) => update(index, { amount_cents: e.target.value === "" ? 0 : dollarsToCents(e.target.value) })} />
          </label>
          <label className="grid gap-1 text-xs text-ink-soft">
            <span>Due</span>
            <select id={inputId ? `${inputId}-${index}-due-type` : undefined} aria-label={`${row.label || `Payment ${index + 1}`} due`} className={inputClass}
              value={row.due_type}
              onChange={(e) => {
                const due_type = e.target.value as InstallmentTerms["due_type"];
                update(index, {
                  due_type,
                  due_date: due_type === "date" ? row.due_date : null,
                  due_days: due_type === "before_event" ? row.due_days ?? 14 : null,
                });
              }}>
              <option value="on_signing">On signing</option>
              <option value="date">On a specific date</option>
              <option value="before_event">Before the event</option>
            </select>
          </label>
          {row.due_type === "date" ? (
            <label className="grid gap-1 text-xs text-ink-soft">
              <span>Due date</span>
              <DateField id={inputId ? `${inputId}-${index}-date` : undefined} aria-label={`${row.label || `Payment ${index + 1}`} due date`}
                className={inputClass} value={row.due_date ?? ""}
                onChange={(iso) => update(index, { due_date: iso || null })} />
            </label>
          ) : null}
          {row.due_type === "before_event" ? (
            <label className="grid gap-1 text-xs text-ink-soft">
              <span>Days before the event</span>
              <input id={inputId ? `${inputId}-${index}-days` : undefined} aria-label={`${row.label || `Payment ${index + 1}`} days before event`}
                type="number" min="0" step="1" className={inputClass} value={row.due_days ?? ""}
                onChange={(e) => update(index, { due_days: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
          ) : null}
          <button type="button" className="justify-self-start text-xs font-semibold text-maroon hover:underline dark:text-gold"
            aria-label={`Remove ${row.label || `payment ${index + 1}`}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
            Remove payment
          </button>
        </fieldset>
      ))}
      <button type="button" className="justify-self-start text-xs font-semibold text-gold hover:underline"
        onClick={() => onChange([...rows, {
          id: `new-${Math.random().toString(36).slice(2, 10)}`,
          label: `Payment ${rows.length + 1}`,
          amount_cents: 0,
          due_type: "on_signing",
          due_date: null,
          due_days: null,
        }])}>
        Add payment
      </button>
    </div>
  );
}

const fieldControlId = (key: string) => `negotiation-field-${encodeURIComponent(key)}`;
const fieldInputId = (key: string) => `${fieldControlId(key)}-input`;

/** An input for one field's value, in the units a person thinks in. */
function ValueInput({
  field,
  value,
  onChange,
  inputId,
}: {
  field: NegotiationFieldView;
  value: unknown;
  onChange: (v: unknown) => void;
  inputId?: string;
}) {
  const k = kindOf(field.key);
  if (field.key === "event.location") {
    return <AddressStringFields value={value == null ? "" : String(value)} onChange={onChange} />;
  }
  if (k === "date") {
    const v = (value ?? {}) as { date_iso?: string; date_end?: string | null };
    return (
      <div className="grid grid-cols-2 gap-2">
        <DateField id={inputId ? `${inputId}-start` : undefined} aria-label={`${field.label}: start`} className={inputClass} value={v.date_iso ?? ""}
          rangeWith={v.date_end ?? undefined} onChange={(iso) => onChange({ date_iso: iso, date_end: v.date_end ?? null })} />
        <DateField id={inputId ? `${inputId}-end` : undefined} aria-label={`${field.label}: last day (optional)`} className={inputClass} value={v.date_end ?? ""}
          min={v.date_iso || undefined} rangeWith={v.date_iso ?? undefined} onChange={(iso) => onChange({ date_iso: v.date_iso ?? "", date_end: iso || null })} />
      </div>
    );
  }
  if (k === "time") {
    const v = (value ?? {}) as { time_start?: string; time_end?: string };
    return (
      <div className="grid gap-2">
        <TimeField name={`${field.label}: start`} value={v.time_start ?? ""}
          onChange={(t) => onChange({ time_start: t, time_end: v.time_end ?? "" })} />
        <TimeField name={`${field.label}: end`} value={v.time_end ?? ""}
          onChange={(t) => onChange({ time_start: v.time_start ?? "", time_end: t })} />
      </div>
    );
  }
  if (k === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input id={inputId} aria-label={field.label} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        Include it
      </label>
    );
  }
  if (k === "schedule") {
    return <ScheduleInput value={value} onChange={onChange} inputId={inputId} />;
  }
  if (k === "money") {
    return (
      <input id={inputId} aria-label={`${field.label} ($)`} type="number" min={0} step="0.01" className={inputClass}
        value={centsToDollars(value)} onChange={(e) => onChange(e.target.value === "" ? null : dollarsToCents(e.target.value))} />
    );
  }
  if (k === "hours") {
    return (
      <input id={inputId} aria-label={`${field.label} (days)`} type="number" min={0} className={inputClass}
        value={hoursToDays(value)} onChange={(e) => onChange(e.target.value === "" ? null : daysToHours(e.target.value))} />
    );
  }
  if (k === "count") {
    return (
      <input id={inputId} aria-label={field.label} type="number" min={1} step="any" className={inputClass}
        value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    );
  }
  return (
    <input id={inputId} aria-label={field.label} className={inputClass} value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)} />
  );
}

/** A field waiting on the reader: theirs against the agreed value, and three ways to answer. */
function AnswerCard({
  field,
  answer,
  otherName,
  canCounter,
  onAnswer,
}: {
  field: NegotiationFieldView;
  answer: FieldAnswer | undefined;
  otherName: string;
  canCounter: boolean;
  onAnswer: (a: FieldAnswer | null) => void;
}) {
  const action = answer?.action;
  // Their keep matches the contract only when they hold the contract's own
  // value; a keep of an earlier ask shows as that ask (backend DECISIONS #37).
  const kept = JSON.stringify(field.proposed ?? null) === JSON.stringify(field.value ?? null);
  const asked = field.your_last_ask;
  const problem = action === "counter" ? valueProblem(field.key, answer?.value) : null;
  return (
    <section aria-label={field.label} className="rounded-xl border border-gold/50 bg-card p-3.5">
      <p className="text-sm font-semibold text-ink">{field.label}</p>
      {kept ? (
        <p className="mt-1.5 text-xs text-ink-soft">
          <strong className="text-ink">{otherName} kept {display(field.key, field.value)}</strong>
          {asked !== undefined && asked !== null ? ` (you asked ${display(field.key, asked)})` : ""}
        </p>
      ) : (
        <dl className="mt-1.5 grid gap-0.5 text-xs">
          <div className="flex gap-1.5"><dt className="text-ink-faint">Contract:</dt><dd className="text-ink-soft">{display(field.key, field.value)}</dd></div>
          {asked !== undefined && asked !== null ? (
            <div className="flex gap-1.5"><dt className="text-ink-faint">You asked:</dt><dd className="text-ink-soft">{display(field.key, asked)}</dd></div>
          ) : null}
          <div className="flex gap-1.5"><dt className="text-ink-faint">{otherName} {asked != null ? "answered" : "asked"}:</dt><dd className="font-semibold text-ink">{display(field.key, field.proposed)}</dd></div>
        </dl>
      )}
      {field.note ? <p className="mt-1.5 text-xs italic text-ink-soft">“{field.note}”</p> : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {/* Each answer names the value it settles on, so "Accept" and "Keep"
            can't be read the wrong way round (2026-10-26 test). */}
        <button type="button" className={chip(action === "accept")} onClick={() => onAnswer(action === "accept" ? null : { key: field.key, action: "accept" })}>
          Accept {display(field.key, field.proposed)}
        </button>
        {canCounter ? (
          <button type="button" className={chip(action === "counter")}
            onClick={() => onAnswer(action === "counter" ? null : { key: field.key, action: "counter", value: field.proposed })}>
            Counter
          </button>
        ) : null}
        <button type="button" className={chip(action === "keep")} onClick={() => onAnswer(action === "keep" ? null : { key: field.key, action: "keep" })}>
          {asked != null ? `Ask for ${display(field.key, asked)} again` : `Keep ${display(field.key, field.value)}`}
        </button>
      </div>
      {action === "counter" ? (
        <div className="mt-2.5">
          <ValueInput
            field={field}
            value={answer?.value}
            inputId={fieldInputId(field.key)}
            onChange={(v) => onAnswer({ key: field.key, action: "counter", value: v })}
          />
          {problem ? <p className="mt-1 text-xs text-maroon dark:text-gold">{problem}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function FieldNegotiationWorkspace({
  state,
  title,
  vendorName,
  clientName,
  onSend,
  onSaveDraft,
  onClose,
  headerActions,
  signSlot,
  footerNote,
}: {
  state: FieldNegotiationState;
  title: string;
  vendorName: string;
  clientName: string;
  onSend: (answers: FieldAnswer[], message: string | null) => Promise<void>;
  onSaveDraft?: (answers: FieldAnswer[], message: string | null) => Promise<void>;
  onClose?: () => void;
  headerActions?: ReactNode;
  /** The client's Sign block, shown once nothing is waiting. */
  signSlot?: ReactNode;
  /** A line above the note box, e.g. how long the vendor is holding the date. */
  footerNote?: ReactNode;
}) {
  const side = state.side;
  const otherName = side === "client" ? vendorName : clientName;
  const myTurn = state.may_send ?? state.turn === side;
  // Nothing open on either side: it's agreed and waits for the signature.
  const agreed = state.fields.every((f) => f.state !== "waiting_client" && f.state !== "waiting_vendor");
  const usableDraft = state.draft && !state.draft.stale ? state.draft : null;

  const [answers, setAnswers] = useState<Record<string, FieldAnswer>>(() =>
    Object.fromEntries((usableDraft?.answers ?? []).map((a) => [a.key, a])),
  );
  const [message, setMessage] = useState(usableDraft?.message ?? "");
  // Folded until wanted: open, the footer covered the answers on a short
  // laptop screen (2026-10-26 test).
  const [noteOpen, setNoteOpen] = useState(Boolean(usableDraft?.message));
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const waiting = waitingOn(state.fields, side);
  const theirs = state.fields.filter((f) => f.proposed_by && f.proposed_by !== side && f.state !== "settled" && f.state !== "agreed");
  const open = state.fields.filter((f) => (f.state === "agreed" || f.state === "settled") && kindOf(f.key) !== "newline");
  // Everything the reader has opened, and what of it actually changes
  // something — only that is sent and counted.
  const all = Object.values(answers);
  const list = effectiveAnswers(state.fields, all);
  const mine = all.filter((a) => a.action === "change" || a.action === "reopen");
  const total = estimateTotal(state.terms, state.fields, list);
  const scheduleAnswer = all.find((a) => a.key === "schedule" && ["counter", "change", "reopen"].includes(a.action));
  const scheduleIssue = scheduleAnswer ? scheduleProblem(scheduleAnswer.value, total) : null;
  const problems = all
    .filter((a) => a.action === "counter" || a.action === "change" || a.action === "reopen")
    .map((a) => valueProblem(a.key, a.value))
    .filter((p): p is string => Boolean(p));
  if (scheduleIssue) problems.push(scheduleIssue);
  const unanswered = waiting.filter((f) => !answers[f.key]);

  const set = (key: string, a: FieldAnswer | null) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (a) next[key] = a;
      else delete next[key];
      // An item left out takes its price and quantity asks with it; the
      // backend refuses them together (DECISIONS #37 there).
      const line = /^line:(.+)\.included$/.exec(key);
      if (line && a?.value === false) {
        delete next[`line:${line[1]}.price`];
        delete next[`line:${line[1]}.quantity`];
      }
      return next;
    });

  // Packages still in if this send were agreed: the last one can't be left
  // out, nor any while the vendor's prices are fixed (decisions D and E).
  const packageIds = (state.terms.line_items ?? []).filter((l) => l.kind === "package").map((l) => l.id);
  const packagesLeft = packageIds.filter((id) => answers[`line:${id}.included`]?.value !== false).length;
  const cantLeaveOut = (key: string): string | null => {
    const line = /^line:(.+)\.included$/.exec(key);
    if (!line || !packageIds.includes(line[1])) return null;
    if (side === "client" && state.locks.includes("prices")) return `Fixed by ${vendorName}`;
    return packagesLeft <= 1 ? "Needs one package" : null;
  };

  // Rose: the other side's open asks. Gold: what the reader is changing now.
  const previewSchedule = previewTerms(state.terms, state.fields, list).payment_schedule ?? [];
  const scheduleIds = [...(state.terms.payment_schedule ?? []), ...previewSchedule].flatMap((i) => [
    `pay:${i.id}.amount`,
    ...(i.due_type === "date" ? [`pay:${i.id}.dueDate`] : []),
    ...(i.due_type === "before_event" ? [`pay:${i.id}.dueDays`] : []),
  ]);
  const paperIdsFor = (key: string) => key === "schedule" ? [...new Set(scheduleIds)] : paperIds(key);
  const scheduleControlIds = new Map<string, string>();
  previewSchedule.forEach((item, index) => {
    const prefix = `${fieldInputId("schedule")}-${index}`;
    scheduleControlIds.set(`pay:${item.id}.amount`, `${prefix}-amount`);
    if (item.due_type === "date") scheduleControlIds.set(`pay:${item.id}.dueDate`, `${prefix}-date`);
    if (item.due_type === "before_event") scheduleControlIds.set(`pay:${item.id}.dueDays`, `${prefix}-days`);
  });
  const marks = new Map<string, Mark>();
  for (const f of theirs) for (const id of paperIdsFor(f.key)) marks.set(id, "other");
  for (const a of list) {
    if (a.action === "change" || a.action === "counter" || a.action === "reopen" || a.action === "accept") {
      for (const id of paperIdsFor(a.key)) marks.set(id, "yours");
    }
  }

  const lastFromThem = state.last_send && state.last_send.side !== side ? state.last_send : null;
  const byKey = new Map(state.fields.map((f) => [f.key, f]));
  const fieldByPaperId = new Map<string, string>();
  const waitingKeys = new Set(waiting.map((f) => f.key));
  for (const f of state.fields) {
    const editable = myTurn && f.can_change && (f.state === "agreed" || (side === "vendor" && f.state === "settled"));
    if (!editable && !(myTurn && waitingKeys.has(f.key))) continue;
    for (const id of paperIdsFor(f.key)) fieldByPaperId.set(id, f.key);
  }

  function focusFieldFromPaper(paperId: string) {
    const key = fieldByPaperId.get(paperId);
    if (!key) return;
    const field = document.getElementById(fieldControlId(key));
    if (!field) return;
    const details = field.closest("details");
    if (details && !details.open) details.open = true;
    setFocusedField(key);
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    let targetId = scheduleControlIds.get(paperId);
    if (key === "event.date") targetId = `${fieldInputId(key)}-${paperId === "event.dateEnd" ? "end" : "start"}`;
    const controls = Array.from(field.querySelectorAll<HTMLElement>("input:not([type='hidden']), select, textarea, button"));
    const timeControl = key === "event.time"
      ? controls.find((control) => control.getAttribute("aria-label")?.endsWith(`${paperId === "event.end" ? "end" : "start"} — hour`))
      : undefined;
    const control = timeControl ?? (targetId ? document.getElementById(targetId) : null) ?? controls[0];
    if (control) requestAnimationFrame(() => control.focus({ preventScroll: true }));
  }

  function markOf(paperId: string): Mark {
    return marks.get(paperId) ?? (fieldByPaperId.get(paperId) === focusedField ? "yours" : null);
  }

  function isFocused(paperId: string): boolean {
    return fieldByPaperId.get(paperId) === focusedField;
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      await onSend(list, message.trim() || null);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't send that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!onSaveDraft) return;
    setBusy("draft");
    setError(null);
    try {
      await onSaveDraft(list, message.trim() || null);
      setNotice("Draft saved.");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't save the draft.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Round {state.round}</p>
          {/* Truncating clips to the line box, which .serif's 1.14 makes shorter
              than the descenders. */}
          <h2 className="serif truncate text-xl text-ink" style={{ lineHeight: 1.35 }}>{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-ink-soft">
            {agreed ? (side === "vendor" ? `Agreed — waiting for ${otherName} to sign` : "Agreed") : myTurn ? "Your turn" : `${otherName}'s turn`}
          </span>
          {headerActions}
          {onClose ? (
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:text-ink">
              Close
            </button>
          ) : null}
        </div>
      </header>

      {state.nudge ? (
        <p role="note" className="border-b border-line-soft bg-gold/10 px-5 py-2 text-sm text-ink-soft">
          This is round {state.round}. If you&apos;re going back and forth, a quick call or message with {otherName} might settle it faster.
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_25rem] lg:overflow-hidden">
        <div className="min-w-0 px-5 py-6 lg:overflow-y-auto">
          <div aria-label="Contract" role="region" className="mx-auto max-w-2xl">
            {/* With the reader's answers in, marked: the contract as it would read (#153). */}
            <ContractPaper
              draft={paperDraft(previewTerms(state.terms, state.fields, list))}
              markOf={markOf}
              focusedOf={isFocused}
              vendorName={vendorName}
              clientName={clientName}
              title={title}
              onPick={focusFieldFromPaper}
              pickableOf={(id) => fieldByPaperId.has(id)}
            />
          </div>
        </div>

        {/* On a phone the answers come first — they're what needs doing; the
            contract is below to check against. */}
        <aside aria-label="Your answers" className="order-first flex flex-col border-b border-line-soft bg-ground lg:order-none lg:min-h-0 lg:border-b-0 lg:border-l">
          <div className="grid content-start gap-5 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {!myTurn ? (
              <section className="rounded-xl bg-panel p-4 text-sm text-ink-soft">
                <p className="font-semibold text-ink">Waiting on {otherName}</p>
                <p className="mt-1">
                  {state.last_send && state.last_send.side === side
                    ? `You sent ${sendLabel(state.last_send.answers).replace(/^Send /, "")} in round ${state.last_send.round}. `
                    : ""}
                  We&apos;ll email you when they answer.
                </p>
                {theirs.length === 0 && waitingOn(state.fields, side === "client" ? "vendor" : "client").length ? (
                  <ul className="mt-2 grid gap-1 text-xs">
                    {waitingOn(state.fields, side === "client" ? "vendor" : "client").map((f) => (
                      <li key={f.key}>{f.label}: you asked for {display(f.key, f.proposed)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {myTurn && lastFromThem?.message ? (
              <section aria-label={`${otherName}'s note`} className="rounded-xl border border-line-soft bg-card p-3.5 text-sm">
                <p className="text-xs font-semibold text-ink-faint">{otherName}&apos;s note</p>
                <p className="mt-1 whitespace-pre-wrap text-ink">“{lastFromThem.message}”</p>
              </section>
            ) : null}

            {agreed && side === "vendor" ? (
              <section className="rounded-xl bg-panel p-4 text-sm text-ink-soft">
                <p className="font-semibold text-ink">Everything&apos;s agreed</p>
                <p className="mt-1">
                  {otherName} can sign now. Change something below only if you need to — it goes to them as a new round.
                </p>
              </section>
            ) : null}

            {myTurn && waiting.length ? (
              <section aria-label="Waiting on you" className="grid gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">Waiting on you ({waiting.length})</h3>
                  {waiting.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-gold hover:underline"
                      onClick={() => {
                        for (const f of waiting) set(f.key, { key: f.key, action: "accept" });
                      }}
                    >
                      Accept all
                    </button>
                  ) : null}
                </div>
                {waiting.map((f) => (
                  <div
                    key={f.key}
                    id={fieldControlId(f.key)}
                    onFocusCapture={() => setFocusedField(f.key)}
                    onBlurCapture={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedField(null);
                    }}
                  >
                    <AnswerCard
                      field={f}
                      answer={answers[f.key]}
                      otherName={otherName}
                      canCounter={f.can_change && !(side === "client" && f.group === "schedule") && !["newline", "bool"].includes(kindOf(f.key))}
                      onAnswer={(a) => set(f.key, a)}
                    />
                  </div>
                ))}
              </section>
            ) : null}

            {myTurn && mine.length ? (
              <section aria-label="Your changes" className="grid gap-2">
                <h3 className="text-sm font-semibold text-ink">Your changes</h3>
                {mine.map((a) => {
                  const f = byKey.get(a.key);
                  return (
                    <div key={a.key} className="rounded-lg border border-line-soft px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink">
                          {f?.label ?? `Add ${(a.value as { name?: string } | undefined)?.name ?? "an item"}`}
                        </span>
                        <button type="button" className="text-xs text-ink-faint hover:text-maroon" onClick={() => set(a.key, null)}>
                          Undo
                        </button>
                      </div>
                      {f ? (
                        <p className="text-xs text-ink-faint">
                          {list.includes(a) ? (
                            <>
                              {display(a.key, f.value)} → <strong className="text-ink">{display(a.key, answerValue(f, a))}</strong>
                            </>
                          ) : (
                            "Not changed yet"
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-faint">{display(a.key, a.value)}</p>
                      )}
                    </div>
                  );
                })}
              </section>
            ) : null}

            {myTurn ? (
              <section aria-label="Available contract fields" className="grid gap-4">
                <h3 className="text-sm font-semibold text-ink">Review and edit available fields</h3>
                {Object.entries(GROUP_NAMES).map(([group, name]) => {
                    const rows = open.filter((f) => f.group === group || (group === "prices" && f.group === "schedule"));
                  if (!rows.length) return null;
                  return (
                    <section key={group} aria-label={name} className="grid gap-2.5 rounded-xl border border-line-soft bg-card p-3.5">
                      <h4 className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{name}</h4>
                      {rows.map((f) => {
                        const a = answers[f.key];
                        const constraint = cantLeaveOut(f.key);
                        const value = a && (a.action === "change" || a.action === "reopen") ? a.value : f.value;
                        return (
                          <div
                            key={f.key}
                            id={fieldControlId(f.key)}
                            className="grid gap-1.5 border-t border-line-soft pt-2.5 first:border-0 first:pt-0"
                            onFocusCapture={() => setFocusedField(f.key)}
                            onBlurCapture={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedField(null);
                            }}
                          >
                            <span className="text-sm font-medium text-ink">{f.label}</span>
                            {f.state === "settled" && !(a?.action === "reopen") ? (
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm text-ink-soft">{display(f.key, f.value)}</span>
                                {side === "vendor" && myTurn && f.can_change ? (
                                  <button type="button" className="text-xs font-semibold text-gold hover:underline"
                                    onClick={() => set(f.key, { key: f.key, action: "reopen", value: f.value })}>
                                    Reopen
                                  </button>
                                ) : null}
                              </div>
                            ) : !f.can_change ? (
                              <p className="text-sm text-ink-soft">{f.locked ? `Fixed by ${vendorName}` : display(f.key, f.value)}</p>
                            ) : constraint && !a ? (
                              <p className="text-sm text-ink-soft">
                                {display(f.key, f.value)} <span className="ml-1 text-xs text-ink-faint">{constraint}</span>
                              </p>
                            ) : (
                              <>
                                <ValueInput
                                  field={f}
                                  value={value}
                                  inputId={fieldInputId(f.key)}
                                  onChange={(v) => set(f.key, { key: f.key, action: f.state === "settled" ? "reopen" : "change", value: v, note: a?.note })}
                                />
                                {constraint ? <p className="text-xs text-ink-faint">{constraint}</p> : null}
                                {(a?.action === "change" || a?.action === "reopen") && list.includes(a) ? (
                                  <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                                    <span>Was {display(f.key, f.value)}</span>
                                    <button type="button" className="font-semibold text-gold hover:underline" onClick={() => set(f.key, null)}>
                                      Undo
                                    </button>
                                  </div>
                                ) : null}
                                {a?.action === "change" && kindOf(f.key) === "bool" && a.value === false ? (
                                  <input
                                    aria-label={`Why leave out ${f.label.replace(/^Include /, "")}? (optional)`}
                                    placeholder="Why? (optional)"
                                    className={inputClass}
                                    value={a.note ?? ""}
                                    onChange={(e) => set(f.key, { ...a, note: e.target.value })}
                                  />
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
                  {state.packages?.length ? (
                    <label className="grid gap-1 text-sm text-ink-soft">
                      <span>Add an item</span>
                      <select
                        className={inputClass}
                        value=""
                        onChange={(e) => {
                          // "<service_id>" for a package, "<service_id>|<addon id>" for an add-on.
                          const [serviceId, addonId] = e.target.value.split("|");
                          const pkg = state.packages?.find((p) => p.service_id === serviceId);
                          const addon = addonId ? pkg?.add_ons.find((x) => x.id === addonId) : undefined;
                          if (!pkg || (addonId && !addon)) return;
                          const key = `line:new:${Math.random().toString(36).slice(2, 10)}`;
                          set(key, {
                            key,
                            action: "change",
                            value: {
                              service_id: pkg.service_id,
                              ...(addon ? { addon_id: addon.id } : {}),
                              name: addon ? addon.name : pkg.name,
                              quantity: 1,
                              unit_price_cents: addon ? addon.price_cents : pkg.price_cents,
                            },
                          });
                        }}
                      >
                        <option value="" disabled>Choose a package or add-on…</option>
                        {state.packages.map((p) => [
                          <option key={p.service_id} value={p.service_id}>
                            {p.name} — {display("discount", p.price_cents)}
                          </option>,
                          ...p.add_ons.map((x) => (
                            <option key={`${p.service_id}|${x.id}`} value={`${p.service_id}|${x.id}`}>
                              {"  "}+ {x.name} — {display("discount", x.price_cents)}
                            </option>
                          )),
                        ])}
                      </select>
                    </label>
                  ) : null}
              </section>
            ) : null}

            {state.can_sign && signSlot ? signSlot : null}
          </div>

          {myTurn ? (
            <footer className="grid gap-2 border-t border-line-soft bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink-soft">Total if this is agreed</span>
                <strong className="serif text-lg text-ink">{display("discount", total)}</strong>
              </div>
              {state.terms.payment_schedule?.length && total !== state.terms.amount_cents ? (
                <p className="text-xs text-ink-faint">If it&apos;s agreed, the payments are rescaled to the new total.</p>
              ) : null}
              {footerNote ? <p className="text-xs text-ink-faint">{footerNote}</p> : null}
              {noteOpen ? (
                <textarea
                  aria-label={`A note for ${otherName} (optional)`}
                  placeholder={`A note for ${otherName} (optional)`}
                  rows={2}
                  maxLength={2000}
                  className={inputClass}
                  value={message}
                  autoFocus
                  onChange={(e) => setMessage(e.target.value)}
                />
              ) : (
                <button type="button" className="justify-self-start text-xs font-semibold text-gold hover:underline" onClick={() => setNoteOpen(true)}>
                  Add a note for {otherName}
                </button>
              )}
              {error ? <p role="alert" className="text-sm text-maroon dark:text-gold">{error}</p> : null}
              {notice && !error ? <p role="status" className="text-xs text-ink-faint">{notice}</p> : null}
              {problems.length ? <p className="text-xs text-maroon dark:text-gold">{problems[0]}</p> : null}
              {total <= 0 ? (
                <p className="text-xs text-maroon dark:text-gold">The total has to stay above $0.</p>
              ) : null}
              {unanswered.length ? (
                <p className="text-xs text-ink-faint">
                  Answer {unanswered.length === 1 ? "1 more field" : `${unanswered.length} more fields`} to send.
                </p>
              ) : null}
              <div className="flex gap-2">
                {onSaveDraft ? (
                  <Button type="button" variant="ghost" disabled={busy !== null} onClick={saveDraft}>
                    {busy === "draft" ? "Saving…" : "Save draft"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="flex-1"
                  disabled={busy !== null || unanswered.length > 0 || list.length === 0 || problems.length > 0 || total <= 0}
                  onClick={send}
                >
                  {busy === "send" ? "Sending…" : sendLabel(list)}
                </Button>
              </div>
            </footer>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
