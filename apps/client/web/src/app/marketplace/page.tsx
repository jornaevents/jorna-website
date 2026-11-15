"use client";

// Marketplace — every service on Jorna: search, category chips, filters,
// pagination. Service, not vendor: /vendors/search returns one row per
// vendor+listing pair (see VendorSearchItem), so a vendor selling three things
// is three rows here, and the page says so.
//
// This used to be an in-place "expanded" state of the Home tab's search bar;
// it's its own tab now, so Home's search bar, tiles, and "Browse every vendor"
// button link straight here instead of expanding in place.
//
// A service or group from the taxonomy (backend DECISIONS #35) can arrive via
// ?service= — how the landing pages hand off into a preset filter. Older links
// carry ?category=&subcategory=; those still filter (the backend reads the old
// pairs), they just don't light a chip.
//
// Where each filter is applied, which is not uniform:
//
//   service (or an old category), rating, price, sort   → the search API
//   your event (guests, days, hours, performers)       → the search API, which
//                           estimates each row's total and sorts price by it
//   location                → API narrows to the state, the city is matched here
//   date                    → not searchable at all; see lib/availability
//   typed query             → here, over a pulled pool (the API has no q param)
//
// Everything applied here rather than by the API shares one consequence: the
// server's `total` stops describing what's on screen, and paging through a
// locally-filtered pool would skip rows. So any such filter switches the fetch
// to a single large pool (QUERY_POOL) and hides "Show more".

import { vendorName } from "@jorna/shared/lib/vendorName";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { searchVendors } from "@/lib/jorna";
import { freeVendorIds } from "@/lib/availability";
import { categoryLabel, priceUnitKind, type VendorSearchItem } from "@/lib/types";
import type { Quantity } from "@jorna/shared/lib/pricing";
import { findService, groupOf, useTaxonomy } from "@jorna/shared/lib/taxonomy";
import { Button, Chip, Field, LinkButton, TimeField } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { VendorCard, VendorCardSkeleton } from "@/components/VendorCard";
import { useSavedPackages } from "@/lib/savedPackages";

const PAGE_SIZE = 12;
// /vendors/search has no text-query parameter, so a typed query is filtered
// client-side — exactly as the iOS home does over its loaded vendors. Pull the
// largest page the API allows (cap: 100) while a query is active, or "dhol"
// would only ever search the twelve rows already on screen.
const QUERY_POOL = 100;

const SORTS = [
  { value: "rating", label: "Top rated" },
  // The backend sorts by the estimated total for the event above, not the rate.
  { value: "price", label: "Lowest total" },
];

const RATINGS = [
  { value: 0, label: "Any rating" },
  { value: 4, label: "4.0+" },
  { value: 4.5, label: "4.5+" },
];

/** Fields the typed query is matched against. iOS also matches a vendor's bio
 *  and subcategory; a search row carries neither, so those are simply absent. */
/** Today as a local-timezone ISO date. `toISOString()` reads UTC, which is
 *  "yesterday" for part of the day anywhere east of Greenwich — the same
 *  off-by-one class of bug fixed in `planning.ts`/`vendorPlan.ts`'s day-range
 *  helpers, here on the single-day form the date filter's `min` needs. */
function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** A typed quantity, or undefined until it's a usable one. The backend refuses
 *  out-of-range values outright, so they're held back here rather than turning
 *  the whole result list into an error while someone is mid-keystroke. */
function quantityValue(raw: string, max: number, whole = true): number | undefined {
  if (!raw.trim()) return undefined;
  const n = whole ? Math.round(Number(raw)) : Number(raw);
  return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
}

function matches(item: VendorSearchItem, q: string) {
  return [
    vendorName(item),
    `${item.first_name} ${item.last_name}`,
    item.category,
    categoryLabel(item.category),
    item.service_name ?? "",
    item.location ?? "",
    ...(item.tags ?? []),
  ].some((field) => field.toLowerCase().includes(q));
}

/** "Chicago, IL" → { city: "Chicago", state: "IL" }; "IL" → state only. */
function parsePlace(value: string): { city: string; state: string } {
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return { city: "", state: v.toUpperCase() };
  const m = v.match(/^(.*),\s*([A-Za-z]{2})$/);
  return m ? { city: m[1].trim(), state: m[2].toUpperCase() } : { city: "", state: "" };
}

