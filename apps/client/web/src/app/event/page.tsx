"use client";

// One event's workspace (Jorna-Client design; client redesign PR 4): the
// event's name and facts, a sidebar of its sections, and the Overview — how
// many vendors are booked, where contracts and payments stand, each vendor
// with the one thing to do next, what's still to find, what needs the client,
// and the budget.
//
// The Overview is the front door, not a second copy of the plan: sending
// requests, swapping a vendor, changing a date and cancelling still happen on
// the plan (/bundle) the vendor rows link to, and a contract opens on
// /contract. /event was a redirect to the plan before this.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, LinkButton } from "@jorna/shared/components/ui";
import { listBundles, listEvents } from "@/lib/jorna";
import { bookedOf, daysAway, prettyDate, toCelebrations, type Celebration } from "@/lib/myEvents";
import { overviewTotals, vendorRows, type VendorRow } from "@/lib/eventOverview";
import { centsMoney, contractInChatPath } from "@/lib/contract";
import { taskDetail, type PlanTask } from "@/lib/planning";
import { categoryLabel } from "@/lib/types";
import { Badge, MiniProgress, type Tone } from "@/components/kit";
import { VendorDrawer } from "@/components/VendorDrawer";
import { EditEventDrawer } from "@/components/EditEventDrawer";
import { signInUrl } from "@/lib/vendorSite";

const dollars = (n: number) => `$${Math.round(n).toLocaleString()}`;

function when(c: Celebration): string {
  const start = prettyDate(c.dateIso);
  const end = prettyDate(c.event?.date_end);
  return [start && end ? `${start} – ${end}` : start, c.location, c.guestCount != null ? `${c.guestCount.toLocaleString()} guests` : null]
    .filter(Boolean)
    .join(" · ");
}

function toGo(c: Celebration): string | null {
  const n = daysAway(c.dateIso);
  if (n == null) return null;
  return n < 0 ? "Past" : n === 0 ? "Today" : `${n} ${n === 1 ? "day" : "days"} to go`;
}

/** Where a task's link goes: the contract for one to sign, the vendor's
 *  payments for one to pay, and the plan for the rest. */
function taskHref(task: PlanTask, c: Celebration): string {
  if (task.bookingId && (task.kind === "sign" || task.kind === "contract-expired")) return contractInChatPath(task.bookingId);
  const bundle = c.bundles.find((b) => (b.bookings ?? []).some((x) => x.booking_id === task.bookingId)) ?? c.bundles[0];
  return bundle ? `/bundle?id=${bundle.bundle_id}` : "/activity";
}

function Tile({ label, value, badge, tone, note, children }: { label: string; value: string; badge: string; tone: Tone; note?: string; children?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5 rounded-[14px] border border-line bg-card p-4">
      <span className="text-[0.75rem] font-semibold text-ink-soft">{label}</span>
      <strong className="font-serif text-[1.45rem] font-bold text-ink">{value}</strong>
      <Badge tone={tone}>{badge}</Badge>
      {note ? <small className="text-[0.72rem] text-ink-soft">{note}</small> : null}
      {children}
    </div>
  );
}

