"use client";

// Moving a plan that is already with its vendors.
//
// Their date is theirs to hold once they've agreed to it, so this is a request
// rather than an edit — and a request every vendor answers separately, because
// a wedding moving takes all of them with it but one being unable to come
// shouldn't veto a move the client still wants.
//
// Nothing here charges or refunds anything. The backend moves money only when a
// request resolves, which is what lets this be proposed freely.

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  consentToChangePrice,
  proposeChange,
  refundAfterFailedReschedule,
  withdrawChange,
} from "@/lib/jorna";
import {
  CHANGE_RESPONSE_DAYS,
  RESCHEDULE_CANCELLATION_PCT,
  awaitingClientConsent,
  type BundleBooking,
  type ChangeRequest,
} from "@/lib/types";
import { isDeadBooking } from "@/lib/planning";
import { Button, Card, Field } from "@/components/ui";

function money(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * There's one clock for the whole request, not one for the vendor's answer
 * and a fresh one for the client's consent — a vendor who takes 5 of the 7
 * days to accept-with-reprice leaves the client 2, not another 7. So this
 * reads the same `expires_at` regardless of which side is currently up.
 */
function expiryLabel(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 0) return "Expires today";
  if (days === 1) return "1 day left to answer";
  return `${days} days left to answer`;
}

/** How a single vendor has answered, in a word and a colour. */
function verdict(cr: ChangeRequest): { text: string; tone: string } {
  if (awaitingClientConsent(cr)) {
    return { text: "Costs more — needs you", tone: "text-gold" };
  }
  switch (cr.status) {
    case "accepted":
      return { text: "Moved", tone: "text-green" };
    case "declined":
      return { text: "Can't make it", tone: "text-maroon dark:text-gold" };
    case "expired":
      return { text: "No answer", tone: "text-ink-faint" };
    case "withdrawn":
      return { text: "Withdrawn", tone: "text-ink-faint" };
    default:
      return { text: "Waiting", tone: "text-ink-soft" };
  }
}