/**
 * Whether a row is in the chosen place. Rows carry `location` as "Chicago, IL".
 *
 * The state half is re-checked here rather than trusted to the API, because the
 * backend's `state` parameter is a substring match over that same location
 * string, not a state lookup: `state=CA` also returns every "Chicago, IL" row
 * (chi-CA-go), and `state=HO` — not a state at all — returns Houston. It only
 * ever over-includes, since a genuine "City, CA" always contains "CA" in its
 * suffix, so sending it stays a useful prefilter and this makes it exact.
 */
function inPlace(item: VendorSearchItem, city: string, state: string) {
  const loc = item.location?.trim().toLowerCase();
  if (!loc) return false;
  const [head, tail] = loc.split(",");
  if (state && tail?.trim() !== state.toLowerCase()) return false;
  return !city || head.trim() === city.toLowerCase();
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="size-5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

const PinIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
    aria-hidden="true"
  >
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

function MarketplaceInner() {
  const searchParams = useSearchParams();
  const shortlist = useSavedPackages();

  const [query, setQuery] = useState("");
  // Set once by /book after a draft add; read straight off the URL rather than
  // held in state, so it clears on the next navigation without any cleanup.
  const addedBundleId = searchParams.get("added");
  const addedName = searchParams.get("name");
  // A group or service key — what the chips pick and the API's `service`
  // takes. Groups for browsing, services for what's actually booked (#164:
  // the chips are named the way vendors name what they sell).
  const [pick, setPick] = useState(searchParams.get("service") ?? "");
  // An old ?category=&subcategory= link, passed through until a chip is picked.
  const [legacy, setLegacy] = useState(() => ({
    category: searchParams.get("category") ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
  }));
  const [showFilters, setShowFilters] = useState(false);
  const taxonomy = useTaxonomy();

  const [place, setPlace] = useState("");
  const [date, setDate] = useState("");
  // Optional hours for the date. A vendor's day isn't a single booking, so
  // without these the filter can only ask "busy at all that day" and drops
  // someone whose morning ceremony has nothing to do with your evening.
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState("rating");
  // The client's event, as far as they've said. Each is optional: a per-person
  // price gets a total once there's a guest count, an hourly one once there are
  // hours, and a listing whose quantity is still missing keeps its rate.
  const [guests, setGuests] = useState("");
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [performers, setPerformers] = useState("");
  // Caps match the backend's; hours stop at 24, the longest booking window.
  const quantity = useMemo<Quantity>(
    () => ({
      guests: quantityValue(guests, 5000),
      days: quantityValue(days, 60),
      hours: quantityValue(hours, 24, false),
      performers: quantityValue(performers, 100),
    }),
    [guests, days, hours, performers],
  );

  const [items, setItems] = useState<VendorSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The vendors found free, tagged with the date+candidates they were looked up
  // for. Keeping the key alongside the answer means a stale result is simply one
  // whose key no longer matches — nothing has to be reset when the date changes.
  const [avail, setAvail] = useState<{ key: string; ids: Set<string> } | null>(null);

  const { city, state } = useMemo(() => parsePlace(place), [place]);
  const searching = query.trim().length > 0;
  // Filters this component applies itself, rather than the search API. `state`
  // covers the location filter in both its forms, since even a bare state has
  // to be re-checked here — see inPlace.
  const narrowing = searching || state !== "" || date !== "";
  const pageSize = narrowing ? QUERY_POOL : PAGE_SIZE;

  const load = useCallback(
    async (nextOffset: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchVendors({
          ...(pick ? { service: pick } : legacy),
          state: state || undefined,
          min_rating: minRating || undefined,
          max_price: maxPrice ? Number(maxPrice) : undefined,
          sort_by: sortBy,
          guests: quantity.guests ?? undefined,
          days: quantity.days ?? undefined,
          hours: quantity.hours ?? undefined,
          performers: quantity.performers ?? undefined,
          limit: pageSize,
          offset: nextOffset,
        });
        setTotal(res.total);
        setOffset(nextOffset);
        setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load vendors. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [pick, legacy, state, minRating, maxPrice, sortBy, quantity, pageSize],
  );

  // Debounced so dragging through filters fires one fetch, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => load(0, true), 250);
    return () => clearTimeout(t);
  }, [load]);

  // Rows that survive everything except the date, which costs a request per
  // vendor and so is asked only about the vendors that got this far.
  const candidates = useMemo(() => {
    let rows = items;
    if (state) rows = rows.filter((i) => inPlace(i, city, state));
    if (searching) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((i) => matches(i, q));
    }
    return rows;
  }, [items, city, state, searching, query]);

  const candidateIds = useMemo(
    () => [...new Set(candidates.map((i) => i.vendor_id))].sort().join(","),
    [candidates],
  );

  // Availability for exactly the candidates, refetched when they or the date
  // change. Cancellation keeps a slow response from overwriting a newer one.
  // Only a whole window narrows anything — half of one says nothing an
  // availability check can use.
  const window = timeStart && timeEnd ? { start: timeStart, end: timeEnd } : null;
  const availKey = date ? `${date}|${timeStart}|${timeEnd}|${candidateIds}` : "";
  useEffect(() => {
    if (!availKey) return;
    let cancelled = false;
    const ids = candidateIds ? candidateIds.split(",") : [];
    const hours = timeStart && timeEnd ? { start: timeStart, end: timeEnd } : null;
    freeVendorIds(ids, date, hours).then((free) => {
      if (!cancelled) setAvail({ key: availKey, ids: free });
    });
    return () => {
      cancelled = true;
    };
  }, [availKey, candidateIds, date, timeStart, timeEnd]);

  function choose(key: string | null) {
    setPick(key ?? "");
    setLegacy({ category: undefined, subcategory: undefined });
  }

  function clearFilters() {
    setPlace("");
    setDate("");
    setTimeStart("");
    setTimeEnd("");
    setMinRating(0);
    setMaxPrice("");
    setSortBy("rating");
  }

  // Until the availability answers land, show the unfiltered candidates rather
  // than briefly hiding vendors that may well be free.
  const availReady = avail !== null && avail.key === availKey;
  const checkingDate = date !== "" && !availReady;
  const visible =
    availReady && avail ? candidates.filter((i) => avail.ids.has(i.vendor_id)) : candidates;
  // Paging is meaningless while a local filter works over a pulled pool.
  const hasMore = !narrowing && items.length < total;
  // The picked group, or the group of the picked service.
  const activeGroup = taxonomy && pick ? (taxonomy.groups.find((g) => g.key === pick) ?? groupOf(taxonomy, pick)) : null;
  const activeService = taxonomy && pick && findService(taxonomy, pick) ? pick : "";
  const activeFilters =
    (place ? 1 : 0) + (date ? 1 : 0) + (minRating ? 1 : 0) + (maxPrice ? 1 : 0);
  const placeUnrecognised = place.trim() !== "" && !state;
  // Performer pricing is rare (dance troupes, dhol groups); the field only
  // shows once a result is priced that way, or it's been filled in already.
  const showPerformers =
    performers !== "" || items.some((i) => priceUnitKind(i.service_price_unit) === "performer");
  // Rate-priced rows the price sort couldn't place, because their quantity is
  // still blank — they sit at the end, and the page should say why.
  const unranked =
    sortBy === "price" &&
    visible.some((i) => i.estimated_total == null && priceUnitKind(i.service_price_unit) !== "event");

  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-11">
      {/* Adding a service as a draft lands back here, because assembling a plan
          means adding the next thing. The confirmation names what went where so
          the return doesn't read as the click having failed. */}
      {addedBundleId ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-sm">
          <p className="text-ink-soft">
            <span className="text-ink">{addedName || "That package"}</span> was added
            to your plan as a draft — no request sent yet.
          </p>
          <Link
            href={`/bundle?id=${addedBundleId}`}
            className="shrink-0 font-semibold text-gold hover:underline"
          >
            View plan →
          </Link>
        </div>
      ) : null}

      <header>
        <p className="eyebrow">Find your people</p>
        <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[3.2rem]">
          Vendors for every celebration
        </h1>
        <p className="mt-2 max-w-[52ch] text-ink-soft">
          Search by name or package, or filter by city, date, category, rating, and price.
        </p>
      </header>

      <div className="mt-8 flex gap-2">
        <label className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gold">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search DJs, Mehndi…"
            aria-label="Search vendors"
            autoFocus
            className="w-full rounded-xl border border-card-edge bg-ground-2 py-3 pl-11 pr-3.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
          />
        </label>
        <Button variant={showFilters ? "primary" : "ghost"} onClick={() => setShowFilters((v) => !v)}>
          Filters{activeFilters ? ` · ${activeFilters}` : ""}
        </Button>
      </div>

      <section aria-label="Your event" className="mt-4 rounded-2xl border border-card-edge bg-panel p-4">
        <p className="text-sm text-ink-soft">
          <strong className="text-ink">Your event</strong> · Fill in what you know and prices show
          the estimated total.
        </p>
        <div className={`mt-3 grid grid-cols-2 gap-3 ${showPerformers ? "sm:grid-cols-4" : "sm:grid-cols-3"} sm:max-w-2xl`}>
          <Field label="Guests" type="number" inputMode="numeric" min={1} max={5000} step={1} placeholder="e.g. 200" value={guests} onChange={(e) => setGuests(e.target.value)} />
          <Field label="Days" type="number" inputMode="numeric" min={1} max={60} step={1} placeholder="e.g. 2" value={days} onChange={(e) => setDays(e.target.value)} />
          <Field label="Hours" type="number" inputMode="decimal" min={0.5} max={24} step={0.5} placeholder="e.g. 6" value={hours} onChange={(e) => setHours(e.target.value)} />
          {showPerformers ? (
            <Field label="Performers" type="number" inputMode="numeric" min={1} max={100} step={1} placeholder="e.g. 4" value={performers} onChange={(e) => setPerformers(e.target.value)} />
          ) : null}
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip active={!pick && !legacy.category} onClick={() => choose(null)}>
          All
        </Chip>
        {(taxonomy?.groups ?? []).map((g) => (
          <Chip key={g.key} active={activeGroup?.key === g.key} onClick={() => choose(g.key)}>
            {g.label}
          </Chip>
        ))}
      </div>

      {activeGroup && activeGroup.services.length > 1 ? (
        <div aria-label={`${activeGroup.label} services`} role="group" className="mt-2 flex flex-wrap gap-2">
          <Chip active={!activeService} onClick={() => choose(activeGroup.key)}>
            All {activeGroup.label.toLowerCase()}
          </Chip>
          {activeGroup.services.map((svc) => (
            <Chip key={svc.key} active={activeService === svc.key} onClick={() => choose(svc.key)}>
              {svc.label}
            </Chip>
          ))}
        </div>
      ) : null}

      {showFilters ? (
        <div className="mt-4 rounded-2xl border border-card-edge bg-panel p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <CityCombobox
                label="Location"
                value={place}
                icon={PinIcon}
                placeholder="City, or a state like IL"
                onChange={(v) => setPlace(v)}
              />
              {placeUnrecognised ? (
                <span className="mt-1 block text-xs text-ink-faint">
                  Pick a city from the list, or type a two-letter state.
                </span>
              ) : city ? (
                <span className="mt-1 block text-xs text-ink-faint">
                  Vendors listed in {city}, {state}.
                </span>
              ) : state ? (
                <span className="mt-1 block text-xs text-ink-faint">
                  Vendors anywhere in {state}.
                </span>
              ) : null}
            </div>

            <div>
              <Field
                label="Date"
                type="date"
                value={date}
                min={todayLocalIso()}
                onChange={(e) => setDate(e.target.value)}
              />
              {date ? (
                // What this can actually promise. lib/availability hides a
                // vendor only on positive evidence of a conflict — an empty,
                // unparseable or failed response leaves them visible — and most
                // vendors publish no hours at all, so the filter currently
                // excludes almost nobody. Worded as "hides vendors booked that
                // day", a full list read as "these are all free", and a client
                // picked one on that basis and got declined.
                <span className="mt-1 block text-xs text-ink-faint">
                  {window
                    ? "Hides vendors who've told us they're busy over those hours, or closed that day."
                    : "Hides vendors who've told us they're busy that day. Add hours to keep the ones only busy elsewhere in it."}
                </span>
              ) : null}
            </div>
          </div>

          {date ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-[50%]">
              <TimeField label="From (optional)" value={timeStart} onChange={setTimeStart} />
              <TimeField label="Until (optional)" value={timeEnd} onChange={setTimeEnd} />
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 border-t border-card-edge pt-4 sm:grid-cols-3">
            <div>
              <span className="mb-2 block text-sm font-medium text-ink-soft">Minimum rating</span>
              <div className="flex flex-wrap gap-2">
                {RATINGS.map((r) => (
                  <Chip key={r.value} active={minRating === r.value} onClick={() => setMinRating(r.value)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-ink-soft">Sort by</span>
              <div className="flex flex-wrap gap-2">
                {SORTS.map((s) => (
                  <Chip key={s.value} active={sortBy === s.value} onClick={() => setSortBy(s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>

            <Field
              label="Max price"
              type="number"
              min={0}
              placeholder="Any"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>

          {activeFilters ? (
            <div className="mt-4 text-right">
              <Button variant="quiet" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-8 rounded-lg bg-maroon/10 px-3 py-2 text-center text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 && !error ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <VendorCardSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {!error && !loading && visible.length === 0 ? (
        <p className="mt-12 text-center text-ink-soft">
          {searching
            ? `Nothing matches “${query.trim()}” here — try a category, or fewer filters.`
            : state
              ? `No vendors in ${city || state} match those filters — try widening them.`
              : "No vendors match those filters yet — try widening them."}
        </p>
      ) : null}

      {visible.length > 0 ? (
        <>
          <p className="mt-6 text-sm text-ink-faint">
            {narrowing
              ? `${visible.length} ${visible.length === 1 ? "match" : "matches"}`
              : `${total} ${total === 1 ? "listing" : "listings"}`}
            {checkingDate ? " · checking availability…" : ""}
          </p>
          {unranked ? (
            <p className="mt-1 text-xs text-ink-faint">
              Prices per guest, day or hour are listed after the totals until you fill in
              your event above.
            </p>
          ) : null}
          {/* Said once, next to the results, because the filter's own hint is
              behind a Filters toggle that may be shut by the time these are
              read — and "40 vendors, filtered by my date" is exactly the moment
              someone concludes all forty are free. */}
          {date && !checkingDate ? (
            <p className="mt-1 text-xs text-ink-faint">
              Availability is what vendors have published — a vendor who
              hasn&apos;t set their hours still appears here. Confirm the date
              with them before you count on it.
            </p>
          ) : null}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => (
              <VendorCard
                key={`${item.vendor_id}-${item.service_name ?? ""}`}
                item={item}
                quantity={quantity}
                saved={item.service_id ? shortlist.isSaved(item.service_id) : false}
                // A row with no package id has nothing to save — no heart.
                onToggleSave={
                  shortlist.canSave && item.service_id
                    ? () => shortlist.toggle(item.service_id as string)
                    : undefined
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {visible.length > 0 && loading ? (
        <p className="mt-8 text-center text-ink-soft">Loading…</p>
      ) : hasMore && items.length > 0 ? (
        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={() => load(offset + PAGE_SIZE, false)}>
            Show more
          </Button>
        </div>
      ) : null}
      {/* The shortlist, and the way on to comparing it (signed-in only). */}
      {shortlist.canSave ? (
        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom)+0.75rem)] z-20 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/95 px-4 py-3 shadow-[0_12px_36px_rgba(67,27,24,0.12)] backdrop-blur desk:bottom-4">
          <span className="grid">
            <strong className="text-sm text-ink">
              {shortlist.saved?.length
                ? `${shortlist.saved.length} ${shortlist.saved.length === 1 ? "package" : "packages"} selected`
                : "Select packages to compare"}
            </strong>
            <small className="text-xs text-ink-soft">Tap the heart on any package to add it.</small>
          </span>
          {shortlist.saved?.length ? (
            <LinkButton size="md" href="/compare">
              Next · Compare
            </LinkButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <MarketplaceInner />
    </Suspense>
  );
}
