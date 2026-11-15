"use client";

import { vendorName } from "@jorna/shared/lib/vendorName";
import { useState } from "react";
import Link from "next/link";
import { categoryLabel, priceUnitKind, priceUnitLabel, type VendorSearchItem } from "@/lib/types";
import type { Quantity } from "@jorna/shared/lib/pricing";
import { quantityText } from "@/lib/eventQuantity";
import { Card } from "@jorna/shared/components/ui";

function money(n?: number | null) {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * One search result. `/vendors/search` returns a row per vendor+service pair,
 * so a vendor with several services appears once per service — the card leads
 * with the service and attributes it to the vendor.
 */
export function VendorCard({
  item,
  saved,
  onToggleSave,
  quantity,
}: {
  item: VendorSearchItem;
  /** The event the search was estimated for — names what the total assumed. */
  quantity?: Quantity;
  /** Whether this package is on the client's shortlist. Omit `onToggleSave`
   *  (a signed-out visitor) and the card has no heart. */
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  // Some vendor photos are external links (e.g. imported from Instagram)
  // rather than files this app hosts itself — those can 404 or expire on
  // their own schedule with nothing wrong on this end. Falling back to the
  // monogram on a failed load beats the browser's broken-image icon.
  const [photoFailed, setPhotoFailed] = useState(false);
  const name = vendorName(item);
  const price = money(item.service_price);
  const unit = priceUnitLabel(item.service_price_unit);
  const flat = item.service_price_unit != null && !unit;
  const kind = priceUnitKind(item.service_price_unit);
  // A total only for a rate the search could multiply out. A flat price's
  // "total" is just its price, which the flat line already says.
  const total = kind !== "event" && item.estimated_total != null ? money(item.estimated_total) : null;
  const times = quantityText(kind, quantity);
  const monogram = (name || item.service_name || "·").charAt(0).toUpperCase();
  // The listing's own photo first — the card leads with the service, so that's
  // what a client is scrolling past photos of. Falls back to the vendor's
  // avatar for a listing with no photo yet, and only then to the monogram.
  const photo = !photoFailed && (item.service_photo_url || item.pfp_url);
  const distance =
    item.distance_miles != null ? `${Math.round(item.distance_miles)} mi away` : null;

  return (
    <article className="relative">
      {onToggleSave ? (
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={Boolean(saved)}
          aria-label={`${saved ? "Remove" : "Save"} ${item.service_name || name}`}
          className={`absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-ground/90 backdrop-blur transition ${saved ? "text-maroon" : "text-ink-soft hover:text-ink"}`}
        >
          <svg viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
          </svg>
        </button>
      ) : null}
    <Link
      // The card leads with the service name and its price, so the service is
      // what a click is asking about. Falls back to the vendor's profile for a
      // row that somehow arrives without a service id, which is better than a
      // dead card.
      href={
        item.service_id
          ? `/service?id=${item.service_id}`
          : `/vendor?id=${item.vendor_id}`
      }
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:border-gold"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-panel">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={item.service_name || name}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="size-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[#e7c790]">
            <span className="font-serif text-5xl font-bold text-maroon">{monogram}</span>
          </div>
        )}
      </div>

      {/* The Jorna-Client card: what kind of vendor, who, which package, then
          the price and the rating on one line. The rating is this listing's
          own, shown only once it has reviews — an unreviewed listing shows
          none rather than borrowing the vendor's average. */}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-gold">{categoryLabel(item.category)}</span>
        <h3 className="font-serif text-[1.05rem] font-bold leading-snug tracking-[-0.01em] text-ink">{name}</h3>
        {item.service_name ? <span className="text-sm text-ink-soft">{item.service_name}</span> : null}
        {item.location || distance ? (
          <span className="truncate text-xs text-ink-faint">{[item.location, distance].filter(Boolean).join(" · ")}</span>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3 text-sm">
          {/* The rate and what it's per: "$62 per person" beside an $8,500
              venue reads as what it is. A flat price says so; the total for a
              per-unit one depends on the event, so it's "From" — as is a row
              that arrives with no unit at all, which can't be called flat. */}
          {/* With the event's numbers filled in, the total leads — it's what
              the client compares and what Price sorts by — and the rate stays
              beneath it with what it was multiplied by, so the figure is
              checkable rather than a number from nowhere. */}
          {price && total ? (
            <span className="grid text-ink">
              <span>
                <strong>{total}</strong> <span className="text-ink-soft">est. total</span>
              </span>
              <span className="text-xs text-ink-soft">
                {price} {unit}
                {times ? ` × ${times}` : ""}
              </span>
            </span>
          ) : price ? (
            <span className="text-ink">
              <strong>{flat ? price : `From ${price}`}</strong>
              {unit || flat ? <span className="text-ink-soft"> {unit || "flat"}</span> : null}
            </span>
          ) : (
            <span />
          )}
          {item.service_num_reviews && item.service_rating ? (
            <span className="text-gold">
              ★ {item.service_rating.toFixed(1)} <span className="text-ink-faint">({item.service_num_reviews})</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
    </article>
  );
}

/** Placeholder card shown while the first page of results loads. */
export function VendorCardSkeleton() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="aspect-[4/3] animate-pulse bg-line-soft" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-line-soft" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-line-soft" />
        <div className="mt-3 flex justify-between">
          <div className="h-3 w-16 animate-pulse rounded bg-line-soft" />
          <div className="h-5 w-12 animate-pulse rounded bg-line-soft" />
        </div>
      </div>
    </Card>
  );
}
