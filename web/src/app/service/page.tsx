"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getService, getServiceReviews, getVendor } from "@/lib/jorna";
import {
  categoryLabel,
  priceUnitKind,
  priceUnitLabel,
  usableMedia,
  type MediaItem,
  type Review,
  type ServiceItem,
  type VendorDetail,
} from "@/lib/types";
import {
  DEFAULT_QUANTITY,
  QUANTITY_LIMITS,
  estimateTotal,
  quantityKey,
  quantityPhrase,
  settledBy,
  type Quantity,
} from "@/lib/pricing";
import { Avatar, Card, LinkButton, Stars } from "@/components/ui";
import { AskVendor } from "@/components/AskVendor";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function monthYear(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** A soft monogram standing in for a photo nobody uploaded. */
function Monogram({
  name,
  className = "",
  letterClass = "text-6xl",
}: {
  name: string;
  className?: string;
  letterClass?: string;
}) {
  return (
    <div
      className={`grid place-items-center bg-gradient-to-br from-panel to-ground-2 ${className}`}
    >
      <span className={`serif ${letterClass} text-gold/70`}>
        {(name || "·").charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

/** A small play-triangle badge, overlaid on a video's thumbnail so it doesn't
 *  read as just another (oddly static) photo in the rail. */
function PlayBadge({ size = "size-8" }: { size?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 grid place-items-center`}
    >
      <span className={`grid ${size} place-items-center rounded-full bg-black/55 text-white`}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-1/2">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
}

/**
 * The listing's photos and videos. One large, the rest as thumbnails that
 * swap into it — rather than a "view all" control that opens nothing.
 */
function Gallery({ media, name }: { media: MediaItem[]; name: string }) {
  const [active, setActive] = useState(0);
  // Some listings' photos are external links (imported from Instagram, say)
  // rather than files this app hosts — those can 404 or expire on their own
  // schedule. Tracked by URL rather than index so a thumbnail already known
  // to be dead doesn't get retried the moment it's clicked into the hero
  // slot.
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const markFailed = (url: string) =>
    setFailedUrls((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));

  // No media: a band, not a hole. This kept the 4:3 frame the real gallery
  // uses, which on the page's 1100px column is over 800px of empty gradient —
  // so a listing with nothing to show pushed its name, price and description
  // clean off the screen, and the one thing it had least of took up the most
  // room. Sized to read as a placeholder rather than a missing image.
  if (media.length === 0) {
    return (
      <Monogram
        name={name}
        className="h-24 w-full rounded-2xl sm:h-28"
        letterClass="text-3xl"
      />
    );
  }

  const activeItem = media[active];
  const rest = media.slice(0, 5).filter((_, i) => i !== active);
  const activeFailed = activeItem.type !== "video" && failedUrls.has(activeItem.url);

  return (
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
      {activeItem.type === "video" ? (
        <video
          key={activeItem.url}
          src={activeItem.url}
          poster={activeItem.thumbnail_url ?? undefined}
          controls
          className="aspect-[4/3] w-full rounded-2xl bg-black object-contain"
        />
      ) : activeFailed ? (
        <Monogram name={name} className="aspect-[4/3] w-full rounded-2xl" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeItem.url}
          alt={name}
          onError={() => markFailed(activeItem.url)}
          className="aspect-[4/3] w-full rounded-2xl object-cover"
        />
      )}
      {rest.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-2">
          {rest.map((item) => {
            const index = media.indexOf(item);
            // A video's own file can't be dropped into an <img> — the thumbnail
            // ffmpeg extracted server-side stands in for it here.
            const thumbSrc = item.type === "video" ? item.thumbnail_url : item.url;
            const thumbFailed = Boolean(thumbSrc && failedUrls.has(thumbSrc));
            return (
              <button
                key={item.url}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Show ${item.type} ${index + 1} of ${media.length}`}
                className="relative overflow-hidden rounded-xl ring-1 ring-card-edge transition hover:ring-gold focus-visible:ring-2 focus-visible:ring-gold"
              >
                {thumbSrc && !thumbFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbSrc}
                    alt=""
                    loading="lazy"
                    onError={() => markFailed(thumbSrc)}
                    className="aspect-[4/3] size-full object-cover"
                  />
                ) : (
                  <div className="aspect-[4/3] size-full bg-panel" />
                )}
                {item.type === "video" ? <PlayBadge size="size-6" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-card-edge px-3 py-1 text-xs text-ink-faint">
      {children}
    </span>
  );
}

/** Minus/plus around a number. Purely an input to the estimate below it. */
function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const button =
    "grid size-8 place-items-center rounded-full border border-card-edge text-ink-soft transition hover:border-gold hover:text-ink disabled:opacity-40 disabled:hover:border-card-edge";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[0.66rem] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          aria-label={label}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
          className="w-16 rounded-lg border border-card-edge bg-ground-2 py-1.5 text-center text-sm tabular-nums text-ink outline-none focus:border-gold"
        />
        <button
          type="button"
          className={button}
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * The price, and what it depends on.
 *
 * A flat rate is a total and gets no controls — there is nothing to vary. A
 * rate-priced listing gets the one stepper its unit multiplies by, and the
 * estimate always names the quantity it used so a number that isn't this
 * client's is visibly not theirs.
 *
 * Nothing here is booked or saved. The real quantity is set on the request
 * form, and the backend recomputes before anyone is charged.
 */
function PricePanel({ service }: { service: ServiceItem }) {
  const kind = priceUnitKind(service.price_unit);
  const unitLabel = priceUnitLabel(service.price_unit);
  const key = quantityKey(kind);
  const [quantity, setQuantity] = useState<Quantity>(DEFAULT_QUANTITY);

  const total = estimateTotal(service, quantity);
  const phrase = quantityPhrase(kind, quantity);
  const settled = settledBy(kind);
  const limits = key ? QUANTITY_LIMITS[kind as keyof typeof QUANTITY_LIMITS] : null;
  const stepperLabel =
    kind === "person"
      ? "Guests"
      : kind === "day"
        ? "Days"
        : kind === "hour"
          ? "Hours"
          : kind === "performer"
            ? "Performers"
            : "";

  return (
    <Card className="p-6">
      <p className="serif text-4xl text-ink">
        {money(service.price)}
        {unitLabel ? (
          <span className="ml-2 text-base text-ink-faint">{unitLabel}</span>
        ) : null}
      </p>

      {key && limits ? (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            {total != null && phrase ? (
              <>
                ≈ <span className="serif text-lg text-ink">{money(total)}</span> for {phrase}
              </>
            ) : (
              <>Enter {stepperLabel.toLowerCase()} to estimate a total.</>
            )}
          </p>

          <div className="mt-5 border-t border-line-soft pt-4">
            <Stepper
              label={stepperLabel}
              value={(quantity[key] as number) ?? limits.min}
              min={limits.min}
              max={limits.max}
              step={limits.step}
              onChange={(n) => setQuantity((q) => ({ ...q, [key]: n }))}
            />
            {/* Said plainly, because a stepper looks like a booking control and
                this one changes nothing but the sum above it. */}
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              An estimate only — nothing here is saved. Your {settled} is set when you
              request the booking.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">
          A flat rate for the whole event, however long it runs.
        </p>
      )}

      <div className="mt-5 grid gap-2">
        <LinkButton href={`/book?service=${service.service_id}`} size="lg">
          Request this package
        </LinkButton>
        {/* Beside the request, not instead of it. A client who isn't ready to
            book had one option on this page and it was a commitment — so the
            question that would have got them there was asked somewhere else,
            or not at all. */}
        <AskVendor
          vendorId={service.vendor_id}
          serviceId={service.service_id}
          serviceName={service.name}
        />
        <LinkButton href={`/vendor?id=${service.vendor_id}`} variant="ghost" size="md">
          View vendor profile
        </LinkButton>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        Changes to this booking — at the event, or after the request is
        finalized — are at your vendor&apos;s discretion.
      </p>
    </Card>
  );
}

function ReviewsSection({
  reviews,
  service,
}: {
  reviews: Review[];
  service: ServiceItem;
}) {
  const [showAll, setShowAll] = useState(false);
  const count = service.num_reviews ?? 0;
  const shown = showAll ? reviews : reviews.slice(0, 4);

  return (
    <section className="mt-12">
      <div className="flex items-baseline gap-3">
        <h2 className="serif text-2xl text-ink">Reviews</h2>
        {count > 0 ? (
          <span className="text-sm text-ink-soft">
            <Stars rating={service.rating} /> · {count} {count === 1 ? "review" : "reviews"}
          </span>
        ) : null}
      </div>

      {count === 0 ? (
        // Not a zero-star row. An unreviewed listing reports 0, and five empty
        // stars beside a real price reads as a bad vendor rather than a new one.
        <p className="mt-3 text-ink-soft">
          No reviews yet — this listing hasn&apos;t been booked through Jorna before.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {shown.map((r) => (
              <Card key={r.review_id} className="p-4">
                <div className="flex items-center gap-2">
                  <Avatar src={r.reviewer_pfp} name={r.reviewer_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {r.reviewer_name || "A client"}
                    </p>
                    {r.created_at ? (
                      <p className="text-xs text-ink-faint">{monthYear(r.created_at)}</p>
                    ) : null}
                  </div>
                  <Stars rating={r.rating} />
                </div>
                {/* A rating with no comment is a finished review, not a broken
                    card — the comment field is optional. */}
                {r.comment ? (
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{r.comment}</p>
                ) : null}
              </Card>
            ))}
          </div>
          {!showAll && reviews.length > 4 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 rounded-full border border-card-edge px-4 py-2 text-sm text-ink-soft transition hover:border-gold hover:text-ink"
            >
              Show all {reviews.length} reviews
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function ServiceInner() {
  const params = useSearchParams();
  const serviceId = params.get("id");

  const [service, setService] = useState<ServiceItem | null>(null);
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  // Seeded from the query string rather than corrected inside the effect: a
  // visit with no id is already known to be an error on the first render, and
  // setting that state in an effect body cascades a render for nothing.
  const [loading, setLoading] = useState(Boolean(serviceId));
  const [error, setError] = useState<string | null>(
    serviceId ? null : "No package specified.",
  );

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    getService(serviceId)
      .then(async (s) => {
        if (cancelled) return;
        setService(s);
        // Secondary detail. Fetched after the listing so a slow or missing
        // vendor record can't keep the page from painting what it came for.
        const [v, r] = await Promise.all([
          getVendor(s.vendor_id).catch(() => null),
          getServiceReviews(serviceId, { limit: 50 }).catch(() => null),
        ]);
        if (cancelled) return;
        setVendor(v);
        setReviews(r?.items ?? []);
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load this package."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const media = useMemo(() => usableMedia(service?.media), [service]);

  if (loading) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  if (error || !service) {
    return (
      <div className="py-20 text-center">
        <p className="text-ink-soft">{error ?? "Package not found."}</p>
        <Link href="/marketplace" className="mt-4 inline-block text-sm text-gold hover:underline">
          Back to marketplace
        </Link>
      </div>
    );
  }

  const label = categoryLabel(service.subcategory || service.category || "");
  const isVenue = service.category === "venue";
  const duration = service.duration_minutes
    ? `${Math.round((service.duration_minutes / 60) * 10) / 10} hours`
    : null;

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-8">
      <Link href="/marketplace" className="text-sm text-ink-soft hover:text-ink">
        ← Back to marketplace
      </Link>

      <div className="mt-5">
        <Gallery media={media} name={service.name} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="min-w-0">
          <header>
            {label ? (
              <span className="eyebrow">{label}</span>
            ) : null}
            <h1 className="serif mt-2 text-4xl leading-tight text-maroon dark:text-gold">
              {service.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-soft">
              <Link
                href={`/vendor?id=${service.vendor_id}`}
                className="flex items-center gap-2 hover:text-ink"
              >
                <Avatar src={service.vendor_pfp_url} name={service.vendor_name} size={28} />
                <span>{service.vendor_name || "This vendor"}</span>
              </Link>
              {/* This listing's own record, not the vendor's blend. Hidden until
                  there's something to average. */}
              {service.num_reviews ? (
                <span className="flex items-center gap-1.5">
                  <Stars rating={service.rating} />
                  <span>
                    · {service.num_reviews}{" "}
                    {service.num_reviews === 1 ? "review" : "reviews"}
                  </span>
                </span>
              ) : null}
              {service.location ? <span>· {service.location}</span> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {service.experience ? <Pill>{service.experience}</Pill> : null}
              {duration ? <Pill>Up to {duration}</Pill> : null}
              {service.negotiable ? (
                <span className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold">
                  Open to offers
                </span>
              ) : null}
            </div>
          </header>

          {/* Priced panel sits here on mobile — above the fold, under the facts
              it depends on — and moves to the sticky column on desktop. */}
          <div className="mt-7 lg:hidden">
            <PricePanel service={service} />
          </div>

          {service.description ? (
            <section className="mt-10">
              <span className="eyebrow">About this {isVenue ? "venue" : "package"}</span>
              <p className="mt-3 max-w-[65ch] whitespace-pre-line leading-relaxed text-ink-soft">
                {service.description}
              </p>
            </section>
          ) : null}

          {vendor?.bio || vendor?.travel_radius_miles ? (
            <section className="mt-10">
              <span className="eyebrow">About {service.vendor_name || "the vendor"}</span>
              {vendor.bio ? (
                <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-soft">{vendor.bio}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {/* A venue qualifies on where the building stands, so a travel
                    radius would be meaningless on one. */}
                {isVenue && service.location ? (
                  <Pill>{service.location}</Pill>
                ) : vendor.travel_radius_miles ? (
                  <Pill>Travels up to {vendor.travel_radius_miles} miles</Pill>
                ) : null}
                {vendor.open_to_long_distance ? <Pill>Open to long distance</Pill> : null}
              </div>
            </section>
          ) : null}

          <ReviewsSection reviews={reviews} service={service} />
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <PricePanel service={service} />
        </aside>
      </div>
    </div>
  );
}

export default function ServicePage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ServiceInner />
    </Suspense>
  );
}
