"use client";

// Propose a detail in chat (backend DECISIONS #59): one side proposes a date,
// the times, a guest count or one of the vendor's add-ons; the other agrees
// or declines. An agreed value is exact, so the contract can take it as said.
// Both apps draw the card and the form from here.

import { useState } from "react";
import { DateField } from "./DateField";
import { TimeField } from "./ui";

export type DetailField = "date" | "times" | "guests" | "addon";

/** What a detail_proposal message carries on `meta`. */
export interface DetailProposalMeta {
  field: DetailField;
  value: string;
  label: string;
  status: "open" | "agreed" | "declined" | "replaced";
  proposed_by: string;
  addon?: { id: string; name?: string | null; price?: number | null; price_unit?: string | null; service_id?: string | null };
}

export function isDetailProposal(meta: unknown): meta is DetailProposalMeta {
  const m = meta as Partial<DetailProposalMeta> | null | undefined;
  return Boolean(m && typeof m.field === "string" && typeof m.value === "string" && typeof m.status === "string");
}

const NOUN: Record<DetailField, string> = { date: "Date", times: "Time", guests: "Guests", addon: "Add-on" };

const STATUS: Record<DetailProposalMeta["status"], string> = {
  open: "Waiting for an answer",
  agreed: "Agreed",
  declined: "Declined",
  replaced: "Replaced by a newer proposal",
};

/** The card in the thread. Agree and Decline only for the side that didn't propose it, while it's open. */
export function DetailProposalCard({
  meta,
  mine,
  who,
  onAnswer,
}: {
  meta: DetailProposalMeta;
  mine: boolean;
  /** Who proposed it, as the thread names them. */
  who: string;
  onAnswer?: (agree: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAnswer = !mine && meta.status === "open" && onAnswer;
  const answer = (agree: boolean) => {
    if (!onAnswer) return;
    setBusy(true);
    setError(null);
    onAnswer(agree)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "That didn't work. Try again."))
      .finally(() => setBusy(false));
  };
  return (
    <div className="w-[min(360px,85vw)] rounded-2xl border border-card-edge bg-card p-4">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">
        {mine ? "You proposed" : `${who} proposed`}
      </p>
      <p className="mt-2 text-sm text-ink">
        <span className="text-ink-faint">{NOUN[meta.field]}:</span> {meta.label}
      </p>
      <p
        className={`mt-1 text-xs font-semibold ${
          meta.status === "agreed" ? "text-green" : meta.status === "open" ? "text-gold-dark" : "text-ink-faint"
        }`}
      >
        {STATUS[meta.status]}
      </p>
      {canAnswer ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(true)}
            className="rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 dark:bg-gold dark:text-[#2A0C19]"
          >
            Agree
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(false)}
            className="rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:border-gold disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

export interface AddOnChoice {
  id: string;
  name: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The form behind "Propose a detail": pick what, give the value, send. */
export function ProposeDetailForm({
  addons,
  onPropose,
  onClose,
}: {
  /** The vendor's add-ons; the Add-on choice only shows when there are some. */
  addons: AddOnChoice[];
  onPropose: (field: DetailField, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [field, setField] = useState<DetailField>("date");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [guests, setGuests] = useState("");
  const [addon, setAddon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value =
    field === "date" ? date : field === "times" ? (start && end ? `${start}-${end}` : "") : field === "guests" ? guests.trim() : addon;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) {
      setError(field === "times" ? "Give a start and an end time." : "Fill this in first.");
      return;
    }
    setBusy(true);
    setError(null);
    onPropose(field, value)
      .then(onClose)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "That didn't work. Try again."))
      .finally(() => setBusy(false));
  }

  const choices: { key: DetailField; label: string }[] = [
    { key: "date", label: "Date" },
    { key: "times", label: "Times" },
    { key: "guests", label: "Guests" },
    ...(addons.length ? [{ key: "addon" as const, label: "Add-on" }] : []),
  ];

  return (
    <form onSubmit={submit} aria-label="Propose a detail" className="grid gap-3 rounded-2xl border border-card-edge bg-card p-4">
      <div role="radiogroup" aria-label="What to propose" className="flex flex-wrap gap-1.5">
        {choices.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={field === c.key}
            onClick={() => setField(c.key)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              field === c.key ? "bg-maroon text-white dark:bg-gold dark:text-[#2A0C19]" : "border border-card-edge text-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {field === "date" ? <DateField label="Date" min={todayIso()} value={date} onChange={setDate} /> : null}
      {field === "times" ? (
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Starts" value={start} onChange={setStart} />
          <TimeField label="Ends" value={end} onChange={setEnd} />
        </div>
      ) : null}
      {field === "guests" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">Guest count</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className="w-full rounded-xl border border-card-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-gold"
          />
        </label>
      ) : null}
      {field === "addon" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">Add-on</span>
          <select
            value={addon}
            onChange={(e) => setAddon(e.target.value)}
            className="w-full rounded-xl border border-card-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-gold"
          >
            <option value="">Pick an add-on</option>
            {addons.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 dark:bg-gold dark:text-[#2A0C19]"
        >
          Propose
        </button>
        <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-sm font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
