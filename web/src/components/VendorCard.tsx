"use client";

import { useState } from "react";
import Link from "next/link";
import { categoryLabel, type VendorSearchItem } from "@/lib/types";
import { Card, Stars } from "./ui";

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
  const name = `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim();
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-card-edge bg-card shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_20px_44px_-22px_rgba(74,11,26,0.4)]"
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
          // No photo → an elegant serif monogram on a soft gradient.
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-panel to-ground-2">
            <span className="serif text-5xl text-gold/70">{monogram}</span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-ground/90 px-2.5 py-1 text-xs font-semibold text-maroon backdrop-blur dark:text-gold">
          {categoryLabel(item.category)}
        </span>
        {/* The card leads with the service, so the badge is that listing's own
            rating — not the vendor's blend, which used to be shown here and
            described something the client isn't looking at.
            No fallback to the vendor's number: this badge is a bare star row
            with nowhere to put a label, so a quiet swap between two different
            averages would be unreadable. An unreviewed listing shows nothing,
            and the vendor's record is a tap away on their page. */}
        {item.service_num_reviews && item.service_rating ? (
          <span className="absolute right-3 top-3 rounded-full bg-ground/90 px-2 py-1 text-xs backdrop-blur">
            <Stars rating={item.service_rating} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="serif text-lg leading-snug text-ink">{item.service_name || name}</h3>
        <p className="mt-0.5 text-sm text-ink-soft">{name}</p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            {item.location ? (
              <p className="truncate text-xs text-ink-faint">{item.location}</p>
            ) : null}
            {distance ? <p className="text-xs text-ink-faint">{distance}</p> : null}
          </div>
          {price ? (
            // /vendors/search returns the service's rate but not its price_unit,
            // so a per-person rate would read as a full total. Show it as a
            // starting price instead — the vendor page has the real unit.
            <p className="shrink-0 text-right">
              <span className="block text-[0.65rem] uppercase tracking-wide text-ink-faint">
                from
              </span>
              <span className="serif text-lg text-ink">{price}</span>
            </p>
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
