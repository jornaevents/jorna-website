"use client";

// Where an invitation link lands (/rsvp?t=…).
//
// The only page in the app with no account behind it, and it's built for the
// person least likely to have one: a relative opening a link on their phone
// from a group chat. So — no sign-in, no app, no "create an account to reply".
// The token in the URL is the whole credential.
//
// One URL shape for two kinds of link, because a guest can't tell which they
// were sent. Their own link knows who they are and shows what they already
// said; the shared one doesn't, and asks first.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { getInvitation, joinViaInviteLink, sendRsvp } from "@/lib/jorna";
import { Button, Card, Field, Rule } from "@jorna/shared/components/ui";
import type { EventFunction, Invitation, RsvpReply } from "@/lib/types";
import { FormSkeleton } from "@/components/Skeletons";

/** "Saturday, 5 June 2027" — no year-less shorthand on a page about a date. */
function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "7:00 PM" from "19:00". Returns null for anything it can't read. */
function prettyTime(t?: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const hour = Number(m[1]);
  if (Number.isNaN(hour)) return null;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${((hour + 11) % 12) + 1}:${m[2]} ${suffix}`;
}

function whenLine(fn: EventFunction, fallbackDate?: string | null): string | null {
  const date = prettyDate(fn.date_iso ?? fallbackDate);
  const from = prettyTime(fn.time_start);
  const to = prettyTime(fn.time_end);
  const hours = from ? (to ? `${from} – ${to}` : `from ${from}`) : null;
  return [date, hours].filter(Boolean).join(" · ") || null;
}

type Answer = { status: "attending" | "declined" | null; count: number };

/**
 * One function, and the two things a guest has to say about it.
 *
 * Coming and how many are one question in practice — nobody answers "yes" and
 * then goes looking for a number field — so the count sits inside the yes.
 */
function FunctionCard({
  fn,
  fallbackDate,
  answer,
  onChange,
  maxParty,
}: {
  fn: EventFunction;
  fallbackDate?: string | null;
  answer: Answer;
  onChange: (next: Answer) => void;
  maxParty: number;
}) {
  const when = whenLine(fn, fallbackDate);
  const chosen = answer.status;

  return (
    <div className="rounded-2xl border border-card-edge bg-ground-2 p-4">
      <h3 className="serif text-lg text-ink">{fn.name}</h3>
      {when ? <p className="mt-0.5 text-sm text-ink-soft">{when}</p> : null}
      {fn.location ? <p className="text-sm text-ink-faint">{fn.location}</p> : null}

      <div
        role="group"
        aria-label={`Are you coming to ${fn.name}?`}
        className="mt-3 flex gap-2"
      >
        <button
          type="button"
          aria-pressed={chosen === "attending"}
          onClick={() => onChange({ ...answer, status: "attending" })}
          className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition ${
            chosen === "attending"
              ? "border-green bg-green/15 text-green"
              : "border-card-edge bg-card text-ink-soft hover:border-green/50"
          }`}
        >
          Coming
        </button>
        <button
          type="button"
          aria-pressed={chosen === "declined"}
          onClick={() => onChange({ ...answer, status: "declined" })}
          className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition ${
            chosen === "declined"
              ? "border-maroon bg-maroon/10 text-maroon dark:text-gold"
              : "border-card-edge bg-card text-ink-soft hover:border-maroon/40"
          }`}
        >
          Can&apos;t make it
        </button>
      </div>

      {chosen === "attending" ? (
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-soft">How many of you?</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              aria-label="One fewer"
              disabled={answer.count <= 1}
              onClick={() => onChange({ ...answer, count: Math.max(1, answer.count - 1) })}
              className="size-8 rounded-full border border-card-edge text-ink-soft transition hover:bg-black/[0.04] disabled:opacity-40 dark:hover:bg-white/[0.06]"
            >
              −
            </button>
            <span className="w-8 text-center text-base font-semibold tabular-nums text-ink">
              {answer.count}
            </span>
            <button
              type="button"
              aria-label="One more"
              disabled={answer.count >= maxParty}
              onClick={() =>
                onChange({ ...answer, count: Math.min(maxParty, answer.count + 1) })
              }
              className="size-8 rounded-full border border-card-edge text-ink-soft transition hover:bg-black/[0.04] disabled:opacity-40 dark:hover:bg-white/[0.06]"
            >
              +
            </button>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function RsvpInner() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  // A link with no token has nothing to load, so it starts settled rather than
  // being switched off by the effect a moment later.
  const [loading, setLoading] = useState(Boolean(token));
  const [loadError, setLoadError] = useState<string | null>(null);

  // Only asked for on the shared link, where the app doesn't know who's reading.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Their own token once they've joined, so a second send updates rather than
  // adding them to the list twice.
  const [myToken, setMyToken] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getInvitation(token)
      .then((inv) => {
        if (cancelled) return;
        setInvitation(inv);
        // Seed with what they've already said. Somebody arriving a second time
        // should see their answer, not be asked again as though it never
        // happened.
        const seed: Record<string, Answer> = {};
        const party = inv.guest?.party_size ?? 1;
        for (const fn of inv.functions) {
          const prior = inv.guest?.replies.find((r) => r.function_id === fn.function_id);
          seed[fn.function_id] = {
            status:
              prior?.status === "attending" || prior?.status === "declined"
                ? prior.status
                : null,
            count: prior?.attending_count && prior.attending_count > 0
              ? prior.attending_count
              : party,
          };
        }
        setAnswers(seed);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This invitation link isn't valid any more. Ask whoever sent it for a new one."
            : "Couldn't open this invitation. Check your connection and try again.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isOpenLink = invitation !== null && invitation.guest === null && myToken === null;
  const party = invitation?.guest?.party_size ?? 1;
  // Somebody adding themselves says how many they are, so nothing caps them but
  // sense. A host-added guest can bring fewer than expected but not more —
  // that's a conversation, not a form field.
  const maxParty = isOpenLink ? 20 : Math.max(party, 1);
  const answered = Object.values(answers).filter((a) => a.status !== null).length;

  async function submit() {
    setBusy(true);
    setError(null);
    const replies: RsvpReply[] = Object.entries(answers)
      .filter(([, a]) => a.status !== null)
      .map(([function_id, a]) => ({
        function_id,
        status: a.status as "attending" | "declined",
        attending_count: a.status === "attending" ? a.count : null,
      }));

    try {
      if (myToken) {
        await sendRsvp(myToken, replies);
      } else if (invitation?.guest === null) {
        const joined = await joinViaInviteLink(token, {
          name: name.trim(),
          email: email.trim() || null,
          // Whatever they said for the largest function they're coming to —
          // asking for a party size and then again per function is asking twice.
          party_size: Math.max(
            1,
            ...replies.map((r) => (r.status === "attending" ? r.attending_count ?? 1 : 1)),
          ),
          replies,
        });
        setMyToken(joined.token);
        // They're somebody now. Swapping in the invitation the join returned is
        // what makes "change your answer" work on the second pass — otherwise
        // the page still thinks nobody is reading it.
        setInvitation(joined);
      } else {
        await sendRsvp(token, replies);
      }
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't send your reply. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">Invitation link</h1>
        <p className="mt-3 text-ink-soft">
          This link is missing its code. Ask whoever invited you to send it again.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return <p className="py-20 text-center text-ink-soft">Opening your invitation…</p>;
  }

  if (loadError || !invitation) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">
          We couldn&apos;t open this
        </h1>
        <p className="mt-3 text-ink-soft">{loadError}</p>
      </Shell>
    );
  }

  if (sent) {
    const coming = Object.values(answers).some((a) => a.status === "attending");
    return (
      <Shell>
        <p className="eyebrow">{invitation.event_name}</p>
        <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">
          {coming ? "Thank you — you're on the list" : "Thank you for letting them know"}
        </h1>
        <p className="mt-3 text-ink-soft">
          {coming
            ? "Your reply has gone to the host."
            : "They'll be sorry to miss you. Your reply has gone to the host."}
        </p>
        <div className="mt-6">
          <Button variant="ghost" onClick={() => setSent(false)}>
            Change your answer
          </Button>
        </div>
      </Shell>
    );
  }

  const readable = invitation.guest?.name ?? null;

  return (
    <div className="mx-auto w-[min(560px,100%-2rem)] py-12">
      <div className="text-center">
        <p className="eyebrow">You&apos;re invited to</p>
        <h1 className="serif mt-2 text-4xl text-maroon dark:text-gold">
          {invitation.event_name}
        </h1>
        {invitation.location ? (
          <p className="mt-2 text-ink-soft">{invitation.location}</p>
        ) : null}
        <div className="mt-6">
          <Rule />
        </div>
      </div>

      {readable ? (
        <p className="mt-8 text-center text-ink-soft">
          Hello {readable} — {party > 1 ? `${party} places are held for you. ` : ""}
          please let them know if you can come.
        </p>
      ) : null}

      {isOpenLink ? (
        <Card className="mt-8 p-5">
          <p className="text-sm font-medium text-ink-soft">First, who&apos;s replying?</p>
          <div className="mt-3 grid gap-3">
            <Field
              label="Your name"
              placeholder="Anita Sharma"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="Email"
              type="email"
              placeholder="anita@example.com"
              autoComplete="email"
              hint="Only so the host can reach you about the day."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-3">
        {invitation.functions.map((fn) => (
          <FunctionCard
            key={fn.function_id}
            fn={fn}
            fallbackDate={invitation.date_iso}
            answer={answers[fn.function_id] ?? { status: null, count: party }}
            maxParty={maxParty}
            onChange={(next) =>
              setAnswers((prev) => ({ ...prev, [fn.function_id]: next }))
            }
          />
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <Button
          size="lg"
          className="w-full"
          disabled={busy || answered === 0 || (isOpenLink && !name.trim())}
          onClick={submit}
        >
          {busy ? "Sending…" : "Send my reply"}
        </Button>
        {answered === 0 ? (
          <p className="mt-2 text-center text-xs text-ink-faint">
            {invitation.functions.length > 1
              ? "Answer at least one — you can leave the rest for later."
              : "Let them know either way."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-[min(520px,100%-2rem)] py-20 text-center">{children}</div>;
}

export default function RsvpPage() {
  return (
    <Suspense fallback={<FormSkeleton label="Loading your invitation…" fields={3} />}>
      <RsvpInner />
    </Suspense>
  );
}
