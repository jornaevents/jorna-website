"use client";

// Vendor Profile: only what clients see (plan 2.5). Contract defaults moved to
// Contracts → Defaults; payments to Settings.
//
// Each section saves itself — packages one at a time, the business details
// through the Edit profile popup, availability with its own Save. It used to
// be one long form whose single Save at the bottom covered some sections but
// not others, so it was easy to edit the bio and leave.

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  getMyVendor,
  getVendorReviews,
  listMyServices,
  listVendorCategories,
} from "@/lib/jorna";
import {
  categoryLabel,
  priceUnitLabel,
  vendorSpecializations,
  type Review,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
} from "@/lib/types";
import { Avatar, Card, LinkButton, Stars } from "@jorna/shared/components/ui";
import { ServicesManager, type ServicesManagerHandle } from "@/components/ServicesManager";
import { PageHeader, PrimaryAction, primaryClass } from "@/components/vendor/ui";
import { AvailabilityFields } from "@/components/AvailabilityFields";
import { ProfileEditModal, yearsLabel } from "@/components/vendor/ProfileEditModal";

function prettyDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** What decides whether a listing shows up and gets booked. Each item links
 *  to where it's fixed (EDIT: the Edit profile popup); the card goes away once
 *  they're all done. */
const EDIT = "edit";
function checklist(vendor: VendorDetail, services: ServiceItem[], hasHours: boolean | null) {
  const listed = services.filter((s) => s.status !== "hidden" && s.status !== "archived");
  return [
    { done: Boolean(vendor.pfp_url), label: "Add a profile photo", href: EDIT },
    { done: (vendor.bio ?? "").trim().length >= 40, label: "Write a few lines about your business", href: EDIT },
    {
      done: listed.some((s) => s.price > 0 && (s.media?.length ?? 0) > 0),
      label: "List a priced package with a photo",
      href: "#packages",
    },
    // Unknown until the hours load: don't nag before we know.
    { done: hasHours !== false, label: "Set the hours you're available", href: "#availability" },
    { done: Boolean(vendor.instagram_username?.trim()), label: "Link your Instagram", href: EDIT },
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
  const [editing, setEditing] = useState(false);
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

  if (authLoading || !user || loading || !vendor) {
    return error ? (
      <p role="alert" className="py-20 text-center text-ink-soft">{error}</p>
    ) : (
      <p className="py-20 text-center text-ink-soft">Loading…</p>
    );
  }

  const displayName = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ");
  const todo = checklist(vendor, services, hasHours).filter((i) => !i.done);
  const meta = profileMeta(vendor);

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
              {vendor.category ? categoryLabel(vendor.subcategory || vendor.category) : "Add your specialty"}
            </p>
            {meta.length ? (
              <p aria-label="Profile details" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-faint">
                {meta.map((m, i) => (
                  <span key={m.key} className="inline-flex items-center gap-2">
                    {i > 0 ? <i aria-hidden="true" className="size-[3px] rounded-full bg-gold" /> : null}
                    {m.node}
                  </span>
                ))}
              </p>
            ) : null}
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
            <button type="button" onClick={() => setEditing(true)} className={primaryClass}>
              Edit profile
            </button>
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
                {i.href === EDIT ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-left text-gold underline-offset-4 hover:underline"
                  >
                    {i.label}
                  </button>
                ) : (
                  <Link href={i.href} className="text-gold underline-offset-4 hover:underline">
                    {i.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Profile sections" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[
          ["#packages", "Packages"],
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

          <p className="mt-3 text-xs text-ink-faint">
            Your deposit, cancellation window, overtime rate and default clauses are on{" "}
            <Link href="/contracts" className="font-semibold text-gold hover:underline">
              Contracts → Defaults
            </Link>
            . Whether a request needs a guest count is set on each package.
          </p>

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
            <ClientPreview vendor={vendor} categories={categories} services={services} />
          </aside>
        ) : null}
      </div>

      {editing ? (
        <ProfileEditModal
          vendor={vendor}
          categories={categories}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setVendor(updated);
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** The line under the name: where they're based, whether they'll travel out
 *  of state, how long they've been at it — whichever are set. */
type Meta = { key: string; node: ReactNode };
function profileMeta(v: VendorDetail): Meta[] {
  const items: (Meta | null)[] = [
    v.location ? { key: "location", node: v.location } : null,
    v.open_to_long_distance
      ? {
          key: "travel",
          node: (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 font-semibold text-maroon dark:text-gold">
              Open to out-of-state events
            </span>
          ),
        }
      : null,
    v.years_experience != null ? { key: "years", node: yearsLabel(v.years_experience) } : null,
  ];
  return items.filter((m): m is Meta => m !== null);
}

/** The listing as a client sees it. The Edit profile popup has its own
 *  preview of the details as they're typed; this one adds the packages. */
function ClientPreview({
  vendor,
  categories,
  services,
}: {
  vendor: VendorDetail;
  categories: TaxonomyCategory[];
  services: ServiceItem[];
}) {
  const name = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ") || "Your business";
  const primary = vendorSpecializations(vendor)[0];
  const category = primary
    ? (categories.find((c) => c.value === primary.category)?.subcategories?.find((s) => s.value === primary.subcategory)
        ?.label ?? categoryLabel(primary.subcategory || primary.category))
    : null;
  const listed = services
    .filter((s) => s.status !== "hidden" && s.status !== "archived")
    .sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9));
  const bio = vendor.bio?.trim() ?? "";
  const instagram = vendor.instagram_username?.trim().replace(/^@/, "");

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
      {bio ? (
        <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{bio}</p>
      ) : (
        <p className="mt-3 text-sm italic text-ink-faint">No bio yet.</p>
      )}
      <p className="mt-2 text-xs text-ink-faint">
        {[
          vendor.years_experience != null ? yearsLabel(vendor.years_experience) : null,
          vendor.open_to_long_distance ? "Open to out-of-state events" : null,
          instagram ? `@${instagram}` : null,
        ]
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