function Workspace() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const eventId = useSearchParams().get("id") ?? "";
  const [celebrations, setCelebrations] = useState<Celebration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openVendor, setOpenVendor] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace(signInUrl(`/event?id=${eventId}`));
  }, [authLoading, user, eventId]);

  const load = useCallback(() => {
    if (!user) return Promise.resolve();
    return Promise.all([listBundles(), listEvents()]).then(
      ([bundles, events]) => {
        setCelebrations(toCelebrations(events, bundles));
        setError(null);
      },
      (err) => setError(err instanceof ApiError ? err.message : "Couldn't load this event."),
    );
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading || !user || (celebrations === null && !error)) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }
  const c = celebrations?.find((x) => x.event?.event_id === eventId) ?? null;
  if (!c || !c.event) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">{error ?? "That event isn't here any more."}</p>
        <LinkButton href="/bundles" variant="ghost" className="mt-5">
          All events
        </LinkButton>
      </div>
    );
  }

  const rows = vendorRows(c);
  const totals = overviewTotals(rows);
  const { booked, total } = bookedOf(c);
  const pct = total > 0 ? Math.round((booked / total) * 100) : 0;
  const countdown = toGo(c);
  const open = rows.find((r) => r.booking.booking_id === openVendor) ?? null;
  const budget = c.budget;
  const committed = c.money.committed;
  const builderHref = `/plan?${new URLSearchParams({
    event_id: c.event.event_id,
    ...(c.dateIso && c.dateIso !== "TBD" ? { date: c.dateIso } : {}),
    ...(c.location ? { city: c.location } : {}),
    ...(c.guestCount != null ? { guests: String(c.guestCount) } : {}),
  })}`;

  const act = (row: VendorRow) => {
    if (row.target === "drawer") setOpenVendor(row.booking.booking_id);
    else router.push(row.target === "contract" ? contractInChatPath(row.booking.booking_id) : `/bundle?id=${row.bundleId}`);
  };

  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-10">
      <Link href="/bundles" className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← All Events
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[2.8rem]">{c.name}</h1>
          <p className="mt-2 text-ink-soft">{when(c) || "Date and place not set yet"}</p>
        </div>
        <div className="flex items-center gap-3">
          {countdown ? <Badge tone="neutral">{countdown}</Badge> : null}
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit event
          </Button>
        </div>
      </div>

      <div className="mt-7 grid gap-6 desk:grid-cols-[200px_minmax(0,1fr)]">
        <aside aria-label="Event sections">
          <nav className="flex gap-1 overflow-x-auto desk:grid">
            <span aria-current="page" className="shrink-0 rounded-xl bg-card px-3.5 py-2.5 text-sm font-semibold text-ink">
              Overview
            </span>
            <Link href={`/guests?event=${c.event.event_id}`} className="shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink-soft hover:bg-card">
              Guest List
            </Link>
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Overview</p>
              <h2 className="mt-2 font-serif text-xl font-bold tracking-[-0.02em] text-ink">Your event at a glance</h2>
              <p className="mt-1 text-sm text-ink-soft">Bookings, payments, and planning progress in one place.</p>
            </div>
            <Badge tone={booked === total && total > 0 ? "green" : "gold"}>
              {booked} of {total} booked
            </Badge>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Vendor progress" value={`${booked} / ${total}`} badge={`${pct}%`} tone="green">
              <MiniProgress value={booked} max={total} label="Vendors booked" />
            </Tile>
            <Tile
              label="Contracts"
              value={`${totals.signed} signed`}
              badge={totals.toSign > 0 ? `${totals.toSign} to sign` : totals.signed > 0 ? "All set" : "None yet"}
              tone={totals.toSign > 0 ? "gold" : "neutral"}
              note={totals.signed > 0 ? `${dollars(committed)} committed` : "Nothing is owed until one is signed"}
            />
            <Tile
              label="Payments"
              value={centsMoney(totals.paidCents)}
              badge={totals.overdue > 0 ? `${totals.overdue} overdue` : totals.owedCents > 0 ? "On track" : totals.signed > 0 ? "Nothing due" : "Not started"}
              tone={totals.overdue > 0 ? "maroon" : "green"}
              note={totals.owedCents > 0 ? `${centsMoney(totals.owedCents)} still to pay` : "No payments due"}
            />
            <Tile
              label="Planning"
              value={countdown ?? "No date yet"}
              badge={c.tasks.length > 0 ? `${c.tasks.length} ${c.tasks.length === 1 ? "task" : "tasks"} open` : `${c.missing.length} ${c.missing.length === 1 ? "slot" : "slots"} open`}
              tone="neutral"
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section aria-label="Booking progress" className="rounded-2xl border border-line bg-card p-[18px]">
              <h3 className="font-serif text-base font-bold text-ink">Booking progress</h3>
              <span className="text-[0.76rem] text-ink-soft">
                {rows.length} of {total} {total === 1 ? "category" : "categories"} started
              </span>

              {rows.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {rows.map((row) => (
                    <li key={row.booking.booking_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <button type="button" onClick={() => setOpenVendor(row.booking.booking_id)} className="flex min-w-0 items-center gap-3 text-left">
                        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-panel font-serif font-bold text-maroon">
                          {(row.booking.vendor_name ?? "V").charAt(0).toUpperCase()}
                        </span>
                        <span className="grid min-w-0">
                          <small className="text-[0.7rem] text-ink-faint">{categoryLabel(row.booking.service_category ?? "")}</small>
                          <strong className="truncate text-sm text-ink">{row.booking.vendor_name ?? "Vendor"}</strong>
                          <em className="truncate text-xs not-italic text-ink-soft">{row.detail}</em>
                        </span>
                      </button>
                      <span className="max-sm:hidden">
                        <Badge tone={row.tone}>{row.status}</Badge>
                      </span>
                      <Button size="md" variant={row.action === "View" ? "ghost" : "primary"} onClick={() => act(row)}>
                        {row.action}
                      </Button>
                      <span className="col-span-2 sm:hidden">
                        <Badge tone={row.tone}>{row.status}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl bg-panel px-4 py-5 text-center text-sm text-ink-soft">
                  <strong className="block text-ink">No vendors added yet</strong>
                  Your open slots are ready when you are.
                </p>
              )}

              {c.missing.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <strong className="text-sm text-ink">Still to find</strong>
                    <span className="text-xs text-ink-soft">{c.missing.length} open</span>
                  </div>
                  <ul className="grid gap-2">
                    {c.missing.map((cat) => (
                      <li key={cat} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-3 py-2.5">
                        <span className="grid">
                          <strong className="text-sm text-ink">{categoryLabel(cat)}</strong>
                          <small className="text-xs text-ink-soft">No vendor added yet</small>
                        </span>
                        <LinkButton size="md" variant="ghost" href={`/marketplace?category=${encodeURIComponent(cat)}`}>
                          Find vendor
                        </LinkButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Link href="/marketplace" className="mt-4 block text-sm font-semibold text-gold hover:underline">
                + Find another vendor
              </Link>

              {c.missing.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold/10 px-4 py-3">
                  <span className="grid">
                    <strong className="text-sm text-ink">
                      Let Jorna suggest vendors for your {c.missing.length} open {c.missing.length === 1 ? "slot" : "slots"}
                    </strong>
                    <small className="text-xs text-ink-soft">We&apos;ll build a highly rated bundle around your budget.</small>
                  </span>
                  <LinkButton size="md" href={builderHref}>
                    Suggest vendors
                  </LinkButton>
                </div>
              ) : rows.length > 0 ? (
                <p className="mt-4 text-sm text-green">✓ All your vendor slots are filled</p>
              ) : null}
            </section>

            <div className="grid content-start gap-4">
              <section aria-label="Needs your attention" className="rounded-2xl border border-line bg-card p-[18px]">
                <h3 className="font-serif text-base font-bold text-ink">Needs your attention</h3>
                <span className="text-[0.76rem] text-ink-soft">
                  {c.tasks.length > 0 ? `${c.tasks.length} ${c.tasks.length === 1 ? "item" : "items"}` : "You're all caught up"}
                </span>
                {c.tasks.length > 0 ? (
                  <ul className="mt-3 grid gap-1.5">
                    {c.tasks.map((task) => (
                      <li key={task.id}>
                        <Link href={taskHref(task, c)} className="flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-panel">
                          <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${task.tone === "urgent" ? "bg-maroon" : "bg-gold"}`} />
                          <span className="grid min-w-0 flex-1">
                            <strong className="text-sm text-ink">{task.title}</strong>
                            {taskDetail(task) ? <small className="text-xs text-ink-soft">{taskDetail(task)}</small> : null}
                          </span>
                          <span aria-hidden="true" className="text-ink-faint">
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-soft">Nothing needs you right now. We&apos;ll let you know when that changes.</p>
                )}
              </section>

              <section aria-label="Budget snapshot" className="rounded-2xl border border-line bg-card p-[18px]">
                <h3 className="font-serif text-base font-bold text-ink">Budget snapshot</h3>
                <span className="text-[0.76rem] text-ink-soft">Agreed vendors only</span>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Budget</dt>
                    <dd className="font-semibold text-ink">{budget != null ? dollars(budget) : "Not set"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Committed</dt>
                    <dd className="font-semibold text-ink">{dollars(committed)}</dd>
                  </div>
                  {budget != null ? (
                    <div className="flex justify-between">
                      <dt className="text-ink-soft">{committed > budget ? "Over by" : "Remaining"}</dt>
                      <dd className={`font-semibold ${committed > budget ? "text-maroon" : "text-ink"}`}>{dollars(Math.abs(budget - committed))}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              {c.bundles.length > 0 ? (
                <LinkButton variant="ghost" href={`/bundle?id=${c.bundles[0].bundle_id}`}>
                  Open the full plan
                </LinkButton>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {open ? <VendorDrawer row={open} onClose={() => setOpenVendor(null)} onPaid={() => void load()} /> : null}
      {editing ? (
        <EditEventDrawer
          event={c.event}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
          onDeleted={() => router.replace("/bundles")}
        />
      ) : null}
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <Workspace />
    </Suspense>
  );
}
