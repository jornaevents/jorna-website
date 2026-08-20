"use client";

// The run sheet — the celebration's day, in order.
//
// Every booking is created with a required time_start/time_end and its own
// location, and none of it was shown anywhere: a host couldn't say what time the
// photographer arrives, or that the mehndi artist is coming to the house while
// everyone else is at the hall. This lays each date out in time order.
//
// On the day it doubles as an arrivals board. vendor_checked_in_at is already
// recorded (the vendor's GPS check-in) and was likewise invisible to the person
// who most wants it — the host standing in a hall wondering who's turned up.
//
// It shows whenever there is a schedule to show. Only the arrivals half waits
// for the week of — see runSheetIsDue — because "who has turned up" answers
// nothing in April, while "who is coming, when, and where" is exactly the thing
// a host wants to check months out.
//
// Collapsible, and always collapsed to start. Always-on and always open, it is
// a second copy of the vendor list sitting between the host and the parts of the
// page they can act on; the summary line says what it holds so opening it is a
// choice rather than a guess.
//
// Times are shown when there are any to show — see ScheduleDay.timesKnown. A day
// where nothing has hours yet lists its vendors without inventing clock times,
// and says so.

import { useId, useState } from "react";
import { ApiError } from "@/lib/api";
import { resendCheckInEmail } from "@/lib/jorna";
import { categoryLabel, formatCheckInTime, type BundleBooking } from "@/lib/types";
import { daysUntil, runSheetIsDue, scheduleFor, type ScheduleDay } from "@/lib/planning";
import type { BundleDetail } from "@/lib/types";
import { Avatar } from "@/components/ui";

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function relative(iso: string): string | null {
  const n = daysUntil(iso);
  if (n == null) return null;
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 0) return n === -1 ? "Yesterday" : `${Math.abs(n)} days ago`;
  return `in ${n} days`;
}

function Arrivals({ day }: { day: ScheduleDay }) {
  const n = daysUntil(day.dateIso);
  // Only meaningful around the event itself — a check-in count is noise while
  // the day is still months out.
  if (n == null || n > 1 || n < -2 || day.expected === 0) return null;

  const all = day.arrived === day.expected;
  return (
    <div
      className={`mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${
        all ? "bg-green/12" : "bg-gold/12"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${all ? "bg-green" : "bg-gold"}`}
      />
      <p className={`text-sm font-medium ${all ? "text-green" : "text-ink"}`}>
        {day.arrived} of {day.expected} vendors checked in
        {all ? " — everyone's here." : ""}
      </p>
    </div>
  );
}

/**
 * Nudge one vendor who hasn't checked in.
 *
 * Per booking, because that's the shape of the problem on the day: four vendors
 * are here and the fifth isn't. It lives on the run sheet rather than with the
 * plan's other buttons because this is where their absence is visible — a row
 * with no "Here" against it.
 *
 * Offered strictly on the backend's own answer. can_resend_checkin already
 * accounts for the cooldown, whether they've arrived, whether there's anywhere
 * to check in against, and how close the day is; second-guessing any of that
 * here would only produce a button that gets refused.
 */
