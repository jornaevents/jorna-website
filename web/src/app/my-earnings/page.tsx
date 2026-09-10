"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  getEarnings,
  getMyVendor,
  getStripeStatus,
  startStripeOnboarding,
  updateMyVendor,
} from "@/lib/jorna";
import {
  PAYMENT_STATUS_LABELS,
  type Earnings,
  type StripeStatus,
  type VendorDetail,
} from "@/lib/types";
import { paymentsSetup, vendorMoney } from "@/lib/vendorPlan";
import { Button, Card, Field, LinkButton } from "@/components/ui";
import { VendorNav } from "@/components/VendorNav";

function money(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "gold" | "green";
}) {
  const colour =
    tone === "green" ? "text-green" : tone === "gold" ? "text-gold" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`serif mt-1 text-2xl ${colour}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </Card>
  );
}

function EarningsInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Stripe sends the vendor back here after onboarding.
  const justOnboarded = params.get("stripe") === "return";

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The alternative to Stripe, offered right where the Stripe gate already
  // is — a vendor stuck on setup shouldn't have to already know
  // /vendor-profile has a way out.
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [venmoHandle, setVenmoHandle] = useState("");
  const [zelleContact, setZelleContact] = useState("");
  const [savingDirect, setSavingDirect] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/my-earnings");
  }, [authLoading, user, router]);

  const load = useCallback(async (vendorId: string) => {
    // Status is fetched live from Stripe, so returning from onboarding reflects
    // reality without any extra step.
    const [st, earn] = await Promise.all([
      getStripeStatus(vendorId).catch(() => null),
      getEarnings(vendorId).catch(() => null),
    ]);
    setStatus(st);
    setEarnings(earn);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyVendor()
      .then(async (mine) => {
        if (cancelled) return;
        setVendor(mine);
        setVenmoHandle(mine?.venmo_handle ?? "");
        setZelleContact(mine?.zelle_contact ?? "");
        if (mine) await load(mine.vendor_id);
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load your earnings."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, load]);

  async function onboard() {
    if (!vendor) return;
    setBusy(true);
    setError(null);
    try {
      const { onboarding_url } = await startStripeOnboarding(vendor.vendor_id);
      window.location.href = onboarding_url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't start payment setup.",
      );
      setBusy(false);
    }
  }

  async function switchToDirect() {
    if (!vendor) return;
    const trimmedVenmo = venmoHandle.trim();
    const trimmedZelle = zelleContact.trim();
    if (!trimmedVenmo && !trimmedZelle) {
      setDirectError("Add a Venmo handle or Zelle contact so clients know how to pay you.");
      return;
    }
    setSavingDirect(true);
    setDirectError(null);
    try {
      const updated = await updateMyVendor({
        payment_method: "manual",
        venmo_handle: trimmedVenmo || null,
        zelle_contact: trimmedZelle || null,
      });
      setVendor(updated);
      setShowDirectForm(false);
    } catch (err) {
      setDirectError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSavingDirect(false);
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (!vendor) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">
          You&apos;re not selling on Jorna yet
        </h1>
        <LinkButton href="/vendor-profile" className="mt-6">
          Create vendor profile
        </LinkButton>
      </div>
    );
  }

  // Same reading the dashboard and the "Needs you" badge use, so a vendor can't
  // be told two different things about one account.
  const payments = paymentsSetup(status);
  // Only for the derived fee rate; the tiles above read the API's own totals.
  const cash = vendorMoney(earnings);

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <VendorNav />
      <header>
        <span className="eyebrow">Selling</span>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold sm:text-5xl">
          Earnings
        </h1>
      </header>

      {error ? (
        <p className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      {/* Payments setup — the gate on getting paid at all. Stripe's gate has
          nothing to say to a vendor who already chose Direct — they don't
          need it — so that track gets its own ready-state instead of a
          Stripe nag they've deliberately opted out of. */}
      {vendor.payment_method === "manual" ? (
        <p className="mt-6 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">
          You&apos;re set up to get paid directly via Venmo/Zelle — no Stripe needed.
        </p>
      ) : !payments.ready ? (
        <Card className="mt-7 p-6">
          <h2 className="serif text-xl text-ink">
            {justOnboarded ? "Finishing payment setup…" : payments.title}
          </h2>
          <p className="mt-2 text-ink-soft">
            {justOnboarded
              ? "Stripe hasn't confirmed your details yet. If you left anything incomplete, pick up where you left off."
              : payments.detail}
          </p>
          <Button className="mt-4" disabled={busy} onClick={onboard}>
            {busy ? "Opening Stripe…" : payments.cta}
          </Button>

          <div className="mt-6 border-t border-line-soft pt-5">
            {showDirectForm ? (
              <>
                <p className="text-sm font-medium text-ink">Get paid directly instead</p>
                <p className="mt-1 text-xs text-ink-soft">
                  No Stripe, no card fees — clients pay you via Venmo or Zelle, and
                  cancelling loses the protection Stripe gives you today.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Venmo handle"
                    placeholder="@your-business"
                    value={venmoHandle}
                    onChange={(e) => setVenmoHandle(e.target.value)}
                  />
                  <Field
                    label="Zelle contact"
                    placeholder="you@business.com or a phone number"
                    value={zelleContact}
                    onChange={(e) => setZelleContact(e.target.value)}
                  />
                </div>
                {directError ? (
                  <p
                    role="alert"
                    className="mt-2 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold"
                  >
                    {directError}
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button size="md" disabled={savingDirect} onClick={switchToDirect}>
                    {savingDirect ? "Saving…" : "Switch to Direct"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      setShowDirectForm(false);
                      setDirectError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="ghost" size="md" onClick={() => setShowDirectForm(true)}>
                Get paid directly instead (Venmo/Zelle)
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <p className="mt-6 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">
          Payments are set up — you&apos;re ready to be booked and paid.
        </p>
      )}

      {/* Money */}
      {earnings ? (
        <>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Paid out"
              value={money(earnings.total_released_cents)}
              hint="Released to you after the event"
              tone="green"
            />
            <Stat
              label="Held in escrow"
              value={money(earnings.in_escrow_cents)}
              hint="Yours once you and the client confirm"
              tone="gold"
            />
            <Stat
              label="Upcoming"
              value={money(earnings.upcoming_cents)}
              hint={`${earnings.upcoming_count} accepted, not yet paid`}
            />
          </div>

          {earnings.disputed_cents > 0 || earnings.refunded_cents > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {earnings.disputed_cents > 0 ? (
                <Stat
                  label="Under review"
                  value={money(earnings.disputed_cents)}
                  hint="Frozen while a dispute is resolved"
                />
              ) : null}
              {earnings.refunded_cents > 0 ? (
                <Stat
                  label="Refunded"
                  value={money(earnings.refunded_cents)}
                  hint="Returned to the client"
                />
              ) : null}
            </div>
          ) : null}

          {/* Manual track — paid directly, Venmo/Zelle. Self-reported, so kept
              apart from "Paid out" above rather than folded in as if verified. */}
          {earnings.self_reported_cents > 0 || earnings.self_reported_pending_count > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {earnings.self_reported_cents > 0 ? (
                <Stat
                  label="Paid directly"
                  value={money(earnings.self_reported_cents)}
                  hint="Confirmed by you — not through Jorna"
                  tone="green"
                />
              ) : null}
              {earnings.self_reported_pending_count > 0 ? (
                <Stat
                  label="Awaiting your confirmation"
                  value={money(earnings.self_reported_pending_cents)}
                  hint={
                    earnings.self_reported_pending_count === 1
                      ? "1 client says they've paid"
                      : `${earnings.self_reported_pending_count} clients say they've paid`
                  }
                  tone="gold"
                />
              ) : null}
            </div>
          ) : null}

          {/* The rate is derived from what has actually been taken. The API
              publishes no percentage — only a per-booking platform_fee_cents —
              so a hardcoded one would be a guess that goes quietly wrong the
              day it changes, and there's nothing to derive before the first
              booking. */}
          <p className="mt-3 text-xs text-ink-faint">
            Amounts are what reaches you — Jorna&apos;s fee is already deducted
            ({money(earnings.platform_fees_cents)} so far
            {cash?.feePercent != null ? `, ${cash.feePercent}% of gross` : ""}).
          </p>

          <section className="mt-9">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="serif text-2xl text-ink">History</h2>
              {/* Gross, fee, net — the decomposition was on the dashboard, in a
                  card that repeated this list six rows at a time. It belongs on
                  the ledger, and most marketplaces don't show it at all. */}
              <p className="text-xs text-ink-faint">Gross · fee · net</p>
            </div>
            {earnings.history.length === 0 ? (
              <p className="mt-3 text-ink-soft">
                Nothing yet. Payments show up here once a client pays.
              </p>
            ) : (
              <div className="mt-4 grid gap-2">
                {earnings.history.map((h) => (
                  <Card
                    key={h.booking_id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">
                        {h.event_name || "Booking"}
                      </p>
                      <p className="truncate text-xs text-ink-faint">
                        {[
                          h.client_name,
                          h.paid_at ? h.paid_at.slice(0, 10) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="flex items-baseline justify-end gap-1.5 text-sm tabular-nums">
                        <span className="text-ink-faint">
                          {money(h.amount_cents ?? 0)}
                        </span>
                        <span className="text-xs text-ink-faint">−</span>
                        <span className="text-maroon dark:text-gold">
                          {money(h.platform_fee_cents ?? 0)}
                        </span>
                        <span className="text-xs text-ink-faint">=</span>
                        <span className="font-bold text-ink">
                          {money(h.net_cents)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-faint">
                        {PAYMENT_STATUS_LABELS[h.payment_status ?? ""] ??
                          h.payment_status}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function EarningsPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <EarningsInner />
    </Suspense>
  );
}
