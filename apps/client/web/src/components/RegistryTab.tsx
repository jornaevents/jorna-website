"use client";

// An event's Registry tab (Jorna-Client design; client redesign PR 9, backend
// 0089): funds the host is collecting toward, the gifts they've recorded
// against each, and who's been thanked. Tracking only — Jorna takes and moves
// no money, and guests don't see this; the host writes down what arrives.
//
// The design's "Registry visitors" figure isn't here: there's no public
// registry page to visit yet.

import { useEffect, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, Field } from "@jorna/shared/components/ui";
import {
  addRegistryFund,
  addRegistryGift,
  deleteRegistryFund,
  deleteRegistryGift,
  getRegistry,
  updateRegistryGift,
  type Registry,
  type RegistryFund,
} from "@/lib/jorna";
import { centsMoney } from "@/lib/contract";
import { Badge, MiniProgress } from "@/components/kit";

/** "1,250.50" → 125050. Null for anything that isn't an amount above zero. */
function toCents(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function FundCard({ fund, busy, run }: { fund: RegistryFund; busy: boolean; run: (work: () => Promise<Registry>) => void }) {
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const cents = toCents(amount);
  const pct = fund.goal_cents ? Math.min(100, Math.round((fund.raised_cents / fund.goal_cents) * 100)) : null;

  return (
    <article aria-label={fund.name} className="rounded-2xl border border-line bg-card p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-base font-bold text-ink">{fund.name}</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => deleteRegistryFund(fund.fund_id))}
          className="text-xs font-semibold text-ink-faint hover:text-maroon disabled:opacity-50"
        >
          Delete<span className="sr-only"> {fund.name}</span>
        </button>
      </div>
      <p className="mt-2 text-sm">
        <strong className="font-serif text-xl text-ink">{centsMoney(fund.raised_cents)}</strong>
        {fund.goal_cents ? <span className="text-ink-soft"> of {centsMoney(fund.goal_cents)}</span> : <span className="text-ink-soft"> received</span>}
      </p>
      {fund.goal_cents ? (
        <div className="mt-2">
          <MiniProgress value={fund.raised_cents} max={fund.goal_cents} label={`${fund.name}: received toward the goal`} />
          <small className="mt-1 block text-xs text-ink-soft">{pct}% funded</small>
        </div>
      ) : null}

      {fund.gifts.length > 0 ? (
        <ul className="mt-4 grid gap-1.5">
          {fund.gifts.map((gift) => (
            <li key={gift.gift_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel px-3 py-2 text-sm">
              <span>
                <strong className="text-ink">{gift.from_name}</strong>
                <span className="text-ink-soft"> · {centsMoney(gift.amount_cents)}</span>
              </span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={gift.thanked}
                    disabled={busy}
                    onChange={(e) => run(() => updateRegistryGift(gift.gift_id, { thanked: e.target.checked }))}
                    className="accent-maroon"
                  />
                  Thanked<span className="sr-only"> {gift.from_name}</span>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => deleteRegistryGift(gift.gift_id))}
                  className="text-xs font-semibold text-ink-faint hover:text-maroon disabled:opacity-50"
                >
                  Remove<span className="sr-only"> {gift.from_name}&apos;s gift</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="mt-4 grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!from.trim() || cents == null) return;
          run(() => addRegistryGift(fund.fund_id, { from_name: from.trim(), amount_cents: cents }));
          setFrom("");
          setAmount("");
        }}
      >
        <Field label="Gift from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Rekha Bua" />
        <Field label="Amount ($)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250" />
        <Button type="submit" size="md" variant="ghost" disabled={busy || !from.trim() || cents == null}>
          Add gift
        </Button>
      </form>
    </article>
  );
}

export function RegistryTab({ eventId }: { eventId: string }) {
  // Kept with the event it was loaded for.
  const [loaded, setLoaded] = useState<{ eventId: string; registry: Registry } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");

  useEffect(() => {
    let cancelled = false;
    getRegistry(eventId)
      .then((registry) => !cancelled && setLoaded({ eventId, registry }))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load the registry."));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const registry = loaded && loaded.eventId === eventId ? loaded.registry : null;

  // Every write answers with the whole registry, so the totals can't drift.
  const run = (work: () => Promise<Registry>) => {
    setBusy(true);
    setError(null);
    work()
      .then((next) => setLoaded({ eventId, registry: next }))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't save that."))
      .finally(() => setBusy(false));
  };

  const goalCents = goal.trim() ? toCents(goal) : null;
  const goalBad = goal.trim() !== "" && goalCents == null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Registry</p>
          <h2 className="mt-2 font-serif text-xl font-bold tracking-[-0.02em] text-ink">Gifts with a little more meaning</h2>
          <p className="mt-1 text-sm text-ink-soft">Track gifts and thank-yous here. Jorna doesn&apos;t process these payments.</p>
        </div>
        {registry ? (
          <Badge tone="green">
            {registry.gift_count} {registry.gift_count === 1 ? "gift" : "gifts"} received
          </Badge>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
          {error}
        </p>
      ) : null}

      {!registry ? (
        error ? null : <p className="mt-8 text-center text-ink-soft">Loading…</p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-line bg-card p-4">
              <dt className="text-[0.75rem] font-semibold text-ink-soft">Total received</dt>
              <dd className="font-serif text-[1.45rem] font-bold text-ink">{centsMoney(registry.total_cents)}</dd>
            </div>
            <div className="rounded-[14px] border border-line bg-card p-4">
              <dt className="text-[0.75rem] font-semibold text-ink-soft">Thank-yous sent</dt>
              <dd className="font-serif text-[1.45rem] font-bold text-ink">
                {registry.thanked_count} / {registry.gift_count}
              </dd>
            </div>
          </dl>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {registry.funds.map((fund) => (
              <FundCard key={fund.fund_id} fund={fund} busy={busy} run={run} />
            ))}
          </div>

          <form
            className="mt-4 grid items-end gap-2 rounded-2xl border border-dashed border-line p-[18px] sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || goalBad) return;
              run(() => addRegistryFund(eventId, { name: name.trim(), goal_cents: goalCents }));
              setName("");
              setGoal("");
            }}
          >
            <Field label="New fund" value={name} onChange={(e) => setName(e.target.value)} placeholder="Honeymoon fund" />
            <Field label="Goal ($, optional)" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="5,000" />
            <Button type="submit" size="md" disabled={busy || !name.trim() || goalBad}>
              Add fund
            </Button>
          </form>
          {registry.funds.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">Start with a fund — a honeymoon, a first home, an education fund — then record gifts as they arrive.</p>
          ) : null}
        </>
      )}
    </>
  );
}
