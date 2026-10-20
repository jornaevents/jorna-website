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
import { ApiError } from "@jorna/shared/lib/api";
import { ESCROW_ENABLED } from "@jorna/shared/lib/flags";
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
import { useTaxonomy } from "@jorna/shared/lib/taxonomy";
import {
  type ServiceItem,
  type ServicePickNeeded,
  type TaxonomyCategory,
  type VendorDetail,
} from "@/lib/types";
import { Button, Card, LinkButton } from "@jorna/shared/components/ui";
import {
  VendorIdentityFields,
  VendorPaymentFields,
  VendorReachFields,
} from "@/components/VendorProfileFields";
import { ServicesManager } from "@/components/ServicesManager";
import { clientAppUrl } from "@/lib/clientApp";

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
  const [yearsExperience, setYearsExperience] = useState("");
  // Service keys from the taxonomy (backend DECISIONS #35).
  const taxonomy = useTaxonomy();
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [picksNeeded, setPicksNeeded] = useState<ServicePickNeeded[]>([]);

  // Step 2 — reach (plus payment info, since with escrow disabled it's the
  // only payment path and there's otherwise no step that ever asks for it)
  const [radius, setRadius] = useState("");
  const [longDistance, setLongDistance] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "manual">("manual");
  const [venmoHandle, setVenmoHandle] = useState("");
  const [zelleContact, setZelleContact] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/vendor-onboarding&role=vendor");
    }
  }, [authLoading, user, router]);

  // Bumped by the "Try again" button below to re-run the load effect after a
  // failed load, without duplicating the fetch logic.
  const [retryTick, setRetryTick] = useState(0);

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
          // the point of no return rather than after. Fail closed: a network
          // hiccup here must not read as "nothing to check".
          try {
            const bundles = await listBundles();
            if (cancelled) return;
            setStep(hasActiveBookings(bundles) ? "blocked" : "identity");
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof ApiError ? err.message : "Couldn't check your account.");
            }
          }
          return;
        }
        setVendor(mine);
        setBio(mine.bio ?? "");
        setYearsExperience(mine.years_experience?.toString() ?? "");
        setSpecialties(mine.specialties ?? []);
        setPicksNeeded(mine.service_picks_needed ?? []);
        setRadius(mine.travel_radius_miles?.toString() ?? "");
        setLongDistance(Boolean(mine.open_to_long_distance));
        setInstagram(mine.instagram_username ?? "");
        setPaymentMethod(ESCROW_ENABLED ? (mine.payment_method ?? "stripe") : "manual");
        setVenmoHandle(mine.venmo_handle ?? "");
        setZelleContact(mine.zelle_contact ?? "");

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
        // Step 2's one required answer is how they're paid; once that's saved,
        // a reload carries on at the packages (#162 sent them back to step 2).
        const reachDone = ESCROW_ENABLED ? mine.payment_method != null : Boolean(mine.venmo_handle || mine.zelle_contact);
        setStep(reachDone ? "service" : "reach");
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
  }, [user, router, retryTick]);

  function updateSpecialties(next: string[]) {
    setSpecialties(next);
    if (next.length > 0) setError(null);
  }

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (specialties.length === 0) {
      setError("Pick at least one service first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The backend derives category/subcategory and the old pairs from these.
      const payload = {
        bio,
        specialties,
        years_experience: yearsExperience ? Number(yearsExperience) : null,
      };
      if (vendor) {
        // Reached via Back from step 2 — the vendor record already exists, so
        // this edits it instead of trying (and failing) to create a second one.
        const updated = await updateMyVendor(payload);
        setVendor(updated);
        setPicksNeeded(updated.service_picks_needed ?? []);
      } else {
        const created = await createVendor(payload);
        // The account just became a vendor's — nav and ClientOnlyRoute read a
        // 60s-cached answer to "is this a vendor," and this is the one moment
        // that answer actually changes. Without this, the client tabs (and the
        // client-only routes behind them) would still be reachable for up to a
        // minute after this succeeds.
        clearRoleCache();
        setVendor(created);
        // Show the radius the new record starts with, not a blank that a
        // reload would fill in (#162).
        setRadius(created.travel_radius_miles?.toString() ?? "");
      }
      setStep("reach");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your vendor profile.");
    } finally {
      setBusy(false);
    }
  }

  function onPaymentChange(set: (v: string) => void) {
    return (v: string) => {
      set(v);
      if (v.trim()) setError(null);
    };
  }

  async function submitReach(e: React.FormEvent) {
    e.preventDefault();
    const trimmedVenmo = venmoHandle.trim();
    const trimmedZelle = zelleContact.trim();
    if (!ESCROW_ENABLED && !trimmedVenmo && !trimmedZelle) {
      setError("Add a Venmo handle or Zelle contact so clients know how to pay you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMyVendor({
        // Left out when blank: the backend rejects an explicit null (it
        // validates any radius it's sent as 1–500), and blank means "not set".
        ...(radius ? { travel_radius_miles: Number(radius) } : {}),
        open_to_long_distance: longDistance,
        instagram_username: instagram.trim().replace(/^@/, "") || null,
        ...(ESCROW_ENABLED
          ? {}
          : {
              payment_method: paymentMethod,
              venmo_handle: trimmedVenmo || null,
              zelle_contact: trimmedZelle || null,
            }),
      });
      setVendor(updated);
      setStep("service");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (!step) {
    return (
      <div className="py-20 text-center">
        <p role="alert" className="text-ink-soft">
          {error ?? "Couldn't load your profile."}
        </p>
        <Button
          type="button"
          className="mt-4"
          onClick={() => {
            setError(null);
            setLoading(true);
            setRetryTick((t) => t + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const stepNumber = STEP_NUMBER[step];

  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-14">
      {step === "reach" || step === "service" ? (
        <button
          type="button"
          onClick={() => setStep(step === "reach" ? "identity" : "reach")}
          className="text-sm text-ink-soft hover:text-ink"
        >
          ← Back
        </button>
      ) : null}

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
            You have an open request, an upcoming booking, or a payment still
            settling. An account can only be a client or a seller, not both — wrap
            that up (or wait for it to settle) before switching to a seller
            account.
          </p>
          <div className="mt-8">
            <LinkButton href={clientAppUrl("/bundles")} size="lg">
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
                taxonomy={taxonomy}
                specialties={specialties}
                picksNeeded={picksNeeded}
                bio={bio}
                onSpecialtiesChange={updateSpecialties}
                onBioChange={setBio}
                yearsExperience={yearsExperience}
                onYearsExperienceChange={setYearsExperience}
              />
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold"
                >
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
            How far you go, and how you&apos;re paid
          </h1>
          <p className="mt-2 text-center text-ink-soft">
            {ESCROW_ENABLED
              ? "Your travel radius helps clients searching by distance find you. Both are optional."
              : "Your travel radius helps clients searching by distance find you. How clients pay you is the one thing we need."}
          </p>
          <Card className="mt-8 p-6">
            <form onSubmit={submitReach} className="grid gap-4">
              <VendorReachFields
                radius={radius}
                longDistance={longDistance}
                instagram={instagram}
                onRadiusChange={setRadius}
                onLongDistanceChange={setLongDistance}
                onInstagramChange={setInstagram}
              />
              {!ESCROW_ENABLED ? (
                <div className="mt-2 border-t border-line-soft pt-4">
                  <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                    How clients pay you
                  </span>
                  <VendorPaymentFields
                    paymentMethod={paymentMethod}
                    venmoHandle={venmoHandle}
                    zelleContact={zelleContact}
                    onPaymentMethodChange={setPaymentMethod}
                    onVenmoHandleChange={onPaymentChange(setVenmoHandle)}
                    onZelleContactChange={onPaymentChange(setZelleContact)}
                  />
                </div>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold"
                >
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
            A price and a photo are what make a listing worth stopping for.
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
          ) : (
            // No "I'll add packages later": the vendor pages wait for a first
            // package (#162, decided 2026-10-14), so there'd be nowhere to go.
            <p className="mt-6 text-center text-sm text-ink-faint">
              Your vendor pages open once your first package is saved.
            </p>
          )}
        </>
      ) : null}

      {step === "done" ? (
        <div className="py-10 text-center">
          <p className="eyebrow">You&apos;re set up</p>
          <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">
            {ESCROW_ENABLED ? "Two more things get you booked" : "One more thing gets you booked"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">
            {ESCROW_ENABLED
              ? "Without payment setup, you can be booked but never paid. Without weekly hours, clients searching by date won't find you. Both take a few minutes."
              : "Without weekly hours, clients searching by date won't find you — takes a few minutes."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {ESCROW_ENABLED ? (
              <LinkButton href="/my-earnings" size="lg">
                Set up payments
              </LinkButton>
            ) : null}
            <LinkButton href="/vendor-profile" variant={ESCROW_ENABLED ? "ghost" : "primary"} size="lg">
              Set weekly hours
            </LinkButton>
          </div>
          <div className="mt-4">
            <LinkButton href="/vendor-profile" variant="quiet" size="md">
              Go to your listing
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