export function DateChangePanel({
  bundleId,
  bookings,
  onChanged,
}: {
  bundleId: string;
  bookings: BundleBooking[];
  onChanged: () => void | Promise<void>;
}) {
  const [proposing, setProposing] = useState(false);
  const [date, setDate] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = bookings.filter((b) => !isDeadBooking(b));
  // Every booking's own request. The plan-wide proposal fans out to one each,
  // so the board is just the live bookings that have one.
  const withRequests = live.filter((b) => b.change_request);
  const outstanding = withRequests.filter(
    (b) => b.change_request?.status === "pending",
  );
  const anyOpen = outstanding.length > 0;
  // "Pending" covers two very different waits — a vendor hasn't answered yet,
  // or a vendor already has and it's the client who owes a click (and a
  // charge). Conflating them told a client to sit tight on a request that was
  // actually theirs to finish.
  const needingConsent = outstanding.filter((b) => awaitingClientConsent(b.change_request!));
  const anyNeedsConsent = needingConsent.length > 0;

  // Only bookings a vendor has actually agreed to can be asked to move. The
  // server says the same, so offering it more widely would only earn a refusal.
  const movable = live.filter(
    (b) => b.status === "approved" || b.status === "payment_confirmed",
  );
  if (movable.length === 0 && withRequests.length === 0) return null;

  async function run(what: string, fn: () => Promise<unknown>) {
    setBusy(what);
    setError(null);
    try {
      await fn();
      setProposing(false);
      setDate("");
      setDateEnd("");
      setTimeStart("");
      setTimeEnd("");
      setNote("");
      await onChanged();
    } catch (err) {
      // The server's own wording, always. On a clash it names the booking the
      // vendor already has, which is the thing they need to know.
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="serif text-lg text-ink">
            {anyNeedsConsent
              ? "A vendor needs your approval"
              : anyOpen
                ? "Waiting on your vendors"
                : "Need to move the date?"}
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-ink-soft">
            {anyNeedsConsent
              ? `The new date costs more for ${needingConsent.length === 1 ? "one vendor" : `${needingConsent.length} vendors`} — approve the new price below to lock in the move. Nothing is charged until you do, but it doesn't happen on its own either.`
              : anyOpen
                ? `Each vendor answers for themselves. They have ${CHANGE_RESPONSE_DAYS} days — nothing is charged or refunded until they do.`
                : `Your vendors hold this date, so moving it is something they agree to rather than something you can change. Ask them all at once; each answers for themselves.`}
          </p>
        </div>
        {!anyOpen && !proposing ? (
          <Button variant="ghost" size="md" onClick={() => setProposing(true)}>
            Propose a new date
          </Button>
        ) : null}
        {anyOpen ? (
          <Button
            variant="quiet"
            size="md"
            disabled={busy !== null}
            onClick={() => run("withdraw", () => withdrawChange(bundleId))}
          >
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </Button>
        ) : null}
      </div>

      {proposing ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="New date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Field
              label="Last day (if it runs across several)"
              type="date"
              min={date || undefined}
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
            <Field
              label="Starts (optional)"
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
            />
            <Field
              label="Ends (optional)"
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
            />
          </div>
          <div className="mt-3">
            <Field
              label="Anything they should know (optional)"
              placeholder="The venue flooded — we've had to move the whole weekend."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {/* Said before it happens. A per-day or per-hour booking costs a
              different amount on different dates, and a client should know that
              before they ask rather than when the bill changes. */}
          <p className="mt-3 text-xs text-ink-faint">
            Nothing is charged or refunded by asking. If a vendor accepts and the
            new dates cost more, we&apos;ll check with you before charging
            anything; if they cost less, the difference comes back. A vendor who
            can&apos;t make it leaves your booking exactly as it is — you can keep
            it, or take a refund less a {RESCHEDULE_CANCELLATION_PCT}% cancellation
            fee for the date they held.
          </p>
          {error ? (
            <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={busy !== null || (!date && !timeStart && !timeEnd)}
              onClick={() =>
                run("propose", () =>
                  proposeChange(bundleId, {
                    date_iso: date || null,
                    date_end: dateEnd || null,
                    time_start: timeStart || null,
                    time_end: timeEnd || null,
                    message: note.trim() || null,
                  }),
                )
              }
            >
              {busy === "propose"
                ? "Asking…"
                : `Ask ${movable.length} ${movable.length === 1 ? "vendor" : "vendors"}`}
            </Button>
            <Button variant="ghost" onClick={() => setProposing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {withRequests.length > 0 ? (
        <div className="mt-4 border-t border-line-soft pt-3">
          {(() => {
            const sample = withRequests[0].change_request;
            const to = prettyDate(sample?.date_iso);
            return to ? (
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
                Moving to {to}
                {sample?.date_end && sample.date_end !== sample.date_iso
                  ? ` – ${prettyDate(sample.date_end)}`
                  : ""}
              </p>
            ) : null;
          })()}
          <ul className="grid gap-2">
            {withRequests.map((b) => {
              const cr = b.change_request!;
              const v = verdict(cr);
              const needsConsent = awaitingClientConsent(cr);
              const canRefund =
                (cr.status === "declined" || cr.status === "expired") &&
                (b.payment_status === "paid" || b.payment_status === "processing");
              return (
                <li
                  key={b.booking_id}
                  className="rounded-xl bg-panel px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-ink">
                      {b.service_name || "Package"}
                      <span className="text-ink-faint"> · {b.vendor_name}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${v.tone}`}>
                      {v.text}
                    </span>
                  </div>

                  {cr.response_message ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      “{cr.response_message}”
                    </p>
                  ) : null}

                  {needsConsent ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-soft">
                        {money(cr.repriced_amount_cents!)} on the new dates —{" "}
                        {money(cr.repriced_amount_cents! - (b.price ?? 0) * 100)} more.
                      </span>
                      <Button
                        size="md"
                        disabled={busy !== null}
                        onClick={() =>
                          run(cr.change_request_id, () =>
                            consentToChangePrice(cr.change_request_id),
                          )
                        }
                      >
                        {busy === cr.change_request_id ? "Confirming…" : "Approve & move"}
                      </Button>
                      {expiryLabel(cr.expires_at) ? (
                        <span className="w-full text-xs text-gold">
                          {expiryLabel(cr.expires_at)} — after that this vendor keeps the
                          original date.
                        </span>
                      ) : null}
                    </div>
                  ) : cr.status === "pending" && expiryLabel(cr.expires_at) ? (
                    <p className="mt-1 text-xs text-ink-faint">{expiryLabel(cr.expires_at)}</p>
                  ) : null}

                  {canRefund ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-soft">
                        Keep it as booked, or take a refund less{" "}
                        {RESCHEDULE_CANCELLATION_PCT}%.
                      </span>
                      <Button
                        variant="ghost"
                        size="md"
                        disabled={busy !== null}
                        onClick={() =>
                          run(b.booking_id, () =>
                            refundAfterFailedReschedule(b.booking_id),
                          )
                        }
                      >
                        {busy === b.booking_id ? "Refunding…" : "Refund this one"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {error && !proposing ? (
            <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
