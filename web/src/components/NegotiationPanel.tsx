"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  acceptOffer,
  counterOffer,
  getNegotiation,
  rejectOffer,
  startNegotiation,
} from "@/lib/jorna";
import type { Negotiation } from "@/lib/types";
import { Button } from "./ui";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Price negotiation for one booking — works for either party.
 *
 * It's turn-based: `proposed_by` is whoever made the current offer, and only the
 * other party can counter or accept (the backend enforces this). Accepting sets
 * the booking's price and approves it, so the parent refreshes via onSettled.
 */
export function NegotiationPanel({
  bookingId,
  listedPrice,
  onSettled,
}: {
  bookingId: string;
  /** The current listed price (dollars), used as the offer field's starting point. */
  listedPrice: number;
  onSettled?: () => void;
}) {
  const { user } = useAuth();
  const [neg, setNeg] = useState<Negotiation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOffer, setShowOffer] = useState(false);
  const [amount, setAmount] = useState<string>("");
  // Both endpoints have always accepted a message and this panel never sent
  // one, so the only channel that could carry "we'd do $2,800 if you drop the
  // second shooter" discarded it — leaving a bare number to be accepted or
  // refused with no way to say why either way.
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setNeg(await getNegotiation(bookingId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the negotiation.");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  // Initial load, plus a poll and a refetch-on-return so a turn taken while
  // this tab was in the background (or just sitting open) shows up without a
  // manual reload. There's no live socket for negotiations the way chat has
  // one, so this mirrors conversation/page.tsx's poll fallback rather than
  // its socket.
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 8000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  async function run(action: () => Promise<Negotiation>, settled = false) {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      setNeg(updated);
      setShowOffer(false);
      setAmount("");
      if (settled) onSettled?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function submitOffer() {
    const cents = Math.round(Number(amount) * 100);
    if (!(cents > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const words = note.trim() || undefined;
    void run(() =>
      neg
        ? counterOffer(neg.negotiation_id, cents, words)
        : startNegotiation(bookingId, cents, words),
    );
  }

  if (loading) return null;

  const mineIsCurrent = neg != null && neg.proposed_by === user?.user_id;
  const status = neg?.status ?? "none";

  return (
    <div className="rounded-lg bg-panel p-3">
      {status === "accepted" ? (
        <p className="text-xs text-green">
          Agreed at {money(neg!.current_offer_cents)}. The booking is approved at
          that price.
        </p>
      ) : status === "rejected" ? (
        <p className="text-xs text-ink-faint">Negotiation closed.</p>
      ) : (
        <>
          {neg ? (
            <div className="mb-2">
              <p className="text-xs text-ink-soft">
                Current offer{" "}
                <span className="font-semibold text-ink">
                  {money(neg.current_offer_cents)}
                </span>{" "}
                — {mineIsCurrent ? "you" : neg.proposed_by_name || "the other party"}
              </p>
              {/* The offers have always been on the payload and nothing ever
                  rendered them, so a haggle was a single number with no memory
                  of how it got there — and any reason either side gave was
                  invisible even when it had been sent. */}
              {neg.offers && neg.offers.length > 1 ? (
                <ul className="mt-2 grid gap-1 border-l-2 border-line-soft pl-2.5">
                  {neg.offers.map((o, i) => (
                    <li key={o.offer_id ?? i} className="text-xs text-ink-faint">
                      <span className="font-medium text-ink-soft">
                        {o.proposed_by === user?.user_id
                          ? "You"
                          : o.proposed_by_name || "They"}
                      </span>{" "}
                      offered{" "}
                      <span className="tabular-nums">{money(o.amount_cents)}</span>
                      {o.message ? <span> — “{o.message}”</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {showOffer || !neg ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-ink-faint">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={String(listedPrice)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-28 rounded-lg border border-card-edge bg-ground-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-gold"
                  />
                </div>
                <Button size="md" disabled={busy} onClick={submitOffer}>
                  {busy ? "Sending…" : neg ? "Counter" : "Send offer"}
                </Button>
                {neg ? (
                  <Button variant="ghost" size="md" onClick={() => setShowOffer(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why? (optional) — e.g. we'd drop the second shooter"
                className="w-full rounded-lg border border-card-edge bg-ground-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-gold"
              />
            </div>
          ) : mineIsCurrent ? (
            <p className="text-xs text-ink-faint">
              Waiting for {neg.proposed_by_name || "the other party"} to respond.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="md"
                disabled={busy}
                onClick={() => void run(() => acceptOffer(neg!.negotiation_id), true)}
              >
                {busy ? "…" : `Accept ${money(neg!.current_offer_cents)}`}
              </Button>
              <Button variant="ghost" size="md" onClick={() => setShowOffer(true)}>
                Counter
              </Button>
              <Button
                variant="quiet"
                size="md"
                disabled={busy}
                onClick={() => void run(() => rejectOffer(neg!.negotiation_id))}
              >
                Decline
              </Button>
            </div>
          )}
        </>
      )}

      {error ? <p className="mt-2 text-xs text-maroon dark:text-gold">{error}</p> : null}
    </div>
  );
}
