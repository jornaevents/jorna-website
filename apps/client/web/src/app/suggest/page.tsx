"use client";

// Suggest vendors for an event's open slots (Jorna-Client design; client
// redesign PR 5). Two questions — the budget and the feel — then one
// suggested vendor per open category, in three plans to switch between.
// "Add to my event" keeps the chosen plan as drafts on the event (Ready to
// send); nothing reaches a vendor until the client sends it from there.
//
// It runs on the bundle builder's API (POST /chatbot/bundles), which saves
// all three plans as drafts: the two not chosen are deleted here, as /plan
// does. The design's priority weighting, out-of-state option and notes aren't
// asked — the matching engine doesn't read them yet.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, LinkButton } from "@jorna/shared/components/ui";
import { deleteBundle, generateBundles, listBundles, listEvents } from "@/lib/jorna";
import { prettyDate, toCelebrations, type Celebration } from "@/lib/myEvents";
import { unchosenBundleIds } from "@/lib/planning";
import { categoryLabel, priceLine, type BundleItem, type BundleOption } from "@/lib/types";
import { Badge } from "@/components/kit";
import { signInUrl } from "@/lib/vendorSite";

const VIBES = ["Elegant", "Traditional", "Modern", "Fusion", "Playful", "Minimal"];
// The builder's three options, under the names the design gives them.
const PLANS = [
  { name: "Best value", match: "budget" },
  { name: "Balanced", match: "balanced" },
  { name: "Top rated", match: "top" },
] as const;

const dollars = (n: number) => `$${Math.round(n).toLocaleString()}`;

// The design's loading steps tick over on these marks (ms). The last one stays
// in progress until the suggestions are back, and the results never show
// before it's reached, so a fast answer still reads as three steps done.
const STEP_AT = [650, 1400, 2200];
const MIN_LOADING_MS = 2500;

