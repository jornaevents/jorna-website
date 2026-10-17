"use client";

// The one "New" button every vendor page header carries. It replaced four
// buttons — "New contract", "New lead", "New booking" — that all opened the
// same contract editor under different names, which left vendors wondering
// whether a lead and a booking were different starting points. They aren't:
// the backend runs them as one pipeline.
//
// Two ways in: send a contract, or add a client you're talking to without one
// yet (a lead — it shows on Leads as an inquiry, and "Create contract" there
// converts it). Leads puts "Add a client" first; everywhere else the contract
// leads.

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, Field } from "@jorna/shared/components/ui";
import { createLead } from "@/lib/jorna";
import type { Lead } from "@/lib/types";
import { Drawer, primaryClass } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Choice = "contract" | "client";

const itemClass =
  "grid w-full gap-0.5 rounded-[9px] px-3 py-2.5 text-left transition hover:bg-panel focus-visible:bg-panel focus-visible:outline-none";

export function NewMenu({
  first = "contract",
  onClientAdded,
}: {
  /** Which choice leads the menu: the page's most likely next step. */
  first?: Choice;
  /** Called with the new lead. Without it, the vendor is taken to Leads to see it. */
  onClientAdded?: (lead: Lead) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Opens toward the room it has: right-aligned under a button at the end of
  // the header, left-aligned when a narrow header wraps it to the start.
  const [alignLeft, setAlignLeft] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A small menu, not a sheet: close on Escape or a click outside, and leave
  // the page scrolling (useOverlay would lock it).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const contract = (
    <Link key="contract" href="/contracts/new" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
      <span className="text-sm font-semibold text-ink">Send a contract</span>
      <span className="text-xs text-ink-faint">Write it from your usual terms and send the link.</span>
    </Link>
  );
  const client = (
    <button
      key="client"
      type="button"
      role="menuitem"
      className={itemClass}
      onClick={() => {
        setOpen(false);
        setAdding(true);
      }}
    >
      <span className="text-sm font-semibold text-ink">Add a client</span>
      <span className="text-xs text-ink-faint">Someone you&apos;re talking to, before there&apos;s a contract.</span>
    </button>
  );

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          setAlignLeft(e.currentTarget.getBoundingClientRect().right < 18 * 16);
          setOpen((o) => !o);
        }}
        className={primaryClass}
      >
        <Icon name="plus" size={16} />
        New
        <Icon name="chevron" size={14} className={`transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="New"
          className={`absolute ${alignLeft ? "left-0" : "right-0"} z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-card-edge bg-card p-1.5 shadow-[0_16px_40px_rgba(42,12,25,0.16)]`}
        >
          {first === "client" ? [client, contract] : [contract, client]}
        </div>
      ) : null}
      <AddClientDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(lead) => {
          setAdding(false);
          if (onClientAdded) onClientAdded(lead);
          else router.push("/leads");
        }}
      />
    </div>
  );
}

function AddClientDrawer({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (lead: Lead) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [guests, setGuests] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setDate("");
    setEventType("");
    setGuests("");
    setNote("");
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Add their name.");
    // A client you can't reach is a name on a list, not a lead.
    if (!email.trim() && !phone.trim()) return setError("Add an email or a phone number so you can reach them.");
    // The backend checks these too (#165: "neha@" and "call me maybe" were saved).
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError("That email doesn't look right — check it, or leave it blank.");
    }
    const digits = phone.replace(/\D/g, "").length;
    if (phone.trim() && (/[a-z]/i.test(phone) || digits < 7 || digits > 15)) {
      return setError("That phone number doesn't look right — check it, or leave it blank.");
    }
    if (date && date < todayIso()) return setError("The event date has already passed.");
    const count = guests.trim() ? Number(guests) : null;
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 100_000)) {
      return setError("Guest count must be between 1 and 100,000.");
    }
    setBusy(true);
    setError(null);
    try {
      const lead = await createLead({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        event_date_iso: date || null,
        event_type: eventType.trim() || null,
        guest_count: count,
        note: note.trim() || null,
      });
      reset();
      onAdded(lead);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add them. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add a client"
      subtitle="They'll show on Leads as an inquiry. Send a contract from there when you're ready."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-client" disabled={busy}>
            {busy ? "Adding…" : "Add client"}
          </Button>
        </div>
      }
    >
      <form id="add-client" onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Field label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        <Field
          label="Event date"
          type="date"
          min={todayIso()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          hint="Leave it blank if they haven't picked one."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Event"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder="Sangeet, wedding…"
            maxLength={50}
          />
          <Field
            label="Guests"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            placeholder="About how many"
          />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="How you met, what they're after."
            className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
