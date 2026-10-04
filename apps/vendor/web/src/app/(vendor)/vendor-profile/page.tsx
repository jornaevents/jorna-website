"use client";

// Vendor Profile: only what clients see (plan 2.5). Contract defaults moved to
// Contracts → Defaults; payments to Settings.
//
// Each section saves itself — packages one at a time, About with its own
// Save, availability with its own — and says whether it has unsaved changes.
// It used to be one long form whose single Save at the bottom covered some
// sections but not others, so it was easy to edit the bio and leave.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  getMyVendor,
  getVendorReviews,
  listMyServices,
  listVendorCategories,
  updateMyVendor,
} from "@/lib/jorna";
import {
  categoryLabel,
  priceUnitLabel,
  vendorSpecializations,
  type Review,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
  type VendorSpecialization,
} from "@/lib/types";
import { Avatar, Button, Card, LinkButton, Stars } from "@jorna/shared/components/ui";
import { ServicesManager, type ServicesManagerHandle } from "@/components/ServicesManager";
import { PageHeader, PrimaryAction, StatusPill } from "@/components/vendor/ui";
import { AvailabilityFields } from "@/components/AvailabilityFields";
import { VendorIdentityFields, VendorReachFields } from "@/components/VendorProfileFields";

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** The About section's fields, as the form holds them. */
interface About {
  bio: string;
  yearsExperience: string;
  specializations: VendorSpecialization[];
  radius: string;
  longDistance: boolean;
  locationNegotiable: boolean;
  instagram: string;
}

function aboutOf(v: VendorDetail): About {
  return {
    bio: v.bio ?? "",
    yearsExperience: v.years_experience?.toString() ?? "",
    specializations: vendorSpecializations(v),
    radius: v.travel_radius_miles?.toString() ?? "",
    longDistance: Boolean(v.open_to_long_distance),
    locationNegotiable: Boolean(v.open_to_price_negotiation),
    instagram: v.instagram_username ?? "",
  };
}

// A missing subcategory and a null one are the same choice.
const comparable = (a: About) => ({
  ...a,
  specializations: a.specializations.map((s) => ({ category: s.category, subcategory: s.subcategory ?? null })),
});
const sameAbout = (a: About, b: About) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));

/** What decides whether a listing shows up and gets booked. Each item links
 *  to where it's fixed; the card goes away once they're all done. */
function checklist(vendor: VendorDetail, about: About, services: ServiceItem[], hasHours: boolean | null) {
  const listed = services.filter((s) => s.status !== "hidden" && s.status !== "archived");
  return [
    { done: Boolean(vendor.pfp_url), label: "Add a profile photo", href: "/settings" },
    { done: about.bio.trim().length >= 40, label: "Write a few lines about your business", href: "#about" },
    {
      done: listed.some((s) => s.price > 0 && (s.media?.length ?? 0) > 0),
      label: "List a priced package with a photo",
      href: "#packages",
    },
    // Unknown until the hours load: don't nag before we know.
    { done: hasHours !== false, label: "Set the hours you're available", href: "#availability" },
    { done: Boolean(about.instagram.trim()), label: "Link your Instagram", href: "#about" },
  ];
}

