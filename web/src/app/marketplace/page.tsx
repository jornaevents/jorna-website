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
// A category (and, for a few tiles, subcategory) can arrive via ?category=
// &subcategory= — that's how Home's tiles hand off into a preset filter.
//
// Where each filter is applied, which is not uniform:
//
//   category/subcategory, rating, price, sort   → the search API
//   location                → API narrows to the state, the city is matched here
//   date                    → not searchable at all; see lib/availability
//   typed query             → here, over a pulled pool (the API has no q param)
//
// Everything applied here rather than by the API shares one consequence: the
// server's `total` stops describing what's on screen, and paging through a
// locally-filtered pool would skip rows. So any such filter switches the fetch
// to a single large pool (QUERY_POOL) and hides "Show more".

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { searchVendors } from "@/lib/jorna";
import { freeVendorIds } from "@/lib/availability";
import { categoryLabel, type VendorSearchItem } from "@/lib/types";
import { TILES } from "@/lib/categoryTiles";
import { Button, Chip, Field } from "@/components/ui";
import { CityCombobox } from "@/components/CityCombobox";
import { VendorCard, VendorCardSkeleton } from "@/components/VendorCard";

const PAGE_SIZE = 12;
// /vendors/search has no text-query parameter, so a typed query is filtered
// client-side — exactly as the iOS home does over its loaded vendors. Pull the
// largest page the API allows (cap: 100) while a query is active, or "dhol"
// would only ever search the twelve rows already on screen.
const QUERY_POOL = 100;

const SORTS = [
  { value: "rating", label: "Top rated" },
  { value: "price", label: "Price" },
];

const RATINGS = [
  { value: 0, label: "Any rating" },
  { value: 4, label: "4.0+" },
  { value: 4.5, label: "4.5+" },
];

/** Fields the typed query is matched against. iOS also matches a vendor's bio
 *  and subcategory; a search row carries neither, so those are simply absent. */
function matches(item: VendorSearchItem, q: string) {
  return [
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

  const [query, setQuery] = useState("");
  // Set once by /book after a draft add; read straight off the URL rather than
  // held in state, so it clears on the next navigation without any cleanup.
  const addedBundleId = searchParams.get("added");
  const addedName = searchParams.get("name");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [subcategory, setSubcategory] = useState<string | undefined>(
    searchParams.get("subcategory") ?? undefined,
  );
  const [showFilters, setShowFilters] = useState(false);

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
          category: category || undefined,
          subcategory,
          state: state || undefined,
          min_rating: minRating || undefined,
          max_price: maxPrice ? Number(maxPrice) : undefined,
          sort_by: sortBy,
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
    [category, subcategory, state, minRating, maxPrice, sortBy, pageSize],
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

  function pickCategory(tile: (typeof TILES)[number] | null) {
    setCategory(tile?.category ?? "");
    setSubcategory(tile?.subcategory);
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
  const activeTile = TILES.find(
    (t) => t.category === category && t.subcategory === subcategory,
  );
  const activeFilters =
    (place ? 1 : 0) + (date ? 1 : 0) + (minRating ? 1 : 0) + (maxPrice ? 1 : 0);
  const placeUnrecognised = place.trim() !== "" && !state;

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-10">
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

      <header className="text-center">
        <span className="eyebrow">Marketplace</span>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold sm:text-5xl">
          Every package on Jorna
        </h1>
        <p className="mx-auto mt-3 max-w-[52ch] text-ink-soft">
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

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip active={!activeTile} onClick={() => pickCategory(null)}>
          All
        </Chip>
        {TILES.map((tile) => (
          <Chip
            key={tile.label}
            active={activeTile?.label === tile.label}
            onClick={() => pickCategory(tile)}
          >
            {tile.label}
          </Chip>
        ))}
      </div>

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
                min={new Date().toISOString().slice(0, 10)}
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
              <Field
                label="From (optional)"
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
              />
              <Field
                label="Until (optional)"
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              />
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
              <VendorCard key={`${item.vendor_id}-${item.service_name ?? ""}`} item={item} />
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
