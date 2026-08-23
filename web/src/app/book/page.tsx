"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { createBooking, getService, listBundles } from "@/lib/jorna";
import { crossesMidnight, daysBetweenInclusive, estimateTotal, hoursBetween } from "@/lib/pricing";
import {
  categoryLabel,
  priceUnitKind,
  priceUnitLabel,
  type BundleDetail,
  type ServiceItem,
} from "@/lib/types";
import { Button, Card, Field, roundTimeLabel, TimeQuickPicks } from "@/components/ui";
import { ClientOnlyRoute } from "@/components/ClientOnlyRoute";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

const NEW_BUNDLE = "__new__";

function BookInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const serviceId = params.get("service");

  const [service, setService] = useState<ServiceItem | null>(null);
  const [bundles, setBundles] = useState<BundleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form
  const [eventName, setEventName] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  // Blank, not 17:00–23:00. A defaulted window is indistinguishable from an
  // answered one — here, on the vendor's request, and in ScheduleDay.timesKnown,
  // which is what decides whether the run sheet dares print clock times. So a
  // booking nobody set times for looked like one that had been, and the plan
  // never asked. Empty is honest, and the plan chases it before sending.
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  // Cleared whenever the times change, so acknowledging one overnight window
  // doesn't silently carry over to a different pair of times.
  const [overnightAck, setOvernightAck] = useState(false);
  const [location, setLocation] = useState("");
  const [guests, setGuests] = useState("");
  const [bundleChoice, setBundleChoice] = useState(NEW_BUNDLE);
  // What the chosen plan just filled in, phrased for the client. Null when
  // they're starting a new plan and there was nothing to inherit.
  const [filledFrom, setFilledFrom] = useState<string[] | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/book${serviceId ? `?service=${serviceId}` : ""}`);
    }
  }, [authLoading, user, router, serviceId]);

  useEffect(() => {
    setOvernightAck(false);
  }, [timeStart, timeEnd]);

  useEffect(() => {
    if (!serviceId || !user) return;
    let cancelled = false;
    Promise.all([
      getService(serviceId),
      listBundles().catch(() => [] as BundleDetail[]),
    ])
      .then(([s, b]) => {
        if (cancelled) return;
        setService(s);
        setBundles(b);
        // A venue carries its own address + map pin; prefill so the event is
        // anchored there (the venue is what check-in is measured against).
        if (s.location) setLocation(s.location);
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load this package."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [serviceId, user]);

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (error || !service) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">{error ?? "Package not found."}</p>
        <Link href="/marketplace" className="mt-4 inline-block text-sm text-gold hover:underline">
          Back to marketplace
        </Link>
      </div>
    );
  }

  const kind = priceUnitKind(service.price_unit);
  const unitLabel = priceUnitLabel(service.price_unit);
  const needsGuests = kind === "person";
  const perDay = kind === "day";

  // Show what they'll actually be charged. The arithmetic lives in lib/pricing
  // so this form and the service page's estimator can't drift apart — all this
  // does is turn the form's fields into the quantity that rate multiplies by.
  function estimate(): number | null {
    return estimateTotal(service, {
      guests: Number(guests),
      days: daysBetweenInclusive(dateIso, (multiDay && dateEnd) || dateIso),
      hours: hoursBetween(timeStart, timeEnd),
    });
  }

  const selectedBundle =
    bundleChoice === NEW_BUNDLE
      ? null
      : bundles.find((b) => b.bundle_id === bundleChoice) ?? null;

  // A draft plan hasn't been sent, so a service can join it half-finished and be
  // completed later. Once a plan has gone out its vendors are waiting, and the
  // backend refuses an incomplete addition — there'd be no draft to fix it in.
  const planAlreadySent = selectedBundle != null && selectedBundle.status !== "draft";

  /**
   * Take the plan's settled facts into the form.
   *
   * Picking a plan is a deliberate "use this one's details", so its facts win
   * over anything typed — a booking whose date quietly disagrees with the plan
   * it's joining is worse than losing a half-typed value. Fields the plan says
   * nothing about keep what's there.
   */
  function chooseBundle(id: string) {
    setBundleChoice(id);
    setError(null);

    if (id === NEW_BUNDLE) {
      setFilledFrom(null);
      return;
    }
    const b = bundles.find((x) => x.bundle_id === id);
    if (!b) {
      setFilledFrom(null);
      return;
    }

    const filled: string[] = [];
    const name = b.event_name || b.name;
    if (name) setEventName(name);

    // The event owns the plan's date, place and headcount; the times and any
    // multi-day span live on its bookings, which share them.
    const sample = (b.bookings ?? []).find((bk) => bk.time_start || bk.date_end);

    if (b.event?.date_iso) {
      setDateIso(b.event.date_iso);
      filled.push(b.event.date_iso);
    }
    if (sample?.date_end) {
      setDateEnd(sample.date_end);
      setMultiDay(true);
      filled.push(`through ${sample.date_end}`);
    }
    if (b.event?.location) {
      setLocation(b.event.location);
      filled.push(b.event.location);
    }
    if (b.event?.guest_count) {
      setGuests(String(b.event.guest_count));
      filled.push(`${b.event.guest_count} guests`);
    }
    if (sample?.time_start && sample?.time_end) {
      setTimeStart(sample.time_start);
      setTimeEnd(sample.time_end);
      filled.push(`${sample.time_start}–${sample.time_end}`);
    }

    setFilledFrom(filled.length ? filled : null);
  }

  /**
   * Add the service to the plan without telling the vendor.
   *
   * Nothing is validated: a draft exists so a client can gather what they want
   * first and settle the details once, in one place, rather than answering the
   * same questions on every service they add. The plan's "still needed" card is
   * what chases the gaps, and pressing Send is what tells the vendors.
   */
  async function addAsDraft() {
    if (!service) return;
    setDraftBusy(true);
    setError(null);
    try {
      const res = await createBooking({
        service_id: service.service_id,
        event_name: eventName.trim() || "My Event",
        date_iso: dateIso,
        date_end: multiDay && dateEnd ? dateEnd : null,
        time_start: timeStart,
        time_end: timeEnd,
        location: location.trim(),
        guest_count: guests ? Number(guests) : null,
        venue_latitude: service.venue_latitude ?? null,
        venue_longitude: service.venue_longitude ?? null,
        bundle_id: bundleChoice === NEW_BUNDLE ? null : bundleChoice,
      });
      // Back to browsing: a draft is how a plan gets assembled, and assembling
      // means adding the next thing.
      const params = new URLSearchParams({
        added: res.bundle_id,
        name: service.name,
      });
      router.push(`/marketplace?${params.toString()}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't add this to your plan. Try again.",
      );
      setDraftBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service) return;
    // Only where it's actually required. Joining a sent plan goes straight to
    // the vendor and the server refuses it without a headcount, so blocking
    // here saves a round trip. On a draft nothing is sent and the plan's "still
    // needed" card chases the gap — blocking there turned an optional field
    // into a wall in front of the one action on the page.
    if (planAlreadySent && needsGuests && !(Number(guests) > 0)) {
      setError("This package is priced per person — add a guest count so we can total it.");
      return;
    }
    if (crossesMidnight(timeStart, timeEnd) && !overnightAck) {
      setError("Confirm the overnight time window above before sending.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createBooking({
        service_id: service.service_id,
        event_name: eventName.trim() || "My Event",
        date_iso: dateIso,
        date_end: multiDay && dateEnd ? dateEnd : null,
        time_start: timeStart,
        time_end: timeEnd,
        location: location.trim(),
        guest_count: guests ? Number(guests) : null,
        venue_latitude: service.venue_latitude ?? null,
        venue_longitude: service.venue_longitude ?? null,
        bundle_id: bundleChoice === NEW_BUNDLE ? null : bundleChoice,
      });
      router.push(`/bundle?id=${res.bundle_id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't request this booking. Try again.",
      );
      setBusy(false);
    }
  }

  const total = estimate();
  const overnight = crossesMidnight(timeStart, timeEnd);
  const blockedByOvernight = overnight && !overnightAck;

  return (
    <div className="mx-auto w-[min(var(--container-page),100%-2rem)] py-10">
      <Link
        href={`/vendor?id=${service.vendor_id}`}
        className="text-sm text-ink-soft hover:text-ink"
      >
        ← Back to vendor
      </Link>

      <header className="mt-5">
        <span className="eyebrow">Request a booking</span>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">{service.name}</h1>
        <p className="mt-2 text-ink-soft">
          {service.vendor_name}
          {service.category
            ? ` · ${categoryLabel(service.subcategory || service.category)}`
            : ""}
        </p>
        <p className="serif mt-2 text-xl text-ink">
          {money(service.price)}{" "}
          {unitLabel ? <span className="text-sm text-ink-faint">{unitLabel}</span> : null}
        </p>
      </header>

      <Card className="mt-7 p-6">
        <form onSubmit={submit} className="grid gap-4">
          {/* First, because it decides the rest: an existing plan already knows
              the date, the place and the headcount, and choosing it fills them
              in rather than asking the same questions again. */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">Add to</span>
            <select
              value={bundleChoice}
              onChange={(e) => chooseBundle(e.target.value)}
              className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
            >
              <option value={NEW_BUNDLE}>A new plan</option>
              {bundles.map((b) => (
                <option key={b.bundle_id} value={b.bundle_id}>
                  {b.event_name || b.name}
                  {b.status !== "draft" ? " (already sent)" : ""}
                </option>
              ))}
            </select>
          </label>

          {filledFrom ? (
            <p className="-mt-1 rounded-lg bg-panel px-3 py-2 text-sm text-ink-soft">
              Filled in from this plan: <span className="text-ink">{filledFrom.join(" · ")}</span>.
              Change anything below that&apos;s different for this package.
            </p>
          ) : null}

          {planAlreadySent ? (
            <p className="-mt-1 rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink-soft">
              This plan is already with your vendors, so anything added to it goes
              out straight away and can&apos;t be saved as a draft.
            </p>
          ) : null}

          <Field
            label="Event name"
            placeholder="Priya & Arjun's Wedding"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={multiDay ? "Start date" : "Date"}
              type="date"
              required={planAlreadySent}
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
            />
            {multiDay ? (
              <Field
                label="End date"
                type="date"
                min={dateIso || undefined}
                required={planAlreadySent}
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            ) : (
              <div className="flex items-end">
                <button
                  type="button"
                  className="pb-2.5 text-sm font-semibold text-gold hover:underline"
                  onClick={() => setMultiDay(true)}
                >
                  + Runs across multiple days
                </button>
              </div>
            )}
          </div>
          {multiDay ? (
            <button
              type="button"
              className="-mt-2 justify-self-start text-xs text-ink-faint hover:text-ink"
              onClick={() => {
                setMultiDay(false);
                setDateEnd("");
              }}
            >
              Single day instead
            </button>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Field
                label="Start time"
                type="time"
                required={planAlreadySent}
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
              />
              <TimeQuickPicks value={timeStart} onPick={setTimeStart} />
            </div>
            <div>
              <Field
                label="End time"
                type="time"
                required={planAlreadySent}
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              />
              <TimeQuickPicks value={timeEnd} onPick={setTimeEnd} />
            </div>
          </div>

          {overnight ? (
            <label className="flex items-start gap-2.5 rounded-lg bg-gold/10 px-3 py-2.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={overnightAck}
                onChange={(e) => setOvernightAck(e.target.checked)}
              />
              <span>
                <strong className="text-ink">
                  {roundTimeLabel(timeStart)} to {roundTimeLabel(timeEnd)} spans into the next
                  day
                </strong>
                {hoursBetween(timeStart, timeEnd) != null
                  ? ` — that's ${hoursBetween(timeStart, timeEnd)} hours total.`
                  : "."}{" "}
                Check this to confirm that&apos;s what you meant, not a typo for the same evening.
              </span>
            </label>
          ) : null}

          <Field
            label="Location"
            placeholder="Venue or address"
            required={planAlreadySent}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          {/* Required only where it really is. A per-person service can't be
              totalled without it, but on a draft nothing is being totalled yet
              — the plan asks for it before you send. Marking it required there
              blocked the page's only action over a number the client may
              genuinely not have for months. */}
          <Field
            label={
              needsGuests && planAlreadySent
                ? "Guest count (required)"
                : "Guest count (optional)"
            }
            type="number"
            min={1}
            required={needsGuests && planAlreadySent}
            hint={
              needsGuests
                ? planAlreadySent
                  ? "This package is priced per person, so the total needs it."
                  : "Priced per person — add it now or on your plan, before you send."
                : undefined
            }
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          />

          {total !== null ? (
            <p className="rounded-lg bg-panel px-3 py-2 text-sm text-ink-soft">
              Estimated total: <strong className="text-ink">{money(total)}</strong>
              {perDay && multiDay ? " (end date included)" : ""}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}

          {/* Two buttons here used to make the same API call.
              POST /bookings notifies the vendor only when the plan it joins has
              already been sent (booking_service: "Draft plan — vendors are told
              when it's sent"). So on a new or draft plan, "Request booking" and
              "Add to plan as a draft" were byte-identical requests differing
              only in where they navigated — while the page presented them as a
              meaningful choice, and the primary one promised a vendor review
              that does not happen. The very next screen then said "Not sent
              yet". Whichever the client believed, one of the two was lying.

              So the buttons now follow what the backend actually does: one
              action when nothing is sent, differing only in where you go next,
              and a single send when the plan is already out with its vendors. */}
          {planAlreadySent ? (
            <>
              <Button type="submit" size="lg" disabled={busy || draftBusy || blockedByOvernight}>
                {busy ? "Sending request…" : "Send this request"}
              </Button>
              <p className="text-center text-xs text-ink-faint">
                This plan is already with your vendors, so this one goes out as
                soon as you add it. They review it first — you only pay once they
                accept, and the money is held in escrow until after the event.
              </p>
            </>
          ) : (
            <>
              <Button type="submit" size="lg" disabled={busy || draftBusy || blockedByOvernight}>
                {busy ? "Adding…" : "Add to plan"}
              </Button>
              {/* type="button" so it never trips the form's required fields —
                  a draft is exactly the case where they aren't required. */}
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={busy || draftBusy}
                onClick={addAsDraft}
              >
                {draftBusy ? "Adding…" : "Add and keep browsing"}
              </Button>
              <p className="text-center text-xs text-ink-faint">
                Nothing reaches {service.vendor_name || "the vendor"} yet, and
                nothing here is required — you can fill in the rest on your plan.
                Sending the plan is what asks them.
              </p>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}

export default function BookPage() {
  return (
    <ClientOnlyRoute>
      <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
        <BookInner />
      </Suspense>
    </ClientOnlyRoute>
  );
}
