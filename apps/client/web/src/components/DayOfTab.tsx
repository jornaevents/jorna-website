"use client";

// An event's Day-of tab (Jorna-Client design; client redesign PR 10): who's
// coming when, day by day, and — in the week of the event — who has checked
// in. It's the plan's run sheet (components/RunSheet), shown per plan on the
// event, so the two can't disagree about the order of the day.

import { scheduleFor } from "@/lib/planning";
import type { Celebration } from "@/lib/myEvents";
import { RunSheet } from "@/components/RunSheet";

export function DayOfTab({ celebration }: { celebration: Celebration }) {
  const withSchedule = celebration.bundles.filter((b) => scheduleFor(b).length > 0);
  return (
    <>
      <p className="eyebrow">Day-of</p>
      <h2 className="mt-2 font-serif text-xl font-bold tracking-[-0.02em] text-ink">Who&apos;s coming, and when</h2>
      <p className="mt-1 text-sm text-ink-soft">Vendors check in when they arrive. You&apos;ll see it here.</p>
      {withSchedule.length === 0 ? (
        <p className="mt-5 rounded-xl border border-line bg-card px-4 py-5 text-center text-sm text-ink-soft">
          Nothing to show yet. The schedule fills in as vendors are added with their dates and times.
        </p>
      ) : (
        withSchedule.map((bundle) => (
          <div key={bundle.bundle_id} className="mt-2">
            <RunSheet bundle={bundle} defaultOpen />
          </div>
        ))
      )}
    </>
  );
}
