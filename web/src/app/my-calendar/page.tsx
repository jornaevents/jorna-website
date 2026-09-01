"use client";

// The vendor's calendar, following the iOS one
// (front_end_desiconnect/Jorna/Jorna/NavigationFlow/VendorCalendarView.swift and
// docs/VENDOR_CALENDAR_IMPLEMENTATION.md): a month grid and a year overview, days
// tinted by state, today ringed, a selected day filled, and a legend.
//
// The three states are iOS's, mapped from booking status in lib/vendorPlan:
// approved and payment_confirmed read as booked, pending and negotiation_ongoing
// as tentative, rejected shows as nothing. iOS colours them red / orange / green;
// this palette has no red or orange, so booked is maroon and tentative gold —
// the same severity order in the colours the app actually has.
//
// Google-busy days come from the vendor's own availability endpoint and, as on
// iOS, the legend only mentions Google when a calendar is actually connected.
//
// It takes the slot "Hours" used to hold in the seller nav. Weekly hours still
// matter — they're what a host filtering by a date is matched against — so this
// links through to them rather than dropping them.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  getGoogleAuthUrl,
  getMyAvailability,
  getMyVendor,
  getVendorAvailability,
  listVendorBookings,
} from "@/lib/jorna";
import {
  calendarMonth,
  dayStatus,
  upcomingOnCalendar,
  type CalendarDay,
  type DayStatus,
} from "@/lib/vendorPlan";
import { WEEKDAYS, type AvailabilitySlot, type VendorBooking } from "@/lib/types";
import { Button, Card, LinkButton } from "@/components/ui";
import { VendorNav } from "@/components/VendorNav";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * iOS: red booked, orange tentative, green available. This palette has no red or
 * orange, so booked is maroon and tentative gold.
 *
 * Both hold in dark mode too, deliberately: maroon lightens to #8A1B34 there and
 * gold to #E0B457, which stay two distinct hues. An earlier pass mapped booked to
 * gold in dark for contrast, and the legend then showed two identical dots
 * against different labels.
 */
const DOT: Record<DayStatus, string> = {
  booked: "bg-maroon",
  tentative: "bg-gold",
  free: "bg-green/50",
};
const TINT: Record<DayStatus, string> = {
  booked: "bg-maroon/20",
  tentative: "bg-gold/15",
  free: "",
};

