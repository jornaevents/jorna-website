"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { CELEBRATIONS } from "@jorna/shared/lib/celebrations";
import { Button, Field } from "@jorna/shared/components/ui";
import { useAuth } from "@/lib/auth";
import { listServices, sendInquiry } from "@/lib/jorna";

// The inquiry form (backend DECISIONS #32, #45): a client account with a
// confirmed email sends it, and it opens their thread with the vendor. Anyone
// can fill it in; signed out, what they typed is kept while they make an
// account (or confirm their email) and is waiting here when they come back.
// Used on the vendor's page (in a drawer) and on /inquire, the link vendors
// share — coming back always lands on /inquire.

type FieldKey = "phone" | "date" | "guests" | "package";

type Draft = {
  vendorId: string;
  phone: string;
  date: string;
  eventType: string;
  location?: string;
  serviceId?: string;
  guests: string;
  note: string;
};

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
  if (m.includes("phone")) return "phone";
  if (m.includes("date")) return "date";
  if (m.includes("guest")) return "guests";
  if (m.includes("package")) return "package";
  return null;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InquiryForm({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const id = useId();
  const [draft] = useState(() => loadDraft(vendorId));
  const [phone, setPhone] = useState(draft?.phone || user?.phone || "");
  const [date, setDate] = useState(draft?.date ?? "");
  const [eventType, setEventType] = useState(draft?.eventType ?? "");
  const [location, setLocation] = useState(draft?.location ?? "");
  // "" is "not sure yet".
  const [serviceId, setServiceId] = useState(draft?.serviceId ?? "");
  // The packages the client can see, kept with the vendor they're for.
  const [packages, setPackages] = useState<{ vendorId: string; items: { id: string; name: string }[] } | null>(null);
  const [guests, setGuests] = useState(draft?.guests ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  // Hidden from people; a bot fills it in and the server quietly drops it.
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ conversationId: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listServices({ vendor_id: vendorId, limit: 50 })
      .then((page) => {
        if (!cancelled) setPackages({ vendorId, items: page.items.map((p) => ({ id: p.service_id, name: p.name })) });
      })
      // No list, no picker: the inquiry still goes, as "not sure yet".
      .catch(() => !cancelled && setPackages({ vendorId, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [vendorId]);
  const packageOptions = packages?.vendorId === vendorId ? packages.items : [];

  const back = `/inquire?vendor=${encodeURIComponent(vendorId)}`;

  /** Keep what they typed and go do what sending needs first. */
  function leaveFor(path: string) {
    saveDraft({ vendorId, phone, date, eventType, location, serviceId, guests, note });
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
    const count = guests.trim() ? Number(guests) : null;
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 100_000)) {
      found.guests = "Guest count must be between 1 and 100,000";
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
      const reply = await sendInquiry(vendorId, {
        phone: phone.trim() || null,
        event_date_iso: date || null,
        event_type: eventType.trim() || null,
        event_location: location.trim() || null,
        service_id: packageOptions.some((p) => p.id === serviceId) ? serviceId : null,
        guest_count: count,
        note: note.trim() || null,
        website,
      });
      clearDraft();
      setSent({ conversationId: reply.conversation_id ?? null });
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
          <Field
            label="Event date (optional)"
            type="date"
            min={todayIso()}
            hint="Leave it blank if you're not sure yet."
            value={date}
            onChange={(e) => setDate(e.target.value)}
            {...described("date")}
          />
          {err("date")}
        </div>
        <div>
          <Field
            label="What's the event? (optional)"
            list={`${id}-events`}
            placeholder="Sangeet, wedding, birthday…"
            maxLength={50}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
          <datalist id={`${id}-events`}>
            {CELEBRATIONS.map((c) => (
              <option key={c.label} value={c.label} />
            ))}
          </datalist>
        </div>
        <div>
          <Field
            label="Where's the event? (optional)"
            placeholder="Venue, or just the city"
            autoComplete="off"
            maxLength={255}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        {packageOptions.length > 0 ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">Package (optional)</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              {...described("package")}
              className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
            >
              <option value="">Not sure yet</option>
              {packageOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {err("package")}
          </label>
        ) : null}
        <div>
          <Field
            label="Rough guest count (optional)"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            {...described("guests")}
          />
          {err("guests")}
        </div>
        <div>
          <Field label="Phone (optional)" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} {...described("phone")} />
          {err("phone")}
        </div>
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
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send inquiry"}
          </Button>
          <p className="text-xs text-ink-faint">They&apos;ll reply in your messages on Jorna.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Create an account to send</Button>
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
