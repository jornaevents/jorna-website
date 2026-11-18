"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { CELEBRATIONS } from "@jorna/shared/lib/celebrations";
import { EMPTY_ADDRESS, addressGaps, type Address } from "@jorna/shared/lib/address";
import { AddressFields } from "@jorna/shared/components/AddressFields";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { Button, Field, TimeField } from "@jorna/shared/components/ui";
import { priceUnitKind, type EventItem } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { listEvents, listServices, sendInquiry } from "@/lib/jorna";
import { DateField } from "@jorna/shared/components/DateField";

// The inquiry form (backend DECISIONS #32, #45): a client account with a
// confirmed email sends it, and it opens their thread with the vendor. Anyone
// can fill it in; signed out, what they typed is kept while they make an
// account (or confirm their email) and is waiting here when they come back.
// Used on the vendor's page (in a drawer) and on /inquire, the link vendors
// share — coming back always lands on /inquire.
//
// What the event is and where are required (backend DECISIONS #52), and so is
// a guest count when the package is priced per guest. Where is a city (the
// app's city autofill) or a venue's full address. No phone: the vendor
// replies in the thread.

type FieldKey = "date" | "time" | "guests" | "package" | "event" | "where";
type Where = "city" | "venue";

type Draft = {
  vendorId: string;
  date: string;
  eventType: string;
  where?: Where;
  city?: string;
  venue?: Address;
  serviceId?: string;
  guests: string;
  note: string;
  timeStart?: string;
  timeEnd?: string;
};

const GUEST_SLIDER_MAX = 1000;

/** "Edison, NJ" → its two parts; null for anything else. */
function cityAndState(value: string): { city: string; state: string } | null {
  const m = value.trim().match(/^(.+?),\s*([A-Za-z]{2})$/);
  return m ? { city: m[1].trim(), state: m[2].toUpperCase() } : null;
}

const DRAFT_KEY = "jorna_inquiry_draft";
const CONFIRM_EMAIL = "Confirm your email before sending an inquiry";

