"use client";

// First-time vendor setup, as a sequence rather than a settings page.
//
// /vendor-profile used to do this too — a bio-only "create" form that, once
// submitted, revealed a newly-required category field the vendor hadn't been
// asked for. This page asks for everything in order instead, one save per
// step, and is resumable: reloading mid-setup picks up wherever the vendor's
// own record says they got to. /vendor-profile now assumes setup is already
// done and redirects here if it isn't — see that page for the "done" test
// this one shares (a vendor with at least one service is done, no matter what
// else is unset, since an unpriced radius doesn't stop a booking and a
// missing service does).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  createVendor,
  getMyVendor,
  listBundles,
  listServices,
  listVendorCategories,
  updateMyVendor,
} from "@/lib/jorna";
import { hasActiveBookings } from "@/lib/planning";
import { clearRoleCache } from "@/lib/role";
import {
  vendorSpecializations,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
  type VendorSpecialization,
} from "@/lib/types";
import { Button, Card, LinkButton } from "@/components/ui";
import { VendorIdentityFields, VendorReachFields } from "@/components/VendorProfileFields";
import { ServicesManager } from "@/components/ServicesManager";

type Step = "blocked" | "identity" | "reach" | "service" | "done";

// Only the steps that actually count toward "Step N of 3" — "blocked" and
// "done" are both terminal states, not a position in the sequence.
const STEP_NUMBER: Partial<Record<Step, number>> = { identity: 1, reach: 2, service: 3 };

