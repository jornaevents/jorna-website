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

import { useState, type ReactNode } from "react";
import { ApiError } from "../../lib/api";
import type { FieldAnswer, NegotiationFieldView, FieldNegotiationState } from "../../lib/contractTypes";
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
import { Button } from "../ui";
import { ContractPaper, type Mark } from "./ContractPaper";


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

/** An input for one field's value, in the units a person thinks in. */
function ValueInput({ field, value, onChange }: { field: NegotiationFieldView; value: unknown; onChange: (v: unknown) => void }) {
  const k = kindOf(field.key);
  if (k === "date") {
    const v = (value ?? {}) as { date_iso?: string; date_end?: string | null };
    return (
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={`${field.label}: start`} type="date" className={inputClass} value={v.date_iso ?? ""}
          onChange={(e) => onChange({ date_iso: e.target.value, date_end: v.date_end ?? null })} />
        <input aria-label={`${field.label}: last day (optional)`} type="date" className={inputClass} value={v.date_end ?? ""}
          onChange={(e) => onChange({ date_iso: v.date_iso ?? "", date_end: e.target.value || null })} />
      </div>
    );
  }
  if (k === "time") {
    const v = (value ?? {}) as { time_start?: string; time_end?: string };
    return (
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={`${field.label}: start`} type="time" className={inputClass} value={v.time_start ?? ""}
          onChange={(e) => onChange({ time_start: e.target.value, time_end: v.time_end ?? "" })} />
        <input aria-label={`${field.label}: end`} type="time" className={inputClass} value={v.time_end ?? ""}
          onChange={(e) => onChange({ time_start: v.time_start ?? "", time_end: e.target.value })} />
      </div>
    );
  }
  if (k === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        Include it
      </label>
    );
  }
  if (k === "money") {
    return (
      <input aria-label={`${field.label} ($)`} type="number" min={0} step="0.01" className={inputClass}
        value={centsToDollars(value)} onChange={(e) => onChange(e.target.value === "" ? null : dollarsToCents(e.target.value))} />
    );
  }
  if (k === "hours") {
    return (
      <input aria-label={`${field.label} (days)`} type="number" min={0} className={inputClass}
        value={hoursToDays(value)} onChange={(e) => onChange(e.target.value === "" ? null : daysToHours(e.target.value))} />
    );
  }
  if (k === "count") {
    return (
      <input aria-label={field.label} type="number" min={1} step="any" className={inputClass}
        value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    );
  }
  return (
    <input aria-label={field.label} className={inputClass} value={value == null ? "" : String(value)}
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
          <ValueInput field={field} value={answer?.value} onChange={(v) => onAnswer({ key: field.key, action: "counter", value: v })} />
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
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const waiting = waitingOn(state.fields, side);
  const theirs = state.fields.filter((f) => f.proposed_by && f.proposed_by !== side && f.state !== "settled" && f.state !== "agreed");
  const settled = state.fields.filter((f) => f.state === "settled");
  const open = state.fields.filter(
    (f) => f.state === "agreed" && !["schedule", "newline"].includes(kindOf(f.key)),
  );
  // Everything the reader has opened, and what of it actually changes
  // something — only that is sent and counted.
  const all = Object.values(answers);
  const list = effectiveAnswers(state.fields, all);
  const mine = all.filter((a) => a.action === "change" || a.action === "reopen");
  const problems = all
    .filter((a) => a.action === "counter" || a.action === "change" || a.action === "reopen")
    .map((a) => valueProblem(a.key, a.value))
    .filter((p): p is string => Boolean(p));
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
  const marks = new Map<string, Mark>();
  for (const f of theirs) for (const id of paperIds(f.key)) marks.set(id, "other");
  for (const a of list) {
    if (a.action === "change" || a.action === "counter" || a.action === "reopen" || a.action === "accept") {
      for (const id of paperIds(a.key)) marks.set(id, "yours");
    }
  }

  const total = estimateTotal(state.terms, state.fields, list);
  const lastFromThem = state.last_send && state.last_send.side !== side ? state.last_send : null;
  const byKey = new Map(state.fields.map((f) => [f.key, f]));

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
          <h2 className="serif truncate text-xl text-ink">{title}</h2>
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
            <ContractPaper draft={paperDraft(previewTerms(state.terms, state.fields, list))} markOf={(id) => marks.get(id) ?? null} vendorName={vendorName} clientName={clientName} title={title} />
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
                  <AnswerCard
                    key={f.key}
                    field={f}
                    answer={answers[f.key]}
                    otherName={otherName}
                    canCounter={!(side === "client" && f.group === "schedule") && !["newline", "bool"].includes(kindOf(f.key))}
                    onAnswer={(a) => set(f.key, a)}
                  />
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
                      {f && kindOf(f.key) === "bool" && a.value === false ? (
                        <input
                          aria-label={`Why leave out ${f.label.replace(/^Include /, "")}? (optional)`}
                          placeholder="Why? (optional)"
                          className={`${inputClass} mt-1.5`}
                          value={a.note ?? ""}
                          onChange={(e) => set(a.key, { ...a, note: e.target.value })}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}

            {myTurn ? (
              <details className="rounded-xl border border-line-soft">
                <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-semibold text-ink-soft">Change something else</summary>
                <div className="grid gap-3 px-3.5 pb-3.5">
                  {Object.entries(GROUP_NAMES).map(([group, name]) => {
                    const rows = open.filter((f) => f.group === group);
                    if (!rows.length) return null;
                    return (
                      <div key={group}>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{name}</p>
                        <div className="mt-1 grid gap-1.5">
                          {rows.map((f) => {
                            const a = answers[f.key];
                            if (!f.can_change) {
                              return (
                                <p key={f.key} className="flex justify-between gap-2 text-sm text-ink-faint">
                                  <span>{f.label}</span>
                                  <span>{f.locked ? `Fixed by ${vendorName}` : display(f.key, f.value)}</span>
                                </p>
                              );
                            }
                            return (
                              <div key={f.key} className="text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-ink-soft">{f.label}</span>
                                  {editing === f.key || a ? null : cantLeaveOut(f.key) ? (
                                    <span className="text-xs text-ink-faint">{cantLeaveOut(f.key)}</span>
                                  ) : (
                                    <button type="button" className="text-xs font-semibold text-gold hover:underline"
                                      aria-label={kindOf(f.key) === "bool" ? `Leave out ${f.label.replace(/^Include /, "")}` : `Change ${f.label}`}
                                      onClick={() => {
                                        setEditing(f.key);
                                        set(f.key, { key: f.key, action: "change", value: kindOf(f.key) === "bool" ? !f.value : f.value });
                                      }}>
                                      {kindOf(f.key) === "bool" ? "Leave out" : "Change"}
                                    </button>
                                  )}
                                </div>
                                {a && a.action === "change" && kindOf(f.key) !== "bool" ? (
                                  <div className="mt-1">
                                    <ValueInput field={f} value={a.value} onChange={(v) => set(f.key, { ...a, value: v })} />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
                </div>
              </details>
            ) : null}

            {settled.length ? (
              <details className="rounded-xl border border-line-soft">
                <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-semibold text-ink-soft">Settled ({settled.length})</summary>
                <ul className="grid gap-1.5 px-3.5 pb-3.5 text-sm">
                  {settled.map((f) => {
                    const a = answers[f.key];
                    return (
                      <li key={f.key}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-soft">{f.label}</span>
                          <span className="text-ink">{display(f.key, f.value)}</span>
                        </div>
                        {side === "vendor" && myTurn && kindOf(f.key) !== "newline" ? (
                          a ? (
                            <div className="mt-1">
                              <ValueInput field={f} value={a.value} onChange={(v) => set(f.key, { ...a, value: v })} />
                            </div>
                          ) : (
                            <button type="button" className="text-xs font-semibold text-gold hover:underline"
                              onClick={() => set(f.key, { key: f.key, action: "reopen", value: f.value })}>
                              Reopen
                            </button>
                          )
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </details>
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
