"use client";

// An event's guest list, as a section of the event's page (2026-11-17: it used
// to be its own page, which took the host away from the event and its
// sidebar). Laid out as the Jorna-Client design has it: the totals, Add guest,
// and a table of households, each opening to edit their RSVPs or copy their
// link. The design's Side and Dietary columns, and its Import and Send
// invitations buttons, are left out until there's something behind them.
//
// Deliberately reports rather than decides. It shows the gap between what a
// function is planned for and what people have actually said, and leaves the
// decision there — a vendor booked for two hundred is holding a promise, not a
// variable, and no headcount arriving on its own should move it.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import {
  addFunction,
  addGuest,
  addGuestsBulk,
  getGuestList,
  getInviteLink,
  removeFunction,
  removeGuest,
  revokeInviteLink,
  updateFunction,
  updateGuest,
} from "@/lib/jorna";
import { Button, Card, Field, TimeField } from "@jorna/shared/components/ui";
import {
  headcountGap,
  type EventFunction,
  type FunctionHeadcount,
  type Guest,
  type GuestList,
} from "@/lib/types";
import { Drawer } from "@/components/Drawer";
import { GuestListSkeleton } from "@/components/Skeletons";

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The public URL for a token. Absolute, because it gets pasted into messages. */
function inviteUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/client/rsvp/?t=${encodeURIComponent(token)}`;
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

function GuestEditor({
  guest,
  functions,
  onChanged,
  onDone,
}: {
  guest: Guest;
  functions: EventFunction[];
  onChanged: () => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState(guest.name);
  const [email, setEmail] = useState(guest.email ?? "");
  const [size, setSize] = useState(String(guest.party_size));
  const [invited, setInvited] = useState<string[]>(guest.invites.map((i) => i.function_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onChanged();
      onDone();
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
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove them. Try again.");
      setBusy(false);
    }
  }

  return (
    <div>
        <div className="grid grid-cols-1 gap-3">
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
          <CopyButton value={inviteUrl(guest.token)} label="Copy their RSVP link" />
          <Button variant="quiet" size="md" disabled={busy} onClick={remove} className="ml-auto">
            Remove
          </Button>
        </div>
    </div>
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
        <div className="mt-4 grid gap-3">
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

// ── The list ──────────────────────────────────────────────────────────

type Standing = "attending" | "declined" | "awaiting";

/** Where one household stands overall, and how many people that is. */
function standing(guest: Guest): { state: Standing; people: number } {
  const coming = guest.invites.filter((i) => i.status === "attending");
  if (coming.length > 0) {
    return { state: "attending", people: Math.max(...coming.map((i) => i.attending_count ?? guest.party_size)) };
  }
  const replied = guest.invites.length > 0 && guest.invites.every((i) => i.status === "declined");
  return { state: replied ? "declined" : "awaiting", people: guest.party_size };
}

/** The design's Sub-events column: which parts they're coming to, in words. */
function subEvents(guest: Guest, functions: EventFunction[]): { text: string; tone: string } {
  const name = (id: string) => functions.find((f) => f.function_id === id)?.name ?? "";
  const coming = guest.invites.filter((i) => i.status === "attending");
  if (coming.length > 0) {
    if (coming.length === guest.invites.length && guest.invites.length > 1) return { text: "All attending", tone: "text-green" };
    return { text: coming.map((i) => name(i.function_id)).filter(Boolean).join(" + ") || "Attending", tone: "text-green" };
  }
  if (guest.invites.length > 0 && guest.invites.every((i) => i.status === "declined")) {
    return { text: "Can't come", tone: "text-ink-soft" };
  }
  return { text: "Awaiting RSVP", tone: "text-ink-faint" };
}

export function GuestListSection({ eventId, plannedFor }: { eventId: string; plannedFor?: number | null }) {
  const [loaded, setLoaded] = useState<{ eventId: string; list: GuestList } | null>(null);
  const [error, setError] = useState<{ eventId: string; message: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      getGuestList(eventId).then(
        (list) => {
          setLoaded({ eventId, list });
          setError(null);
        },
        (err) =>
          setError({
            eventId,
            message:
              err instanceof ApiError && err.status === 403
                ? "This isn't your celebration."
                : "Couldn't load your guest list. Try again.",
          }),
      ),
    [eventId],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const list = loaded?.eventId === eventId ? loaded.list : null;
  const failed = error?.eventId === eventId ? error.message : null;

  const head = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">Guest List</p>
        <h2 className="mt-1 font-serif text-[1.45rem] font-bold tracking-[-0.02em] text-ink">Everyone celebrating with you</h2>
      </div>
    </div>
  );

  if (!list) {
    return (
      <div>
        {head}
        {failed ? <p className="text-ink-soft">{failed}</p> : <GuestListSkeleton />}
      </div>
    );
  }

  const totals = { invited: 0, attending: 0, awaiting: 0, declined: 0 };
  for (const g of list.guests) {
    const s = standing(g);
    totals.invited += g.party_size;
    totals[s.state] += s.state === "attending" ? s.people : g.party_size;
  }
  const open = list.guests.find((g) => g.guest_id === editing) ?? null;

  return (
    <div>
      {head}

      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            ["Invited", totals.invited],
            ["Attending", totals.attending],
            ["Awaiting", totals.awaiting],
            ["Declined", totals.declined],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="grid min-w-[110px] rounded-xl border border-line bg-card p-4 max-sm:min-w-0 max-sm:flex-1">
            <strong className="text-[1.35rem] tabular-nums text-ink">{n}</strong>
            <span className="text-[0.75rem] text-ink-soft">{label}</span>
          </div>
        ))}
        <div className="ml-auto max-sm:ml-0 max-sm:w-full">
          <Button onClick={() => setAdding(true)} className="max-sm:w-full">
            Add guest
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[14px] border border-line bg-card">
        <div className="min-w-[560px]">
          <div aria-hidden="true" className="grid grid-cols-[1.4fr_0.6fr_1.3fr] gap-5 bg-panel px-[18px] py-3.5 text-[0.72rem] text-ink-soft">
            <span>Household</span>
            <span>People</span>
            <span>Sub-events</span>
          </div>
          {list.guests.length === 0 ? (
            <p className="border-t border-line px-[18px] py-8 text-center text-sm text-ink-soft">
              Nobody yet. Add a guest, or share the link below and let people add themselves.
            </p>
          ) : (
            <ul aria-label="Guests">
            {list.guests.map((g) => {
              const sub = subEvents(g, list.functions);
              return (
                <li key={g.guest_id}>
                <button
                  type="button"
                  aria-label={`${g.name}, ${g.party_size} ${g.party_size === 1 ? "person" : "people"}, ${sub.text}`}
                  onClick={() => setEditing(g.guest_id)}
                  className="grid w-full grid-cols-[1.4fr_0.6fr_1.3fr] gap-5 border-t border-line px-[18px] py-3.5 text-left text-[0.82rem] transition hover:bg-panel"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">{g.name}</span>
                    {g.self_added ? <span className="block text-xs text-ink-faint">Added themselves from your link</span> : null}
                  </span>
                  <span className="tabular-nums text-ink">{g.party_size}</span>
                  <span className={sub.tone}>{sub.text}</span>
                </button>
                </li>
              );
            })}
            </ul>
          )}
        </div>
      </div>

      {list.headcount.length > 1 || plannedFor ? (
        <section className="mt-8">
          <h3 className="eyebrow mb-3">Headcount by part of the day</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.headcount.map((counts) => (
              <HeadcountCard key={counts.function_id} counts={counts} plannedFor={plannedFor} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 grid gap-3">
        <SharedLink key={list.invite_link ?? "none"} eventId={eventId} live={list.invite_link} />
        <Functions eventId={eventId} functions={list.functions} onChanged={refresh} />
      </div>

      {adding ? (
        <Drawer label="Add guests" onClose={() => setAdding(false)}>
          <AddGuests eventId={eventId} functions={list.functions} onAdded={refresh} />
        </Drawer>
      ) : null}
      {open ? (
        <Drawer label={open.name} onClose={() => setEditing(null)}>
          <h2 className="mb-4 font-serif text-xl font-bold text-ink">{open.name}</h2>
          <GuestEditor guest={open} functions={list.functions} onChanged={refresh} onDone={() => setEditing(null)} />
        </Drawer>
      ) : null}
    </div>
  );
}
