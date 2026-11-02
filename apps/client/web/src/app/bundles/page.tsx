"use client";

// The planning dashboard — the client's Bundles tab.
//
// It used to be a grid of bundle cards showing a name, a status word, and a
// total, which told you nothing about whether the celebration was on track.
// This answers the question you actually open the tab with: what's booked, what
// still needs me, and what do I do next.
//
// A celebration, not a bundle, is the unit here. /events used to list events
// separately, which split one plan across two tabs — an event you'd created but
// not yet built a bundle for simply didn't appear next to the ones you had. So
// this reads both and joins them on event_id:
//
//   event + its bundles   → the normal case
//   event, no bundles     → shown with a Build a bundle button
//   bundle, no event      → shown on its own (bundles can exist event-less)
//
// The outstanding work comes from lib/planning, the same rules behind the
// "Needs you" badge, so the two can't tell you different things.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { createEvent, listBundles, listEvents } from "@/lib/jorna";
import {
  celebrationProgress,
  compareByDate,
  isDraftBundle,
  missingCategories,
  moneyForBundle,
  planForBundle,
  taskDetail,
  type MoneyBreakdown,
  type PlanTask,
  type ProgressBreakdown,
} from "@/lib/planning";
import {
  CATEGORY_LABELS,
  categoryLabel,
  type BundleDetail,
  type EventItem,
} from "@/lib/types";
import { Button, Card, Chip, Field, LinkButton } from "@jorna/shared/components/ui";
import { PlanProgress } from "@/components/PlanProgress";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { signInUrl } from "@/lib/vendorSite";

function money(n?: number | null) {
  return n == null ? null : `$${Math.round(n).toLocaleString()}`;
}

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Days until the event; negative once it's past. Null when there's no date. */
function daysAway(iso?: string | null): number | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function countdown(iso?: string | null): string | null {
  const n = daysAway(iso);
  if (n == null) return null;
  if (n < 0) return "Past";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 31) return `In ${n} days`;
  const months = Math.round(n / 30);
  return `In ${months} ${months === 1 ? "month" : "months"}`;
}

/** One celebration: an event, the bundles built for it, and what it still needs. */
interface Celebration {
  key: string;
  name: string;
  event: EventItem | null;
  bundles: BundleDetail[];
  dateIso: string | null;
  location: string | null;
  guestCount: number | null;
  tasks: PlanTask[];
  live: number;
  spend: number;
  /** What the host set out to spend, when they told us. */
  budget: number | null;
  money: MoneyBreakdown;
  /** How far along it is, counted in vendors rather than dollars. */
  progress: ProgressBreakdown;
  /** Categories they said they needed that nothing live covers. */
  missing: string[];
}

const ZERO_MONEY: MoneyBreakdown = {
  committed: 0,
  requested: 0,
  inEscrow: 0,
  released: 0,
  outstanding: 0,
  unpricedCount: 0,
  refunded: 0,
  strandedInEscrow: 0,
};

/**
 * Join events and bundles into celebrations.
 *
 * A bundle carries only a thin `event` summary, so an event the user created in
 * full (with a budget, say) is preferred as the source of the shared fields and
 * the bundle's copy is the fallback.
 */
