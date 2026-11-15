"use client";

import { vendorName } from "@jorna/shared/lib/vendorName";
import { useState } from "react";
import Link from "next/link";
import { categoryLabel, type VendorSearchItem } from "@/lib/types";
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
export function VendorCard({ item }: { item: VendorSearchItem }) {
  // Some vendor photos are external links (e.g. imported from Instagram)
  // rather than files this app hosts itself — those can 404 or expire on
  // their own schedule with nothing wrong on this end. Falling back to the
  // monogram on a failed load beats the browser's broken-image icon.
  const [photoFailed, setPhotoFailed] = useState(false);
  const name = vendorName(item);
  const price = money(item.service_price);
  const monogram = (name || item.service_name || "·").charAt(0).toUpperCase();
  // The listing's own photo first — the card leads with the service, so that's
  // what a client is scrolling past photos of. Falls back to the vendor's
  // avatar for a listing with no photo yet, and only then to the monogram.
  const photo = !photoFailed && (item.service_photo_url || item.pfp_url);
  const distance =
    item.distance_miles != null ? `${Math.round(item.distance_miles)} mi away` : null;

  return (
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:border-gold"
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
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm">
          {/* /vendors/search returns the rate but not its unit, so it's a
              starting price here — the package page has the real unit. */}
          {price ? <strong className="text-ink">From {price}</strong> : <span />}
          {item.service_num_reviews && item.service_rating ? (
            <span className="text-gold">
              ★ {item.service_rating.toFixed(1)} <span className="text-ink-faint">({item.service_num_reviews})</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
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
