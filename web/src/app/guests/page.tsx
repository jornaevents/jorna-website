"use client";

// The guest list for one celebration (/guests?event=…), reached from the plan.
//
// Its own page rather than a panel on the plan, because it's the one part of
// planning that isn't about vendors: a list that gets worked over months, in
// short bursts, usually on a phone, often by somebody other than whoever books
// the caterer.
//
// Deliberately reports rather than decides. It shows the gap between what a
// function is planned for and what people have actually said, and leaves the
// decision there — a vendor booked for two hundred is holding a promise, not a
// variable, and no headcount arriving on its own should move it.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  addFunction,
  addGuest,
  addGuestsBulk,
  getGuestList,
  getInviteLink,
  listEvents,
  removeFunction,
  removeGuest,
  revokeInviteLink,
  updateFunction,
  updateGuest,
} from "@/lib/jorna";
import { ClientOnlyRoute } from "@/components/ClientOnlyRoute";
import { Button, Card, Field, TimeField } from "@/components/ui";
import {
  headcountGap,
  type EventFunction,
  type EventItem,
  type FunctionHeadcount,
  type Guest,
  type GuestList,
} from "@/lib/types";

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The public URL for a token. Absolute, because it gets pasted into messages. */
function inviteUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/app/rsvp/?t=${encodeURIComponent(token)}`;
}

/** Copy, and say so — a copy button that gives no sign it worked gets pressed twice. */
function CopyButton({
  value,
  label = "Copy link",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="md"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard refused (an insecure origin, usually). The field beside
          // this is selectable, so there's still a way through.
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

// ── The numbers ───────────────────────────────────────────────────────

/**
 * One function's headcount, and how it sits against the plan.
 *
 * `plannedFor` is the celebration's guest count — the figure the vendors were
 * booked against. Showing the difference is the whole point: a caterer billing
 * per head against two hundred when a hundred and forty have said yes is the
 * expensive kind of quiet.
 */
function HeadcountCard({
  counts,
  plannedFor,
}: {
  counts: FunctionHeadcount;
  plannedFor?: number | null;
}) {
  const gap = headcountGap(counts, plannedFor);
  const date = prettyDate(counts.date_iso);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="serif text-lg text-ink">{counts.name}</h3>
        {date ? <span className="text-xs text-ink-faint">{date}</span> : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="serif text-4xl tabular-nums text-maroon dark:text-gold">
          {counts.attending}
        </span>
        <span className="text-sm text-ink-soft">coming</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
        <span>
          <span className="tabular-nums text-ink">{counts.no_reply}</span> yet to reply
        </span>
        <span>
          <span className="tabular-nums text-ink">{counts.declined}</span> can&apos;t come
        </span>
        <span>
          <span className="tabular-nums text-ink">{counts.invited}</span> invited
        </span>
      </div>

      {gap ? (
        <p
          className={`mt-3 border-t border-line-soft pt-3 text-sm ${
            gap.delta === 0 ? "text-green" : "text-ink-soft"
          }`}
        >
          {gap.delta === 0 ? (
            <>Matches the {plannedFor} your vendors are booked for.</>
          ) : gap.delta < 0 ? (
            <>
              <span className="tabular-nums">{Math.abs(gap.delta)}</span> under the{" "}
              <span className="tabular-nums">{plannedFor}</span> your vendors are booked
              for.{" "}
              {gap.settled
                ? "Everyone has answered."
                : `${counts.no_reply} still to reply.`}
            </>
          ) : (
            <>
              <span className="tabular-nums">{gap.delta}</span> over the{" "}
              <span className="tabular-nums">{plannedFor}</span> your vendors are booked
              for — worth telling them.
            </>
          )}
        </p>
      ) : null}
    </Card>
  );
}

// ── One guest ─────────────────────────────────────────────────────────

function GuestRow({
  guest,
  functions,
  onChanged,
}: {
  guest: Guest;
  functions: EventFunction[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(guest.name);
  const [email, setEmail] = useState(guest.email ?? "");
  const [size, setSize] = useState(String(guest.party_size));
  const [invited, setInvited] = useState<string[]>(guest.invites.map((i) => i.function_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replied = guest.invites.filter((i) => i.status !== "no_reply");
  const coming = guest.invites.filter((i) => i.status === "attending");
  const summary =
    replied.length === 0
      ? { text: "No reply yet", tone: "text-ink-faint" }
      : coming.length === 0
        ? { text: "Can't come", tone: "text-ink-soft" }
        : coming.length === guest.invites.length
          ? { text: `Coming · ${coming[0].attending_count ?? guest.party_size}`, tone: "text-green" }
          : {
              text: `Coming to ${coming.length} of ${guest.invites.length}`,
              tone: "text-green",
            };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateGuest(guest.guest_id, {
        name: name.trim(),
        email: email.trim() || null,
        party_size: Math.max(1, Number(size) || 1),
        function_ids: invited,
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeGuest(guest.guest_id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove them. Try again.");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field
            label="Email"
            type="email"
            placeholder="Optional"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="How many"
            type="number"
            min={1}
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
        </div>

        {functions.length > 1 ? (
          <div className="mt-4 border-t border-line-soft pt-3">
            <p className="text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint">
              Invited to
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {functions.map((fn) => {
                const on = invited.includes(fn.function_id);
                return (
                  <button
                    key={fn.function_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setInvited((prev) =>
                        on
                          ? prev.filter((id) => id !== fn.function_id)
                          : [...prev, fn.function_id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      on
                        ? "border-gold bg-gold/15 text-maroon dark:text-gold"
                        : "border-card-edge bg-ground-2 text-ink-soft hover:border-gold/50"
                    }`}
                  >
                    {fn.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="md" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="quiet" size="md" disabled={busy} onClick={remove} className="ml-auto">
            Remove
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {guest.name}
            {guest.party_size > 1 ? (
              <span className="ml-2 text-sm font-normal text-ink-faint tabular-nums">
                party of {guest.party_size}
              </span>
            ) : null}
          </p>
          <p className={`mt-0.5 text-sm ${summary.tone}`}>{summary.text}</p>
          {guest.email ? (
            <p className="mt-0.5 truncate text-xs text-ink-faint">{guest.email}</p>
          ) : null}
          {guest.self_added ? (
            <p className="mt-1 text-xs text-ink-faint">Added themselves from your link</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopyButton value={inviteUrl(guest.token)} label="Copy their link" />
          <Button variant="quiet" size="md" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Adding people ─────────────────────────────────────────────────────

function AddGuests({
  eventId,
  functions,
  onAdded,
}: {
  eventId: string;
  functions: EventFunction[];
  onAdded: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"one" | "many">("one");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [size, setSize] = useState("1");
  const [pasted, setPasted] = useState("");
  // Empty means every function, which is what adding somebody to a guest list
  // without saying which parts means.
  const [invited, setInvited] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "one") {
        if (!name.trim()) {
          setError("A guest needs a name.");
          return;
        }
        await addGuest(eventId, {
          name: name.trim(),
          email: email.trim() || null,
          party_size: Math.max(1, Number(size) || 1),
          function_ids: invited,
        });
        setName("");
        setEmail("");
        setSize("1");
      } else {
        const lines = pasted.split("\n").filter((l) => l.trim());
        if (lines.length === 0) {
          setError("Paste a name per line first.");
          return;
        }
        await addGuestsBulk(eventId, lines, invited);
        setPasted("");
      }
      await onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add them. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="serif text-lg text-ink">Add guests</h2>
        <button
          type="button"
          onClick={() => setMode(mode === "one" ? "many" : "one")}
          className="text-sm font-semibold text-gold hover:underline"
        >
          {mode === "one" ? "Paste a list" : "Add one at a time"}
        </button>
      </div>

      {mode === "one" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
          <Field
            label="Name"
            placeholder="Anita Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label="Email"
            type="email"
            placeholder="Optional"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="How many"
            type="number"
            min={1}
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
        </div>
      ) : (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">
            One per line
          </span>
          <textarea
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={"Anita Sharma, anita@example.com, 3\nRaj Patel, 2\nThe Kapoors, 4"}
            className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
          />
          <span className="mt-1 block text-xs text-ink-faint">
            Name first. An email and how many they are can follow, in any order — both
            optional.
          </span>
        </label>
      )}

      {functions.length > 1 ? (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint">
            Invited to
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {functions.map((fn) => {
              const on = invited.length === 0 || invited.includes(fn.function_id);
              return (
                <button
                  key={fn.function_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setInvited((prev) => {
                      // An empty selection reads as "everything", so the first
                      // tap has to mean "only this one" rather than "all but".
                      const current =
                        prev.length === 0 ? functions.map((f) => f.function_id) : prev;
                      const next = current.includes(fn.function_id)
                        ? current.filter((id) => id !== fn.function_id)
                        : [...current, fn.function_id];
                      return next.length === functions.length ? [] : next;
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    on
                      ? "border-gold bg-gold/15 text-maroon dark:text-gold"
                      : "border-card-edge bg-ground-2 text-ink-soft hover:border-gold/50"
                  }`}
                >
                  {fn.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button size="md" disabled={busy} onClick={submit}>
          {busy ? "Adding…" : mode === "one" ? "Add guest" : "Add them all"}
        </Button>
      </div>
    </Card>
  );
}

// ── The parts of the celebration ──────────────────────────────────────

function Functions({
  eventId,
  functions,
  onChanged,
}: {
  eventId: string;
  functions: EventFunction[];
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");

  async function create() {
    if (!name.trim()) {
      setError("Give it a name — mehndi, sangeet, reception.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addFunction(eventId, {
        name: name.trim(),
        date_iso: date || null,
        time_start: from || null,
        time_end: to || null,
      });
      setName("");
      setDate("");
      setFrom("");
      setTo("");
      setAdding(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(functionId: string) {
    setBusy(true);
    setError(null);
    try {
      await updateFunction(functionId, {
        name: editName.trim(),
        date_iso: editDate || null,
      });
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function drop(functionId: string) {
    setBusy(true);
    setError(null);
    try {
      await removeFunction(functionId);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="serif text-lg text-ink">The parts of the day</h2>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm font-semibold text-gold hover:underline"
          >
            Add one
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        A mehndi, a sangeet, a reception — each with its own guest list, so the number
        you give a caterer is the number for their night.
      </p>

      <div className="mt-4 grid gap-2">
        {functions.map((fn) =>
          editingId === fn.function_id ? (
            <div key={fn.function_id} className="rounded-xl border border-card-edge bg-ground-2 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field value={editName} onChange={(e) => setEditName(e.target.value)} />
                <Field
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="md" disabled={busy} onClick={() => saveEdit(fn.function_id)}>
                  Save
                </Button>
                <Button variant="ghost" size="md" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
                {functions.length > 1 ? (
                  <Button
                    variant="quiet"
                    size="md"
                    disabled={busy}
                    className="ml-auto"
                    onClick={() => drop(fn.function_id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              key={fn.function_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">{fn.name}</p>
                {prettyDate(fn.date_iso) ? (
                  <p className="text-xs text-ink-faint">{prettyDate(fn.date_iso)}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingId(fn.function_id);
                  setEditName(fn.name);
                  setEditDate(fn.date_iso ?? "");
                }}
                className="shrink-0 text-sm text-ink-soft hover:text-ink"
              >
                Edit
              </button>
            </div>
          ),
        )}
      </div>

      {adding ? (
        <div className="mt-3 rounded-xl border border-card-edge bg-ground-2 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Name"
              placeholder="Sangeet"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <TimeField label="From" value={from} onChange={setFrom} />
            <TimeField label="To" value={to} onChange={setTo} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="md" disabled={busy} onClick={create}>
              {busy ? "Adding…" : "Add it"}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

// ── The shared link ───────────────────────────────────────────────────

function SharedLink({ eventId, live }: { eventId: string; live: string | null }) {
  const [token, setToken] = useState<string | null>(live);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const { token: t } = await getInviteLink(eventId);
      setToken(t);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make a link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await revokeInviteLink(eventId);
      setToken(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't retire it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="serif text-lg text-ink">One link for the group chat</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Whoever opens it adds themselves and replies. Useful for the side of the family
        whose addresses you&apos;ll never finish collecting — but anyone with the link can
        add to your headcount, so retire it once the list settles.
      </p>

      {token ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={inviteUrl(token)}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-sm text-ink-soft outline-none"
            />
            <CopyButton value={inviteUrl(token)} />
          </div>
          <Button
            variant="quiet"
            size="md"
            disabled={busy}
            onClick={revoke}
            className="mt-2 px-0"
          >
            Retire this link
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="ghost" size="md" disabled={busy} onClick={mint}>
            {busy ? "Making a link…" : "Make a link"}
          </Button>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

// ── The page ──────────────────────────────────────────────────────────

function GuestsInner() {
  const { user, loading: authLoading } = useAuth();
  const params = useSearchParams();
  const eventId = params.get("event") ?? "";
  const bundleId = params.get("bundle") ?? "";

  const [list, setList] = useState<GuestList | null>(null);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const data = await getGuestList(eventId);
    setList(data);
  }, [eventId]);

  useEffect(() => {
    if (authLoading || !user || !eventId) return;
    let cancelled = false;
    Promise.all([getGuestList(eventId), listEvents()])
      .then(([data, events]) => {
        if (cancelled) return;
        setList(data);
        setEvent(events.find((e) => e.event_id === eventId) ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "This isn't your celebration."
            : "Couldn't load your guest list. Try again.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, eventId]);

  if (authLoading) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  if (!user) {
    return (
      <div className="mx-auto w-[min(520px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-2xl text-maroon dark:text-gold">Sign in first</h1>
        <p className="mt-3 text-ink-soft">Your guest list lives with your plan.</p>
        <Link href="/login" className="mt-5 inline-block font-semibold text-gold hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="mx-auto w-[min(520px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-2xl text-maroon dark:text-gold">No celebration chosen</h1>
        <p className="mt-3 text-ink-soft">Open a plan and pick up the guest list there.</p>
        <Link href="/bundles" className="mt-5 inline-block font-semibold text-gold hover:underline">
          Your plans
        </Link>
      </div>
    );
  }

  if (loading) return <p className="py-20 text-center text-ink-soft">Loading your guest list…</p>;

  if (error || !list) {
    return (
      <div className="mx-auto w-[min(520px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-2xl text-maroon dark:text-gold">We couldn&apos;t load it</h1>
        <p className="mt-3 text-ink-soft">{error}</p>
      </div>
    );
  }

  const backHref = bundleId ? `/bundle?id=${bundleId}` : "/bundles";

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <Link href={backHref} className="text-sm text-ink-soft hover:text-ink">
        ← Back to the plan
      </Link>

      <header className="mt-4">
        <p className="eyebrow">{event?.name ?? "Your celebration"}</p>
        <h1 className="serif mt-1 text-4xl text-maroon dark:text-gold">Guest list</h1>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {list.headcount.map((counts) => (
          <HeadcountCard
            key={counts.function_id}
            counts={counts}
            plannedFor={event?.guest_count}
          />
        ))}
      </div>

      <div className="mt-8">
        <AddGuests eventId={eventId} functions={list.functions} onAdded={refresh} />
      </div>

      <section className="mt-8">
        <h2 className="eyebrow mb-3">
          {list.guests.length === 1 ? "1 guest" : `${list.guests.length} guests`}
        </h2>
        {list.guests.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-ink-soft">
              Nobody yet. Add a name above, or share one link and let people add
              themselves.
            </p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {list.guests.map((guest) => (
              <GuestRow
                key={guest.guest_id}
                guest={guest}
                functions={list.functions}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-3">
        <SharedLink key={list.invite_link ?? "none"} eventId={eventId} live={list.invite_link} />
        <Functions eventId={eventId} functions={list.functions} onChanged={refresh} />
      </div>
    </div>
  );
}

export default function GuestsPage() {
  return (
    <ClientOnlyRoute>
      <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
        <GuestsInner />
      </Suspense>
    </ClientOnlyRoute>
  );
}