function toCelebrations(events: EventItem[], bundles: BundleDetail[]): Celebration[] {
  const byKey = new Map<string, Celebration>();

  const blank = (key: string, name: string, event: EventItem | null): Celebration => ({
    key,
    name,
    event,
    bundles: [],
    dateIso: event?.date_iso ?? null,
    location: event?.location ?? null,
    guestCount: event?.guest_count ?? null,
    tasks: [],
    live: 0,
    spend: 0,
    budget: event?.budget ?? null,
    money: { ...ZERO_MONEY },
    // Filled in below, once every bundle is in — progress counts what's still
    // to book, which is a fact about the celebration and not about any one
    // bundle in it.
    progress: celebrationProgress([]),
    missing: [],
  });

  for (const event of events) {
    byKey.set(event.event_id, blank(event.event_id, event.name, event));
  }

  for (const bundle of bundles) {
    const key = bundle.event_id ?? `bundle:${bundle.bundle_id}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = blank(key, bundle.event_name || bundle.name || "Untitled celebration", null);
      byKey.set(key, entry);
    }
    entry.bundles.push(bundle);

    // Fill anything the event didn't supply from the bundle's own summary.
    entry.dateIso ??= bundle.event?.date_iso ?? null;
    entry.location ??= bundle.event?.location ?? null;
    entry.guestCount ??= bundle.event?.guest_count ?? null;

    const plan = planForBundle(bundle);
    entry.tasks.push(...plan.tasks);
    entry.live += plan.liveCount;
    entry.spend += bundle.total_estimated_cost ?? 0;

    const cash = moneyForBundle(bundle);
    for (const k of Object.keys(entry.money) as (keyof MoneyBreakdown)[]) {
      entry.money[k] += cash[k];
    }
  }

  // An event's own gaps are derived per bundle, so two bundles on one event
  // would each report the same missing date. Keep one of each.
  for (const entry of byKey.values()) {
    const seen = new Set<string>();
    entry.tasks = entry.tasks.filter((t) => !seen.has(t.id) && seen.add(t.id));
    // Compared across all of a celebration's bundles: a photographer booked in
    // one of them isn't missing just because the other doesn't have one.
    entry.missing = missingCategories(entry.event?.services_needed, entry.bundles);
    entry.progress = celebrationProgress(entry.bundles, entry.missing.length);
  }

  // Upcoming first, soonest at the top; then finished, most recent first; then
  // undated. See compareByDate — a plain ascending sort put last year's wedding
  // above the one three weeks away.
  return [...byKey.values()].sort(
    (a, b) => compareByDate(a.dateIso, b.dateIso) || a.name.localeCompare(b.name),
  );
}

/** Carry what's known about a celebration into the builder's form. */
function buildQuery(c: Celebration): string {
  const q = new URLSearchParams();
  // The celebration itself, not just its facts. The builder used to only
  // prefill, and always created its own event — so building a bundle for a
  // wedding already on this dashboard produced a second card for the same
  // wedding, with no way to merge them.
  if (c.event) q.set("event_id", c.event.event_id);
  if (c.dateIso && c.dateIso !== "TBD") q.set("date", c.dateIso);
  if (c.location) q.set("city", c.location);
  if (c.guestCount != null) q.set("guests", String(c.guestCount));
  const s = q.toString();
  return s ? `?${s}` : "";
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={value ? "text-ink" : "text-ink-faint"}>{value ?? "Not set"}</p>
    </div>
  );
}

function CelebrationCard({ celebration }: { celebration: Celebration }) {
  const { name, bundles, tasks, live, spend, dateIso, budget, progress } = celebration;
  const urgent = tasks.filter((t) => t.tone === "urgent").length;
  const when = countdown(dateIso);
  const total = money(spend);
  // Two stages, and the card should say which at a glance. A plan whose vendors
  // have been asked is a different kind of thing from one still being written,
  // and the difference decides what you can do to it — a draft is yours to
  // change, a sent one is a set of promises other people are holding.
  //
  // Gold and green, matching the banners on the plan itself, so the colour
  // means the same thing on both screens.
  const allDraft = bundles.length > 0 && bundles.every(isDraftBundle);
  const stage = bundles.length === 0 ? null : allDraft ? "draft" : "plan";
  // Withheld while anything is unpriced. "Under budget" is a claim, and a plan
  // with an unpriced caterer in it can't support one — the missing figure is
  // frequently the largest. Reporting "$5,240 of $40,000" on a celebration
  // heading for $60,000 is worse than reporting nothing.
  const unpriced = celebration.money.unpricedCount;
  // Against everything asked for, not just what's agreed: a plan sent out
  // over budget is over budget whether or not the vendors have answered yet.
  const { committed, requested } = celebration.money;
  const overBudget =
    budget != null && unpriced === 0 && committed + requested > budget;

  return (
    <Card
      className={`p-5 sm:p-6 ${
        stage === "draft"
          ? "border-gold/50 bg-gold/[0.05]"
          : stage === "plan"
            ? "border-green/40 bg-green/[0.04]"
            : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="serif text-2xl text-ink">{name}</h2>
          {when ? (
            <p className="mt-1 text-sm text-ink-soft">
              {when}
              {prettyDate(dateIso) ? ` · ${prettyDate(dateIso)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {stage ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                stage === "draft"
                  ? "bg-gold/15 text-gold"
                  : "bg-green/12 text-green"
              }`}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {stage === "draft" ? "Draft — not sent" : "Sent to vendors"}
            </span>
          ) : null}
          {tasks.length > 0 ? (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                urgent > 0
                  ? "bg-maroon text-ground dark:bg-gold dark:text-ground"
                  : "bg-ground-2 text-ink-soft"
              }`}
            >
              {tasks.length} {tasks.length === 1 ? "thing needs you" : "things need you"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Fact label="Date" value={prettyDate(dateIso)} />
        <Fact label="Location" value={celebration.location} />
        <Fact
          label="Guests"
          value={celebration.guestCount != null ? String(celebration.guestCount) : null}
        />
        {/* Spend lives in the money row below, where it can be read against the
            budget; repeating it here as a bare "Estimated" said less. */}
        {live === 0 && total ? <Fact label="Estimated" value={total} /> : null}
      </div>

      {/* Where the celebration has got to, in vendors. Not in money: the venue
          is most of the bill, so paying it used to fill most of a bar while
          five vendors sat unanswered — and nothing still to be booked was in
          the total at all, which is how one paid vendor out of six needed drew
          a full bar. See the Progress section of lib/planning.

          Rendered on `progress.total`, not on `live`: a celebration with
          categories listed and nothing booked yet is exactly the case the old
          bar had nothing to say about. */}
      <PlanProgress progress={progress} className="mt-4" />

      {live > 0 ? (
        <div className="mt-3">
          {/* The budget, in words. It used to be the bar's scale, which meant
              the same bar measured spend on one card and progress-ish on the
              next; as a sentence it says what it always meant. */}
          <p className="text-xs text-ink-soft">
            {/* A draft has committed to nothing — no vendor has been asked,
                and the figure is a sum of listed rates the client can still
                change. "Estimated" is what it is until the plan is sent.
                Once sent, requests the vendors haven't answered aren't
                committed either: "$1,500 committed" read as a promise nobody
                had made (#102). */}
            {committed > 0 || requested === 0 ? (
              <>
                {money(committed)} {stage === "draft" ? "estimated" : "committed"}
                {requested > 0 ? " · " : null}
              </>
            ) : null}
            {requested > 0 ? <>{money(requested)} requested</> : null}
            {unpriced > 0 ? <span className="text-ink-faint"> so far</span> : null}
            {celebration.budget ? (
              <span className={overBudget ? "text-maroon dark:text-gold" : "text-ink-faint"}>
                {" "}
                of {money(celebration.budget)} budget
                {overBudget ? " — over" : ""}
              </span>
            ) : null}
            {celebration.money.outstanding > 0 ? (
              <span className="text-ink-faint">
                {" · "}
                {money(celebration.money.outstanding)} still to pay
              </span>
            ) : null}
          </p>

          {unpriced > 0 ? (
            <p className="mt-1.5 text-xs text-ink-faint">
              {unpriced === 1 ? "1 booking isn't" : `${unpriced} bookings aren't`}{" "}
              priced yet — they charge by the guest, hour or day
              {celebration.budget ? ", so this can't be read against your budget" : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      {celebration.missing.length > 0 ? (
        <p className="mt-4 rounded-xl bg-gold/10 px-3 py-2.5 text-sm text-ink-soft">
          <span className="font-medium text-ink">Still to book:</span>{" "}
          {celebration.missing.map((c) => categoryLabel(c)).join(", ")} — you listed
          {celebration.missing.length === 1 ? " it" : " them"} when you set this up.
        </p>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {tasks.slice(0, 3).map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-2.5 rounded-xl bg-panel px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  task.tone === "urgent" ? "bg-maroon dark:bg-gold" : "bg-gold/60"
                }`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{task.title}</span>
                {taskDetail(task) ? (
                  <span className="block text-xs text-ink-soft">{taskDetail(task)}</span>
                ) : null}
              </span>
            </li>
          ))}
          {tasks.length > 3 ? (
            <li className="px-3 text-xs text-ink-faint">
              and {tasks.length - 3} more
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* One way in. This card used to offer "Open plan" and "Event details"
          side by side, which asked you to guess which held what — the plan now
          carries the event's details too, so there's one door. A celebration
          with several bundles opens the first; the plan links the rest. */}
      <div className="mt-5">
        {bundles.length === 0 ? (
          // Carries the celebration itself, not just its details — the bundle
          // built there joins this card rather than starting a second one.
          <LinkButton href={`/plan${buildQuery(celebration)}`}>Build a bundle</LinkButton>
        ) : (
          <LinkButton href={`/bundle?id=${bundles[0].bundle_id}`}>
            {allDraft ? "Review draft" : "Open plan"}
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  return <DashboardInner />;
}

function DashboardInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [celebrations, setCelebrations] = useState<Celebration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [location, setLocation] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [needed, setNeeded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace(signInUrl("/bundles"));
  }, [authLoading, user, router]);

  // A promise chain, not async/await: state is only set once the requests
  // settle, so the mount effect below never updates state synchronously.
  const load = useCallback(() => {
    if (!user) return Promise.resolve();
    // An events failure shouldn't empty the dashboard — bundles are the part
    // that always exists, so a missing event list just costs the join.
    return Promise.all([listBundles(), listEvents().catch(() => [] as EventItem[])]).then(
      ([bundles, events]) => {
        setCelebrations(toCelebrations(events, bundles));
        setError(null);
      },
      (err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load your celebrations.");
        setCelebrations([]);
      },
    );
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createEvent({
        name: name.trim(),
        date_iso: dateIso,
        location: location.trim(),
        guest_count: guests ? Number(guests) : null,
        budget: budget ? Number(budget) : null,
        // Without this the "Still to book" hint never fires for a celebration
        // made here: missingCategories compares against services_needed, and
        // only the builder was ever setting it. A hand-made celebration got no
        // checklist at all.
        services_needed: needed.length > 0 ? needed : null,
      });
      setCreating(false);
      setName("");
      setDateIso("");
      setLocation("");
      setGuests("");
      setBudget("");
      setNeeded([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that celebration.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const totalTasks = (celebrations ?? []).reduce((n, c) => n + c.tasks.length, 0);

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Your celebrations</span>
          <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold sm:text-5xl">
            Dashboard
          </h1>
          {celebrations && celebrations.length > 0 ? (
            <p className="mt-2 text-ink-soft">
              {totalTasks === 0
                ? "Everything's up to date."
                : `${totalTasks} ${totalTasks === 1 ? "thing needs" : "things need"} you across ${
                    celebrations.length
                  } ${celebrations.length === 1 ? "celebration" : "celebrations"}.`}
            </p>
          ) : null}
        </div>
        {celebrations && celebrations.length > 0 && !creating ? (
          <Button variant="ghost" onClick={() => setCreating(true)}>
            New celebration
          </Button>
        ) : null}
      </header>

      {creating ? (
        <Card className="mt-7 p-6">
          <h2 className="serif text-xl text-ink">New celebration</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Or skip this — building a bundle sets one up for you.
          </p>
          <form onSubmit={submit} className="mt-4 grid gap-4">
            <Field
              label="Name"
              placeholder="Priya & Arjun's Wedding"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Date"
                type="date"
                required
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
              />
              <CityCombobox
                label="Location"
                placeholder="Start typing a city…"
                required
                value={location}
                onChange={(v) => setLocation(v)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Guests (optional)"
                type="number"
                min={1}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
              />
              <Field
                label="Budget (optional)"
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>

            {/* What the "Still to book" hint compares against. Only the builder
                was setting this, so a celebration created here never got a
                checklist — the one thing that tells a host what they haven't
                arranged yet. */}
            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">
                What you&apos;ll need{" "}
                <span className="text-ink-faint">
                  (optional · we&apos;ll remind you what&apos;s still unbooked)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.keys(CATEGORY_LABELS).map((c) => (
                  <Chip
                    key={c}
                    active={needed.includes(c)}
                    onClick={() =>
                      setNeeded((list) =>
                        list.includes(c) ? list.filter((v) => v !== c) : [...list, c],
                      )
                    }
                  >
                    {categoryLabel(c)}
                  </Chip>
                ))}
              </div>
            </div>

            {error ? (
              <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create celebration"}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {error && !creating ? (
        <p className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      {celebrations === null ? (
        <p className="mt-10 text-center text-ink-soft">Loading…</p>
      ) : celebrations.length === 0 ? (
        // Nothing planned yet: one thing to do, and it's the builder.
        <Card className="mt-10 p-10 text-center">
          <h2 className="serif text-2xl text-ink">Start with a bundle</h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-ink-soft">
            Tell Jorna about your celebration and it builds three complete vendor teams
            for you to compare — venue, catering, photography, and everything else it
            takes. Everything you book then lives here.
          </p>
          <LinkButton href="/plan" size="lg" className="mt-7">
            Build a bundle
          </LinkButton>
          <p className="mt-5 text-sm text-ink-faint">
            Rather set the date first?{" "}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-gold hover:underline"
            >
              Create a celebration
            </button>
            .
          </p>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4">
          {celebrations.map((c) => (
            <CelebrationCard key={c.key} celebration={c} />
          ))}
        </div>
      )}
    </div>
  );
}
