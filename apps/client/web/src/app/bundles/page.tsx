"use client";

// My Events — the client's home (Jorna-Client design; client redesign PR 2).
//
// It opens on the three numbers a client comes back for — how many
// celebrations are in motion, how many vendors are booked, and what's waiting
// on them — then each celebration as a card that says how far along it is.
// The detail the old dashboard card carried (money, the task list, still to
// book) lives on the plan the card opens.
//
// The join of events and plans, and every count here, come from lib/myEvents
// and lib/planning — the same rules behind the Needs you badge.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { listBundles, listEvents } from "@/lib/jorna";
import {
  bookedOf,
  celebrationHref,
  daysAway,
  prettyDate,
  toCelebrations,
  type Celebration,
} from "@/lib/myEvents";
import type { EventItem } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";
import { Badge, MiniProgress } from "@/components/kit";
import { EventBuilder } from "@/components/EventBuilder";
import { signInUrl } from "@/lib/vendorSite";

function countdown(iso?: string | null): string | null {
  const n = daysAway(iso);
  if (n == null) return null;
  if (n < 0) return "Past";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `${n} days`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function EventCard({ celebration }: { celebration: Celebration }) {
  const { name, dateIso, location, tasks } = celebration;
  const { booked, total } = bookedOf(celebration);
  const when = countdown(dateIso);
  const where = [prettyDate(dateIso), location].filter(Boolean).join(" · ");
  return (
    <Link
      href={celebrationHref(celebration)}
      className="grid items-center gap-4 rounded-2xl border border-line bg-card p-[15px] text-left transition hover:border-gold sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:gap-6"
    >
      <span
        aria-hidden="true"
        className="hidden h-[110px] place-items-center rounded-xl bg-[#e7c790] font-serif text-5xl font-bold text-maroon sm:grid"
      >
        {name.trim().charAt(0).toUpperCase() || "J"}
      </span>
      <span className="grid min-w-0 gap-1.5">
        <span className="flex items-center justify-between gap-4">
          <span className="truncate font-serif text-xl font-bold tracking-[-0.02em] text-ink">{name}</span>
          {when ? <Badge tone="neutral">{when}</Badge> : null}
        </span>
        <span className="text-[0.85rem] text-ink-soft">{where || "Date and place not set yet"}</span>
        <span className="mt-3 flex items-center justify-between gap-3 text-[0.85rem] text-ink-soft">
          <span>
            {total > 0 ? `${booked} of ${total} vendors booked` : "No vendors added yet"}
          </span>
          {tasks.length > 0 ? (
            <Badge>
              {tasks.length} {tasks.length === 1 ? "needs you" : "need you"}
            </Badge>
          ) : null}
        </span>
        <MiniProgress value={booked} max={total} label={`${name}: vendors booked`} />
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hidden size-5 text-ink-faint sm:block" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

/** One of the three tiles: a label, a line under it, and the number. */
function Stat({ label, note, value, attention, onClick }: { label: string; note: string; value: number; attention?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-r border-line px-[18px] py-[15px] text-left transition last:border-r-0 hover:bg-gold/[0.07] max-sm:flex max-sm:flex-col max-sm:items-start max-sm:px-2.5 max-sm:py-3"
    >
      <span className="text-[0.75rem] font-semibold text-ink-soft max-sm:order-2 max-sm:text-[0.65rem]">{label}</span>
      <strong className={`row-span-2 font-serif text-[1.75rem] font-bold max-sm:order-1 max-sm:text-[1.4rem] ${attention ? "text-maroon" : "text-green"}`}>
        {value}
      </strong>
      <small className="text-[0.72rem] text-ink-soft max-sm:hidden">{note}</small>
    </button>
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
  const eventsRef = useRef<HTMLElement>(null);

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

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const list = celebrations ?? [];
  const totalTasks = list.reduce((n, c) => n + c.tasks.length, 0);
  // Still ahead, or not dated yet: a celebration that's happened isn't active.
  const active = list.filter((c) => (daysAway(c.dateIso) ?? 0) >= 0);
  const booked = list.reduce((n, c) => n + bookedOf(c).booked, 0);
  const toFind = list.reduce((n, c) => n + bookedOf(c).toFind, 0);
  const firstName = (user.f_name ?? "").trim();
  const toEvents = () => eventsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-11">
      {celebrations && celebrations.length > 0 ? (
        <>
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">My Events</p>
              <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[3.2rem]">
                {greeting()}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-2 text-ink-soft">
                {totalTasks === 0
                  ? "Everything's up to date across your celebrations."
                  : "Here's what's moving across your celebrations."}
              </p>
            </div>
            {!creating ? <Button onClick={() => setCreating(true)}>+ Plan a new event</Button> : null}
          </header>

          <div aria-label="Event overview" className="mb-6 grid grid-cols-3 overflow-hidden rounded-[14px] border border-line bg-card">
            <Stat
              label="Active events"
              value={active.length}
              note={active.length === 1 ? "One celebration coming up" : `${active.length} celebrations coming up`}
              onClick={toEvents}
            />
            <Stat
              label="Vendors booked"
              value={booked}
              note={toFind > 0 ? `${toFind} ${toFind === 1 ? "vendor" : "vendors"} left to find` : "Nothing left to find"}
              onClick={toEvents}
            />
            <Stat
              label="Needs your attention"
              value={totalTasks}
              note={totalTasks > 0 ? "See everything waiting on you" : "You're all caught up"}
              attention
              onClick={() => router.push("/activity")}
            />
          </div>
        </>
      ) : null}

      {creating ? (
        <EventBuilder
          onClose={() => setCreating(false)}
          onCreated={(event, suggest) => {
            setCreating(false);
            if (suggest) {
              // The builder for this event, so the plan joins it (PR 5 makes
              // this the suggestions step).
              const q = new URLSearchParams({ event_id: event.event_id });
              if (event.date_iso) q.set("date", event.date_iso);
              if (event.location) q.set("city", event.location);
              if (event.guest_count != null) q.set("guests", String(event.guest_count));
              router.push(`/plan?${q}`);
            } else {
              void load();
            }
          }}
        />
      ) : null}

      {error && !creating ? (
        <p className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
          {error}
        </p>
      ) : null}

      {celebrations === null ? (
        <p className="mt-10 text-center text-ink-soft">Loading…</p>
      ) : celebrations.length === 0 ? (
        creating ? null : (
          <div className="mx-auto flex min-h-[60vh] max-w-[520px] flex-col items-center justify-center text-center">
            <div aria-hidden="true" className="relative mb-8 h-[120px] w-[190px]">
              <span className="absolute bottom-0 left-2 size-[84px] rounded-full border-2 border-gold" />
              <span className="absolute bottom-0 right-2 size-[84px] rounded-full border-2 border-gold" />
              <span className="absolute left-[66px] top-0 size-[58px] rounded-full border-2 border-maroon" />
            </div>
            <p className="eyebrow">Welcome to Jorna</p>
            <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[3.2rem]">
              Your celebrations start here
            </h1>
            <p className="mt-4 leading-[1.7] text-ink-soft">
              Bring your vendors, contracts, guests and payment reminders together in one warm, organized place.
            </p>
            <Button className="mt-6" onClick={() => setCreating(true)}>
              Plan your first event
            </Button>
          </div>
        )
      ) : (
        <section
          ref={eventsRef}
          aria-label="Your events"
          className="scroll-mt-24 rounded-2xl border border-line bg-panel/60 p-[18px]"
        >
          <div className="mb-3.5">
            <h2 className="font-serif text-xl font-bold tracking-[-0.02em] text-ink">Your Events</h2>
            <span className="text-[0.76rem] text-ink-soft">
              {active.length} active {active.length === 1 ? "event" : "events"}
            </span>
          </div>
          <div className="grid gap-4">
            {celebrations.map((c) => (
              <EventCard key={c.key} celebration={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
