"use client";

// Compare the packages a client saved in Explore, side by side (Jorna-Client
// design; client redesign PR 7). Packages, not vendors: one vendor's $38-a-head
// dinner and $8,000 buffet are different decisions, and comparing "the vendor"
// could only ever show a starting price. Every row here is the package's own
// terms, with who sells it and their track record underneath.
// "Typical response" and "Travel fee" from the design aren't here — nothing
// records them yet.
//
// The "Your event" bar arrives filled from Explore's (via the URL) and turns
// each rate into an estimated total with the same estimateTotal the service
// page uses — locally, since the saved list is already here.

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { estimateTotal, type Quantity } from "@jorna/shared/lib/pricing";
import {
  inputsFromParams,
  quantityFrom,
  quantityNoun,
  quantityQuery,
  quantityText,
} from "@/lib/eventQuantity";
import { EventQuantityBar } from "@/components/EventQuantityBar";
import { useAuth } from "@/lib/auth";
import { LinkButton } from "@jorna/shared/components/ui";
import { useSavedPackages } from "@/lib/savedPackages";
import { categoryLabel, priceUnitKind, priceUnitLabel } from "@/lib/types";
import type { SavedPackage } from "@/lib/jorna";
import { Badge } from "@/components/kit";
import { signInUrl } from "@/lib/vendorSite";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/** "$38 per person", "$2,400 flat"; a package with no unit is priced flat. */
function price(p: SavedPackage): string {
  if (!p.price) return "Ask for a quote";
  const unit = priceUnitLabel(p.price_unit);
  return `${money(p.price)} ${unit || "flat"}`;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The package's total for this event, or null when it can't be worked out yet. */
function total(p: SavedPackage, quantity: Quantity): number | null {
  return p.price ? estimateTotal(p, quantity) : null;
}

const ROWS: [string, (p: SavedPackage, quantity: Quantity, lowest: number | null) => ReactNode][] = [
  ["Price", price],
  [
    "Estimated total",
    (p, quantity, lowest) => {
      if (!p.price) return "—";
      const kind = priceUnitKind(p.price_unit);
      const t = total(p, quantity);
      if (t == null) {
        return <span className="text-ink-faint">Add {quantityNoun(kind)} above</span>;
      }
      const times = quantityText(kind, quantity);
      return (
        <span className="grid gap-0.5">
          <strong>{money(t)}</strong>
          {times ? <span className="text-xs text-ink-soft">for {times}</span> : null}
          {/* Only meaningful against at least one other total. */}
          {lowest != null && t === lowest ? (
            <span className="mt-1">
              <Badge tone="green">Lowest</Badge>
            </span>
          ) : null}
        </span>
      );
    },
  ],
  ["Hours included", (p) => (p.included_hours ? plural(p.included_hours, "hour", "hours") : "—")],
  [
    "What's included",
    (p) =>
      p.inclusions.length ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {p.inclusions.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        "—"
      ),
  ],
  ["Add-ons", (p) => (p.add_ons.length ? p.add_ons.join(", ") : "None")],
  ["Deposit", (p) => (p.deposit_percent != null ? `${p.deposit_percent}% to book` : "—")],
  [
    "Cancellation",
    // Vendors set this in days (ServicesManager), stored as hours.
    (p) =>
      p.cancellation_window_hours != null
        ? `Up to ${plural(Math.round(p.cancellation_window_hours / 24), "day", "days")} before the event`
        : "—",
  ],
  ["Price negotiable", (p) => (p.negotiable ? "Yes" : "No")],
  // The package's own reviews; an unreviewed one reads as new, not zero stars.
  ["Rating", (p) => (p.num_reviews && p.rating ? `★ ${p.rating.toFixed(1)} (${p.num_reviews})` : "New")],
  [
    "Vendor",
    (p) => (
      <Link href={`/vendor?id=${p.vendor_id}`} className="font-semibold text-ink hover:text-gold">
        {p.vendor_name || "Vendor"}
      </Link>
    ),
  ],
  ["Based in", (p) => p.vendor_location || "—"],
  ["Years in business", (p) => (p.years_experience != null ? String(p.years_experience) : "—")],
];

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <CompareInner />
    </Suspense>
  );
}

