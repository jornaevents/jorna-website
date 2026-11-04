"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { deleteMe, listBundles } from "@/lib/jorna";
import { moneyForBundle } from "@/lib/planning";
import { disableWebPushForThisDevice } from "@jorna/shared/lib/push";
import { vendorSiteUrl, signInUrl } from "@/lib/vendorSite";
import { eventIsOver } from "@/lib/types";
import { Button, Card } from "@jorna/shared/components/ui";

// Dollars, like everything in MoneyBreakdown — those sums are booking.price,
// not the cents the Stripe fields carry.
function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function Row({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-card-edge bg-card px-4 py-3 transition hover:border-gold/50"
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-faint">{sub}</span>
      </span>
      <span className="text-ink-faint">›</span>
    </Link>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
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

  useEffect(() => {
    if (!authLoading && !user) window.location.replace(signInUrl("/profile"));
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const name = [user.f_name, user.l_name].filter(Boolean).join(" ") || user.username;

  return (
    <div className="mx-auto w-[min(var(--container-page),100%-2rem)] py-10">
      <header className="flex items-center gap-4">
        {user.pfp_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.pfp_url} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-panel serif text-2xl text-gold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="serif text-3xl text-maroon dark:text-gold">{name}</h1>
          <p className="text-sm text-ink-soft">{user.email}</p>
        </div>
        <Link
          href="/account"
          className="shrink-0 text-sm font-semibold text-gold hover:underline"
        >
          Settings
        </Link>
      </header>

      {/* Planning side — everyone has this */}
      <section className="mt-8">
        <p className="eyebrow mb-3">Your celebrations</p>
        <div className="grid gap-2">
          <Row href="/activity" title="Needs you" sub="Everything waiting on you, in one place" />
          <Row href="/bundles" title="Dashboard" sub="Your celebrations and what each still needs" />
          <Row href="/marketplace" title="Browse vendors" sub="Find and book more" />
          <Row href="/blocked" title="Blocked" sub="People you've blocked" />
        </div>
      </section>

      {/* Selling side */}
      <section className="mt-8">
        <p className="eyebrow mb-3">Selling</p>
        {/* Selling is a different app — see VendorAccountGate. */}
        <Card className="p-5">
          <p className="text-sm text-ink-soft">
            Offer your packages on Jorna — get discovered by people who are
            actively planning. Vendors sign up and work on jornaevents.com.
          </p>
          <a
            href={vendorSiteUrl("/login?mode=register&role=vendor")}
            className="mt-4 inline-flex items-center rounded-full bg-maroon px-5 py-2.5 font-semibold text-ground hover:brightness-110"
          >
            Start selling
          </a>
        </Card>
      </section>

      <div className="mt-10">
        <Button
          variant="ghost"
          onClick={async () => {
            // Unregister this browser's push token first — needs the session
            // still valid — so a shared computer stops pinging after sign-out.
            await disableWebPushForThisDevice(user.user_id);
            logout();
          }}
        >
          Sign out
        </Button>
      </div>

      {/* Deleting the account, last and on its own. Irreversible, so it asks
          twice and says what goes — a button that only says "Delete account"
          leaves the client to guess whether their bookings survive it. */}
      <section className="mt-12 rounded-2xl border border-maroon/30 bg-maroon/[0.04] p-5 dark:border-gold/25 dark:bg-gold/[0.04]">
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
            {error ? (
              <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
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
    </div>
  );
}
