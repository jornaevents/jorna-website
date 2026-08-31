"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  getMyVendor,
  getVendorReviews,
  listServices,
  listVendorCategories,
  updateMyVendor,
} from "@/lib/jorna";
import {
  vendorSpecializations,
  type Review,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
  type VendorSpecialization,
} from "@/lib/types";
import { Button, Card, LinkButton, Stars } from "@/components/ui";
import { VendorNav } from "@/components/VendorNav";
import { ServicesManager } from "@/components/ServicesManager";
import { VendorIdentityFields, VendorReachFields } from "@/components/VendorProfileFields";

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function VendorProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Form
  const [bio, setBio] = useState("");
  const [specializations, setSpecializations] = useState<VendorSpecialization[]>([]);
  const [radius, setRadius] = useState("");
  const [longDistance, setLongDistance] = useState(false);
  const [locationNegotiable, setLocationNegotiable] = useState(false);
  const [instagram, setInstagram] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/vendor-profile&role=vendor");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listVendorCategories(), getMyVendor()])
      .then(async ([tax, mine]) => {
        if (cancelled) return;
        setCategories(tax.categories);
        if (!mine) {
          // Setup isn't done — that's /vendor-onboarding's job now, not a
          // bare-bones form on this page. See that page for why "has a
          // vendor record" alone isn't quite the test it uses for "done";
          // this redirect only needs the coarser "not started at all" case.
          router.replace("/vendor-onboarding");
          return;
        }
        setVendor(mine);
        setBio(mine.bio ?? "");
        setSpecializations(vendorSpecializations(mine));
        setRadius(mine.travel_radius_miles?.toString() ?? "");
        setLongDistance(Boolean(mine.open_to_long_distance));
        setLocationNegotiable(Boolean(mine.open_to_price_negotiation));
        setInstagram(mine.instagram_username ?? "");
        // Both best-effort: the profile stays editable when either fails.
        const [r, svc] = await Promise.all([
          getVendorReviews(mine.vendor_id).catch(() => null),
          listServices({ vendor_id: mine.vendor_id, limit: 100 }).catch(() => null),
        ]);
        if (cancelled) return;
        if (r) setReviews(r.items);
        if (svc) setServices(svc.items);
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load your profile."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  function updateSpecializations(next: VendorSpecialization[]) {
    setSpecializations(next);
    if (next.length > 0) setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (specializations.length === 0) {
      setError("Pick at least one category first.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const [primary] = specializations;
      const updated = await updateMyVendor({
        bio,
        category: primary.category,
        subcategory: primary.subcategory ?? null,
        specializations,
        travel_radius_miles: radius ? Number(radius) : null,
        open_to_long_distance: longDistance,
        open_to_price_negotiation: locationNegotiable,
        instagram_username: instagram.trim().replace(/^@/, "") || null,
      });
      setVendor(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user || loading || !vendor) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <VendorNav />
      {/* Everything a client sees, in one place: what you sell, who you are,
          and what people have said. Services used to be a page of their own,
          so setting up meant finding two — and neither was the whole listing. */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="eyebrow">Selling</span>
          <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">Your listing</h1>
          <p className="mt-3 text-ink-soft">
            What clients see when they find you in search or an AI bundle.
          </p>
        </div>
        <LinkButton
          href={`/vendor?id=${vendor.vendor_id}`}
          variant="ghost"
          size="md"
          className="shrink-0"
        >
          See what clients see
        </LinkButton>
      </header>

      {/* Services first: a price change or a new photo is a weekly job, and the
          details below are set once. It also puts the listing-health "add a
          service" link on the page's main content rather than under a form. */}
      <ServicesManager vendor={vendor} categories={categories} initial={services} />

      <h2 className="serif mt-10 text-2xl text-ink">About your business</h2>
      <Card className="mt-5 p-6">
        <form onSubmit={submit} className="grid gap-4">
          <VendorIdentityFields
            categories={categories}
            specializations={specializations}
            bio={bio}
            onSpecializationsChange={updateSpecializations}
            onBioChange={setBio}
          />

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
            <p
              role="alert"
              className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold"
            >
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="rounded-lg bg-green/10 px-3 py-2 text-sm text-green">
              Saved.
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Card>

      {/* Reputation, beside the bio and photos it's a consequence of. It was on
          the dashboard, which is otherwise entirely operational — what needs me,
          what's coming, where's my money — and a star rating is none of those.
          Here it sits next to the things a vendor would change in response to
          it. */}
      {vendor.rating || reviews.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-card-edge bg-card p-5">
          <p className="eyebrow mb-3">How clients rate you</p>
          <div className="flex flex-wrap items-baseline gap-6">
            {vendor.rating ? (
              <div>
                <p className="serif text-4xl text-maroon dark:text-gold">
                  {vendor.rating.toFixed(1)}
                </p>
                <Stars rating={vendor.rating} />
              </div>
            ) : null}
            <div>
              <p className="text-xl font-bold text-ink">{reviews.length}</p>
              <p className="text-xs text-ink-faint">Reviews</p>
            </div>
            {vendor.num_events ? (
              <div>
                <p className="text-xl font-bold text-ink">{vendor.num_events}</p>
                <p className="text-xs text-ink-faint">Events</p>
              </div>
            ) : null}
          </div>

          {reviews.slice(0, 3).map((r) => (
            <div key={r.review_id} className="mt-4 border-t border-line-soft pt-4">
              <div className="flex items-center justify-between gap-3">
                <Stars rating={r.rating} />
                <span className="text-xs text-ink-faint">
                  {r.created_at ? prettyDate(r.created_at.slice(0, 10)) : null}
                </span>
              </div>
              {r.comment ? (
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {r.comment}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* No "next steps" card. It pointed at the services page and the public
          view — one of which is now this page's own first section, and the
          other a button in the header. Its warning that clients can't book you
          without a service is the services list's empty state, said where the
          service would go. */}
    </div>
  );
}