function clock(raw?: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

/**
 * What the dots mean — and only the dots that are actually drawn.
 *
 * The month grid marks a day only when something is on it: a free day gets no
 * dot at all. So "Available" was a legend entry with nothing on screen to point
 * at, and in a shade (green/40) that didn't match the one the year view does
 * draw (green/50). The year view puts a dot on every day, free ones included,
 * which is where that entry belongs.
 */
function Legend({ google, view }: { google: boolean; view: "month" | "year" }) {
  const items: [string, string][] = [];
  if (view === "year") items.push(["Available", DOT.free]);
  items.push(["Tentative", DOT.tentative], ["Booked", DOT.booked]);
  if (google) items.push(["Google", "bg-ink-faint"]);
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-line-soft pt-4">
      {items.map(([label, dot]) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-ink-faint">
          <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Link a Google Calendar, or say that one is linked.
 *
 * The reading half of this has worked for a long time — busy days already
 * arrive with the availability and already have their own tint — but nothing
 * ever offered to connect one, so the feature was only reachable from the
 * phone. This is the missing button.
 *
 * It's a whole-page redirect, not a popup: Google's consent screen is its own
 * page, and a popup is the version that gets blocked on a phone. The vendor
 * comes back to /calendar-connected.
 */
function GoogleCalendarCard({
  vendorId,
  connected,
}: {
  vendorId: string;
  connected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { auth_url } = await getGoogleAuthUrl(vendorId);
      window.location.href = auth_url;
      // Deliberately stays busy: the navigation is the success case, and
      // re-enabling the button would invite a second click during it.
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't start the Google connection.",
      );
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="serif text-lg text-ink">
            {connected ? "Google Calendar is connected" : "Connect Google Calendar"}
          </h2>
          <p className="mt-1 max-w-[52ch] text-sm text-ink-soft">
            {connected
              ? "Days you're busy in Google show here too, so a client can't book you into a gap that isn't one."
              : "Your Google events become busy days here, so nobody books you into a gap that isn't one. Jorna reads the times only — never what the events are — and never writes to your calendar."}
          </p>
        </div>
        {connected ? (
          <span className="shrink-0 rounded-full bg-green/15 px-3 py-1 text-xs font-semibold text-green">
            Connected
          </span>
        ) : (
          <Button disabled={busy} onClick={connect}>
            {busy ? "Opening Google…" : "Connect"}
          </Button>
        )}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: CalendarDay;
  selected: boolean;
  onSelect: (iso: string) => void;
}) {
  const marked = day.status !== "free" || day.googleBusy;
  return (
    <button
      type="button"
      onClick={() => onSelect(day.dateIso)}
      aria-current={day.isToday ? "date" : undefined}
      aria-label={`${day.dateIso}${day.status !== "free" ? `, ${day.status}` : ""}`}
      className={`flex h-11 items-center justify-center ${day.inMonth ? "" : "opacity-40"}`}
    >
      <span
        className={`relative flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition ${
          selected
            ? "bg-maroon font-semibold text-ground dark:bg-gold dark:text-[#2A0C19]"
            : `${day.googleBusy ? "bg-ink-faint/15" : TINT[day.status]} text-ink hover:bg-gold/10`
        } ${day.isToday && !selected ? "font-bold ring-2 ring-inset ring-gold" : ""}`}
      >
        {day.day}
        {marked && !selected ? (
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 size-1 rounded-full ${
              day.googleBusy && day.status === "free" ? "bg-ink-faint" : DOT[day.status]
            }`}
          />
        ) : null}
      </span>
    </button>
  );
}

/** A month at a glance — one dot per day, as iOS's MiniDayCell does. */
function MiniMonth({
  year,
  month,
  bookings,
  googleBusy,
  onOpen,
}: {
  year: number;
  month: number;
  bookings: VendorBooking[];
  googleBusy: Set<string>;
  onOpen: (month: number) => void;
}) {
  const days = useMemo(
    () => calendarMonth(bookings, year, month, googleBusy).filter((d) => d.inMonth),
    [bookings, year, month, googleBusy],
  );
  const busy = days.filter((d) => d.status !== "free").length;
  return (
    <button
      type="button"
      onClick={() => onOpen(month)}
      className="rounded-xl border border-card-edge bg-card p-3 text-left transition hover:border-gold/60"
    >
      <p className="text-sm font-semibold text-ink">{MONTHS[month]}</p>
      <p className="text-[0.68rem] text-ink-faint">
        {busy === 0 ? "Free" : `${busy} ${busy === 1 ? "day" : "days"}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-[3px]">
        {days.map((d) => (
          <span
            key={d.dateIso}
            aria-hidden="true"
            className={`size-1.5 rounded-full ${
              d.googleBusy && d.status === "free" ? "bg-ink-faint/60" : DOT[d.status]
            }`}
          />
        ))}
      </div>
    </button>
  );
}

export default function VendorCalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [googleBusy, setGoogleBusy] = useState<Set<string>>(new Set());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notVendor, setNotVendor] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<"month" | "year">("month");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/my-calendar");
  }, [authLoading, user, router]);

  const fetchAll = useCallback(async () => {
    if (!user) return null;
    const me = await getMyVendor().catch(() => null);
    if (!me) return { vendor: null as null };
    const [bk, avail] = await Promise.all([
      listVendorBookings(me.vendor_id, { limit: 100 })
        .then((r) => r.items)
        .catch(() => [] as VendorBooking[]),
      getMyAvailability().catch(() => [] as AvailabilitySlot[]),
    ]);
    return { vendor: me, bookings: bk, availability: avail };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then((snap) => {
      if (cancelled || !snap) return;
      if (!snap.vendor) {
        setNotVendor(true);
        setLoading(false);
        return;
      }
      setVendorId(snap.vendor.vendor_id);
      setBookings(snap.bookings ?? []);
      setAvailability(snap.availability ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  // Google-busy days for the year on show. Its own effect because it depends on
  // the year, and a failure only costs the fourth legend entry.
  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    getVendorAvailability(vendorId, `${year}-01-01`, `${year}-12-31`)
      .then((a) => {
        if (cancelled) return;
        setGoogleConnected(Boolean(a.google_calendar_connected));
        const days = new Set<string>();
        for (const slot of a.google_busy_times ?? []) {
          const s = slot as {
            start?: unknown;
            start_time?: unknown;
            end?: unknown;
            end_time?: unknown;
          };
          const rawStart = typeof s.start === "string" ? s.start : s.start_time;
          const rawEnd = typeof s.end === "string" ? s.end : s.end_time;
          if (typeof rawStart !== "string" || rawStart.length < 10) continue;
          const from = rawStart.slice(0, 10);
          days.add(from);
          // A block spanning days marks all of them. Reading only the start put
          // a three-day festival on the calendar as one busy morning, which is
          // the opposite of what a busy marker is for. Capped, and only when the
          // end genuinely parses — the shape of these is inferred from live
          // responses (see lib/availability), so it fails back to the start day
          // rather than guessing.
          if (typeof rawEnd === "string" && rawEnd.length >= 10) {
            const to = rawEnd.slice(0, 10);
            const cursor = new Date(`${from}T00:00:00`);
            const last = new Date(`${to}T00:00:00`);
            if (!Number.isNaN(cursor.getTime()) && !Number.isNaN(last.getTime())) {
              for (let n = 0; cursor < last && n < 62; n++) {
                cursor.setDate(cursor.getDate() + 1);
                days.add(
                  `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
                    cursor.getDate(),
                  ).padStart(2, "0")}`,
                );
              }
            }
          }
        }
        setGoogleBusy(days);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vendorId, year]);

  const days = useMemo(
    () => calendarMonth(bookings, year, month, googleBusy),
    [bookings, year, month, googleBusy],
  );
  // Everything the grid marks, including the tentative days — see
  // upcomingOnCalendar. Leaving them out left gold days on the calendar with
  // nothing in the list beside them to click.
  const upcoming = useMemo(() => upcomingOnCalendar(bookings), [bookings]);
  const selectedDay = selected ? days.find((d) => d.dateIso === selected) : undefined;

  function step(by: number) {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(null);
  }

  /**
   * Open a date from the list beside the calendar.
   *
   * Paging to the right month is the part that was missing — a date months out
   * was a line of text with no way through to the day it names. Scrolls the
   * grid into view because on a phone the list sits under it, and moving the
   * month without showing it reads as nothing having happened.
   */
  function jumpTo(iso: string) {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setView("month");
    setSelected(iso);
    requestAnimationFrame(() => {
      document
        .getElementById("calendar-grid")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (notVendor) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">Vendor calendar</h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-ink-soft">
          You don&apos;t have a vendor profile yet.
        </p>
        <LinkButton href="/vendor-profile" className="mt-6">
          Start selling
        </LinkButton>
      </div>
    );
  }

  const withWork = days.filter((d) => d.inMonth && d.status !== "free").length;

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="eyebrow">Vendor</span>
          <h1 className="serif mt-1 text-4xl text-maroon dark:text-gold">Calendar</h1>
        </div>
        {/* iOS toggles the same two modes. */}
        <div className="flex gap-1 rounded-full border border-card-edge p-1">
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-3.5 py-1 text-sm font-semibold capitalize transition ${
                view === v
                  ? "bg-maroon text-ground dark:bg-gold dark:text-[#2A0C19]"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-6">
        <VendorNav />
      </div>

      {/* Calendar and what's ahead, side by side where there's room. The list
          used to sit below the fold under the Google card and the weekly-hours
          card, which is a long way from the grid it refers to. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* The anchor is the wrapper, not the Card — Card takes className and
          children only, and widening a shared component for one scroll target
          is the wrong end to change. */}
      <div id="calendar-grid" className="scroll-mt-4">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={() => (view === "month" ? step(-1) : setYear(year - 1))}
          >
            ←
          </Button>
          <div className="text-center">
            <h2 className="serif text-xl text-ink">
              {view === "month" ? `${MONTHS[month]} ${year}` : year}
            </h2>
            {view === "month" ? (
              <p className="text-xs text-ink-faint">
                {withWork === 0
                  ? "Nothing on this month"
                  : `${withWork} ${withWork === 1 ? "day" : "days"} with work`}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="md"
            onClick={() => (view === "month" ? step(1) : setYear(year + 1))}
          >
            →
          </Button>
        </div>

        {view === "year" ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {MONTHS.map((_, i) => (
              <MiniMonth
                key={i}
                year={year}
                month={i}
                bookings={bookings}
                googleBusy={googleBusy}
                onOpen={(m) => {
                  setMonth(m);
                  setView("month");
                  setSelected(null);
                }}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-7 gap-y-1">
              {WEEKDAYS.map((d) => (
                <p
                  key={d}
                  className="pb-1 text-center text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-ink-faint"
                >
                  {d.slice(0, 3)}
                </p>
              ))}
              {days.map((d) => (
                <DayCell
                  key={d.dateIso}
                  day={d}
                  selected={selected === d.dateIso}
                  onSelect={(iso) => setSelected(iso === selected ? null : iso)}
                />
              ))}
            </div>

            {selectedDay ? (
              <div className="mt-4 border-t border-line-soft pt-4">
                <p className="text-sm font-semibold text-ink">
                  {prettyDate(selectedDay.dateIso)}
                </p>
                {selectedDay.bookings.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    {selectedDay.googleBusy
                      ? "Busy in your Google Calendar. Nothing booked through Jorna."
                      : "Nothing booked."}
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {selectedDay.bookings.map((b) => {
                      const booked = dayStatus([b]) === "booked";
                      return (
                        <li
                          key={b.booking_id}
                          className="rounded-xl bg-panel px-3 py-2.5 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-ink">
                              {b.service_name || "Package"}
                              {b.client_name ? (
                                <span className="font-normal text-ink-soft">
                                  {" "}
                                  · {b.client_name}
                                </span>
                              ) : null}
                            </p>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${
                                booked
                                  ? "bg-maroon/12 text-maroon dark:bg-gold/15 dark:text-gold"
                                  : "bg-gold/15 text-gold"
                              }`}
                            >
                              {booked ? "Booked" : "Tentative"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-faint">
                            {[
                              clock(b.time_start)
                                ? `${clock(b.time_start)}${
                                    clock(b.time_end) ? ` – ${clock(b.time_end)}` : ""
                                  }`
                                : null,
                              b.location,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No time set"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        )}

        <Legend google={googleConnected} view={view} />
      </Card>
      </div>

      {/* What's ahead, and a way into each of them. These were plain rows: a
          date months out was a line of text with no route to the day it names,
          so finding it meant paging the grid by hand. */}
      <section className="lg:sticky lg:top-4">
        <h2 className="eyebrow mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-card-edge bg-panel p-5 text-center text-sm text-ink-soft">
            Nothing booked yet.
          </p>
        ) : (
          <div className="grid gap-2">
            {upcoming.slice(0, 10).map((job) => {
              const isSelected = selected === job.dateIso;
              return (
                <button
                  key={job.booking.booking_id}
                  type="button"
                  onClick={() => jumpTo(job.dateIso)}
                  aria-label={`Show ${prettyDate(job.dateIso)} on the calendar`}
                  className={`w-full rounded-xl border px-3.5 py-3 text-left transition hover:border-gold/60 ${
                    isSelected
                      ? "border-gold bg-gold/[0.07]"
                      : "border-card-edge bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-medium text-ink">
                      {job.booking.service_name || "Package"}
                    </p>
                    {/* The same dot as the grid and the legend, so a gold day
                        and a gold row are visibly the same fact. */}
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[job.status]}`}
                    />
                  </div>
                  {job.booking.client_name ? (
                    <p className="truncate text-xs text-ink-soft">
                      {job.booking.client_name}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-faint">
                    {job.isToday ? (
                      <span className="font-semibold text-maroon dark:text-gold">
                        Today
                      </span>
                    ) : (
                      prettyDate(job.dateIso)
                    )}
                    {clock(job.booking.time_start)
                      ? ` · ${clock(job.booking.time_start)}`
                      : null}
                  </p>
                  {job.status === "tentative" ? (
                    <p className="mt-1 text-[0.68rem] font-medium text-gold">
                      Awaiting your answer
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>
      </div>

      {vendorId ? <GoogleCalendarCard vendorId={vendorId} connected={googleConnected} /> : null}

      {/* Not in the nav any more, but still what a host filtering by a date is
          matched against, so it keeps a way in from here. */}
      <section className="mt-8">
        <h2 className="eyebrow mb-3">Weekly hours</h2>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-ink-soft">
            {availability.length === 0
              ? "You haven't set any. Hosts filtering by a date can't tell whether you're free."
              : `Set on ${new Set(availability.map((s) => s.day_of_week)).size} of 7 days.`}
          </p>
          <LinkButton href="/my-availability" variant="ghost" size="md">
            {availability.length === 0 ? "Set your hours" : "Edit hours"}
          </LinkButton>
        </Card>
      </section>

      {/* No "all your bookings" footer: VendorNav carries that link at the top
          of every vendor page, and the upcoming list above already leads into
          the individual ones. */}
    </div>
  );
}
