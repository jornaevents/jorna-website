"use client";

// The Availability section on /vendor-profile, folded in from the old
// /my-availability route. Self-contained: it fetches/saves through
// getMyAvailability/setMyAvailability (lib/jorna.ts) rather than
// updateMyVendor, so it keeps its own save button instead of joining the
// page's single combined form.

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { getMyAvailability, setMyAvailability } from "@/lib/jorna";
import { WEEKDAYS, type AvailabilitySlot } from "@/lib/types";
import { Button, Card, LinkButton, TimeField } from "@jorna/shared/components/ui";

type Window = { start_time: string; end_time: string };

/** `onHoursChange`: whether any hours are set, once loaded and after each
 *  save — the profile's listing checklist reads it. */
export function AvailabilityFields({ onHoursChange }: { onHoursChange?: (hasHours: boolean) => void } = {}) {
  // Read through a ref so a fresh callback each render doesn't reload the hours.
  const onHoursRef = useRef(onHoursChange);
  useEffect(() => {
    onHoursRef.current = onHoursChange;
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Windows per weekday index (0=Mon … 6=Sun).
  const [byDay, setByDay] = useState<Window[][]>(() => WEEKDAYS.map(() => []));

  useEffect(() => {
    let cancelled = false;
    getMyAvailability()
      .then((slots) => {
        if (cancelled) return;
        const grid: Window[][] = WEEKDAYS.map(() => []);
        for (const s of slots) {
          if (s.day_of_week >= 0 && s.day_of_week < 7) {
            grid[s.day_of_week].push({ start_time: s.start_time, end_time: s.end_time });
          }
        }
        setByDay(grid);
        onHoursRef.current?.(slots.length > 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load your hours.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function mutate(day: number, fn: (windows: Window[]) => Window[]) {
    setByDay((prev) => prev.map((w, i) => (i === day ? fn(w) : w)));
    setSaved(false);
  }

  const addWindow = (day: number) =>
    mutate(day, (w) => [...w, { start_time: "09:00", end_time: "17:00" }]);
  const removeWindow = (day: number, idx: number) =>
    mutate(day, (w) => w.filter((_, i) => i !== idx));
  const setField = (day: number, idx: number, field: keyof Window, value: string) =>
    mutate(day, (w) => w.map((win, i) => (i === idx ? { ...win, [field]: value } : win)));

  async function save() {
    // Reject any window that ends before it starts before hitting the server.
    for (let d = 0; d < 7; d++) {
      for (const win of byDay[d]) {
        if (win.end_time <= win.start_time) {
          setError(`${WEEKDAYS[d]}: an end time must be after its start time.`);
          return;
        }
      }
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const slots: AvailabilitySlot[] = byDay.flatMap((windows, day) =>
        windows.map((w) => ({ day_of_week: day, ...w })),
      );
      await setMyAvailability(slots);
      setSaved(true);
      onHoursChange?.(slots.length > 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your hours.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-6 text-center text-ink-soft">Loading…</p>;
  }

  return (
    <div>
      <p className="text-sm text-ink-soft">
        When you&apos;re generally available. Leave a day empty if you don&apos;t take
        bookings then. Google Calendar sync — busy times pulled in automatically, and
        your Jorna bookings added back — lives on your calendar page.
      </p>

      <div className="mt-4 grid gap-3">
        {WEEKDAYS.map((day, d) => (
          <Card key={day} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">{day}</p>
              <button
                type="button"
                onClick={() => addWindow(d)}
                className="text-xs font-semibold text-gold hover:underline"
              >
                + Add hours
              </button>
            </div>
            {byDay[d].length === 0 ? (
              <p className="mt-2 text-sm text-ink-faint">Unavailable</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {byDay[d].map((win, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <TimeField
                      value={win.start_time}
                      onChange={(v) => setField(d, idx, "start_time", v)}
                    />
                    <span className="text-ink-faint">to</span>
                    <TimeField
                      value={win.end_time}
                      onChange={(v) => setField(d, idx, "end_time", v)}
                    />
                    <button
                      type="button"
                      onClick={() => removeWindow(d, idx)}
                      className="ml-auto text-ink-faint hover:text-maroon dark:hover:text-gold"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-4 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">Hours saved.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save hours"}
        </Button>
        <LinkButton href="/my-calendar" variant="ghost" size="md">
          Go to Calendar
        </LinkButton>
      </div>
    </div>
  );
}