export default function VendorProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [hasHours, setHasHours] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const packagesRef = useRef<ServicesManagerHandle>(null);
  const [previewing, setPreviewing] = useState(false);

  const [about, setAbout] = useState<About | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          // Setup isn't done — that's /vendor-onboarding's job.
          router.replace("/vendor-onboarding");
          return;
        }
        setVendor(mine);
        setAbout(aboutOf(mine));
        // Both best-effort: the profile stays editable when either fails.
        const [r, svc] = await Promise.all([
          getVendorReviews(mine.vendor_id).catch(() => null),
          // Hidden and archived included — this is the vendor's own list.
          listMyServices(mine.vendor_id).catch(() => null),
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

  const dirty = Boolean(vendor && about && !sameAbout(about, aboutOf(vendor)));

  // Leaving with an unsaved bio is the mistake the old single Save invited.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (p: Partial<About>) => setAbout((a) => (a ? { ...a, ...p } : a));

  async function saveAbout(e: React.FormEvent) {
    e.preventDefault();
    if (!about) return;
    if (about.specializations.length === 0) {
      setError("Pick at least one category first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [primary] = about.specializations;
      const updated = await updateMyVendor({
        bio: about.bio,
        category: primary.category,
        subcategory: primary.subcategory ?? null,
        specializations: about.specializations,
        years_experience: about.yearsExperience ? Number(about.yearsExperience) : null,
        // Left out when blank: the backend rejects an explicit null (it
        // validates any radius it's sent as 1–500), and blank means "not set".
        ...(about.radius ? { travel_radius_miles: Number(about.radius) } : {}),
        open_to_long_distance: about.longDistance,
        open_to_price_negotiation: about.locationNegotiable,
        instagram_username: about.instagram.trim().replace(/^@/, "") || null,
      });
      setVendor(updated);
      setAbout(aboutOf(updated));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !user || loading || !vendor || !about) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  const displayName = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ");
  const todo = checklist(vendor, about, services, hasHours).filter((i) => !i.done);

  return (
    <div>
      <PageHeader
        eyebrow="Public presence"
        title="Vendor profile"
        subtitle="What clients see when they find you — your packages and your story."
        action={<PrimaryAction onClick={() => packagesRef.current?.startNew()}>Add package</PrimaryAction>}
      />

      {/* The design's identity card: who clients see, and a way to look. */}
      <section className="overflow-hidden rounded-2xl border border-card-edge bg-card shadow-[var(--shadow-card)]">
        <div className="relative h-24 bg-[#641f34] [background-image:radial-gradient(circle_at_85%_20%,#9b5365_0,transparent_40%),radial-gradient(circle_at_10%_100%,#3b0f1b_0,transparent_55%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-12 sm:px-6">
          <div className="absolute -top-9 left-5 rounded-full border-4 border-card sm:left-6">
            <Avatar src={vendor.pfp_url} name={displayName} size={72} />
          </div>
          <div className="min-w-0">
            <strong className="serif block truncate text-xl text-ink">{displayName || "Your business"}</strong>
            <p className="mt-0.5 text-sm text-ink-faint">
              {[vendor.category ? categoryLabel(vendor.subcategory || vendor.category) : null, vendor.location]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={previewing}
              onClick={() => setPreviewing((p) => !p)}
              className="hidden h-10 items-center rounded-full border border-card-edge px-4 text-sm font-semibold text-ink-soft transition hover:text-ink xl:inline-flex"
            >
              {previewing ? "Hide preview" : "See it as a client"}
            </button>
            <LinkButton href={`/vendor?id=${vendor.vendor_id}`} variant="ghost" size="md">
              Open public profile
            </LinkButton>
          </div>
        </div>
      </section>

      {todo.length ? (
        <section aria-label="Listing checklist" className="mt-5 rounded-2xl border border-gold/40 bg-gold/5 p-5">
          <p className="text-sm font-semibold text-ink">
            {todo.length === 1 ? "One thing" : `${todo.length} things`} would help clients find and book you
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {todo.map((i) => (
              <li key={i.label}>
                <Link href={i.href} className="text-gold underline-offset-4 hover:underline">
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Profile sections" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[
          ["#packages", "Packages"],
          ["#about", dirty ? "About · unsaved" : "About"],
          ["#availability", "Availability"],
          ["#reviews", "Reviews"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-card-edge px-3 py-1 text-ink-soft hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className={previewing ? "xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6" : ""}>
        <div className="min-w-0">
          {/* Services first: a price change or a new photo is a weekly job, and
              the details below are set once. Each package saves itself. */}
          <div id="packages" className="scroll-mt-24">
            <ServicesManager
              ref={packagesRef}
              vendor={vendor}
              categories={categories}
              initial={services}
              onServicesChange={setServices}
            />
          </div>

          <section id="about" aria-label="About your business" className="mt-9 scroll-mt-24">
            <form onSubmit={saveAbout}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="serif text-xl text-ink">About your business</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    Help clients understand your style, story and where you&apos;ll travel.
                  </p>
                </div>
                <StatusPill tone={dirty ? "amber" : "green"} dot>
                  {dirty ? "Unsaved changes" : "Saved"}
                </StatusPill>
              </div>
              <Card className="mt-4 p-6">
                <div className="grid gap-4">
                  <VendorIdentityFields
                    categories={categories}
                    specializations={about.specializations}
                    bio={about.bio}
                    onSpecializationsChange={(next) => {
                      patch({ specializations: next });
                      if (next.length > 0) setError(null);
                    }}
                    onBioChange={(bio) => patch({ bio })}
                    yearsExperience={about.yearsExperience}
                    onYearsExperienceChange={(yearsExperience) => patch({ yearsExperience })}
                  />
                  <VendorReachFields
                    radius={about.radius}
                    longDistance={about.longDistance}
                    locationNegotiable={about.locationNegotiable}
                    instagram={about.instagram}
                    onRadiusChange={(radius) => patch({ radius })}
                    onLongDistanceChange={(longDistance) => patch({ longDistance })}
                    onLocationNegotiableChange={(locationNegotiable) => patch({ locationNegotiable })}
                    onInstagramChange={(instagram) => patch({ instagram })}
                  />
                  {error ? (
                    <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                      {error}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={busy || !dirty}>
                      {busy ? "Saving…" : "Save about"}
                    </Button>
                    {dirty ? (
                      <button
                        type="button"
                        onClick={() => setAbout(aboutOf(vendor))}
                        className="text-sm text-ink-faint hover:text-ink"
                      >
                        Discard changes
                      </button>
                    ) : null}
                  </div>
                </div>
              </Card>
            </form>
            <p className="mt-3 text-xs text-ink-faint">
              Your deposit, cancellation window, overtime rate and default clauses are on{" "}
              <Link href="/contracts" className="font-semibold text-gold hover:underline">
                Contracts → Defaults
              </Link>
              . Whether a request needs a guest count is set on each package.
            </p>
          </section>

          {/* Availability saves through its own endpoint (setMyAvailability), so
              it keeps its own Save. */}
          <section id="availability" aria-label="Availability" className="mt-9 scroll-mt-24">
            <h2 className="serif text-xl text-ink">Availability</h2>
            <Card className="mt-4 p-6">
              <AvailabilityFields onHoursChange={setHasHours} />
            </Card>
          </section>

          {/* Reputation, beside the bio and photos it's a consequence of. */}
          <section id="reviews" aria-label="Reviews" className="mt-9 scroll-mt-24">
            <h2 className="serif text-xl text-ink">Reviews</h2>
            {vendor.rating || reviews.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-card-edge bg-card p-5">
                <div className="flex flex-wrap items-baseline gap-6">
                  {vendor.rating ? (
                    <div>
                      <p className="serif text-4xl text-maroon dark:text-gold">{vendor.rating.toFixed(1)}</p>
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
                    {r.comment ? <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{r.comment}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-faint">No reviews yet. They show here after your first events.</p>
            )}
          </section>
        </div>

        {previewing ? (
          <aside aria-label="Client preview" className="hidden xl:sticky xl:top-6 xl:block">
            <ClientPreview vendor={vendor} about={about} categories={categories} services={services} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** The listing as a client sees it, from what's on screen — the About fields
 *  as typed, not as last saved, so a change shows before it's saved. */
function ClientPreview({
  vendor,
  about,
  categories,
  services,
}: {
  vendor: VendorDetail;
  about: About;
  categories: TaxonomyCategory[];
  services: ServiceItem[];
}) {
  const name = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ") || "Your business";
  const primary = about.specializations[0];
  const category = primary
    ? (categories.find((c) => c.value === primary.category)?.subcategories?.find((s) => s.value === primary.subcategory)
        ?.label ?? categoryLabel(primary.subcategory || primary.category))
    : null;
  const listed = services
    .filter((s) => s.status !== "hidden" && s.status !== "archived")
    .sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9));
  const reach = about.longDistance
    ? "Travels anywhere"
    : about.radius
      ? `Travels up to ${about.radius} miles`
      : null;

  return (
    <div className="rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">What clients see</p>
      <div className="mt-3 flex items-center gap-3">
        <Avatar src={vendor.pfp_url} name={name} size={48} />
        <div className="min-w-0">
          <p className="serif truncate text-lg text-ink">{name}</p>
          <p className="truncate text-xs text-ink-faint">{[category, vendor.location].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {about.bio.trim() ? (
        <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{about.bio}</p>
      ) : (
        <p className="mt-3 text-sm italic text-ink-faint">No bio yet.</p>
      )}
      <p className="mt-2 text-xs text-ink-faint">
        {[about.yearsExperience ? `${about.yearsExperience} years in business` : null, reach, about.instagram.trim() ? `@${about.instagram.trim().replace(/^@/, "")}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="mt-4 grid gap-2">
        {listed.length ? (
          listed.map((s) => (
            <div key={s.service_id} className="rounded-lg border border-line-soft px-3 py-2">
              {s.is_popular ? (
                <span className="mb-1 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[0.65rem] font-semibold text-gold">
                  Most popular
                </span>
              ) : null}
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-ink">{s.name}</span>
                <span className="shrink-0 text-sm text-ink">
                  ${Math.round(s.price).toLocaleString()}
                  {priceUnitLabel(s.price_unit) ? (
                    <span className="text-xs text-ink-faint"> {priceUnitLabel(s.price_unit)}</span>
                  ) : null}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm italic text-ink-faint">No public packages yet.</p>
        )}
      </div>
    </div>
  );
}
