// A client's celebrations, as My Events and the event pages read them: each
// event joined with the plans (bundles) built for it, and what it still needs.
// Moved out of the dashboard page (client redesign PR 2) so the home, and the
// event workspace after it, work from one join.
//
// A celebration, not a bundle, is the unit. /events used to list events
// separately, which split one plan across two tabs, so this reads both and
// joins them on event_id:
//
//   event + its bundles   → the normal case
//   event, no bundles     → shown with nothing booked yet
//   bundle, no event      → shown on its own (bundles can exist event-less)
//
// The outstanding work comes from lib/planning, the same rules behind the
// "Needs you" badge, so the two can't tell you different things.

import {
  celebrationProgress,
  compareByDate,
  missingCategories,
  moneyForBundle,
  planForBundle,
  type MoneyBreakdown,
  type PlanTask,
  type ProgressBreakdown,
} from "@/lib/planning";
import type { BundleDetail, EventItem } from "@/lib/types";

export function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Days until the event; negative once it's past. Null when there's no date. */
export function daysAway(iso?: string | null): number | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** One celebration: an event, the bundles built for it, and what it still needs. */
export interface Celebration {
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
export function toCelebrations(events: EventItem[], bundles: BundleDetail[]): Celebration[] {
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

/** Vendors agreed with (accepted, paid or done) out of every slot the
 *  celebration has — booked ones, ones in motion, and ones still to find. */
export function bookedOf(c: Celebration): { booked: number; total: number; toFind: number } {
  const s = c.progress.stages;
  return { booked: s.accepted + s.paid + s.done, total: c.progress.total, toFind: s.toBook };
}

/** Where a celebration's card goes: the event's workspace (/event). A plan
 *  with no event of its own opens as the plan; and the builder is only for a
 *  celebration with neither. */
export function celebrationHref(c: Celebration): string {
  if (c.event) return `/event?id=${c.event.event_id}`;
  if (c.bundles.length > 0) return `/bundle?id=${c.bundles[0].bundle_id}`;
  return "/plan";
}