function loadDraft(vendorId: string): Draft | null {
  try {
    const raw = typeof window === "undefined" ? null : sessionStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    return draft?.vendorId === vendorId ? draft : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // No storage: they'll type it again, which beats not getting there.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Which field a server refusal is about, so it shows under that field. The
 *  backend's messages are written to be read; they just don't say which
 *  input they mean. */
function fieldFor(message: string): FieldKey | null {
  const m = message.toLowerCase();
  if (m.includes("start and an end time")) return "time";
  if (m.includes("date")) return "date";
  if (m.includes("what the event")) return "event";
  if (m.includes("where") || m.includes("city") || m.includes("venue") || m.includes("zip")) return "where";
  if (m.includes("guest")) return "guests";
  if (m.includes("package")) return "package";
  return null;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** What an event already knows, to start the form from (a vendor waiting in
 *  an event as "Ready to send"). A saved draft still wins: it's newer. The
 *  package comes by name, since a booking in a plan doesn't carry its id. */
export interface InquiryPrefill {
  date?: string | null;
  eventType?: string | null;
  city?: string | null;
  guests?: number | null;
  packageName?: string | null;
  /** The package the form was opened from (its page's "Send an inquiry").
   *  It wins over a saved draft's pick: the client just chose it. */
  serviceId?: string | null;
}

export function InquiryForm({
  vendorId,
  vendorName,
  prefill,
  onSent,
}: {
  vendorId: string;
  vendorName: string;
  prefill?: InquiryPrefill;
  onSent?: (conversationId: string | null) => void;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const id = useId();
  const [draft] = useState<Draft | null>(
    () =>
      loadDraft(vendorId) ??
      (prefill
        ? {
            vendorId,
            date: prefill.date ?? "",
            eventType: prefill.eventType ?? "",
            where: "city",
            city: prefill.city && cityAndState(prefill.city) ? prefill.city : "",
            guests: prefill.guests != null ? String(prefill.guests) : "",
            note: "",
          }
        : null),
  );
  const [date, setDate] = useState(draft?.date ?? "");
  const [eventType, setEventType] = useState(draft?.eventType ?? "");
  const [where, setWhere] = useState<Where>(draft?.where ?? "city");
  const [city, setCity] = useState(draft?.city ?? "");
  const [venue, setVenue] = useState<Address>(draft?.venue ?? EMPTY_ADDRESS);
  // "" until they pick one; a package is required (backend DECISIONS #47).
  const [serviceId, setServiceId] = useState(prefill?.serviceId || draft?.serviceId || "");
  // The packages the client can see, kept with the vendor they're for.
  // `failed`: the list didn't load, so there's nothing to pick from.
  const [packages, setPackages] = useState<{
    vendorId: string;
    items: { id: string; name: string; perGuest: boolean }[];
    failed?: boolean;
  } | null>(null);
  const [guests, setGuests] = useState(draft?.guests ?? "");
  // When it starts and ends (backend DECISIONS #58): optional, both or neither.
  const [timeStart, setTimeStart] = useState(draft?.timeStart ?? "");
  const [timeEnd, setTimeEnd] = useState(draft?.timeEnd ?? "");
  // The client's own events, to start the form from one (Contract Builder
  // from Chat, A6): a date, place, guest count and type they've already given.
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [note, setNote] = useState(draft?.note ?? "");
  // Hidden from people; a bot fills it in and the server quietly drops it.
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ conversationId: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listEvents()
      .then((list) => !cancelled && setEvents(list))
      .catch(() => {
        /* the form works the same without them */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    listServices({ vendor_id: vendorId, limit: 50 })
      .then((page) => {
        if (!cancelled) setPackages({
            vendorId,
            items: page.items.map((p) => ({ id: p.service_id, name: p.name, perGuest: priceUnitKind(p.price_unit) === "person" })),
          });
      })
      .catch(() => !cancelled && setPackages({ vendorId, items: [], failed: true }));
    return () => {
      cancelled = true;
    };
  }, [vendorId]);
  const loaded = packages?.vendorId === vendorId ? packages : null;
  const packageOptions = loaded?.items ?? [];
  // One package is the answer already, as is the one the event named.
  const named = prefill?.packageName?.trim().toLowerCase();
  const chosen = packageOptions.some((p) => p.id === serviceId)
    ? serviceId
    : packageOptions.length === 1
      ? packageOptions[0].id
      : (named && packageOptions.find((p) => p.name.trim().toLowerCase() === named)?.id) || "";
  // Nothing to pick from: they can't send it here.
  const noPackages = loaded != null && packageOptions.length === 0;
  // Priced per guest, so the vendor can't quote without a count.
  const needsGuests = packageOptions.find((p) => p.id === chosen)?.perGuest ?? false;

  const back = `/inquire?vendor=${encodeURIComponent(vendorId)}`;

  // Only events still ahead; a past one isn't what they're asking about.
  const upcoming = (events ?? []).filter((ev) => !ev.date_iso || ev.date_iso >= todayIso());

  /** Start from one of their events: fills what it knows, over what's typed. */
  function fromEvent(eventId: string) {
    const ev = upcoming.find((x) => x.event_id === eventId);
    if (!ev) return;
    if (ev.date_iso && ev.date_iso >= todayIso()) setDate(ev.date_iso);
    if (ev.event_type) setEventType(ev.event_type);
    if (ev.guest_count) setGuests(String(ev.guest_count));
    if (ev.location && cityAndState(ev.location)) {
      setWhere("city");
      setCity(ev.location);
    }
  }

  /** Keep what they typed and go do what sending needs first. */
  function leaveFor(path: string) {
    saveDraft({ vendorId, date, eventType, where, city, venue, serviceId: chosen, guests, note, timeStart, timeEnd });
    router.push(path);
  }

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-card-edge bg-panel p-6">
        <p className="serif text-xl text-ink">Sent</p>
        <p className="mt-2 text-ink-soft">
          {vendorName} will reply in your messages, and we&apos;ve emailed you a copy.
        </p>
        {sent.conversationId ? (
          <Link href={`/conversation?id=${sent.conversationId}`} className="mt-3 inline-block font-semibold text-gold hover:underline">
            Open the conversation
          </Link>
        ) : null}
      </div>
    );
  }

  function check(): number | null | false {
    const found: Partial<Record<FieldKey, string>> = {};
    if (!chosen) found.package = "Pick the package you're asking about";
    if (!date) found.date = "Add your event date";
    if (!eventType.trim()) found.event = "Add what the event is";
    if (Boolean(timeStart) !== Boolean(timeEnd)) found.time = "Add both a start and an end time, or leave both out";
    if (where === "city" && !cityAndState(city)) found.where = "Pick the city from the list, or type it as City, ST";
    if (where === "venue" && addressGaps(venue).some((g) => g !== "line2")) found.where = "Add the venue's full address";
    const count = guests.trim() ? Number(guests) : null;
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 100_000)) {
      found.guests = "Guest count must be between 1 and 100,000";
    } else if (count === null && needsGuests) {
      found.guests = "Add a guest count — this package is priced per guest";
    }
    setErrors(found);
    setFormError(null);
    return Object.keys(found).length > 0 ? false : count;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const count = check();
    if (count === false) return;
    if (!user) {
      leaveFor(`/login?mode=register&next=${encodeURIComponent(back)}`);
      return;
    }
    if (user.email_verified === false) {
      leaveFor(`/verify-email?next=${encodeURIComponent(back)}`);
      return;
    }

    setBusy(true);
    try {
      const place = where === "city" ? cityAndState(city) : null;
      const reply = await sendInquiry(vendorId, {
        event_date_iso: date || null,
        event_type: eventType.trim() || null,
        location_kind: where,
        location_street: where === "venue" ? [venue.line1, venue.line2].map((x) => x.trim()).filter(Boolean).join(", ") : null,
        location_city: place ? place.city : venue.city.trim(),
        location_state: place ? place.state : venue.state,
        location_zip: where === "venue" ? venue.zip.trim() : null,
        service_id: chosen,
        guest_count: count,
        ...(timeStart && timeEnd ? { time_start: timeStart, time_end: timeEnd } : {}),
        note: note.trim() || null,
        website,
      });
      clearDraft();
      setSent({ conversationId: reply.conversation_id ?? null });
      onSent?.(reply.conversation_id ?? null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't send that. Check your connection and try again.";
      if (message === CONFIRM_EMAIL) {
        leaveFor(`/verify-email?next=${encodeURIComponent(back)}`);
        return;
      }
      const key = fieldFor(message);
      if (key) setErrors({ [key]: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  const err = (key: FieldKey) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} role="alert" className="mt-1 text-xs text-maroon dark:text-gold">
        {errors[key]}
      </p>
    ) : null;
  const described = (key: FieldKey) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${id}-${key}-error` } : {};

  const signedInName = user ? `${user.f_name ?? ""} ${user.l_name ?? ""}`.trim() : "";

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {user ? (
        <p className="text-sm text-ink-soft">
          Sending as <span className="font-medium text-ink">{signedInName || user.email}</span>
          {signedInName ? <> · {user.email}</> : null}.{" "}
          <button type="button" onClick={() => logout()} className="font-semibold text-gold hover:underline">
            Not you?
          </button>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {noPackages ? (
            <p className="rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-sm text-ink-soft">
              {loaded?.failed
                ? "Couldn't load their packages. Reload the page to try again."
                : `${vendorName} hasn't listed any packages yet, so you can't send them an inquiry here.`}
            </p>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">Package</span>
              <select
                value={chosen}
                onChange={(e) => setServiceId(e.target.value)}
                disabled={!loaded}
                {...described("package")}
                className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              >
                <option value="" disabled>
                  {loaded ? "Choose a package" : "Loading packages…"}
                </option>
                {packageOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {err("package")}
            </label>
          )}
        </div>
        {upcoming.length > 0 ? (
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">Which event is this for?</span>
            <select
              className="w-full rounded-xl border border-card-edge bg-ground-2 px-3 py-2.5 text-ink outline-none focus:border-gold"
              defaultValue=""
              onChange={(e) => fromEvent(e.target.value)}
            >
              <option value="">Pick one of your events, or fill it in below</option>
              {upcoming.map((ev) => (
                <option key={ev.event_id} value={ev.event_id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div>
          <DateField
            label="Event date"
            min={todayIso()}
            value={date}
            onChange={setDate}
            {...described("date")}
          />
          {err("date")}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2" {...described("time")}>
          <TimeField label="Starts (optional)" value={timeStart} onChange={setTimeStart} />
          <TimeField label="Ends (optional)" value={timeEnd} onChange={setTimeEnd} />
          <div className="col-span-2">{err("time")}</div>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="What's the event?"
            list={`${id}-events`}
            placeholder="Sangeet, wedding, birthday…"
            maxLength={50}
            required
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            {...described("event")}
          />
          <datalist id={`${id}-events`}>
            {CELEBRATIONS.map((c) => (
              <option key={c.label} value={c.label} />
            ))}
          </datalist>
          {err("event")}
        </div>
      </div>

      <fieldset className="grid gap-3" {...described("where")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-ink-soft">Where&apos;s the event?</legend>
          {/* A venue isn't always booked yet; a city is enough to ask. */}
          <div role="radiogroup" aria-label="Where" className="flex gap-0.5 rounded-full bg-panel p-[3px] text-sm">
            {(["city", "venue"] as const).map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={where === w}
                onClick={() => setWhere(w)}
                className={`rounded-full px-3.5 py-1 font-semibold transition ${
                  where === w ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                {w === "city" ? "City" : "Venue"}
              </button>
            ))}
          </div>
        </div>
        {where === "city" ? (
          <CityCombobox label="City & state" placeholder="Start typing a city…" value={city} onChange={(v) => setCity(v)} />
        ) : (
          <AddressFields value={venue} onChange={setVenue} showGaps={Boolean(errors.where)} />
        )}
        {err("where")}
      </fieldset>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-guests`} className="text-sm font-medium text-ink-soft">
            Guest count{needsGuests ? "" : " (optional)"}
          </label>
          {needsGuests ? <span className="text-xs text-ink-faint">This package is priced per guest</span> : null}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <input
            type="range"
            aria-label="Guest count slider"
            // Tens for the slider; an exact or small count goes in the box.
            min={10}
            max={GUEST_SLIDER_MAX}
            step={10}
            value={Math.min(Math.max(Number(guests) || 10, 10), GUEST_SLIDER_MAX)}
            onChange={(e) => setGuests(e.target.value)}
            className="min-w-0 flex-1 accent-maroon"
          />
          <input
            id={`${id}-guests`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            placeholder="—"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            {...described("guests")}
            className="w-24 rounded-xl border border-card-edge bg-ground-2 px-3 py-2 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
          />
        </div>
        {err("guests")}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">Message (optional)</span>
        <textarea
          rows={4}
          maxLength={2000}
          placeholder={`What you're planning, and anything ${vendorName} should know`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
        />
      </label>

      {/* The honeypot. Off-screen rather than display:none, which some bots skip. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        </label>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {formError}
        </p>
      ) : null}

      {user ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || noPackages}>
            {busy ? "Sending…" : "Send inquiry"}
          </Button>
          <p className="text-xs text-ink-faint">They&apos;ll reply in your messages on Jorna.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={noPackages}>
              Create an account to send
            </Button>
            <Button type="button" variant="ghost" onClick={() => leaveFor(`/login?next=${encodeURIComponent(back)}`)}>
              I have an account
            </Button>
          </div>
          <p className="text-xs text-ink-faint">
            What you&apos;ve written is kept. You&apos;ll come back here to send it, and {vendorName} replies in your messages.
          </p>
        </div>
      )}
    </form>
  );
}
