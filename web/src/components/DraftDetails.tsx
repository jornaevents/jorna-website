"use client";

// The form that makes a draft sendable.
//
// It exists because the event editor couldn't do this job. That one writes to
// the event, and a draft straight out of the builder may have no event at all —
// so on exactly the bundles that need details most, there was nowhere to put
// them. PATCH /bookings/{id} takes date, location, guest count and times, which
// is the whole of what bookingGaps checks, so the details are written onto the
// bookings themselves. The event is updated too when there is one, so the two
// don't disagree.
//
// Only what's relevant is asked for. A plan of flat-rate services is never asked
// for a headcount. Times are asked for once, for the plan, because every booking
// needs them — a vendor accepting is agreeing to be somewhere at a time — while
// an hourly service also gets its own pair, since there the window is the price.
// A field already answered stays on show so it can be corrected.
//
// Saving takes whatever is filled in. Details arrive over weeks — the venue
// before the headcount, the headcount before the times — and a form that only
// saves once everything is present would make you hold them in your head until
// the last one. Only the send button needs the whole set; that check is
// unchanged, and a partial save simply leaves it blocked.
//
// It saves itself. There used to be a Save button, and it created the worst
// possible state: a card headed "Required Info" sitting above fields that were
// already filled in, because what's on screen and what the send check reads are
// two different things until you press it. Nothing about typing an address
// tells you that. Now a pause writes it, and the heading answers for what was
// actually saved.

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { updateBooking, updateEvent } from "@/lib/jorna";
import {
  formatAddress,
  isValidZip,
  parseAddress,
  addressFromVenue,
  zipFromVenue,
  type Address,
} from "@/lib/address";
import { addressPin } from "@/lib/geocode";
import { createSaver, type Saver } from "@/lib/autosave";
import {
  isDeadBooking,
  isUnset,
  sendReadiness,
  type BookingGapField,
} from "@/lib/planning";
import { priceUnitKind, type BundleDetail, type BundleBooking } from "@/lib/types";
import { AddressFields } from "@/components/AddressFields";
import { Button, Card, Field, TimeQuickPicks } from "@/components/ui";

/**
 * How long a pause counts as "done typing".
 *
 * Long enough that a guest count of 200 is one save rather than three, short
 * enough that looking up from the keyboard finds it already written.
 */
const AUTOSAVE_MS = 900;

