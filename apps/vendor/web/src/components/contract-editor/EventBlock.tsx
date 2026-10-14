"use client";

import { Field } from "@jorna/shared/components/ui";
import { describeWhen, type Draft } from "@jorna/shared/lib/contractDraft";
import type { VendorBooking } from "@/lib/types";
import { todayIso, type SetDraft } from "./shared";

/** When and where. A request's are the client's own, so they're shown, not
 *  edited — the client asks for a new date from their plan. */
export function EventBlock({
  draft,
  set,
  request,
  clash,
}: {
  draft: Draft;
  set: SetDraft;
  request: VendorBooking | null;
  /** One of the vendor's bookings already takes these dates and hours. */
  clash?: string | null;
}) {
  return request ? (
    <div className="grid gap-1 text-sm text-ink-soft">
      <p className="text-ink">{describeWhen(request.date_iso, request.date_end, request.time_start, request.time_end)}</p>
      <p>{request.location}</p>
      {request.guest_count ? <p>{request.guest_count} guests</p> : null}
      {request.client_note ? <p className="mt-2 italic">“{request.client_note}”</p> : null}
      <p className="mt-2 text-xs text-ink-faint">
        From their request — theirs to change; they can ask for a new date from their plan.
      </p>
      {clash ? (
        <p role="status" className="mt-2 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {clash}
        </p>
      ) : null}
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={draft.multiDay ? "Start date" : "Date"}
        type="date"
        min={todayIso()}
        value={draft.dateIso}
        onChange={(e) => set({ dateIso: e.target.value })}
      />
      {draft.multiDay ? (
        <Field
          label="End date"
          type="date"
          min={draft.dateIso || todayIso()}
          value={draft.dateEnd}
          onChange={(e) => set({ dateEnd: e.target.value })}
        />
      ) : (
        <label className="flex items-center gap-2 self-end pb-3 text-sm text-ink-soft">
          <input type="checkbox" checked={draft.multiDay} onChange={(e) => set({ multiDay: e.target.checked })} />
          Runs over more than one day
        </label>
      )}
      <Field label="Start time" type="time" value={draft.timeStart} onChange={(e) => set({ timeStart: e.target.value })} />
      <Field label="End time" type="time" value={draft.timeEnd} onChange={(e) => set({ timeEnd: e.target.value })} />
      {draft.multiDay ? (
        <p className="text-xs text-ink-faint sm:col-span-2">The times are for each day of the event.</p>
      ) : null}
      {draft.timeStart && draft.timeEnd && draft.timeEnd <= draft.timeStart ? (
        <p className="text-xs text-ink-faint sm:col-span-2">Ends the next morning — that&apos;s fine for a late night.</p>
      ) : null}
      {clash ? (
        <p role="status" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold sm:col-span-2">
          {clash}
        </p>
      ) : null}
      <Field
        label="Venue (optional)"
        placeholder="Leave blank if your client will add it"
        value={draft.location}
        onChange={(e) => set({ location: e.target.value })}
      />
      <Field
        label="Guest count (optional)"
        type="number"
        min={1}
        value={draft.guestCount}
        onChange={(e) => set({ guestCount: e.target.value })}
      />
    </div>
  );
}
