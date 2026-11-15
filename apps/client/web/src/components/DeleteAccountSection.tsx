"use client";

// Deleting the account (moved from the old profile hub to Account, client
// redesign PR 8). Irreversible, so it checks what would be lost first, asks
// twice and says what goes.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { deleteMe, listBundles } from "@/lib/jorna";
import { moneyForBundle } from "@/lib/planning";
import { disableWebPushForThisDevice } from "@jorna/shared/lib/push";
import { eventIsOver } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check the account is safe to delete before offering to.
   *
   * DELETE /me removes every booking on the account outright, escrow and all —
   * and deleting a booking doesn't return its money, it only destroys the record
   * of where the money went. Deleting a single *plan* is refused for exactly
   * this reason; the account is the same plans and the same money, so it is
   * refused here too.
   *
   * Only the buyer's side: a vendor account never reaches this page (see
   * VendorAccountGate) — its own check, for money owed *to* it, lives on
   * jornaevents.com.
   *
   * Checked when they ask rather than on page load: it costs a request, and
   * nearly everyone opening this page is here for something else.
   *
   * The backend does not enforce this. If the check can't be made, the deletion
   * isn't offered — better a client who has to try again than one whose escrow
   * quietly vanished because a request timed out.
   */
  async function startDelete() {
    setBusy(true);
    setError(null);
    try {
      const bundles = await listBundles();
      const boughtHeld = bundles.reduce((sum, b) => {
        const cash = moneyForBundle(b);
        return sum + cash.inEscrow + cash.strandedInEscrow;
      }, 0);

      // The backend refuses these too: until its event is over, a signed
      // contract is both sides' record. Asked here so the answer comes
      // before the confirmation. Same "over" as escrow — the last day, at the
      // venue; no date yet counts as ahead.
      const ahead = bundles
        .flatMap((b) => b.bookings ?? [])
        .filter((b) => b.contract_token && b.signed_at && !eventIsOver(b));
      if (ahead.length > 0) {
        const one = ahead.length === 1;
        setError(
          `You have ${one ? "a signed contract" : `${ahead.length} signed contracts`} for ${one ? "an event that hasn't" : "events that haven't"} happened yet, so your account can't be deleted until ${one ? "it's" : "they're"} over — ${one ? "it's" : "they're"} the record of what you and your ${one ? "vendor" : "vendors"} agreed.`,
        );
        return;
      }
      if (boughtHeld > 0) {
        setError(
          `${money(boughtHeld)} you've paid is still held in escrow — release it to the vendor, request a refund, or report a problem on those bookings before deleting. Deleting your account wouldn't return this money — it would only remove the record of where it went.`,
        );
        return;
      }
      setConfirmDelete(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Couldn't check your bookings first (${err.message}), so nothing was deleted. Try again in a moment.`
          : "Couldn't check your bookings first, so nothing was deleted. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      // Same order as signing out: the push token needs a live session to
      // unregister, and after this there won't be one.
      await disableWebPushForThisDevice(user!.user_id);
      await deleteMe();
      logout();
      router.replace("/home");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.",
      );
      setBusy(false);
    }
  }

  return (
      <section className="rounded-2xl border border-maroon/30 bg-maroon/[0.04] p-5">
        <h2 className="serif text-lg text-ink">Delete your account</h2>

        {confirmDelete ? (
          <>
            <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
              This removes your account, your celebrations and every booking on
              them.
              Vendors you&apos;ve booked lose the request too. It cannot be undone
              and there is no way to get any of it back.
            </p>
            {error ? (
              <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Delete my account permanently"}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setConfirmDelete(false);
                  setError(null);
                }}
              >
                Keep my account
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
              Permanently removes your account and everything on it. There&apos;s
              no undo.
            </p>
            {error ? (
              <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
                {error}
              </p>
            ) : null}
            <Button
              variant="ghost"
              className="mt-4"
              disabled={busy}
              onClick={startDelete}
            >
              {busy ? "Checking…" : "Delete account"}
            </Button>
          </>
        )}
      </section>
  );
}