export function DraftDetails({
  bundle,
  onSaved,
  sent = false,
}: {
  bundle: BundleDetail;
  onSaved: () => void | Promise<void>;
  /**
   * The plan has already gone to its vendors and something is still missing —
   * in practice a per-person total that can't be worked out, which blocks
   * checkout. Only the gaps are shown then: an answered date or address is one
   * a vendor has agreed to, and quietly editing it here would change the job
   * without telling anyone.
   */
  sent?: boolean;
}) {
  const readiness = sendReadiness(bundle);
  const live = (bundle.bookings ?? []).filter((b) => !isDeadBooking(b));

  const needs = (field: BookingGapField) =>
    readiness.blocked.some((r) => r.gaps.some((g) => g.field === field));

  // An answered field stays on show while the plan is a draft, so it can be
  // corrected. After it's sent, only what's missing appears.
  const show = (field: BookingGapField, answered: boolean) =>
    needs(field) || (!sent && answered);

  // Seed from whatever is already known — the event, then any booking that has
  // an answer, so a partly-filled plan doesn't ask again from scratch.
  const seedDate =
    bundle.event?.date_iso && bundle.event.date_iso !== "TBD"
      ? bundle.event.date_iso
      : (live.find((b) => b.date_iso && b.date_iso !== "TBD")?.date_iso ?? "");
  // A booked venue decides where the event is. That's the whole address, not
  // just its postcode: the venue is a place with a street and a city, and
  // asking the client to copy them across from a booking they can see on the
  // same page is asking them to do the app's typing.
  const venueLocations = live
    .filter((b) => b.service_category === "venue")
    .map((b) => b.location);
  const venueAddress = addressFromVenue(venueLocations);
  const venueZip = zipFromVenue(venueLocations);

  const seedLocation =
    bundle.event?.location || live.find((b) => b.location)?.location || "";

  const [date, setDate] = useState(seedDate);
  const [addr, setAddr] = useState<Address>(() => {
    // The venue wins where there is one. Below it, whatever was typed before —
    // and the venue's postcode still fills a blank, for a plan whose address
    // was written by hand before the venue was booked.
    if (venueAddress) return venueAddress;
    const parsed = parseAddress(seedLocation);
    return parsed.zip || !venueZip ? parsed : { ...parsed, zip: venueZip };
  });
  // The event first, then the bookings — the same order as the date and the
  // address above, and for the same reason. A plan straight out of the builder
  // has no event yet, so reading only the event threw away the headcount the
  // builder had just been given and asked for it again. Worse than asking: the
  // bookings already had it, so nothing was flagged as missing and the field
  // never appeared at all.
  const seedGuests =
    bundle.event?.guest_count ?? live.find((b) => b.guest_count != null)?.guest_count ?? null;
  const [guests, setGuests] = useState(seedGuests != null ? String(seedGuests) : "");
  // Every booking charged by the hour, not merely the ones still missing times:
  // keyed off the gap, a field vanished as soon as it was filled, so a wrong
  // time couldn't be corrected. Once the plan is sent that freedom is the wrong
  // one — those times are what the vendor agreed to — so only the gaps remain.
  const hourly = live.filter(
    (b) =>
      priceUnitKind(b.price_unit) === "hour" &&
      (!sent || isUnset(b.time_start) || isUnset(b.time_end)),
  );
  const [times, setTimes] = useState<Record<string, { start: string; end: string }>>(() =>
    Object.fromEntries(
      hourly.map((b) => [
        b.booking_id,
        {
          start: isUnset(b.time_start) ? "" : b.time_start!,
          end: isUnset(b.time_end) ? "" : b.time_end!,
        },
      ]),
    ),
  );
  // One window for the plan, because every booking needs times now — not only
  // the hourly ones — and asking six vendors' worth of them separately would be
  // six fields to answer the same question. The per-service pairs above still
  // win where they're filled in; this fills the rest.
  //
  // Seeded from whatever already has real hours, so a plan that was given a
  // window in the builder doesn't ask for it twice.
  const seedHours = live.find(
    (b) => !isUnset(b.time_start) && !isUnset(b.time_end),
  );
  const [hoursStart, setHoursStart] = useState(
    seedHours && !isUnset(seedHours.time_start) ? seedHours.time_start! : "",
  );
  const [hoursEnd, setHoursEnd] = useState(
    seedHours && !isUnset(seedHours.time_end) ? seedHours.time_end! : "",
  );

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  // A ZIP that's present but not yet five digits is somebody mid-typing, not a
  // wrong answer. The address waits for it to finish; everything else saves
  // anyway, so a date entered a minute ago isn't held hostage by a postcode.
  const zipReady = !addr.zip.trim() || isValidZip(addr.zip);

  // Everything the card can write, as one comparable value. An autosave that
  // would change nothing doesn't fire — which is most of them, since focus
  // moving through a form re-renders it constantly without altering a thing.
  const snapshot = JSON.stringify({ date, addr, guests, times, hoursStart, hoursEnd });

  /** The writes themselves, with no interest in whether anyone is watching. */
  async function writeDetails() {
    // A partial address still composes, and parses back into the same parts
    // next time — it just won't satisfy the send check, which is right.
    const composed = zipReady ? formatAddress(addr) : "";
    const location = composed || undefined;
    const count = Number(guests) > 0 ? Number(guests) : undefined;

    // Written onto every live booking, because that's what a vendor is sent
    // and what the send check reads — minus anything that booking has already
    // committed to.
    //
    // The subtraction matters on a sent plan with two per-person services where
    // only one is missing a headcount: this card holds a single guest count, so
    // filling the gap would post the same number to the booking that already
    // has one, and the server would refuse the whole save. The client would see
    // an error about a field it never showed them.
    await Promise.all(
      live.map((b) => {
        const locked = new Set(b.locked_fields ?? []);
        const put = <T,>(field: string, value: T | undefined) =>
          value !== undefined && !locked.has(field) ? { [field]: value } : {};

        // Its own hours where it has a field of its own (hourly services, where
        // the window is the price); the plan's window where it doesn't and has
        // none set. A booking that already carries real times keeps them —
        // filling a blank is not the same as overwriting an answer.
        const own = times[b.booking_id];
        const start = own?.start || (isUnset(b.time_start) ? hoursStart : "");
        const end = own?.end || (isUnset(b.time_end) ? hoursEnd : "");

        return updateBooking(b.booking_id, {
          ...put("date_iso", date || undefined),
          ...put("location", location),
          ...put("guest_count", count),
          ...put("time_start", start || undefined),
          ...put("time_end", end || undefined),
        });
      }),
    );

    // And onto the event when there is one, so the dashboard and the run sheet
    // read the same answers.
    if (bundle.event?.event_id) {
      await updateEvent(bundle.event.event_id, {
        ...(date ? { date_iso: date } : {}),
        ...(location ? { location } : {}),
        ...(count != null ? { guest_count: count } : {}),
        ...(location ? await addressPin(addr) : {}),
      }).catch(() => {});
    }
  }

  // Debouncing, ordering and the unmount flush all live in lib/autosave, where
  // they're testable. Built once and kept, so it survives the re-render its own
  // status change causes.
  const saver = useRef<Saver | null>(null);
  if (saver.current === null) {
    saver.current = createSaver({
      delayMs: AUTOSAVE_MS,
      onStatus: setStatus,
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : "Couldn't save those details."),
      // The point of the whole exercise: the heading above reads the saved
      // plan, so it can't go on asking for something already written.
      after: onSaved,
    });
  }

  // Reported every render, which is what lets the saver see a change the moment
  // it happens without the component tracking one itself.
  useEffect(() => {
    saver.current?.submit(snapshot, () => {
      setError(null);
      return writeDetails();
    });
  });

  // Leaving the page mid-pause shouldn't lose the last thing typed — which is
  // the exact complaint autosave exists to answer, and it would be a poor joke
  // to reintroduce it here.
  useEffect(() => () => saver.current?.flush(), []);

  return (
    <Card className="mt-4 p-5">
      {/* Where the Save button used to be. It says what already happened rather
          than asking for something — there is nothing left to press. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="serif text-lg text-ink">
          {sent ? "Still needed" : readiness.canSend ? "Details" : "Before this can be sent"}
        </h2>
        <span
          aria-live="polite"
          className={`text-sm ${status === "saved" ? "text-green" : "text-ink-faint"}`}
        >
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : null}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {sent
          ? "Your vendors have this plan, but a total can't be worked out without these — and nothing can be paid until it can."
          : "These go to every vendor in the plan. Fill in what you have — it saves itself, and you can come back for the rest."}
      </p>

      <div className="mt-4 grid gap-4">
        {show("date", Boolean(date)) ? (
          <Field
            label="Event date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        ) : null}

        {show("guests", Boolean(guests)) ? (
          <Field
            label="Guest count"
            type="number"
            min={1}
            placeholder="200"
            hint="Something in this plan is priced per person."
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          />
        ) : null}

        {show("location", Boolean(formatAddress(addr))) ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink-soft">Where it&apos;s happening</p>
            <AddressFields
              value={addr}
              onChange={setAddr}
              showGaps={false}
              zipHint={venueZip && venueZip === addr.zip ? venueZip : null}
            />
            {!zipReady ? (
              // Said here rather than as a save error, because nothing failed —
              // the rest of the card is saving normally, and this one field is
              // waiting for the other two digits.
              <p className="mt-2 text-xs text-ink-faint">
                Finish the ZIP — five digits, or ZIP+4 — and the address saves with
                it.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The plan's own window. Every booking needs one — a vendor accepting
            is agreeing to be somewhere at a time — and asking per vendor would
            be six fields for one answer. */}
        {show("hours", Boolean(hoursStart && hoursEnd)) ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink-soft">
              When does it run?
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Field
                  label="Starts"
                  type="time"
                  value={hoursStart}
                  onChange={(e) => setHoursStart(e.target.value)}
                />
                <TimeQuickPicks value={hoursStart} onPick={setHoursStart} />
              </div>
              <div>
                <Field
                  label="Ends"
                  type="time"
                  value={hoursEnd}
                  onChange={(e) => setHoursEnd(e.target.value)}
                />
                <TimeQuickPicks value={hoursEnd} onPick={setHoursEnd} />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Goes to every vendor who doesn&apos;t have their own hours below.
              You can give them different times once they&apos;ve accepted.
            </p>
          </div>
        ) : null}

        {hourly.map((b: BundleBooking) => (
          <div key={b.booking_id}>
            <p className="mb-2 text-sm font-medium text-ink-soft">
              {b.service_name || "Hourly package"} — charged by the hour
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Field
                  label="Starts"
                  type="time"
                  value={times[b.booking_id]?.start ?? ""}
                  onChange={(e) =>
                    setTimes((t) => ({
                      ...t,
                      [b.booking_id]: { ...t[b.booking_id], start: e.target.value },
                    }))
                  }
                />
                <TimeQuickPicks
                  value={times[b.booking_id]?.start ?? ""}
                  onPick={(time) =>
                    setTimes((t) => ({
                      ...t,
                      [b.booking_id]: { ...t[b.booking_id], start: time },
                    }))
                  }
                />
              </div>
              <div>
                <Field
                  label="Ends"
                  type="time"
                  value={times[b.booking_id]?.end ?? ""}
                  onChange={(e) =>
                    setTimes((t) => ({
                      ...t,
                      [b.booking_id]: { ...t[b.booking_id], end: e.target.value },
                    }))
                  }
                />
                <TimeQuickPicks
                  value={times[b.booking_id]?.end ?? ""}
                  onPick={(time) =>
                    setTimes((t) => ({
                      ...t,
                      [b.booking_id]: { ...t[b.booking_id], end: time },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* An autosave that fails quietly is worse than the button it replaced, so
          a failure says so and offers the retry by hand. */}
      {error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-maroon/10 px-3 py-2">
          <p className="text-sm text-maroon dark:text-gold">
            {error} Your answers are still here — nothing is lost.
          </p>
          <Button
            variant="ghost"
            size="md"
            disabled={status === "saving"}
            onClick={() => saver.current?.saveNow()}
          >
            {status === "saving" ? "Saving…" : "Try again"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
