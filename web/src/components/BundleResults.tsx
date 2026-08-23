"use client";

// The three generated teams, side by side.
//
// Every figure here goes through priceLine, the same function the plan and the
// booking rows use. It used to print `item.price_min` bare: a caterer at $62 a
// head appeared as "$62" in a column beside an $8,500 venue, and the headline
// total a client picks a bundle on was a sum of rates and totals mixed together.
// The backend now resolves each slot against the event's guest count and hours
// (see chatbot_service._price_for) and says which figures are still rates, so
// this can show what a bundle actually costs — and admit when it can't.

import { useState } from "react";
import {
  categoryLabel,
  priceLine,
  type BundleOption,
  type BundleItem,
} from "@/lib/types";
import { Avatar, Button, Card, Stars } from "./ui";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/** The middle "Balanced" tier is the one we nudge people toward. */
function isRecommended(option: BundleOption) {
  return option.label.trim().toLowerCase().includes("balanced");
}

/**
 * One line-up row's figure and its caption.
 *
 * `guestCount` comes from the builder's own form, so a resolved per-person slot
 * can name what it was multiplied by — "Total · 200 guests" rather than a
 * number with nothing behind it.
 */
function itemPrice(item: BundleItem, guestCount: number | null) {
  return priceLine({
    price: item.price_min,
    price_unit: item.price_unit,
    price_pending_quantity: item.price_pending_quantity,
    guest_count: guestCount,
  });
}

function BundleCard({
  option,
  guestCount,
  recommended,
  onChoose,
  choosing,
}: {
  option: BundleOption;
  guestCount: number | null;
  recommended: boolean;
  onChoose?: (option: BundleOption) => void;
  choosing?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const { bundle } = option;
  const unfilled = bundle.unfilled_categories ?? [];
  const count = bundle.items.length;
  const rated = bundle.items.filter((i) => i.rating > 0);
  const avg = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0;

  // Items whose total still can't be worked out. The bundle's total carries
  // them at their rate, so it's a floor rather than an estimate — which is what
  // the heading says, and all it needs to say. A boxed note repeating it under
  // every card told the client three times over something each row already
  // shows in its own caption ("$175 per hour").
  const pending =
    bundle.pending_quantity_count ??
    bundle.items.filter((i) => i.price_pending_quantity).length;
  // A range only when there is one. The builder currently prices min = max, so
  // printing "$14,200–$14,200" would be noise pretending to be precision.
  const spread = bundle.estimated_total_max > bundle.estimated_total_min;

  return (
    <Card
      className={`relative flex flex-col p-5 transition ${
        recommended
          ? "ring-2 ring-gold shadow-[0_20px_55px_-26px_rgba(169,121,31,0.55)]"
          : "hover:border-gold/40"
      }`}
    >
      {recommended ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-3 py-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-maroon-deep shadow-[var(--shadow-card)]">
          Recommended
        </span>
      ) : null}

      {/* Tier + pitch */}
      <div className="text-center">
        <h3 className="serif text-2xl text-maroon dark:text-gold">{option.label}</h3>
        <p className="mx-auto mt-1 max-w-[26ch] text-xs leading-relaxed text-ink-soft">
          {option.description}
        </p>
      </div>

      {/* Headline total */}
      <div className="mt-4 text-center">
        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
          {pending > 0 ? "Estimated so far" : "Estimated total"}
        </p>
        <p className="serif mt-0.5 text-[2rem] leading-none text-ink">
          {spread
            ? `${money(bundle.estimated_total_min)}–${money(bundle.estimated_total_max)}`
            : money(bundle.estimated_total_min)}
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
          <span>
            {count} {count === 1 ? "vendor" : "vendors"}
          </span>
          {avg > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <Stars rating={avg} className="text-xs" />
              <span>avg</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="my-4 h-px bg-line-soft" />

      {/* Line-up */}
      <ul className="flex-1 space-y-3">
        {bundle.items.map((item) => {
          const price = itemPrice(item, guestCount);
          // The site promises twice that these are real businesses "with a
          // profile you can open and check", and this list was plain <li>: you
          // committed a five-vendor team having seen a name, a price and a star
          // count. Both ids have been on the payload all along.
          //
          // A new tab on purpose — the three options are unsaved state on
          // /plan, and navigating in place loses them.
          const href = item.service_id
            ? `/app/service?id=${item.service_id}`
            : item.vendor_id
              ? `/app/vendor?id=${item.vendor_id}`
              : null;
          const heading = item.service_name || categoryLabel(item.category);
          return (
            <li
              key={`${item.category}-${item.vendor_id ?? item.vendor_name}`}
              className="flex items-center gap-3"
            >
              <Avatar src={item.pfp_url} name={item.vendor_name} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition hover:text-maroon hover:underline dark:hover:text-gold"
                    >
                      {heading}
                    </a>
                  ) : (
                    heading
                  )}
                </p>
                <p className="truncate text-xs text-ink-faint">
                  {categoryLabel(item.category)} · {item.vendor_name}
                </p>
                {/* Why this vendor. The backend has always sent it and nothing
                    ever showed it, so "matched for you" was unevidenced. */}
                {item.match_reason ? (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-soft">
                    {item.match_reason}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-ink">{money(price.amount)}</p>
                {/* The unit, always, when there is one — a figure that depends
                    on a quantity is not comparable to one that doesn't, and the
                    column is full of both. */}
                {price.caption ? (
                  <p
                    className={`text-[0.65rem] ${
                      price.isTotal ? "text-ink-faint" : "text-gold"
                    }`}
                  >
                    {price.caption}
                  </p>
                ) : null}
                <Stars rating={item.rating} className="text-[0.7rem]" />
              </div>
            </li>
          );
        })}
      </ul>

      {unfilled.length > 0 ? (
        <p className="mt-4 rounded-lg bg-gold/10 px-3 py-2 text-xs leading-relaxed text-ink-soft">
          No available {unfilled.map(categoryLabel).join(", ")} for your date — you can add{" "}
          {unfilled.length === 1 ? "it" : "one"} later if a vendor opens up.
        </p>
      ) : null}

      {onChoose ? (
        confirming && !choosing ? (
          <div className="mt-5 grid gap-2">
            <p className="text-xs text-ink-soft">
              This discards the other two options — you won&apos;t be able to
              come back and compare them.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant={recommended ? "primary" : "ghost"}
                onClick={() => onChoose(option)}
              >
                Yes, choose this
              </Button>
              <Button variant="quiet" onClick={() => setConfirming(false)}>
                Keep comparing
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="mt-5 w-full"
            variant={recommended ? "primary" : "ghost"}
            disabled={choosing || !option.bundle_id}
            onClick={() => setConfirming(true)}
          >
            {choosing ? "Setting up…" : "Choose this bundle"}
          </Button>
        )
      ) : null}
    </Card>
  );
}

export function BundleResults({
  options,
  guestCount = null,
  onChoose,
  choosingLabel,
}: {
  options: BundleOption[];
  /** From the builder's form — what a per-person rate was multiplied by. */
  guestCount?: number | null;
  onChoose?: (option: BundleOption) => void;
  /** Label of the option currently being selected, so only its button spins. */
  choosingLabel?: string | null;
}) {
  return (
    // pt-4 leaves room for the "Recommended" ribbon to sit above its card.
    <div className="grid grid-cols-1 items-start gap-4 pt-4 md:grid-cols-3">
      {options.map((o) => (
        <BundleCard
          key={o.label}
          option={o}
          guestCount={guestCount}
          recommended={isRecommended(o)}
          onChoose={onChoose}
          choosing={choosingLabel === o.label}
        />
      ))}
    </div>
  );
}