function SuggestLoading({ lines, onBack, backLabel }: { lines: string[]; onBack: () => void; backLabel: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = STEP_AT.slice(0, lines.length - 1).map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [lines.length]);
  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-10">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← {backLabel}
      </button>
      <div role="status" aria-live="polite" className="mx-auto flex min-h-[460px] max-w-[540px] flex-col items-center justify-center text-center">
        <span aria-hidden="true" className="mb-[18px] grid size-[54px] place-items-center rounded-full bg-gold/12 text-gold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6 motion-safe:animate-pulse">
            <path d="m12 2 1.3 4.2L17.5 8l-4.2 1.8L12 14l-1.3-4.2L6.5 8l4.2-1.8Z" />
            <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z" />
          </svg>
        </span>
        <p className="eyebrow">Suggest vendors</p>
        <h1 className="mb-7 mt-2 font-serif text-[2.1rem] font-bold tracking-[-0.03em] text-ink">Finding your best matches</h1>
        <ol aria-label="Progress" className="grid w-full text-left">
          {lines.map((line, i) => {
            const state = step > i ? "complete" : step === i ? "active" : "waiting";
            return (
              <li
                key={line}
                aria-current={state === "active" ? "step" : undefined}
                className={`flex items-center gap-[11px] border-b border-line py-[13px] transition-opacity duration-300 ${
                  state === "complete" ? "text-green" : state === "active" ? "text-ink" : "text-ink-soft opacity-50"
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border text-[0.68rem] ${
                    state === "complete" ? "border-green" : state === "active" ? "border-gold text-gold" : "border-line"
                  }`}
                >
                  {state === "complete" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-label="Done">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <strong className="text-sm font-semibold">{line}</strong>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 h-[7px] w-full overflow-hidden rounded-full bg-panel">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.round(((step + 0.5) / lines.length) * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function planOption(options: BundleOption[], match: string): BundleOption | null {
  return options.find((o) => o.label.toLowerCase().includes(match)) ?? null;
}

function Slot({ item, guests }: { item: BundleItem; guests: number | null }) {
  const price = priceLine({ price: item.price_min, price_unit: item.price_unit, price_pending_quantity: item.price_pending_quantity, guest_count: guests });
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-gold">{categoryLabel(item.category)}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-bold tracking-[-0.02em] text-ink">{item.vendor_name}</h2>
          {item.service_name ? <p className="text-sm text-ink-soft">{item.service_name}</p> : null}
          <p className="mt-1.5 text-sm">
            <strong className="text-ink">{dollars(price.amount)}</strong>
            {price.caption ? <span className="text-ink-faint"> {price.caption.toLowerCase()}</span> : null}
            {item.rating > 0 ? <span className="ml-3 text-gold">★ {item.rating.toFixed(1)}</span> : null}
          </p>
          <p className="mt-1 text-xs italic text-ink-soft">{item.match_reason}</p>
        </div>
        {item.vendor_id ? (
          <Link href={`/vendor?id=${item.vendor_id}`} className="shrink-0 text-sm font-semibold text-gold hover:underline">
            See vendor
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function SuggestInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const eventId = useSearchParams().get("event") ?? "";
  const [celebration, setCelebration] = useState<Celebration | null | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState<string | null>(null);
  const [vibes, setVibes] = useState<string[]>([]);
  const [stage, setStage] = useState<"form" | "loading" | "results">("form");
  // Which suggest() is current: going back while it loads drops its answer.
  const run = useRef(0);
  const [options, setOptions] = useState<BundleOption[]>([]);
  const [plan, setPlan] = useState<(typeof PLANS)[number]["name"]>("Balanced");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace(signInUrl(`/suggest?event=${eventId}`));
  }, [authLoading, user, eventId]);

  const load = useCallback(() => {
    if (!user) return Promise.resolve();
    return Promise.all([listBundles(), listEvents()]).then(
      ([bundles, events]) => setCelebration(toCelebrations(events, bundles).find((c) => c.event?.event_id === eventId) ?? null),
      () => setCelebration(null),
    );
  }, [user, eventId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading || !user || celebration === undefined) return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  const event = celebration?.event;
  if (!celebration || !event) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">That event isn&apos;t here any more.</p>
        <LinkButton href="/bundles" variant="ghost" className="mt-5">
          All events
        </LinkButton>
      </div>
    );
  }

  const back = `/event?id=${event.event_id}`;
  const open = celebration.missing;
  const amount = Number(budget ?? event.budget ?? 0);
  const summary = [prettyDate(celebration.dateIso), celebration.location].filter(Boolean).join(" · ");

  async function suggest() {
    const id = ++run.current;
    setStage("loading");
    setError(null);
    const minimum = new Promise((resolve) => window.setTimeout(resolve, MIN_LOADING_MS));
    try {
      const request = generateBundles({
        event_id: event!.event_id,
        needed_categories: open,
        booked_categories: [],
        location: celebration!.location,
        event_date: celebration!.dateIso && celebration!.dateIso !== "TBD" ? celebration!.dateIso : null,
        event_date_end: event!.date_end ?? null,
        guest_count: celebration!.guestCount,
        budget_tier: amount > 0 ? "custom" : null,
        budget_amount: amount > 0 ? String(amount) : null,
        style: vibes.map((v) => v.toLowerCase()),
      });
      const [res] = await Promise.all([request, minimum]);
      if (run.current !== id) return;
      setOptions(res.options);
      setStage("results");
    } catch (err) {
      if (run.current !== id) return;
      setError(err instanceof ApiError ? err.message : "Couldn't build suggestions. Try again.");
      setStage("form");
    }
  }

  async function add(option: BundleOption) {
    if (!option.bundle_id) return;
    setAdding(true);
    // The two plans not chosen are drafts on this event too; left alone they'd
    // show beside the one picked. Each is deleted on its own so one failure
    // doesn't strand the other.
    await Promise.all(unchosenBundleIds(options, option.bundle_id).map((id) => deleteBundle(id).catch(() => {})));
    router.push(back);
  }

  if (open.length === 0) {
    return (
      <div className="mx-auto w-[min(640px,100%-2rem)] py-16 text-center">
        <p className="eyebrow">Suggest vendors</p>
        <h1 className="mt-3 font-serif text-3xl font-bold tracking-[-0.03em] text-ink">Every slot has a vendor</h1>
        <p className="mt-3 text-ink-soft">Add a category in Edit event to get suggestions for it.</p>
        <LinkButton href={back} className="mt-6">
          Back to {celebration.name}
        </LinkButton>
      </div>
    );
  }

  if (stage === "loading") {
    const when = prettyDate(celebration.dateIso);
    return (
      <SuggestLoading
        backLabel={celebration.name}
        onBack={() => {
          run.current++;
          setStage("form");
        }}
        lines={[
          `Checking highly rated vendors${when ? ` for ${when}` : ""}${celebration.location ? ` near ${celebration.location}` : ""}`,
          `Balancing ${open.length} ${open.length === 1 ? "category" : "categories"}${amount > 0 ? ` within ${dollars(amount)}` : ""}`,
          vibes.length ? `Matching your style: ${vibes.join(", ").toLowerCase()}` : "Matching your style and priorities",
        ]}
      />
    );
  }

  if (stage === "results") {
    const option = planOption(options, PLANS.find((p) => p.name === plan)!.match) ?? options[0] ?? null;
    const items = option?.bundle.items ?? [];
    const unfilled = option?.bundle.unfilled_categories ?? [];
    const total = option?.bundle.estimated_total_min ?? 0;
    const pending = option?.bundle.pending_quantity_count ?? 0;
    const over = amount > 0 && pending === 0 && total > amount;
    return (
      <div className="mx-auto w-[min(860px,100%-2rem)] py-6 pb-28 desk:py-10">
        <button type="button" onClick={() => setStage("form")} className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← {celebration.name}
        </button>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Suggest vendors</p>
            <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink">Your suggested vendors</h1>
          </div>
          <Badge tone="neutral">
            {open.length} {open.length === 1 ? "category" : "categories"}
          </Badge>
        </div>

        <div role="tablist" aria-label="Plan" className="mt-5 inline-flex rounded-xl bg-panel p-1">
          {PLANS.map((p) => (
            <button
              key={p.name}
              role="tab"
              type="button"
              aria-selected={plan === p.name}
              disabled={!planOption(options, p.match)}
              onClick={() => setPlan(p.name)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${plan === p.name ? "bg-card text-ink shadow-sm" : "text-ink-soft"}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className={`mt-4 rounded-2xl border p-4 ${over ? "border-maroon/40 bg-maroon/[0.05]" : "border-line bg-card"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[0.75rem] font-semibold text-ink-soft">{pending > 0 ? "Suggested so far" : "Suggested total"}</span>
              <strong className="block font-serif text-xl font-bold text-ink">
                {dollars(total)}
                {amount > 0 ? ` of ${dollars(amount)} budget` : ""}
              </strong>
            </div>
            {amount > 0 && pending === 0 ? <Badge tone={over ? "maroon" : "green"}>{over ? `${dollars(total - amount)} over` : "Within budget"}</Badge> : null}
          </div>
          {pending > 0 ? (
            <p className="mt-2 text-xs text-ink-soft">
              {pending === 1 ? "1 vendor charges" : `${pending} vendors charge`} by the guest or hour, so this isn&apos;t the full total yet.
            </p>
          ) : null}
        </div>

        <ul className="mt-4 grid gap-3">
          {items.map((item) => (
            <Slot key={`${item.category}-${item.vendor_id ?? item.vendor_name}`} item={item} guests={celebration.guestCount} />
          ))}
          {unfilled.map((cat) => (
            <li key={cat} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4">
              <span className="grid">
                <strong className="text-sm text-ink">
                  No {categoryLabel(cat).toLowerCase()} vendor fits this yet
                </strong>
                <small className="text-xs text-ink-soft">Try the marketplace to see more options.</small>
              </span>
              <LinkButton size="md" variant="ghost" href={`/marketplace?category=${encodeURIComponent(cat)}`}>
                Browse {categoryLabel(cat)} in Explore
              </LinkButton>
            </li>
          ))}
        </ul>

        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-card/95 backdrop-blur desk:bottom-0">
          <div className="mx-auto flex w-[min(860px,100%-2rem)] flex-wrap items-center justify-between gap-3 py-3">
            <span className="grid">
              <strong className="text-sm text-ink">
                {items.length} {items.length === 1 ? "vendor" : "vendors"} · {dollars(total)}
                {amount > 0 && pending === 0 ? ` · ${over ? "over your budget" : "within your budget"}` : ""}
              </strong>
              <small className="text-xs text-ink-soft">They&apos;ll wait in your event as Ready to send.</small>
            </span>
            <Button disabled={adding || !option?.bundle_id || items.length === 0} onClick={() => option && add(option)}>
              {adding ? "Adding…" : "Add to my event"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const steps = ["Budget", "Style"];
  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-6 desk:py-10">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => (step ? setStep(step - 1) : router.push(back))}
          aria-label={step ? "Previous step" : "Back to event"}
          className="grid size-9 place-items-center rounded-full border border-line text-ink-soft"
        >
          ←
        </button>
        <span className="text-sm text-ink-soft">
          {step + 1} of {steps.length} · <strong className="text-ink">{steps[step]}</strong>
        </span>
        <Link href={back} className="text-sm font-semibold text-ink-soft hover:text-ink">
          Cancel
        </Link>
      </div>
      <div className="mt-3 h-[3px] rounded-full bg-panel">
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="mt-6 rounded-xl border border-line bg-card px-4 py-3 text-sm">
        <strong className="text-ink">{celebration.name}</strong>
        <span className="block text-ink-soft">
          {[summary, celebration.guestCount != null ? `${celebration.guestCount.toLocaleString()} guests` : null].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-1 block text-ink-soft">
          Open: {open.map((c) => categoryLabel(c)).join(", ")}
        </span>
      </div>

      {step === 0 ? (
        <>
          <p className="eyebrow mt-7">Budget</p>
          <h1 className="mt-3 font-serif text-[1.9rem] font-bold leading-[1.1] tracking-[-0.03em] text-ink">What should this cover?</h1>
          <p className="mt-2 text-ink-soft">
            We&apos;ll suggest one vendor for each of your {open.length} open {open.length === 1 ? "slot" : "slots"} within this amount.
          </p>
          <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-line bg-card px-4 py-3 focus-within:border-gold">
            <span className="grid">
              <small className="text-[0.72rem] font-semibold text-ink-soft">Total vendor budget</small>
              <strong className="text-sm text-ink">From your event details</strong>
            </span>
            <span className="flex items-center gap-1 font-serif text-xl font-bold text-ink">
              $
              <input
                type="number"
                min={0}
                step={500}
                aria-label="Total vendor budget"
                value={budget ?? (event.budget != null ? String(event.budget) : "")}
                onChange={(e) => setBudget(e.target.value)}
                className="w-28 bg-transparent text-right outline-none"
              />
            </span>
          </label>
          <p className="mt-2 text-xs text-ink-faint">Based on vendor starting prices. Actual prices may vary with your final event details.</p>
        </>
      ) : (
        <>
          <p className="eyebrow mt-7">The look</p>
          <h1 className="mt-3 font-serif text-[1.9rem] font-bold leading-[1.1] tracking-[-0.03em] text-ink">What should it feel like?</h1>
          <p className="mt-2 text-ink-soft">Pick as many as you like, or skip this step.</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {VIBES.map((v) => {
              const on = vibes.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setVibes(on ? vibes.filter((x) => x !== v) : [...vibes, v])}
                  className={`flex min-h-[52px] items-center justify-between rounded-xl border px-3.5 text-sm font-semibold ${
                    on ? "border-gold bg-gold/10 text-ink" : "border-line bg-card text-ink-soft"
                  }`}
                >
                  {v}
                  {on ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
          {error}
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[0.8rem] text-ink-soft">Nothing is sent to vendors until you choose.</span>
        {step === 0 ? (
          <Button onClick={() => setStep(1)}>Continue</Button>
        ) : (
          <Button onClick={suggest}>Suggest vendors</Button>
        )}
      </div>
    </div>
  );
}

export default function SuggestPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <SuggestInner />
    </Suspense>
  );
}