export default function VendorOnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Null until the initial fetch decides where to resume — rendering nothing
  // for a step until then avoids a flash of "step 1" for a vendor who's
  // actually further along.
  const [step, setStep] = useState<Step | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the first service in this session is saved, so the "done for
  // now" action only appears once there's something to finish with — before
  // that, ServicesManager's own form is the only thing on screen.
  const [addedService, setAddedService] = useState(false);

  // Step 1 — identity
  const [bio, setBio] = useState("");
  const [specializations, setSpecializations] = useState<VendorSpecialization[]>([]);

  // Step 2 — reach
  const [radius, setRadius] = useState("");
  const [longDistance, setLongDistance] = useState(false);
  const [locationNegotiable, setLocationNegotiable] = useState(false);
  const [instagram, setInstagram] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/vendor-onboarding");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listVendorCategories(), getMyVendor()])
      .then(async ([tax, mine]) => {
        if (cancelled) return;
        setCategories(tax.categories);
        if (!mine) {
          // An account is one or the other (see ClientOnlyRoute) — converting
          // out from under an open request or an escrowed booking would strand
          // it with no client nav left to manage that from, so check before
          // the point of no return rather than after.
          const bundles = await listBundles().catch(() => []);
          if (cancelled) return;
          setStep(hasActiveBookings(bundles) ? "blocked" : "identity");
          return;
        }
        setVendor(mine);
        setBio(mine.bio ?? "");
        setSpecializations(vendorSpecializations(mine));
        setRadius(mine.travel_radius_miles?.toString() ?? "");
        setLongDistance(Boolean(mine.open_to_long_distance));
        setLocationNegotiable(Boolean(mine.open_to_price_negotiation));
        setInstagram(mine.instagram_username ?? "");

        const svc = await listServices({ vendor_id: mine.vendor_id, limit: 100 }).catch(
          () => null,
        );
        if (cancelled) return;
        if (svc?.items.length) {
          // Already bookable — nothing left for this page to do. A radius or
          // Instagram they skipped isn't unfinished setup, it's a setting;
          // /vendor-profile is where settings live once there's a listing.
          router.replace("/vendor-profile");
          return;
        }
        if (svc) setServices(svc.items);
        setStep("reach");
      })
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof ApiError ? err.message : "Couldn't load your profile."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (specializations.length === 0) {
      setError("Pick at least one category first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [primary] = specializations;
      const created = await createVendor({
        bio,
        category: primary.category,
        subcategory: primary.subcategory ?? undefined,
        specializations,
      });
      // The account just became a vendor's — nav and ClientOnlyRoute read a
      // 60s-cached answer to "is this a vendor," and this is the one moment
      // that answer actually changes. Without this, the client tabs (and the
      // client-only routes behind them) would still be reachable for up to a
      // minute after this succeeds.
      clearRoleCache();
      setVendor(created);
      setStep("reach");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your vendor profile.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReach(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMyVendor({
        travel_radius_miles: radius ? Number(radius) : null,
        open_to_long_distance: longDistance,
        open_to_price_negotiation: locationNegotiable,
        instagram_username: instagram.trim().replace(/^@/, "") || null,
      });
      setVendor(updated);
      setStep("service");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user || loading || !step) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const stepNumber = STEP_NUMBER[step];

  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-14">
      {stepNumber ? (
        <>
          <p className="eyebrow text-center">Step {stepNumber} of 3</p>
          <div className="mx-auto mt-3 flex max-w-xs gap-1.5" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 flex-1 rounded-full ${
                  n <= stepNumber ? "bg-gold" : "bg-line-soft"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}

      {step === "blocked" ? (
        <div className="py-10 text-center">
          <p className="eyebrow">One thing first</p>
          <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">
            Finish up as a client first
          </h1>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">
            You have an open request, an upcoming booking, or money still in
            escrow. An account can only be a client or a seller, not both — wrap
            that up (or wait for it to settle) before switching to a seller
            account.
          </p>
          <div className="mt-8">
            <LinkButton href="/bundles" size="lg">
              Go to your celebrations
            </LinkButton>
          </div>
        </div>
      ) : null}

      {step === "identity" ? (
        <>
          <h1 className="serif mt-5 text-center text-4xl text-maroon dark:text-gold">
            What do you sell?
          </h1>
          <p className="mt-2 text-center text-ink-soft">
            So clients know who they&apos;re booking.
          </p>
          <Card className="mt-8 p-6">
            <form onSubmit={submitIdentity} className="grid gap-4">
              <VendorIdentityFields
                categories={categories}
                specializations={specializations}
                bio={bio}
                onSpecializationsChange={setSpecializations}
                onBioChange={setBio}
              />
              {error ? (
                <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Saving…" : "Continue"}
              </Button>
            </form>
          </Card>
        </>
      ) : null}

      {step === "reach" ? (
        <>
          <h1 className="serif mt-5 text-center text-4xl text-maroon dark:text-gold">
            Where do you work?
          </h1>
          <p className="mt-2 text-center text-ink-soft">
            Helps clients searching by distance find you. Both optional — skip
            them if you&apos;re not sure yet.
          </p>
          <Card className="mt-8 p-6">
            <form onSubmit={submitReach} className="grid gap-4">
              <VendorReachFields
                radius={radius}
                longDistance={longDistance}
                locationNegotiable={locationNegotiable}
                instagram={instagram}
                onRadiusChange={setRadius}
                onLongDistanceChange={setLongDistance}
                onLocationNegotiableChange={setLocationNegotiable}
                onInstagramChange={setInstagram}
              />
              {error ? (
                <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Saving…" : "Continue"}
              </Button>
            </form>
          </Card>
        </>
      ) : null}

      {step === "service" && vendor ? (
        <>
          <h1 className="serif mt-5 text-center text-4xl text-maroon dark:text-gold">
            List your packages
          </h1>
          <p className="mt-2 text-center text-ink-soft">
            What clients can book — add one for every specialty from step 1.
            A price and a photo are what makes a listing worth scrolling past.
          </p>
          <div className="mt-8">
            <ServicesManager
              vendor={vendor}
              categories={categories}
              initial={services}
              autoStartNew
              onServiceAdded={() => setAddedService(true)}
            />
          </div>
          {addedService ? (
            <div className="mt-8 text-center">
              <Button type="button" size="lg" onClick={() => setStep("done")}>
                Done for now
              </Button>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
                Add more anytime from your listing — one per specialty is what
                gets you found in each.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {step === "done" ? (
        <div className="py-10 text-center">
          <p className="eyebrow">You&apos;re live</p>
          <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">
            Clients can find you now
          </h1>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">
            One thing left: without payment setup, you can be booked but never
            paid — it takes a few minutes with Stripe.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/my-earnings" size="lg">
              Set up payments
            </LinkButton>
            <LinkButton href="/vendor-profile" variant="ghost" size="lg">
              Go to your listing
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
