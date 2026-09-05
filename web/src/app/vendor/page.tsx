"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getVendor, getVendorReviews, listServices } from "@/lib/jorna";
import {
  categoryLabel,
  priceUnitLabel,
  usableMedia,
  type Review,
  type ServiceItem,
  type VendorDetail,
} from "@/lib/types";
import { loadIsVendor } from "@/lib/role";
import { Card, LinkButton, Stars } from "@/components/ui";
import { ModerationMenu } from "@/components/ModerationMenu";
import { AskVendor } from "@/components/AskVendor";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function monthYear(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const IconInstagram = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <circle cx="12" cy="12" r="3.8" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** A rounded-square avatar for the storefront — photo, else serif monogram. */
function StorefrontAvatar({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className="size-28 shrink-0 rounded-2xl object-cover ring-1 ring-card-edge"
      />
    );
  }
  return (
    <div className="grid size-28 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-panel to-ground-2 ring-1 ring-card-edge">
      <span className="serif text-5xl text-gold/80">{(name || "·").charAt(0).toUpperCase()}</span>
    </div>
  );
}

function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-card-edge bg-ground-2 px-3 py-2.5 text-center">
      <p className="serif text-lg leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
    </div>
  );
}

function ServiceRow({ service, canBook }: { service: ServiceItem; canBook: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const unit = priceUnitLabel(service.price_unit);
  const first = usableMedia(service.media)[0];
  // A video's own file can't go in an <img> — show its poster frame instead.
  const photo =
    !photoFailed && (first ? (first.type === "video" ? first.thumbnail_url : first.url) : null);
  return (
    // The card itself is the link — a "stretched link" overlay covers the
    // whole thing (group-hover carries the name's old hover color along with
    // it) so a click anywhere on the panel opens the package, not just the
    // name. "Book this" sits above that overlay (relative z-10) so it still
    // opens its own destination rather than being swallowed by the card's.
    <Card className="group relative overflow-hidden transition hover:border-gold/40">
      <Link
        href={`/service?id=${service.service_id}`}
        className="absolute inset-0 z-0"
        aria-label={service.name}
      />
      <div className="flex flex-col sm:flex-row">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={service.name}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="h-40 w-full object-cover sm:h-auto sm:w-48"
          />
        ) : (
          <div className="grid h-24 w-full place-items-center bg-gradient-to-br from-panel to-ground-2 text-xs uppercase tracking-wide text-ink-faint sm:h-auto sm:w-48">
            {categoryLabel(service.subcategory || service.category || "")}
          </div>
        )}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="serif text-lg text-ink transition group-hover:text-maroon dark:group-hover:text-gold">
              {service.name}
            </h3>
            <div className="shrink-0 text-right">
              <p className="serif text-lg text-ink">{money(service.price)}</p>
              {unit ? <p className="text-xs text-ink-faint">{unit}</p> : null}
            </div>
          </div>
          {/* This listing's own rating, not the vendor's. A vendor strong at one
              thing and weaker at another used to show the blended score on both
              rows, which told a client nothing about the one they were reading.
              Hidden until there's a review to average — an unreviewed listing
              reports 0, and five empty stars beside a real price reads as a bad
              vendor rather than a new listing. */}
          {service.num_reviews ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
              <Stars rating={service.rating} />
              <span>
                {service.rating?.toFixed(1)} · {service.num_reviews}{" "}
                {service.num_reviews === 1 ? "review" : "reviews"}
              </span>
            </p>
          ) : null}
          {service.description ? (
            <p className="mt-1.5 text-sm text-ink-soft">{service.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {service.category ? (
              <span className="rounded-full border border-card-edge px-2.5 py-1 text-ink-faint">
                {categoryLabel(service.subcategory || service.category)}
              </span>
            ) : null}
            {service.experience ? (
              <span className="rounded-full border border-card-edge px-2.5 py-1 text-ink-faint">
                {service.experience}
              </span>
            ) : null}
            {service.negotiable ? (
              <span className="rounded-full border border-gold/50 px-2.5 py-1 text-gold">
                Open to offers
              </span>
            ) : null}
            {/* A vendor can read any listing — seeing how others present a
                service is a fair reason to be here — but booking is the client
                half of the app, and /book turns them away anyway. Offering a
                button that only leads to a redirect is worse than not offering
                it. */}
            {canBook ? (
              <LinkButton
                href={`/book?service=${service.service_id}`}
                size="md"
                className="relative z-10 ml-auto"
              >
                Book this
              </LinkButton>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function VendorInner() {
  const params = useSearchParams();
  const vendorId = params.get("id");
  const { user } = useAuth();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Null until known, and only a confirmed vendor loses the button — a signed-out
  // visitor keeps it, because "Book this" is how they're invited to sign up.
  const [isVendor, setIsVendor] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadIsVendor().then((v) => !cancelled && setIsVendor(v));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!vendorId) {
      setError("No vendor specified.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getVendor(vendorId),
      listServices({ vendor_id: vendorId, limit: 50 }),
      // Reviews are a nice-to-have — don't fail the page if they error.
      getVendorReviews(vendorId).catch(() => ({ items: [] as Review[] })),
    ])
      .then(([v, s, r]) => {
        if (cancelled) return;
        setVendor(v);
        setServices(s.items);
        setReviews(r.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Couldn't load this vendor.");
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  if (error || !vendor) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">{error ?? "Vendor not found."}</p>
        <LinkButton href="/marketplace" variant="ghost" className="mt-5">
          Back to marketplace
        </LinkButton>
      </div>
    );
  }

  const name = `${vendor.f_name ?? ""} ${vendor.l_name ?? ""}`.trim();
  // A vendor previewing "what clients see" on their own page shouldn't be
  // offered the client-side CTAs, or a way to report/block themselves.
  const isOwnVendor = user?.user_id === vendor.user_id;

  const tiles: { value: React.ReactNode; label: string }[] = [];
  if (vendor.rating) {
    tiles.push({
      value: (
        <span>
          <span className="text-gold">★</span> {vendor.rating.toFixed(1)}
        </span>
      ),
      label: "Rating",
    });
  }
  if (vendor.num_events) tiles.push({ value: vendor.num_events, label: "Events done" });
  if (vendor.travel_radius_miles) {
    tiles.push({ value: `${vendor.travel_radius_miles} mi`, label: "Travel radius" });
  } else if (vendor.open_to_long_distance) {
    tiles.push({ value: "Yes", label: "Long-distance" });
  }
  if (vendor.open_to_price_negotiation) tiles.push({ value: "Open", label: "To offers" });

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
      <Link href="/marketplace" className="text-sm text-ink-soft hover:text-ink">
        ← Back to marketplace
      </Link>

      {/* Hero */}
      <header className="mt-5 rounded-3xl border border-card-edge bg-gradient-to-br from-card to-panel p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <StorefrontAvatar src={vendor.pfp_url} name={name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="serif text-4xl text-maroon dark:text-gold">{name}</h1>
              {vendor.category ? (
                <span className="rounded-full bg-gold/12 px-3 py-1 text-xs font-semibold text-maroon dark:text-gold">
                  {categoryLabel(vendor.subcategory || vendor.category)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-soft">
              <Stars rating={vendor.rating} />
              {vendor.location ? <span>· {vendor.location}</span> : null}
              {vendor.num_events ? <span>· {vendor.num_events} events</span> : null}
            </p>
            {vendor.instagram_username ? (
              <a
                href={`https://instagram.com/${vendor.instagram_username.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline"
              >
                {IconInstagram}@{vendor.instagram_username.replace(/^@/, "")}
              </a>
            ) : null}
            {vendor.tags && vendor.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {vendor.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-card-edge px-2.5 py-0.5 text-xs text-ink-faint"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {tiles.length > 0 ? (
          // Static class strings — Tailwind only generates what it sees literally.
          <div
            className={`mt-6 grid grid-cols-2 gap-3 ${
              tiles.length >= 4
                ? "sm:grid-cols-4"
                : tiles.length === 3
                  ? "sm:grid-cols-3"
                  : "sm:grid-cols-2"
            }`}
          >
            {tiles.map((t) => (
              <StatTile key={t.label} value={t.value} label={t.label} />
            ))}
          </div>
        ) : null}
      </header>

      {vendor.bio ? (
        <p className="mt-6 max-w-[70ch] leading-relaxed text-ink-soft">{vendor.bio}</p>
      ) : null}

      {/* Services */}
      <section className="mt-10">
        <h2 className="serif text-2xl text-ink">
          Packages{" "}
          {services.length > 0 ? (
            <span className="text-ink-faint">· {services.length}</span>
          ) : null}
        </h2>
        {services.length === 0 ? (
          <p className="mt-3 text-ink-soft">This vendor hasn&apos;t listed any packages yet.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {services.map((s) => (
              <ServiceRow key={s.service_id} service={s} canBook={isVendor !== true} />
            ))}
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <h2 className="serif text-2xl text-ink">Reviews</h2>
          {reviews.length > 0 && vendor.rating ? (
            // Said out loud, because each service row above now carries its own
            // rating and this average is a different one. Two numbers that
            // disagree are confusing; two numbers that say what they cover are
            // just informative.
            <span className="text-sm text-ink-soft">
              <Stars rating={vendor.rating} /> · {reviews.length}{" "}
              {reviews.length === 1 ? "review" : "reviews"} across all listings
            </span>
          ) : null}
        </div>
        {reviews.length === 0 ? (
          <p className="mt-3 text-ink-soft">No reviews yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {reviews.map((r) => (
              <Card key={r.review_id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <Stars rating={r.rating} />
                  {r.created_at ? (
                    <span className="text-xs text-ink-faint">{monthYear(r.created_at)}</span>
                  ) : null}
                </div>
                {r.comment ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.comment}</p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      {!isOwnVendor ? (
        <>
          <div className="mt-12 rounded-2xl border border-card-edge bg-panel p-6 text-center">
            <p className="text-ink-soft">
              Want this vendor on your team? Build a bundle and we&apos;ll match them to your date
              and budget.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <LinkButton href="/plan">Build my bundle</LinkButton>
              <AskVendor vendorId={vendor.vendor_id} />
            </div>
          </div>

          <div className="mt-6">
            <ModerationMenu
              targetType="vendor"
              targetId={vendor.vendor_id}
              blockUserId={vendor.user_id}
              label={name || "this vendor"}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function VendorPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <VendorInner />
    </Suspense>
  );
}
