"use client";

// Deleting the account, at the foot of Settings. Irreversible,
// so it asks twice and says what goes — a button that only says "Delete
// account" leaves the client to guess whether their bookings survive it.

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { deleteMe } from "@/lib/jorna";
import { disableWebPushForThisDevice } from "@jorna/shared/lib/push";
import type { VendorDetail } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";

/** `vendor`: this account's vendor profile, or null if it has none — the
 *  confirmation names what goes with it. */
export function DeleteAccountSection({ vendor, className = "" }: { vendor: VendorDetail | null; className?: string }) {
  const { user, logout } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      // Same order as signing out: the push token needs a live session to
      // unregister, and after this there won't be one.
      await disableWebPushForThisDevice(user!.user_id);
      await deleteMe();
      logout("/home");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-2xl border border-maroon/30 bg-maroon/[0.04] p-5 dark:border-gold/25 dark:bg-gold/[0.04] ${className}`}
    >
      <h2 className="serif text-lg text-ink">Delete your account</h2>

      {confirmDelete ? (
        <>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-soft">
            This removes your account, your celebrations and every booking on
            them{vendor ? ", along with your vendor profile, packages and hours" : ""}.
            Vendors you&apos;ve booked lose the request too. It cannot be undone
            and there is no way to get any of it back.
          </p>
          {error ? (
            <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
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
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => setConfirmDelete(true)}
          >
            Delete account
          </Button>
        </>
      )}
    </section>
  );
}
