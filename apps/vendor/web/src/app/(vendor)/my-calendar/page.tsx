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
// Only what's booked through Jorna (2026-11-16): Google Calendar and weekly
// hours are gone from the vendor app, and a vendor counts as free on any day
// without a booking or a hold.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { myVendor, vendorBookings } from "@/lib/vendorData";
import { useDataVersion } from "@/lib/dataCache";
import {
  calendarMonth,
  dayStatus,
  upcomingOnCalendar,
  type CalendarDay,
  type DayStatus,
} from "@/lib/vendorPlan";
import { WEEKDAYS, type VendorBooking } from "@/lib/types";
import { Button, Card, LinkButton } from "@jorna/shared/components/ui";
import { FilterTabs, PageHeader } from "@/components/vendor/ui";
import { PageSkeleton, SkeletonCard, type PageHeading } from "@/components/vendor/PageSkeleton";

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
function Legend({ view }: { view: "month" | "year" }) {
  const items: [string, string][] = [];
  if (view === "year") items.push(["Available", DOT.free]);
  items.push(["Tentative", DOT.tentative], ["Booked", DOT.booked]);
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

function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: CalendarDay;
  selected: boolean;
  onSelect: (iso: string) => void;
}) {
  const marked = day.status !== "free";
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
            ? "bg-maroon font-semibold text-white dark:bg-gold dark:text-[#2A0C19]"
            : `${TINT[day.status]} text-ink hover:bg-gold/10`
        } ${day.isToday && !selected ? "font-bold ring-2 ring-inset ring-gold" : ""}`}
      >
        {day.day}
        {marked && !selected ? (
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 size-1 rounded-full ${DOT[day.status]}`}
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
  onOpen,
}: {
  year: number;
  month: number;
  bookings: VendorBooking[];
  onOpen: (month: number) => void;
}) {
  const days = useMemo(
    () => calendarMonth(bookings, year, month).filter((d) => d.inMonth),
    [bookings, year, month],
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
            className={`size-1.5 rounded-full ${DOT[d.status]}`}
          />
        ))}
      </div>
    </button>
  );
}

const HEADING: PageHeading = {
  eyebrow: "Schedule",
  title: "Calendar",
  subtitle: "Booked days and tentative holds, in one place.",
};

function CalendarSkeleton() {
  return (
    <PageSkeleton heading={HEADING} label="Loading your calendar…">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="rounded-2xl border border-card-edge bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="size-9 rounded-full bg-line-soft" />
            <div className="h-5 w-36 rounded-md bg-line" />
            <div className="size-9 rounded-full bg-line-soft" />
          </div>
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 42 }, (_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-ground-2" />
            ))}
          </div>
        </div>
        <SkeletonCard lines={4} />
      </div>
    </PageSkeleton>
  );
}

export default function VendorCalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [bookings, setBookings] = useState<VendorBooking[]>([]);
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

  const dataVersion = useDataVersion();

  const fetchAll = useCallback(async () => {
    if (!user) return null;
    const me = await myVendor().catch(() => null);
    if (!me) return { vendor: null as null };
    const bk = await vendorBookings(me.vendor_id)
      .then((r) => r.items)
      .catch(() => [] as VendorBooking[]);
    return { vendor: me, bookings: bk };
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
      setBookings(snap.bookings ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAll, dataVersion]);

  const days = useMemo(
    () => calendarMonth(bookings, year, month),
    [bookings, year, month],
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
    return <CalendarSkeleton />;
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
    <div>
      <PageHeader
        {...HEADING}
        action={
          // iOS toggles the same two modes.
          <FilterTabs<"month" | "year">
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
            ]}
          />
        }
      />

      {/* Calendar and what's ahead, side by side where there's room. */}
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
                  <p className="mt-1 text-sm text-ink-soft">Nothing booked.</p>
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

        <Legend view={view} />
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

      {/* No "all your bookings" footer: the sidebar carries that link on
          every vendor page, and the upcoming list above already leads into
          the individual ones. */}
    </div>
  );
}
