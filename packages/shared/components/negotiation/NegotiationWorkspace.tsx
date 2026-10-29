"use client";

// The contract negotiation workspace, from the Figma Make design (backend
// DECISIONS #23, #24). The same screen for both sides:
//
// - left, the contract as a page, the other side's changes in rose and
//   yours in gold, with "View original" to see the version before;
// - right, "Review and revise": each value the other side changed, as
//   Original / Their proposal / Your revised value, plus anything else you
//   choose to change, the items and clauses that are in or out, and a note;
// - at the foot, Save draft (kept on the server) and Send, plus the side's
//   own answers (the vendor's Decline, the couple's Withdraw).
//
// The host page decides what "send" means for its side; this component only
// keeps the working version and calls back with it.

import { AddressStringFields } from "../AddressFields";
import { useMemo, useState, type ReactNode } from "react";
import { wordDiff } from "../../lib/contractDiff";
import type { Draft } from "../../lib/contractDraft";
import {
  SECTIONS,
  addClause,
  addExtraLine,
  attribute,
  clauseToggles,
  differs,
  followTotal,
  lineToggles,
  rowAttribution,
  setClauseIncluded,
  setLineIncluded,
  showValue,
  unionValues,
  type Attribution,
  type NegotiableValue,
  type Toggle,
} from "../../lib/negotiation";
import { ContractPaper, MARK_CLASS, type Mark } from "./ContractPaper";

const input =
  "w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";
const readonly = "w-full rounded-lg border border-line-soft bg-ground px-3 py-2 text-sm text-ink-soft";

export interface WorkspaceHeader {
  /** "Harper & Leo", or the vendor's name on the couple's side. */
  counterpart: string;
  contractTitle: string;
  round: number;
  lastEditedBy: string | null;
  updatedAt: string | null;
}