function CompareInner() {
  const { user, loading } = useAuth();
  const { saved, toggle } = useSavedPackages();
  const searchParams = useSearchParams();
  const [eventInputs, setEventInputs] = useState(() => inputsFromParams(searchParams));
  const quantity = useMemo(() => quantityFrom(eventInputs), [eventInputs]);
  // The cheapest total, once two or more packages have one to compare.
  const lowest = useMemo(() => {
    const totals = (saved ?? [])
      .filter((p) => p.available)
      .map((p) => total(p, quantity))
      .filter((t): t is number => t != null);
    return totals.length > 1 ? Math.min(...totals) : null;
  }, [saved, quantity]);

  useEffect(() => {
    if (!loading && !user) window.location.replace(signInUrl("/compare"));
  }, [loading, user]);

  if (loading || !user || saved === null) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-10">
      <Link href={`/marketplace${quantityQuery(quantity)}`} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Back to Explore
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your shortlist</p>
          <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[2.8rem]">
            Compare your selected packages
          </h1>
          <p className="mt-2 text-ink-soft">What each one costs and includes, side by side.</p>
        </div>
        <Badge tone="neutral">{saved.length} selected</Badge>
      </div>

      {saved.length > 0 ? (
        <EventQuantityBar
          value={eventInputs}
          onChange={setEventInputs}
          showPerformers={saved.some((p) => priceUnitKind(p.price_unit) === "performer")}
          hint="Fill in what you know to compare totals, not just rates."
        />
      ) : null}

      {saved.length === 0 ? (
        <div className="mx-auto mt-16 max-w-[420px] text-center">
          <h2 className="font-serif text-xl font-bold text-ink">No packages selected</h2>
          <p className="mt-2 text-ink-soft">Heart packages in Explore to build a side-by-side comparison.</p>
          <LinkButton href="/marketplace" className="mt-5">
            Explore packages
          </LinkButton>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-36 p-4 text-left text-[0.72rem] font-semibold text-ink-soft">
                  Compare
                </th>
                {saved.map((p) => (
                  <th key={p.service_id} scope="col" className="min-w-[190px] p-4 text-left align-top">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt="" loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-lg object-cover" />
                    ) : null}
                    <span className="block text-[0.7rem] font-bold uppercase tracking-[0.1em] text-gold">
                      {categoryLabel(p.category ?? "")}
                    </span>
                    <strong className="block font-serif text-base text-ink">{p.name || "Package"}</strong>
                    <span className="block text-xs font-normal text-ink-soft">{p.vendor_name}</span>
                    {/* Hidden or archived since it was saved — kept so it doesn't
                        just disappear, but it can't be booked. */}
                    {!p.available ? (
                      <span className="mt-2 block">
                        <Badge tone="neutral">No longer offered</Badge>
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, value]) => (
                <tr key={label} className="border-b border-line-soft">
                  <th scope="row" className="p-4 text-left align-top text-[0.8rem] font-semibold text-ink-soft">
                    {label}
                  </th>
                  {saved.map((p) => (
                    <td key={p.service_id} className="p-4 align-top text-ink">
                      {value(p, quantity, lowest)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="p-4 text-left text-[0.8rem] font-semibold text-ink-soft">
                  Next step
                </th>
                {saved.map((p) => (
                  <td key={p.service_id} className="p-4">
                    {p.available ? (
                      <LinkButton size="md" variant="ghost" href={`/service?id=${p.service_id}`}>
                        View package
                      </LinkButton>
                    ) : null}
                    <button type="button" onClick={() => toggle(p.service_id)} className="mt-2 block text-xs font-semibold text-ink-soft hover:text-maroon">
                      Remove<span className="sr-only"> {p.name}</span>
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
