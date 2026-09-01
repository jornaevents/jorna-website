"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { celebrationByKey } from "@/lib/celebrations";
import { deleteBundle, generateBundles } from "@/lib/jorna";
import { CATEGORY_LABELS, categoryLabel, type BundleOption } from "@/lib/types";
import { unchosenBundleIds } from "@/lib/planning";
import { Button, Card, Chip, Field, TimeField } from "@/components/ui";
import { BundleResults } from "@/components/BundleResults";
import { ClientOnlyRoute } from "@/components/ClientOnlyRoute";
import { CityCombobox, type Coords } from "@/components/CityCombobox";
import { locateZip, type ZipPlace } from "@/lib/zips";

const BUDGETS = [
  { value: "budget-friendly", label: "Budget-friendly", hint: "Smart value" },
  { value: "mid-range", label: "Balanced", hint: "Best mix" },
  { value: "premium", label: "Premium", hint: "Top tier" },
];

const STYLES = ["elegant", "traditional", "modern", "luxury", "fun", "minimal"];
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

// Inline icons (stroke = currentColor) — nothing fetched over the network.
const svg = "size-[18px] shrink-0";
const IconPin = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={svg}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const IconCalendar = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={svg}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
const IconUsers = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={svg}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M20.5 19a5.5 5.5 0 0 0-3.2-5" />
  </svg>
);

function SkeletonBundles() {
  return (
    <section className="mt-10">
      {/* Left, matching the results this stands in for — otherwise the heading
          jumps from centre to left the moment the bundles arrive. */}
      <h2 className="serif text-3xl text-ink">Assembling three vendor teams…</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Matching packages to your date, budget, and vibe.
      </p>
      <div className="mt-6 grid gap-4 pt-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-5">
            <div className="mx-auto h-6 w-28 animate-pulse rounded bg-line-soft" />
            <div className="mx-auto mt-4 h-9 w-32 animate-pulse rounded bg-line-soft" />
            <div className="my-4 h-px bg-line-soft" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="size-9 animate-pulse rounded-full bg-line-soft" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-line-soft" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-line-soft" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 h-11 w-full animate-pulse rounded-full bg-line-soft" />
          </Card>
        ))}
      </div>
    </section>
  );
}

function PlanInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  // Arriving from a "Trending celebrations" tile on Home (/plan?event=wedding).
  // Only the category selection is seeded from it — see lib/celebrations.
  const celebration = celebrationByKey(params.get("event"));

  // Gate: send guests to sign in, then back here — keeping ?event= so the
  // preselection survives the round trip through sign-in.
  useEffect(() => {
    if (!loading && !user) {
      const next = celebration ? `/plan?event=${celebration.key}` : "/plan";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router, celebration]);

  // Arriving from a celebration on the dashboard
  // (/plan?event_id=&date=&city=&guests=). Seeded in the initializers, like
  // `needed` below, so the form is filled on the first paint.
  //
  // The celebration itself comes too, not just its facts. This used to prefill
  // only, and the generated bundle always minted its own event — so building a
  // bundle for a wedding already on the dashboard produced a second card for
  // the same wedding, with no way to merge them. Read once from the URL; it
  // isn't something the form edits.
  const attachToEventId = params.get("event_id");
  const [location, setLocation] = useState(params.get("city") ?? "");
  // Set when a suggested city is picked, so we can send coordinates for
  // distance-based matching; null when the location was free-typed.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [eventDate, setEventDate] = useState(params.get("date") ?? "");
  // A celebration that genuinely runs across days — a Friday-to-Sunday wedding.
  // This becomes the booking's date_end: what a per-day vendor bills for, and
  // what the escrow gate treats as the last day.
  const [eventDateEnd, setEventDateEnd] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [guests, setGuests] = useState(params.get("guests") ?? "");
  // Optional, and worth asking: a vendor's day isn't one booking, so knowing
  // the hours is what lets somebody with a morning ceremony be offered for an
  // evening reception. Left blank, every generated booking says TBD and
  // availability falls back to whole days — which turns those vendors away.
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  // A ZIP is a location somebody knows by heart, and it stands in for the city
  // when they'd rather not pick one. Resolved through the same table the address
  // form uses, to a city, a state, and roughly where that is — matching vendors
  // is a question about travel radius, so a point is what the backend wants.
  const [zip, setZip] = useState("");
  // Which of the two the person is answering with. A toggle rather than "fill
  // in whichever" — with both on screen it's never clear which one the search
  // is actually using, and the answer has to be one or the other.
  const [byZip, setByZip] = useState(false);
  // The answer is stored with the question it answers. Lookups are async, so
  // without the pairing a resolved place outlives the ZIP that produced it and
  // the hint reads "Evanston" for a moment after you've typed a Houston ZIP.
  const [resolved, setResolved] = useState<{ zip: string; place: ZipPlace | null } | null>(null);

  // What the ZIP is contributing: nothing unless it's the chosen mode, and
  // nothing for an answer belonging to a different ZIP. Derived rather than
  // cleared, so the effect below never writes state synchronously.
  const zipPlace = byZip && resolved?.zip === zip.trim() ? resolved.place : null;
  const zipPlaceLabel = zipPlace ? `${zipPlace.city}, ${zipPlace.state}` : "";
  const [budget, setBudget] = useState("mid-range");
  const [styles, setStyles] = useState<string[]>([]);
  // Seeded in the initializer rather than an effect, so an arriving celebration's
  // categories are ticked on the first paint instead of flicking on after it.
  const [needed, setNeeded] = useState<string[]>(celebration?.categories ?? []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<BundleOption[] | null>(null);
  const [choosingLabel, setChoosingLabel] = useState<string | null>(null);

  // Resolve a whole ZIP to its place. Only when there's no city, since a picked
  // city already carries its own coordinates and is the more precise answer.
  useEffect(() => {
    const clean = zip.trim();
    if (!/^\d{5}$/.test(clean)) return;
    let cancelled = false;
    void locateZip(clean).then(
      (place) => !cancelled && setResolved({ zip: clean, place }),
    );
    return () => {
      cancelled = true;
    };
  }, [zip]);

  /**
   * Open one of the three options. It stays a draft.
   *
   * POST /chatbot/bundles persists all three as drafts and — its own words —
   * holds vendor notifications until one is selected. This used to call
   * /bundles/{id}/select right here, which is the call that notifies them, so
   * vendors heard about plans that had no date and no address yet.
   *
   * Now the draft simply opens on the dashboard, where the missing details are
   * asked for; sending is a separate, deliberate act there. The other two drafts
   * stay until then — /select is what discards them — and since all three share
   * an event they appear as one celebration, not three.
   */
  async function choose(option: BundleOption) {
    if (!option.bundle_id) return;
    setChoosingLabel(option.label);
    setError(null);

    // Discarding the two you didn't pick and telling vendors about the one you
    // did are the same call — /bundles/{id}/select does both — and they want to
    // happen at different times. Deferring select to keep vendors uninformed
    // therefore left all three drafts on the dashboard, so the discard is done
    // here instead, and select still runs later as the act of sending.
    //
    // Each is deleted on its own: one failure shouldn't strand the other or
    // stop you opening the bundle you chose. A survivor shows up as its own
    // draft, which is visible and deletable, rather than as a silent orphan.
    const others = unchosenBundleIds(options ?? [], option.bundle_id);
    await Promise.all(
      others.map((id) =>
        deleteBundle(id).catch(() => {
          console.warn("Couldn't discard unchosen bundle", id);
        }),
      ),
    );

    router.push(`/bundle?id=${option.bundle_id}`);
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function generate() {
    if (needed.length === 0) {
      setError("Pick at least one category to include.");
      return;
    }
    setBusy(true);
    setError(null);
    setOptions(null);
    try {
      const res = await generateBundles({
        event_id: attachToEventId,
        needed_categories: needed,
        booked_categories: [],
        // Whichever the toggle is on. Both resolve to the same two things: a
        // name to put on the booking, and a point to match vendors against.
        location: (byZip ? zipPlaceLabel : location.trim()) || null,
        latitude: (byZip ? zipPlace?.point?.lat : coords?.lat) ?? null,
        longitude: (byZip ? zipPlace?.point?.lng : coords?.lng) ?? null,
        // A last day only when the celebration genuinely runs across days —
        // it becomes the booking's date_end, which a per-day vendor bills for
        // and the escrow gate waits out.
        event_date: eventDate || null,
        event_date_end: multiDay ? eventDateEnd || null : null,
        guest_count: guests ? Number(guests) : null,
        // Only as a pair. One half of a window says nothing an availability
        // check can use, and would be written onto the bookings as a start with
        // no end — which the send check then treats as a missing answer.
        time_start: timeStart && timeEnd ? timeStart : null,
        time_end: timeStart && timeEnd ? timeEnd : null,
        budget_tier: budget,
        style: styles,
      });
      setOptions(res.options);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't build your bundles. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return <div className="py-20 text-center text-ink-soft">Loading…</div>;
  }

  const allSelected = needed.length === ALL_CATEGORIES.length;

  return (
    <div className="mx-auto w-[min(var(--container-wide),100%-2rem)] py-8">
      {/* The title and the explanation sit side by side rather than stacked.
          Centred and stacked — eyebrow, a 5xl heading, two lines of prose and a
          rule — this was about 240px of chrome before the form began, on a page
          whose whole complaint was height. The same horizontal move as the rest
          of the refactor, applied to its own header.

          The rule is gone with it: the card below draws its own edge, and a
          divider between a title and the thing it titles was separating two
          things that belong together. */}
      <header className="lg:flex lg:items-end lg:justify-between lg:gap-12">
        <div className="min-w-0">
          <span className="eyebrow">AI bundle builder</span>
          <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold sm:text-4xl">
            {celebration ? `Build your ${celebration.label.toLowerCase()}` : "Build your celebration"}
          </h1>
        </div>
        <p className="mt-3 max-w-[52ch] text-sm text-ink-soft lg:mt-0 lg:shrink-0 lg:text-right">
          Tell us about your event and we&apos;ll assemble three complete vendor
          teams — Budget, Balanced, and Top Rated — to compare and book.
        </p>
      </header>

      <Card className="mt-6 p-5 sm:p-6">
        {/* Two columns from lg: where and when on the left, how big and how
            much on the right.

            grid-rows-subgrid is what makes them line up. Each column spans the
            parent's four rows and inherits them, so a group sits on the same
            row as its opposite number — heading beside heading, Where beside
            Guests — and both columns end on the same line because they are
            built from the same rows. Without it each column packs its own
            content and the two bottom edges land wherever they happen to.

            A row is as tall as the taller of its pair, so some slack under the
            shorter one is the deal. Slack under an aligned row reads as
            deliberate; a ragged bottom edge reads as an accident.

            Where subgrid isn't supported the column falls back to a plain
            grid — unaligned, but laid out and usable. */}
        {/* auto rows, not grid-rows-4 — that one means repeat(4,minmax(0,1fr)),
            four EQUAL rows, so the height of the tallest was handed to all of
            them and the heading row grew a field's worth of empty space under
            it. Each row should be as tall as its own content. */}
        <div className="lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto_auto_auto] lg:gap-x-9 lg:gap-y-6">
          <div className="grid gap-6 lg:row-span-4 lg:grid-rows-subgrid">
            <p className="eyebrow">The event</p>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-soft">
                  {byZip ? "ZIP code" : "City & state"}
                </span>
                <button
                  type="button"
                  onClick={() => setByZip((v) => !v)}
                  className="shrink-0 text-xs font-semibold text-gold hover:underline"
                >
                  {byZip ? "Use a city" : "Use a ZIP"}
                </button>
              </div>
              {byZip ? (
                <Field
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="60201"
                  icon={IconPin}
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, ""))}
                />
              ) : (
                <CityCombobox
                  placeholder="Start typing a city…"
                  icon={IconPin}
                  value={location}
                  onChange={(v, c) => {
                    setLocation(v);
                    setCoords(c);
                  }}
                />
              )}
              {/* Say what a ZIP resolved to. A field that quietly decides where
                  you're searching is worse than one that tells you. */}
              {byZip && zipPlaceLabel ? (
                <p className="mt-1 text-xs text-ink-faint">Looking near {zipPlaceLabel}.</p>
              ) : null}
            </div>

            {/* ── When ──────────────────────────────────────────────────
                A settled day, optionally running into others. It becomes the
                booking's first and last day: what a per-day vendor bills for,
                what the escrow gate waits out, what the run sheet lays out. */}
            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">When</p>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field
                  label={multiDay ? "First day" : "Event date"}
                  type="date"
                  icon={IconCalendar}
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
                {multiDay ? (
                  <Field
                    label="Last day"
                    type="date"
                    icon={IconCalendar}
                    min={eventDate || undefined}
                    value={eventDateEnd}
                    onChange={(e) => setEventDateEnd(e.target.value)}
                  />
                ) : (
                  <div className="flex items-end">
                    {/* Same affordance and wording as the booking form, so the
                        two places you can say this say it the same way. */}
                    <button
                      type="button"
                      className="pb-2.5 text-sm font-semibold text-gold hover:underline"
                      onClick={() => setMultiDay(true)}
                    >
                      + Runs across multiple days
                    </button>
                  </div>
                )}
              </div>
              {multiDay ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-ink-faint hover:text-ink"
                  onClick={() => {
                    setMultiDay(false);
                    setEventDateEnd("");
                  }}
                >
                  Single day instead
                </button>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">Time</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <TimeField label="Starts" value={timeStart} onChange={setTimeStart} />
                <TimeField label="Ends" value={timeEnd} onChange={setTimeEnd} />
              </div>
            </div>
          </div>

          {/* Right column. Guests moves here from beside the city: three groups
              each balances better than four and two, and it reads as how big
              and how much rather than a stray field. */}
          <div className="mt-6 grid gap-6 lg:row-span-4 lg:mt-0 lg:grid-rows-subgrid">
            <p className="eyebrow">Size and budget</p>

            <Field
              id="plan-guests"
              label="Guests"
              type="number"
              min={1}
              placeholder="200"
              icon={IconUsers}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">Budget</p>
              <div className="grid grid-cols-3 gap-2.5">
                {BUDGETS.map((b) => {
                  const active = budget === b.value;
                  return (
                    <button
                      key={b.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setBudget(b.value)}
                      className={`rounded-xl border px-3 py-3 text-center transition ${
                        active
                          ? "border-gold bg-gold/12 ring-1 ring-gold/40"
                          : "border-card-edge bg-ground-2 hover:border-gold/50"
                      }`}
                    >
                      <span
                        className={`block text-sm font-semibold ${active ? "text-maroon dark:text-gold" : "text-ink"}`}
                      >
                        {b.label}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] text-ink-faint">{b.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink-soft">
                Vibe <span className="text-ink-faint">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <Chip
                    key={s}
                    active={styles.includes(s)}
                    onClick={() => toggle(styles, setStyles, s)}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Full width, under both columns: the categories are the longest
            control on the form and the only one that wants the whole card. */}
        <div className="mt-6 border-t border-line-soft pt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-ink-soft">
              What you need{" "}
              <span className="text-ink-faint">
                · {needed.length}/{ALL_CATEGORIES.length}
              </span>
              {celebration ? (
                <span className="ml-1 text-ink-faint">
                  · preselected for a {celebration.label.toLowerCase()}, change anything
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-gold hover:underline"
              onClick={() => setNeeded(allSelected ? [] : ALL_CATEGORIES)}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          {/* The chips and the button share this row from lg. Below that the
              button drops beneath them at full width, which is also the
              fallback if nine categories beside a button ever reads tight. */}
          <div className="lg:flex lg:items-end lg:justify-between lg:gap-8">
            <div className="flex flex-wrap gap-2 lg:flex-1">
              {ALL_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  active={needed.includes(c)}
                  onClick={() => toggle(needed, setNeeded, c)}
                >
                  {categoryLabel(c)}
                </Chip>
              ))}
            </div>

            <Button
              size="lg"
              className="mt-6 w-full lg:mt-0 lg:w-auto lg:shrink-0"
              disabled={busy}
              onClick={generate}
            >
              <span aria-hidden="true">✦</span>
              {busy ? "Building your bundles…" : "Build my bundles"}
            </Button>
          </div>
        </div>

        {/* Above the row rather than beside the button — in the flex it would
            be a third item competing with the chips for width. */}
        {error ? (
          <p className="mt-5 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}
      </Card>

      {busy ? (
        <SkeletonBundles />
      ) : options ? (
        <section className="mt-10">
          {/* Left, with the rest of the page. Centred here they'd be the only
              centred thing left on it. */}
          <h2 className="serif text-3xl text-ink">Your three teams</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Compare, tweak, and choose — you can edit any bundle after picking it.
          </p>
          {options.every((o) => o.bundle.items.length === 0) ? (
            <p className="mt-8 text-center text-ink-soft">
              We couldn&apos;t find available vendors for those categories and date yet. Try a
              different date or fewer categories.
            </p>
          ) : (
            <BundleResults
              options={options}
              // What a per-person rate was priced against, so a resolved slot can
              // name it rather than showing a total with nothing behind it.
              guestCount={guests ? Number(guests) : null}
              onChoose={choose}
              choosingLabel={choosingLabel}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

// useSearchParams needs a Suspense boundary to prerender in the static export.
export default function PlanPage() {
  return (
    <ClientOnlyRoute>
      <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
        <PlanInner />
      </Suspense>
    </ClientOnlyRoute>
  );
}
