"use client";

// The vendor's half of a signature (backend DECISIONS #34): the client signed
// on their link, and it's booked only once the vendor signs too — or the
// vendor declines to sign, with a reason the client is emailed. Used on the
// Leads drawer and the contract page, for contracts and attached documents.
//
// The vendor signs signed in, so there's no emailed code: a typed full legal
// name, plus the e-records consent the first time (the backend remembers it
// per wording and says so in `consent.given`). A name that isn't the one on
// their account signs only once they confirm it (backend DECISIONS #37).

import { useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Button } from "@jorna/shared/components/ui";
import { useAuth } from "@/lib/auth";
import type { CountersignInput } from "@/lib/jorna";
import { signerMatches } from "@/lib/signerName";
import type { VendorEsignConsent } from "@/lib/types";

function signedOn(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : ` on ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

const field =
  "w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold";

export function CountersignPanel({
  clientName,
  clientSignedAt,
  what,
  freesDate,
  documentKind,
  consent,
  onSign,
  onDecline,
  onDone,
}: {
  clientName: string;
  clientSignedAt?: string | null;
  /** "the contract", or a document's title in quotes. */
  what: string;
  /** Declining a contract frees its date; declining a document changes nothing on the booking. */
  freesDate: string | null;
  /** For an attached document: what signing it does to the booking. */
  documentKind?: "addendum" | "cancellation";
  consent?: VendorEsignConsent;
  onSign: (input: CountersignInput) => Promise<unknown>;
  onDecline: (reason: string) => Promise<unknown>;
  /** After either: the caller reloads, and shows this. */
  onDone: (message: string) => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"idle" | "sign" | "decline">("idle");
  const accountName = [user?.f_name, user?.l_name].filter(Boolean).join(" ");
  const [name, setName] = useState(accountName);
  const [otherName, setOtherName] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsConsent = consent ? !consent.given : false;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // "Mickey Mouse" countersigned a real contract in the 2026-10-26 test.
  const nameDiffers = Boolean(accountName) && name.trim().length > 0 && !signerMatches(name, accountName);
  const canSign = name.trim().length > 0 && (!needsConsent || agreed) && (!nameDiffers || otherName);
  const effect =
    documentKind === "cancellation"
      ? "The booking ends once you sign too."
      : documentKind === "addendum"
        ? "It takes effect once you sign too."
        : "It's booked once you sign too.";
  const signedMessage =
    documentKind === "cancellation"
      ? `Signed. The booking has ended, and you and ${clientName} are getting the signed copy by email.`
      : documentKind === "addendum"
        ? `Signed. It's part of the booking now, and you and ${clientName} are getting the signed copy by email.`
        : `Signed. It's booked, and you and ${clientName} are getting the signed copy by email.`;

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/10 p-4">
      <p className="text-sm text-ink">
        <strong>
          {clientName} signed {what}
          {signedOn(clientSignedAt)}.
        </strong>{" "}
        <span className="text-ink-soft">{effect}</span>
      </p>

      {mode === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setMode("sign")}>Sign</Button>
          <Button variant="quiet" onClick={() => setMode("decline")}>
            Don&apos;t sign
          </Button>
        </div>
      ) : null}

      {mode === "sign" ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSign) return;
            run(
              () =>
                onSign({
                  signerName: name.trim(),
                  consentVersion: needsConsent ? consent?.version : null,
                  nameConfirmed: nameDiffers && otherName,
                }),
              signedMessage,
            );
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs text-ink-faint">Your full legal name</span>
            <input
              value={name}
              maxLength={255}
              onChange={(e) => {
                setName(e.target.value);
                setOtherName(false);
              }}
              className={field}
              autoFocus
            />
          </label>
          {nameDiffers ? (
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={otherName} onChange={(e) => setOtherName(e.target.checked)} className="mt-0.5" />
              <span>
                That isn&apos;t the name on your account ({accountName}). I&apos;m signing as {name.trim()}.
              </span>
            </label>
          ) : null}
          {needsConsent && consent ? (
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              <span>{consent.text}</span>
            </label>
          ) : null}
          <p className="text-xs text-ink-faint">Typing your name signs it, the same as signing by hand.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !canSign}>
              {busy ? "Signing…" : "Sign"}
            </Button>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => setMode("idle")}>
              Not yet
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "decline" ? (
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-ink-soft">
            {freesDate
              ? `This cancels what ${clientName} signed and opens ${freesDate} up again.`
              : `${clientName}'s booking stays as it was; this document won't apply.`}{" "}
            We&apos;ll email them your reason.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-faint">Why you&apos;re not signing</span>
            <textarea
              value={reason}
              maxLength={500}
              rows={2}
              placeholder="e.g. I'm no longer free that night — sorry!"
              onChange={(e) => setReason(e.target.value)}
              className={field}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !reason.trim()}
              onClick={() => run(() => onDecline(reason.trim()), `Not signed. We've told ${clientName} why.`)}
            >
              {busy ? "Sending…" : "Don't sign"}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => setMode("idle")}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
