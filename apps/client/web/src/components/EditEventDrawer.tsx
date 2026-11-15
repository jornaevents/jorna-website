"use client";

// Edit an event (client redesign PR 4): its dates, place, size, budget, notes
// and the vendor categories it needs — and deleting it. An event with plans
// on it can't be deleted from here: the backend refuses and says why (its
// plans go first), and that's shown as it's sent.

import { useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, Chip, Field } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { Drawer } from "@/components/Drawer";
import { deleteEvent, updateEvent } from "@/lib/jorna";
import { CATEGORY_LABELS, categoryLabel, type EventItem } from "@/lib/types";

export function EditEventDrawer({
  event,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: EventItem;
  onClose: () => void;
  onSaved: (event: EventItem) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(event.name);
  const [start, setStart] = useState(event.date_iso && event.date_iso !== "TBD" ? event.date_iso : "");
  const [end, setEnd] = useState(event.date_end ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [guests, setGuests] = useState(event.guest_count != null ? String(event.guest_count) : "");
  const [budget, setBudget] = useState(event.budget != null ? String(event.budget) : "");
  const [notes, setNotes] = useState(event.description ?? "");
  const [needed, setNeeded] = useState<string[]>(event.services_needed ?? []);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (end && start && end < start) {
      setError("The end date is before the start date.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      onSaved(
        await updateEvent(event.event_id, {
          name: name.trim(),
          date_iso: start,
          date_end: end && end !== start ? end : null,
          location: location.trim(),
          guest_count: guests ? Number(guests) : null,
          budget: budget ? Number(budget) : null,
          description: notes.trim() || null,
          services_needed: needed.length > 0 ? needed : null,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save those changes.");
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await deleteEvent(event.event_id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this event.");
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <Drawer label="Edit event" onClose={onClose}>
      <p className="eyebrow">{event.name}</p>
      <h2 className="mt-2 font-serif text-2xl font-bold tracking-[-0.02em] text-ink">Edit event</h2>
      <form onSubmit={save} className="mt-5 grid gap-4">
        <Field label="Event name" required value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          <Field label="End date (optional)" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <CityCombobox label="Where" value={location} onChange={(v) => setLocation(v)} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guests" type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} />
          <Field label="Budget ($)" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">Categories needed</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(CATEGORY_LABELS).map((c) => (
              <Chip
                key={c}
                active={needed.includes(c)}
                onClick={() => setNeeded((list) => (list.includes(c) ? list.filter((v) => v !== c) : [...list, c]))}
              >
                {categoryLabel(c)}
              </Chip>
            ))}
          </div>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="mt-8 grid gap-3 border-t border-line pt-5">
        <div>
          <strong className="text-sm text-ink">Delete event</strong>
          <p className="text-xs text-ink-soft">An event with plans on it can&apos;t be deleted until those are.</p>
        </div>
        {confirming ? (
          <div className="grid gap-2 rounded-xl bg-maroon/[0.06] p-3">
            <p className="text-sm text-ink">Delete this event permanently? This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={() => setConfirming(false)}>
                Keep event
              </Button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={remove}
                className="rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "delete" ? "Deleting…" : "Delete event"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="justify-self-start text-sm font-semibold text-maroon hover:underline">
            Delete event
          </button>
        )}
      </div>
    </Drawer>
  );
}