function Nudge({ booking }: { booking: BundleBooking }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (booking.vendor_checked_in_at) return null;
  if (!booking.can_resend_checkin) {
    if (note) return <p className="mt-1 text-xs text-green">{note}</p>;
    // Say why, whatever the reason is.
    //
    // This showed only the cooldown one and dropped the rest on the floor —
    // "Available closer to the day", "There's nowhere to check in against until
    // the plan has an address", "This vendor hasn't taken the booking yet". The
    // server computes each of them precisely and sends them here for exactly
    // this purpose, and the row rendered blank space instead.
    //
    // The window is narrow on purpose (six hours before the start, twelve
    // after), so most of the time there genuinely is no button — which is fine,
    // and unhelpful only while nothing on screen admits it. A control that is
    // absent without explanation reads as missing rather than as not yet.
    return booking.resend_checkin_reason ? (
      <p className="mt-1 text-xs text-ink-faint">{booking.resend_checkin_reason}</p>
    ) : null;
  }

  async function send() {
    setBusy(true);
    try {
      const result = await resendCheckInEmail(booking.booking_id);
      setNote(result.message);
    } catch (err) {
      setNote(
        err instanceof ApiError ? err.message : "Couldn't send it. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (note) return <p className="mt-1 text-xs text-green">{note}</p>;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={send}
      className="mt-1 text-xs font-semibold text-gold transition hover:underline disabled:opacity-50"
    >
      {busy ? "Sending…" : "Resend check-in email"}
    </button>
  );
}

function Entry({
  booking,
  start,
  end,
  showTimes,
  onTheDay,
}: {
  booking: BundleBooking;
  start: string | null;
  end: string | null;
  showTimes: boolean;
  /** Whether check-in matters yet — see RunSheet. */
  onTheDay: boolean;
}) {
  const here = Boolean(booking.vendor_checked_in_at);
  return (
    <li className="flex gap-3 border-l-2 border-line-soft py-3 pl-4">
      {showTimes ? (
        <span className="w-20 shrink-0 pt-0.5 text-sm tabular-nums text-ink-soft">
          {start ?? "—"}
          {end ? <span className="block text-xs text-ink-faint">to {end}</span> : null}
        </span>
      ) : null}

      <Avatar name={booking.vendor_name} size={32} />

      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{booking.service_name || "Package"}</p>
        <p className="text-sm text-ink-soft">
          {booking.vendor_name}
          {booking.service_category
            ? ` · ${categoryLabel(booking.service_subcategory || booking.service_category)}`
            : ""}
        </p>
        {booking.location ? (
          <p className="mt-0.5 text-xs text-ink-faint">{booking.location}</p>
        ) : null}
        {onTheDay ? <Nudge booking={booking} /> : null}
      </div>

      {here ? (
        <span
          className="shrink-0 self-start rounded-full bg-green/12 px-2.5 py-0.5 text-xs font-medium text-green"
          title={
            formatCheckInTime(booking.vendor_checked_in_at)
              ? `Checked in ${formatCheckInTime(booking.vendor_checked_in_at)}`
              : undefined
          }
        >
          Here
        </span>
      ) : null}
    </li>
  );
}

export function RunSheet({ bundle }: { bundle: BundleDetail }) {
  const days = scheduleFor(bundle);

  // Two jobs, and only one of them is a same-week job.
  //
  // The arrivals board — who has checked in — answers nothing in April about a
  // wedding in September, and used to hold the whole section back with it. But
  // the order of the day is a months-out question: it is how a host checks the
  // photographer has the right date and that the mehndi artist is coming to the
  // house. Hidden until the week of, there was nowhere to check that at all.
  //
  // So the schedule shows whenever there is one, and only the arrivals half
  // waits. `Nudge` is gated the same way — the backend's can_resend_checkin
  // already refuses outside the window, so a button months early could only be
  // refused anyway.
  const onTheDay = runSheetIsDue(days);

  // Always collapsed to start, however close the day is. The summary line says
  // what's inside, so opening it is one click and a decision — and a section
  // that decides for you when to unfold is one you have to fold back every time
  // it guesses wrong.
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // After the hooks: they have to run in the same order every render, and an
  // early return above them wouldn't.
  if (days.length === 0) return null;

  const vendorCount = new Set(
    days.flatMap((day) => day.entries.map((entry) => entry.booking.booking_id)),
  ).size;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">{onTheDay ? "The day" : "The order of the day"}</h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="shrink-0 text-xs font-semibold text-gold transition hover:underline"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {!open ? (
        // Enough to decide whether to open it. A collapsed section that says
        // only "Show" asks the host to remember what it holds.
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-controls={panelId}
          aria-expanded={false}
          className="w-full rounded-2xl border border-card-edge bg-card p-4 text-left transition hover:border-gold/60"
        >
          <p className="text-sm text-ink">
            {days.length === 1
              ? dayLabel(days[0].dateIso)
              : `${days.length} days from ${dayLabel(days[0].dateIso)}`}
            {relative(days[0].dateIso) ? (
              <span className="text-ink-faint"> · {relative(days[0].dateIso)}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {vendorCount} {vendorCount === 1 ? "vendor" : "vendors"} · who&apos;s
            coming, when, and where
            {onTheDay ? "" : ". Check-ins appear here in the week before."}
          </p>
        </button>
      ) : null}

      {!onTheDay && open ? (
        <p className="mb-3 text-sm text-ink-soft">
          Who&apos;s coming, when, and where. Check-ins appear here in the week
          before.
        </p>
      ) : null}
      {/* The `hidden` attribute beats the `grid` display utility here — preflight
          emits [hidden]:where(:not([hidden=until-found])){display:none!important}
          — so the two don't fight. Kept mounted rather than unmounted so
          aria-controls always resolves to something. */}
      <div id={panelId} hidden={!open} className="grid gap-4">
        {days.map((day) => (
          <div
            key={day.dateIso}
            className="rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="serif text-lg text-ink">{dayLabel(day.dateIso)}</h3>
              <span className="text-sm text-ink-faint">{relative(day.dateIso)}</span>
            </div>

            {onTheDay ? <Arrivals day={day} /> : null}

            {!day.timesKnown ? (
              <p className="mt-3 text-xs text-ink-faint">
                No times set on these bookings yet — add them so everyone knows when
                to arrive.
              </p>
            ) : null}

            {/* Said once for the day rather than on every vendor's row. Before
                the week of, each row's answer is the same — "available closer to
                the day" — and six copies of one sentence is not more
                informative than one. */}
            {!onTheDay ? (
              <p className="mt-3 text-xs text-ink-faint">
                Vendors check in at the venue on the day. From about a week
                before, you&apos;ll see who has arrived here — and be able to
                nudge anyone who hasn&apos;t.
              </p>
            ) : null}

            <ul className="mt-2">
              {day.entries.map((entry) => (
                <Entry
                  key={entry.booking.booking_id}
                  booking={entry.booking}
                  start={entry.start}
                  end={entry.end}
                  showTimes={day.timesKnown}
                  onTheDay={onTheDay}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
