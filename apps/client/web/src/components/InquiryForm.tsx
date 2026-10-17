"use client";

import { useId, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { CELEBRATIONS } from "@jorna/shared/lib/celebrations";
import { Button, Field } from "@jorna/shared/components/ui";
import { useAuth } from "@/lib/auth";
import { sendInquiry } from "@/lib/jorna";

// The public inquiry form (backend DECISIONS #32): anyone can send it, signed
// in or not, and it lands in the vendor's Leads. Used on the vendor's page (in
// a drawer) and on /inquire, the link vendors share.

type FieldKey = "name" | "email" | "phone" | "date" | "guests";

/** Which field a server refusal is about, so it shows under that field. The
 *  backend's messages are written to be read; they just don't say which
 *  input they mean. */
function fieldFor(message: string): FieldKey | null {
  const m = message.toLowerCase();
  if (m.includes("name")) return "name";
  if (m.includes("email")) return "email";
  if (m.includes("phone")) return "phone";
  if (m.includes("date")) return "date";
  if (m.includes("guest")) return "guests";
  return null;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InquiryForm({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const { user } = useAuth();
  const id = useId();
  const signedInName = user ? `${user.f_name ?? ""} ${user.l_name ?? ""}`.trim() : "";
  const [name, setName] = useState(signedInName);
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [guests, setGuests] = useState("");
  const [note, setNote] = useState("");
  // Hidden from people; a bot fills it in and the server quietly drops it.
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div role="status" className="rounded-2xl border border-card-edge bg-panel p-6">
        <p className="serif text-xl text-ink">Sent</p>
        <p className="mt-2 text-ink-soft">
          {vendorName} will reply to {sentTo}.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) found.name = "Add your name so they know who's asking";
    if (!email.trim()) found.email = "Add your email so they can reply";
    const count = guests.trim() ? Number(guests) : null;
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 100_000)) {
      found.guests = "Guest count must be between 1 and 100,000";
    }
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await sendInquiry(vendorId, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        event_date_iso: date || null,
        event_type: eventType.trim() || null,
        guest_count: count,
        note: note.trim() || null,
        website,
      });
      setSentTo(email.trim());
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't send that. Check your connection and try again.";
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

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} {...described("name")} />
          {err("name")}
        </div>
        <div>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...described("email")} />
          {err("email")}
        </div>
        <div>
          <Field label="Phone (optional)" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} {...described("phone")} />
          {err("phone")}
        </div>
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send inquiry"}
        </Button>
        <p className="text-xs text-ink-faint">They&apos;ll reply to your email. No account needed.</p>
      </div>
    </form>
  );
}