export interface SendContext {
  yours: Draft;
  note: string;
  /** Your version is exactly theirs — for the vendor, that's an Accept. */
  unchanged: boolean;
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === today.toDateString()
    ? `Today at ${time}`
    : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${time}`;
}

function Summary({ label, value, wrap }: { label: string; value: ReactNode; wrap?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={`text-sm font-semibold text-ink ${wrap ? "" : "truncate"}`}>{value}</p>
    </div>
  );
}

function ValueInput({
  v,
  value,
  onChange,
}: {
  v: NegotiableValue;
  value: string;
  onChange: (raw: string) => void;
}) {
  const common = { "aria-label": `Your ${v.label.toLowerCase()}`, value, className: input };
  if (v.id === "event.venue") return <AddressStringFields value={value} onChange={onChange} />;
  switch (v.kind) {
    case "longtext":
      return <textarea {...common} rows={4} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input {...common} type="date" onChange={(e) => onChange(e.target.value)} />;
    case "time":
      return <input {...common} type="time" onChange={(e) => onChange(e.target.value)} />;
    case "count":
    case "days":
      return <input {...common} type="number" min={0} onChange={(e) => onChange(e.target.value)} />;
    case "money":
      return <input {...common} type="number" min={0} step="0.01" inputMode="decimal" onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />;
  }
}

function ClauseWords({ before, after }: { before: string; after: string }) {
  return (
    <p className="whitespace-pre-line rounded-lg border border-line-soft bg-ground px-3 py-2 text-sm leading-relaxed text-ink-soft">
      {wordDiff(before, after).map((w, i) =>
        w.op === "same" ? (
          <span key={i}>{w.text}</span>
        ) : w.op === "add" ? (
          <ins key={i} className={`no-underline ${MARK_CLASS.other}`}>
            {w.text}
          </ins>
        ) : (
          <del key={i} className="text-ink-faint">
            {w.text}
          </del>
        ),
      )}
    </p>
  );
}

export function NegotiationWorkspace({
  perspective,
  header,
  original,
  proposed,
  initial,
  ask,
  vendorName,
  clientName,
  otherMessage,
  clauseLibrary,
  readOnly,
  readOnlyNotice,
  stale,
  sendLabel,
  canSendUnchanged,
  noteLabel,
  onSaveDraft,
  onSend,
  onDecline,
  declineLabel,
  extraActions,
  headerActions,
  beforeSend,
  onClose,
}: {
  perspective: "vendor" | "client";
  header: WorkspaceHeader;
  /** The version before the other side's change. */
  original: Draft;
  /** The other side's latest: what's on the table. */
  proposed: Draft;
  /** Where your version starts: a saved draft, or `proposed`. */
  initial: Draft;
  /** What this side last asked for (their proposal), when the other side
   *  has answered it — so a change can be shown as accepted from your ask
   *  rather than as the other side's. */
  ask?: Draft | null;
  vendorName: string;
  clientName: string;
  /** The other side's note with their change. */
  otherMessage?: string | null;
  clauseLibrary?: { title: string; body: string }[];
  /** Nothing to answer right now (waiting on the other side). */
  readOnly?: boolean;
  readOnlyNotice?: ReactNode;
  /** The saved draft was made against an older version. */
  stale?: boolean;
  sendLabel: (unchanged: boolean) => string;
  /** Sending with nothing changed means something (the vendor's Accept). */
  canSendUnchanged: boolean;
  noteLabel: string;
  onSaveDraft?: (yours: Draft, note: string) => Promise<void>;
  onSend: (ctx: SendContext) => Promise<void>;
  onDecline?: (note: string) => Promise<void>;
  declineLabel?: string;
  extraActions?: ReactNode;
  /** Beside the title — the Leads panel's "Lead details". */
  headerActions?: ReactNode;
  /** Under the note — the couple's email, when the vendor doesn't have it yet. */
  beforeSend?: ReactNode;
  onClose?: () => void;
}) {
  const other = header.counterpart;
  const [yours, setYours] = useState<Draft>(initial);
  const [note, setNote] = useState("");
  // The last payment follows the total until a payment is edited by hand.
  const [planFollows, setPlanFollows] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [tab, setTab] = useState<"contract" | "revise">("revise");
  const [busy, setBusy] = useState<"save" | "send" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  // Why each value differs between the version before and the one on the
  // table: the other side's change, or your own ask accepted, countered or kept.
  const why = useMemo(() => {
    const out = new Map<string, Exclude<Attribution, null>>();
    for (const v of unionValues(original, proposed, ...(ask ? [ask] : []))) {
      const a = attribute(v, original, proposed, ask);
      if (a) out.set(v.id, a);
    }
    return out;
  }, [original, proposed, ask]);
  const theirIds = useMemo(
    () => new Set([...why].filter(([, a]) => a === "theirs" || a === "countered").map(([id]) => id)),
    [why],
  );
  const count = (a: Attribution) => [...why.values()].filter((x) => x === a).length;
  const all = useMemo(() => unionValues(yours, proposed, original), [yours, proposed, original]);
  const inYours = useMemo(() => new Set(unionValues(yours).map((v) => v.id)), [yours]);

  // The cards: what changed and why, what you've changed or added, what you picked.
  const cards = all.filter(
    (v) =>
      inYours.has(v.id) &&
      (why.has(v.id) ||
        differs(v, yours, proposed) ||
        picked.includes(v.id) ||
        (v.has != null && !v.has(proposed))),
  );
  const others = all.filter((v) => inYours.has(v.id) && !cards.includes(v));
  const lines = lineToggles(original, proposed, yours, ask);
  const clauses = clauseToggles(original, proposed, yours, perspective === "vendor" ? clauseLibrary : [], ask);

  /** An item's or clause's line in the checklist: who put it in or took it out. */
  const rowNote = <T,>(t: Toggle<T>): string => {
    if (t.included !== t.inProposed) return t.included ? "Added by you" : "Removed by you";
    switch (rowAttribution(t.inOriginal, t.inProposed, t.inAsk)) {
      case "accepted":
        return t.inProposed ? `You asked · ${other} added it` : `You asked · ${other} removed it`;
      case "kept":
        return t.inAsk ? `You asked · ${other} left it out` : `You asked · ${other} kept it`;
      case "theirs":
        return t.inProposed ? `Added by ${other}` : `Removed by ${other}`;
      default:
        return t.included ? "Included" : "Excluded";
    }
  };
  const unchanged = unionValues(yours, proposed).every((v) => !differs(v, yours, proposed));
  const yourCount = unionValues(yours, proposed).filter((v) => differs(v, yours, proposed)).length;

  const markOf = (id: string): Mark => {
    const v = all.find((x) => x.id === id);
    if (!v) {
      // A whole line: added or removed by them, or by you.
      const line = id.startsWith("line:") ? id.slice(5) : null;
      if (line && !id.includes(".")) {
        const t = lines.find((x) => x.id === line);
        if (!t) return null;
        if (t.included !== t.inProposed) return "yours";
        const a = rowAttribution(t.inOriginal, t.inProposed, t.inAsk);
        if (a === "accepted") return "yours";
        if (a === "theirs") return "other";
      }
      return null;
    }
    if (showOriginal) return theirIds.has(id) ? "other" : null;
    if (differs(v, yours, proposed)) return "yours";
    if (why.get(id) === "accepted") return "yours";
    return theirIds.has(id) ? "other" : null;
  };

  function edit(v: NegotiableValue, raw: string) {
    setNotice(null);
    const payment = v.section === "Payment schedule";
    if (payment) setPlanFollows(false);
    setYours((d) => {
      const next = v.set(d, raw);
      return payment || !planFollows ? next : followTotal(next);
    });
  }

  function change(fn: (d: Draft) => Draft) {
    setNotice(null);
    setYours((d) => (planFollows ? followTotal(fn(d)) : fn(d)));
  }

  async function run(kind: "save" | "send" | "decline", fn: () => Promise<void>, done?: string) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That didn't go through. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  const theirCount = theirIds.size;
  const changeCount = [
    `${theirCount} value${theirCount === 1 ? "" : "s"} changed by ${other}`,
    count("accepted") ? `${count("accepted")} of your asks accepted` : null,
    count("kept") ? `${count("kept")} kept as it was` : null,
    yourCount && !readOnly ? `${yourCount} by you` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const proposedLabel = perspective === "vendor" ? `${other}'s proposal` : `${other}'s version`;

  const revisePanel = (
    <div className="grid gap-4">
      <div>
        <p className="eyebrow">Negotiable values</p>
        <h3 className="serif mt-1 text-xl text-ink">Review and revise</h3>
        <p className="mt-1 text-sm text-ink-soft">
          {readOnly
            ? "Nothing to answer right now."
            : theirCount
              ? `Review what ${other} changed, then enter the value you want to send back.`
              : why.size
                ? `See how ${other} answered what you asked for. Change anything else below.`
                : "Change any value below, then send it."}
        </p>
      </div>

      {otherMessage ? (
        <blockquote className="rounded-xl border-l-4 border-gold bg-gold/10 px-4 py-3 text-sm text-ink">
          “{otherMessage}”<footer className="mt-1 text-xs text-ink-faint">{other}</footer>
        </blockquote>
      ) : null}

      {stale ? (
        <p role="status" className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink-soft">
          The contract changed after you saved this draft. Check your values against the new version before sending.
        </p>
      ) : null}

      {SECTIONS.map((section) => {
        const inSection = cards.filter((v) => v.section === section);
        if (!inSection.length) return null;
        return (
          <div key={section} className="grid gap-3">
            {inSection.map((v) => {
              const a = why.get(v.id) ?? null;
              const theirs = a === "theirs";
              return (
                <div key={v.id} className="rounded-xl border border-card-edge bg-card p-4 shadow-[var(--shadow-card)]">
                  <p className="text-xs uppercase tracking-wide text-ink-faint">{v.section}</p>
                  <p className="font-semibold text-ink">{v.label}</p>
                  {a && a !== "theirs" ? (
                    <p className={`mt-1 text-xs ${a === "accepted" ? "text-ink-soft" : "text-ink-faint"}`}>
                      {a === "accepted"
                        ? `You asked for this — ${other} accepted it.`
                        : a === "countered"
                          ? `You asked for a change — ${other} put a different value.`
                          : `You asked for a change — ${other} kept it as it was.`}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2.5">
                    {a === "countered" && v.kind !== "longtext" && ask ? (
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-xs text-ink-faint">
                          Original
                          <p className={`mt-1 ${readonly}`}>{showValue(v.kind, v.get(original))}</p>
                        </label>
                        <label className="text-xs text-ink-faint">
                          You asked
                          <p className={`mt-1 ${readonly}`}>{showValue(v.kind, v.get(ask))}</p>
                        </label>
                        <label className="text-xs text-ink-faint">
                          {proposedLabel}
                          <p className={`mt-1 ${readonly} ${MARK_CLASS.other} !px-3`}>
                            {showValue(v.kind, v.get(proposed))}
                          </p>
                        </label>
                      </div>
                    ) : a === "countered" && ask ? (
                      <div>
                        <p className="mb-1 text-xs text-ink-faint">How {other} changed your wording</p>
                        <ClauseWords before={v.get(ask)} after={v.get(proposed)} />
                      </div>
                    ) : (a === "accepted" || a === "kept") && ask ? (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-ink-faint">
                          {a === "accepted" ? "Original agreement" : "You asked"}
                          <p className={`mt-1 ${readonly}`}>
                            {showValue(v.kind, a === "accepted" ? v.get(original) : v.get(ask))}
                          </p>
                        </label>
                        <label className="text-xs text-ink-faint">
                          Now
                          <p className={`mt-1 ${readonly} ${a === "accepted" ? `${MARK_CLASS.yours} !px-3` : ""}`}>
                            {showValue(v.kind, v.get(proposed))}
                          </p>
                        </label>
                      </div>
                    ) : v.kind === "longtext" && theirs ? (
                      <div>
                        <p className="mb-1 text-xs text-ink-faint">What {other} changed</p>
                        <ClauseWords before={v.get(original)} after={v.get(proposed)} />
                      </div>
                    ) : theirs ? (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-ink-faint">
                          Original agreement
                          <p className={`mt-1 ${readonly}`}>{showValue(v.kind, v.get(original))}</p>
                        </label>
                        <label className="text-xs text-ink-faint">
                          {proposedLabel}
                          <p className={`mt-1 ${readonly} ${MARK_CLASS.other} !px-3`}>
                            {showValue(v.kind, v.get(proposed))}
                          </p>
                        </label>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-faint">
                        Now: <span className="text-ink-soft">{showValue(v.kind, v.get(proposed))}</span>
                        {readOnly ? (
                          <>
                            {" "}
                            → Yours: <span className={MARK_CLASS.yours}>{showValue(v.kind, v.get(yours))}</span>
                          </>
                        ) : null}
                      </p>
                    )}
                    {readOnly ? null : (
                      <label className="text-xs font-medium text-ink-soft">
                        Your revised value
                        <div className="mt-1">
                          <ValueInput v={v} value={v.get(yours)} onChange={(raw) => edit(v, raw)} />
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {!readOnly && others.length ? (
        <label className="text-sm text-ink-soft">
          Change something else
          <select
            className={`mt-1 ${input}`}
            value=""
            onChange={(e) => e.target.value && setPicked((p) => [...p, e.target.value])}
          >
            <option value="">Pick a value…</option>
            {SECTIONS.map((s) => {
              const opts = others.filter((v) => v.section === s);
              return opts.length ? (
                <optgroup key={s} label={s}>
                  {opts.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
      ) : null}

      {lines.length || !readOnly ? (
        <div className="rounded-xl border border-line-soft p-4">
          <p className="text-sm font-semibold text-ink">Items</p>
          {lines.length ? (
            <ul className="mt-2 grid gap-1.5">
              {lines.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={t.included}
                      disabled={readOnly}
                      onChange={(e) => change((d) => setLineIncluded(d, t.item, e.target.checked))}
                    />
                    <span className="flex-1">{t.item.name || "New item"}</span>
                    <span className="text-xs text-ink-faint">{rowNote(t)}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => change(addExtraLine)}
              className="mt-2 text-sm font-semibold text-gold underline-offset-4 hover:underline"
            >
              {perspective === "vendor" ? "+ Add an item" : "+ Ask for something extra"}
            </button>
          ) : null}
        </div>
      ) : null}

      {clauses.length || !readOnly ? (
        <div className="rounded-xl border border-line-soft p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Terms and conditions</p>
              <p className="text-sm font-semibold text-ink">Included clauses</p>
              <p className="text-xs text-ink-faint">Turn each one on or off for this agreement.</p>
            </div>
            <span className="rounded-full bg-ground-2 px-2 py-0.5 text-xs text-ink-soft">
              {clauses.filter((c) => c.included).length}/{clauses.length}
            </span>
          </div>
          <ul className="mt-3 grid gap-2">
            {clauses.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={readOnly}
                  aria-pressed={t.included}
                  onClick={() => change((d) => setClauseIncluded(d, t.item, !t.included))}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    t.included ? "border-gold/50 bg-gold/5" : "border-line-soft opacity-75"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[0.65rem] ${
                      t.included ? "border-gold bg-gold text-white" : "border-line"
                    }`}
                  >
                    {t.included ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{t.item.title || "Untitled clause"}</span>
                    <span className="line-clamp-2 block text-xs text-ink-faint">{t.item.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{rowNote(t)}</span>
                </button>
              </li>
            ))}
          </ul>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => {
                change(addClause);
              }}
              className="mt-2 text-sm font-semibold text-gold underline-offset-4 hover:underline"
            >
              + Add a clause
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <label className="block text-sm text-ink-soft">
          {noteLabel}
          <textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${input}`} />
        </label>
      ) : null}
      {!readOnly ? beforeSend : null}
    </div>
  );

  const actions = readOnly ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-ink-soft">{readOnlyNotice}</div>
      <div className="flex flex-wrap gap-2">{extraActions}</div>
    </div>
  ) : declining && onDecline ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="mr-auto text-sm text-ink-soft">Keep your version as it is? Your note goes with it.</p>
      <button type="button" className="rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink" onClick={() => setDeclining(false)}>
        Never mind
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run("decline", () => onDecline(note.trim()))}
        className="rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold disabled:opacity-50"
      >
        {busy === "decline" ? "Sending…" : (declineLabel ?? "Decline")}
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {onDecline ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setDeclining(true)}
          className="mr-auto text-sm text-ink-faint underline-offset-4 hover:text-ink hover:underline"
        >
          {declineLabel ?? "Decline"}
        </button>
      ) : (
        <span className="mr-auto">{extraActions}</span>
      )}
      {onSaveDraft ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("save", () => onSaveDraft(yours, note.trim()), "Draft saved.")}
          className="rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy !== null || (unchanged && !canSendUnchanged)}
        onClick={() => run("send", () => onSend({ yours, note: note.trim(), unchanged }))}
        className="rounded-full bg-maroon px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-gold dark:text-ground"
      >
        {busy === "send" ? "Sending…" : `${sendLabel(unchanged)} →`}
      </button>
    </div>
  );

  return (
    <section aria-label={`${other} contract negotiation`} className="flex h-full min-h-0 flex-col bg-ground">
      <header className="flex flex-wrap items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close negotiation"
            className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line text-lg text-ink-soft transition hover:text-ink"
          >
            ×
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Contract negotiation</p>
          <h2 className="serif truncate text-2xl text-ink">{other}</h2>
          <p className="text-sm text-ink-faint">
            {header.contractTitle} · Round {header.round}
          </p>
        </div>
        {headerActions ? <div className="flex shrink-0 gap-2 self-center">{headerActions}</div> : null}
      </header>

      <p className="border-b border-line-soft px-5 py-2 text-xs text-ink-soft sm:hidden">
        {changeCount}
        {header.lastEditedBy ? ` · last edited by ${header.lastEditedBy}` : ""}
      </p>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-4 border-b border-line-soft px-6 py-3 sm:grid">
        <Summary label="Proposed changes" value={changeCount} wrap />
        <Summary label="Last edited by" value={header.lastEditedBy ?? "—"} />
        {header.updatedAt ? <Summary label="Updated" value={when(header.updatedAt)} /> : <span />}
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          <i className="inline-block size-2.5 rounded-full bg-rose-500/70" /> Changed by {other}
          <i className="ml-2 inline-block size-2.5 rounded-full bg-gold" /> Yours
        </p>
      </div>

      {error ? (
        <p role="alert" className="mx-5 mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon sm:mx-6 dark:text-gold">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mx-5 mt-3 rounded-lg bg-ground-2 px-3 py-2 text-sm text-ink-soft sm:mx-6">
          ✓ {notice}
        </p>
      ) : null}

      <div className="flex gap-1 border-b border-line-soft px-5 pt-2 lg:hidden" role="tablist">
        {(["revise", "contract"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? "border-gold text-ink" : "border-transparent text-ink-faint"}`}
          >
            {t === "revise" ? "Review and revise" : "Contract preview"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className={`min-h-0 overflow-y-auto bg-ground-2 px-5 py-5 sm:px-8 ${tab === "contract" ? "" : "hidden lg:block"}`}>
          <div className="mx-auto max-w-[680px]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-ink-soft">
                {showOriginal ? "Original agreement" : "Your version"}
              </span>
              <button
                type="button"
                onClick={() => setShowOriginal((s) => !s)}
                className="rounded-full border border-card-edge px-3 py-1 text-xs font-semibold text-ink transition hover:border-gold"
              >
                {showOriginal ? "View your version" : "View original"}
              </button>
            </div>
            <ContractPaper
              draft={showOriginal ? original : yours}
              markOf={markOf}
              vendorName={vendorName}
              clientName={clientName}
              title={header.contractTitle}
            />
          </div>
        </div>
        <aside className={`min-h-0 overflow-y-auto border-line-soft px-5 py-5 lg:border-l sm:px-6 ${tab === "revise" ? "" : "hidden lg:block"}`}>
          {revisePanel}
        </aside>
      </div>

      <footer className="border-t border-line-soft bg-ground px-5 py-3 sm:px-6">{actions}</footer>
    </section>
  );
}
