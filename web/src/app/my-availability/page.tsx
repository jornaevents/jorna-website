"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getMyAvailability, getMyVendor, setMyAvailability } from "@/lib/jorna";
import { WEEKDAYS, type AvailabilitySlot, type VendorDetail } from "@/lib/types";
import { Button, Card, LinkButton, TimeField } from "@/components/ui";
import { VendorNav } from "@/components/VendorNav";

type Window = { start_time: string; end_time: string };

export default function MyAvailabilityPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Windows per weekday index (0=Mon … 6=Sun).
  const [byDay, setByDay] = useState<Window[][]>(() => WEEKDAYS.map(() => []));

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/my-availability");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([getMyVendor(), getMyAvailability().catch(() => [] as AvailabilitySlot[])])
      .then(([mine, slots]) => {
        if (cancelled) return;
        setVendor(mine);
        if (mine) {
          const grid: Window[][] = WEEKDAYS.map(() => []);
          for (const s of slots) {
            if (s.day_of_week >= 0 && s.day_of_week < 7) {
              grid[s.day_of_week].push({ start_time: s.start_time, end_time: s.end_time });
            }
          }
          setByDay(grid);
        }
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load your hours."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

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
    if (!vendor) return;
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your hours.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (!vendor) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">
          You&apos;re not selling on Jorna yet
        </h1>
        <LinkButton href="/vendor-profile" className="mt-6">
          Create vendor profile
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="mx-auto w-[min(680px,100%-2rem)] py-10">
      <VendorNav />
      <header>
        <span className="eyebrow">Selling</span>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold sm:text-5xl">
          Your weekly hours
        </h1>
        <p className="mt-2 text-ink-soft">
          When you&apos;re generally available. Leave a day empty if you don&apos;t
          take bookings then.
        </p>
      </header>

      <div className="mt-7 grid gap-3">
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
        <p className="mt-5 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-5 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">
          Hours saved.
        </p>
      ) : null}

      <div className="mt-6">
        <Button size="lg" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save hours"}
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-card-edge bg-panel p-4">
        <p className="text-xs text-ink-faint">
          These are your recurring weekly hours. Google Calendar sync — busy
          times pulled in automatically, and your Jorna bookings added back —
          lives on your calendar page.
        </p>
        <LinkButton href="/my-calendar" variant="ghost" size="md">
          Go to Calendar
        </LinkButton>
      </div>
    </div>
  );
}
