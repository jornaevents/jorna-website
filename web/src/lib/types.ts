// API types mirroring the Jorna FastAPI backend. Kept intentionally close to the
// backend Pydantic schemas so responses decode without transformation.

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  user_id: string;
  email: string;
  username: string;
  f_name?: string | null;
  l_name?: string | null;
  phone?: string | null;
  location?: string | null;
  pfp_url?: string | null;
}

// ── AI bundle builder ────────────────────────────────────────────────

export interface BundleItem {
  category: string;
  vendor_id?: string | null;
  service_id?: string | null;
  service_name?: string | null;
  vendor_name: string;
  pfp_url?: string | null;
  /**
   * What this slot costs — rate × quantity, resolved against the event's own
   * guest count and hours. Only when `price_pending_quantity` is true is this
   * still a bare rate, and then it must not be rendered as a total.
   *
   * The same three-field contract a booking carries, so an item and the booking
   * it becomes read the same way. Both go through `priceLine`.
   */
  price_min: number;
  price_max: number;
  price_unit?: string | null;
  price_pending_quantity?: boolean;
  rating: number;
  match_reason: string;
}

export interface Bundle {
  items: BundleItem[];
  estimated_total_min: number;
  estimated_total_max: number;
  /**
   * How many items are still priced at a rate. Non-zero means the totals above
   * carry those items at their rate rather than their real cost — a floor, not
   * an estimate. Say so rather than showing it as the price of the bundle.
   */
  pending_quantity_count?: number;
  unfilled_categories?: string[];
}

export interface BundleOption {
  label: string;
  description: string;
  factors: string[];
  bundle: Bundle;
  // The backend also returns `state` (opaque) and an optional `bundle_id`.
  bundle_id?: string | null;
}

export interface MultiBundleResponse {
  options: BundleOption[];
}

/**
 * A window the date falls somewhere inside — "sometime in October".
 *
 * Not a duration. A celebration that genuinely runs several days says so with
 * `event_date` + `event_date_end`, which become the booking's first and last
 * day: what per-day pricing multiplies by, what the escrow gate waits for, and
 * what the run sheet spreads across. A window is none of those — the backend
 * takes its first day as a provisional date and drops the width.
 */
export interface DateRange {
  start?: string | null;
  end?: string | null;
}

export interface BundleRequest {
  needed_categories?: string[];
  booked_categories?: string[];
  /**
   * Attach the generated bundle to a celebration the client already has,
   * instead of minting a new one. Without it, building a bundle for an
   * existing wedding produced a second dashboard card for the same wedding.
   */
  event_id?: string | null;
  event_date?: string | null;
  /** Last day, for a celebration that really does run across several. */
  event_date_end?: string | null;
  date_range?: DateRange | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  guest_count?: number | null;
  /** "HH:MM". Optional — without them every generated booking is TBD, and
      availability falls back to whole days. */
  time_start?: string | null;
  time_end?: string | null;
  budget_tier?: string | null;
  budget_amount?: string | null;
  style?: string[];
  preferences?: string[];
}

// The 10 chatbot bundle categories (slot keys) with display labels.
export const CATEGORY_LABELS: Record<string, string> = {
  venue: "Venue",
  catering: "Catering",
  photography: "Photography",
  videography: "Videography",
  dj: "DJ",
  dhol: "Dhol",
  floral_decor: "Floral & Decor",
  makeup: "Makeup & Hair",
  mehndi: "Mehndi",
  cultural_services: "Cultural Services",
};

// DB-level vendor categories (what /vendors/search rows carry) → display labels.
// A search row's `category` is the DB category (e.g. "music_entertainment"),
// not the bundle slot key ("dj"), so both maps are consulted.
const DB_CATEGORY_LABELS: Record<string, string> = {
  music_entertainment: "Music & Entertainment",
  beauty: "Beauty",
};

export function categoryLabel(key: string): string {
  return (
    CATEGORY_LABELS[key] ??
    DB_CATEGORY_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** A vendor's specializations, as the onboarding wizard and profile settings
 *  form need them: a list, never empty for a vendor who's finished setup.
 *  Falls back to a single-item list built from `category`/`subcategory` for
 *  a record that predates the backend's `specializations` column, or was
 *  created before that column's migration was deployed; see the comment on
 *  that field. */
export function vendorSpecializations(vendor: {
  category?: string | null;
  subcategory?: string | null;
  specializations?: VendorSpecialization[];
}): VendorSpecialization[] {
  if (vendor.specializations?.length) return vendor.specializations;
  return vendor.category ? [{ category: vendor.category, subcategory: vendor.subcategory ?? null }] : [];
}

// ── Browse / vendors ─────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** A row from /vendors/search — one vendor paired with one of their services. */
export interface VendorSearchItem {
  vendor_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  category: string;
  /** A row is a vendor+service pair; this names which listing it is. */
  service_id?: string | null;
  service_name?: string | null;
  service_price?: number | null;
  distance_miles?: number | null;
  /** The vendor's blended rating across every listing they sell. */
  rating?: number | null;
  /** This row's listing on its own. Read with `service_num_reviews`. */
  service_rating?: number | null;
  service_num_reviews?: number | null;
  location?: string | null;
  /** The vendor's account avatar — a fallback when the listing has no photo
   *  of its own. See `service_photo_url`. */
  pfp_url?: string | null;
  /** This listing's own cover photo (or a video's poster frame). The card
   *  leads with the service, so this takes priority over `pfp_url`. */
  service_photo_url?: string | null;
  travel_radius_miles?: number | null;
  open_to_long_distance?: boolean;
  tags?: string[];
}

/** One category, optionally narrowed to a speciality within it — what a
 *  vendor picks any number of during onboarding. See `specializations`
 *  below for why this is a list rather than a single pair. */
export interface VendorSpecialization {
  category: string;
  subcategory?: string | null;
}

export interface VendorDetail {
  vendor_id: string;
  user_id: string;
  bio?: string | null;
  /** The vendor's first specialization, mirrored here for older display code
   *  (vendor cards, the public profile badge) and as the default category
   *  for a new service — see `specializations` for the full list a vendor
   *  can pick from during onboarding. */
  category?: string | null;
  subcategory?: string | null;
  /** Every category(+speciality) a vendor sells under, not just the first. A
   *  2026-08-29 onboarding QA pass found the backend silently dropped
   *  everything past the first entry; Desiconnect migration 0045 adds a
   *  matching column and wires it through create/update/read. Once that's
   *  deployed this round-trips for real — until then, or for a record that
   *  predates it, `vendorSpecializations()` below reconstructs a one-item
   *  list from `category`/`subcategory` on reload. */
  specializations?: VendorSpecialization[];
  rating?: number | null;
  num_events?: number | null;
  travel_radius_miles?: number | null;
  open_to_long_distance?: boolean;
  open_to_price_negotiation?: boolean;
  f_name?: string | null;
  l_name?: string | null;
  location?: string | null;
  pfp_url?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram_username?: string | null;
  tags?: string[];
}

export interface MediaItem {
  url: string;
  type: "image" | "video";
  /** Set for videos (a server-generated poster frame); absent for photos,
   *  which have nothing else to show for themselves at thumbnail size. */
  thumbnail_url?: string | null;
}

/** A service's media, minus any entry with no actual file behind it. The
 *  backend has, in practice, returned array slots with an empty `url` (a
 *  photo that failed to finish uploading, a delete that didn't fully clean
 *  up) — those aren't a real photo or video, just a gap, and rendering them
 *  as-is means an `<img>`/`<video>` with no src: a blank tile in the gallery.
 *  Every place that renders `ServiceItem.media` should filter through this
 *  first rather than mapping the array directly. */
export function usableMedia(media?: MediaItem[] | null): MediaItem[] {
  return (media ?? []).filter((item) => Boolean(item?.url));
}

export interface ServiceItem {
  service_id: string;
  vendor_id: string;
  name: string;
  price: number;
  price_unit?: string | null;
  /** How long the service runs, when the vendor said. Returned by the API all
   *  along; it just had never been declared here. */
  duration_minutes?: number | null;
  experience?: string | null;
  media?: MediaItem[];
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  negotiable?: boolean;
  // Opt-in on top of whatever the price unit already demands — a vendor can
  // require a headcount/performer count for send-readiness purposes even when
  // pricing doesn't need one (see bookingGaps() in lib/planning.ts).
  require_guest_count?: boolean | null;
  require_performer_count?: boolean | null;
  // Venue services carry an address + map pin; the event's check-in anchor is
  // derived from the venue booking, so these get mirrored onto the booking.
  location?: string | null;
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  // This listing's own reviews. Read `rating` together with `num_reviews`: an
  // unreviewed listing reports 0, which is "new", not "one star".
  rating?: number | null;
  num_reviews?: number | null;
  vendor_name?: string | null;
  // The vendor's blended record across every listing they sell — a different
  // number answering a different question from `rating` above.
  vendor_rating?: number | null;
  vendor_pfp_url?: string | null;
}

export interface Review {
  review_id: string;
  vendor_id: string;
  // Which listing was reviewed. Null only for a review written before the
  // column existed whose service has since been removed.
  service_id?: string | null;
  user_id: string;
  rating: number;
  comment?: string | null;
  created_at?: string | null;
  reviewer_name?: string | null;
  reviewer_pfp?: string | null;
}

export interface VendorSearchParams {
  category?: string;
  subcategory?: string;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  sort_by?: string;
  state?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

// ── Bundles & bookings ───────────────────────────────────────────────

export interface BundleEventInfo {
  event_id: string;
  name: string;
  date_iso?: string | null;
  location?: string | null;
  guest_count?: number | null;
}

export interface BundleBooking {
  booking_id: string;
  status: string;
  payment_status?: string | null;
  date_iso?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  service_name?: string | null;
  service_category?: string | null;
  service_subcategory?: string | null;
  vendor_name?: string | null;
  vendor_id?: string | null;
  /** What the client told this vendor when requesting the booking (set on
   *  createBooking, before any vendor decision) — sent and read optimistically,
   *  same as VendorDetail.specializations; see the note in docs/API.md. */
  client_note?: string | null;
  price: number;
  amount_cents?: number | null;
  price_unit?: string | null;
  /** True when the total still needs a quantity (guests/dates) before paying. */
  price_pending_quantity?: boolean;
  // Quantity a rate-priced service multiplies by — carried across on a swap so
  // the replacement booking stays payable.
  date_end?: string | null;
  guest_count?: number | null;
  performer_count?: number | null;
  // Denormalized from the service, same as price_unit — see bookingGaps().
  require_guest_count?: boolean | null;
  require_performer_count?: boolean | null;
  /** Whether this service is open to price negotiation (service.negotiable). */
  open_to_price_negotiation?: boolean;
  /**
   * A date change out with this vendor, or lately settled by them. Null when
   * there's none — and null once accepted, because an accepted change is just
   * the booking's dates now, which the row already shows.
   */
  change_request?: ChangeRequest | null;
  /**
   * The venue's IANA timezone, resolved server-side from the address and pin.
   * Null when it can't be placed. Read it through `todayAtVenue` — "has the
   * event happened yet" is the escrow gate, and it has to be answered on the
   * venue's calendar, not the browser's.
   */
  timezone?: string | null;
  // Escrow lifecycle (ISO timestamps, null until they happen).
  /** When Stripe payment succeeded. */
  paid_at?: string | null;
  customer_confirmed_at?: string | null;
  vendor_confirmed_at?: string | null;
  funds_released_at?: string | null;
  /**
   * What cancelling this booking would pay out right now — server-computed
   * (see cancellation_split on the backend), so the countdown on screen is
   * never a client-side reimplementation of the ramp. Only present while
   * payment_status is "paid"; null otherwise.
   */
  refund_preview?: RefundPreview | null;
  // GPS venue check-ins — presence, not escrow. Neither releases funds; that's
  // customer_confirmed_at / vendor_confirmed_at.
  vendor_checked_in_at?: string | null;
  client_checked_in_at?: string | null;
  // Whether the client may send this vendor their check-in email again, decided
  // by the same backend function the endpoint enforces — so the button is never
  // offered for a call that has to be refused. The reason is what to say when
  // it isn't offered.
  can_resend_checkin?: boolean;
  resend_checkin_reason?: string | null;
  /** When this vendor was last emailed about checking in, scheduled or asked for. */
  checkin_reminded_at?: string | null;
  /**
   * Booking fields the vendor has already been told, and which the server will
   * now refuse to change — `date_iso`, `location`, `guest_count`, `time_start`,
   * `time_end`, `date_end`. Empty while the plan is a draft.
   *
   * A field that is still blank is never listed: filling it completes the
   * request rather than altering it, which is the only way a booking that went
   * out short of a headcount ever becomes payable.
   */
  locked_fields?: string[];
}

/**
 * What cancelling a booking would pay out right now, per the backend's
 * cancellation_split: a full refund for 24h after the vendor accepts, then
 * nothing back to the client — the payment splits between the platform and
 * the vendor instead, on a ramp that favors the vendor the closer it gets to
 * the event. See GET /payments/bookings/{id}/cancellation-preview and the
 * embedded copy on the booking itself.
 */
export interface RefundPreview {
  /** ISO timestamp — full refund available up to this instant. Null if the
   *  booking hasn't been accepted yet (nothing has started the clock). */
  full_refund_until: string | null;
  /** The vendor's current cut, 0–99, if cancelled this instant. 0 while
   *  still inside the full-refund window. */
  vendor_pct_now: number;
  /** What the client would get back this instant, in cents. */
  client_refund_now_cents: number;
}

/**
 * How long after the event escrow releases on its own.
 *
 * Mirrors the backend's AUTO_RELEASE_DAYS. Confirming needs both parties, so a
 * client who never gets round to it used to hold their vendor's payment
 * indefinitely; after this long, not answering is taken as no objection.
 *
 * Not unconditional: the backend's auto_release_due also requires
 * `vendor_confirmed_at`, deliberately, so it never pays a vendor who hasn't
 * claimed to have delivered. A plan whose vendor stays silent never
 * auto-releases at all — so anything on screen has to say the vendor's
 * confirmation is the trigger, not merely the client's silence.
 */
export const AUTO_RELEASE_DAYS = 7;

/**
 * Today's date where the celebration is, as "YYYY-MM-DD".
 *
 * The escrow gate is "has the event happened yet", and that is a question about
 * the calendar hanging on the wall at the venue — not the server's, and not the
 * browser's. The backend publishes the venue's IANA zone on every booking
 * (booking_service._zone_name) and decides the gate against it; this reads the
 * same clock so the two can't reach different days.
 *
 * "en-CA" because its short date format is ISO — the one locale that gives
 * YYYY-MM-DD without assembling it by hand. Falls back to the browser's own
 * timezone for a booking the server couldn't place, which is what it did before
 * and is still nearer than UTC for most people.
 */
export function todayAtVenue(timezone?: string | null): string {
  try {
    return new Date().toLocaleDateString("en-CA", timezone ? { timeZone: timezone } : {});
  } catch {
    // An unrecognised zone name. Better the local calendar than a thrown error
    // on the screen where someone is trying to release a payment.
    return new Date().toLocaleDateString("en-CA");
  }
}

/** Whether the event's first day has arrived, at the venue. */
export function eventHasStarted(b: {
  date_iso?: string | null;
  timezone?: string | null;
}): boolean {
  if (!b.date_iso || b.date_iso === "TBD") return false;
  return todayAtVenue(b.timezone) >= b.date_iso;
}

/**
 * Whether this booking can be confirmed for escrow release yet.
 *
 * Mirrors the backend's event_confirmable_date, which has two routes. The
 * scheduled one: the booking's last day has passed. And the one that follows
 * the work instead of the calendar — the event has started and the vendor has
 * checked in at the venue.
 *
 * That second route exists because a booking runs to the time it was written
 * down for and a job frequently doesn't. Waiting out a three-day window to
 * settle up with someone who finished on the first afternoon is waiting on a
 * date, not on anything happening. A GPS check-in is the vendor's own evidence
 * they turned up, so it's what the day is allowed to turn on.
 *
 * Both halves of that route are needed: a vendor can check in early — dropping
 * equipment off the night before — and that isn't the event taking place.
 */
export function canConfirmBooking(b: {
  date_iso?: string | null;
  date_end?: string | null;
  timezone?: string | null;
  vendor_checked_in_at?: string | null;
}): boolean {
  if (eventIsOver(b)) return true;
  return Boolean(b.vendor_checked_in_at) && eventHasStarted(b);
}

/**
 * The date escrow releases itself, or null when there's no date to count from.
 *
 * Built from local date parts rather than `toISOString()`. That converts to UTC
 * first, so east of Greenwich a local midnight is the *previous* day there —
 * and the date printed beside "this releases on its own on…" came out a day
 * early for every host in India, which is not a niche case for this product.
 */
export function autoReleaseOn(b: {
  date_iso?: string | null;
  date_end?: string | null;
}): string | null {
  const last = lastDay(b);
  if (!last || last === "TBD") return null;
  const d = new Date(`${last}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + AUTO_RELEASE_DAYS);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Parse a timestamp from the API to epoch ms, or null if unusable.
 *
 * These come from Python's `datetime.isoformat()`. The values are written as
 * UTC, but the columns aren't timezone-aware, so a round-trip may hand back
 * either "…T10:00:00+00:00" or a bare "…T10:00:00". Naive strings are read as
 * UTC; anything already carrying Z or ±HH:MM is left alone (appending "Z" to
 * an offset would produce an unparseable string).
 */
export function parseServerTime(ts?: string | null): number | null {
  if (!ts) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(ts);
  const parsed = Date.parse(hasZone ? ts : `${ts}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** True while cancelling right now would still return the full amount. */
export function isFullRefundNow(preview?: RefundPreview | null): boolean {
  const until = parseServerTime(preview?.full_refund_until ?? null);
  if (until === null) return false;
  return Date.now() < until;
}

/**
 * How much of the full-refund grace period is left, in words. Null once it's
 * gone (the ramp has started) or never started (not yet accepted).
 *
 * Read from the server's own `full_refund_until`, not recomputed from
 * `paid_at` client-side — the grace period runs from vendor acceptance, and
 * the exact cutoff (and everything past it) is the backend's cancellation_split
 * to know, not a constant duplicated here. A deadline worth having is a
 * deadline worth stating, so this is shown counting down rather than the
 * option simply disappearing once it's gone.
 */
export function fullRefundTimeLeft(preview?: RefundPreview | null): string | null {
  const until = parseServerTime(preview?.full_refund_until ?? null);
  if (until === null) return null;
  const msLeft = until - Date.now();
  if (msLeft <= 0) return null;
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours >= 1) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minutes = Math.max(1, Math.floor(msLeft / 60_000));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * Whether the event is far enough along to confirm. Mirrors the backend's
 * event_confirmable_date: funds never release before the event's last day, and
 * a TBD date isn't confirmable at all.
 */
/** A check-in timestamp as a short local date + time. Check-ins are stored as
 *  ISO strings; an unparseable one degrades to a vague word rather than "NaN". */
export function formatCheckInTime(iso?: string | null): string {
  if (!iso) return "already";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "already"
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/**
 * Whether a day is behind us at the venue.
 *
 * Strictly after: the last day being *reached* isn't the event being over, and
 * at one minute past midnight on the morning of the wedding it plainly hasn't
 * happened. Mirrors the backend's `today > end`. A client whose vendor finishes
 * early still settles up the same day through the check-in route — see
 * canConfirmBooking.
 */
export function eventHasPassed(dateIso?: string | null, timezone?: string | null): boolean {
  if (!dateIso || dateIso === "TBD") return false;
  return todayAtVenue(timezone) > dateIso;
}

/** When a booking finishes: its end date if it spans days, else its date. */
export function lastDay(b: {
  date_iso?: string | null;
  date_end?: string | null;
}): string | null | undefined {
  return b.date_end || b.date_iso;
}

/**
 * Whether a booking is over, which is the gate on confirming it for escrow
 * release.
 *
 * The backend's event_confirmable_date measures the LAST day, so a Friday-to-
 * Sunday booking isn't confirmable on the Saturday. This was written out by
 * hand in five places and one of them said `date_iso` — which offered the
 * client "Confirm & release" partway through their own multi-day event, and
 * got them a refusal naming a date the same screen hadn't mentioned. It's a
 * function now so there's nothing left to mistype.
 */
export function eventIsOver(b: {
  date_iso?: string | null;
  date_end?: string | null;
  timezone?: string | null;
}): boolean {
  return eventHasPassed(lastDay(b), b.timezone);
}

export interface BundleDetail {
  bundle_id: string;
  user_id: string;
  name: string;
  event_name?: string | null;
  status: string;
  event_id?: string | null;
  event?: BundleEventInfo | null;
  bookings: BundleBooking[];
  booking_count: number;
  total_estimated_cost: number;
  status_breakdown?: Record<string, number>;
  created_at?: string | null;
  updated_at?: string | null;
}

// ── Vendor taxonomy & profile ────────────────────────────────────────

export interface TaxonomyOption {
  value: string;
  label: string;
}

export interface TaxonomyCategory extends TaxonomyOption {
  subcategories: TaxonomyOption[];
}

export interface VendorCreateInput {
  bio: string;
  /** Optional. What a vendor sells is each service's own category — signing up
   *  no longer asks, and an unset one is stored as "other" until a service says
   *  otherwise. Search reads the services (see the backend's search_vendors). */
  category?: string;
  subcategory?: string | null;
  /** The full multi-select list; `category`/`subcategory` above mirror its
   *  first entry. Sent alongside rather than instead of them — the backend
   *  persists both independently (see the comment on
   *  `VendorDetail.specializations`), so they stay in sync rather than one
   *  being derived from the other. */
  specializations?: VendorSpecialization[];
}

export interface VendorUpdateInput {
  bio?: string;
  category?: string;
  subcategory?: string | null;
  specializations?: VendorSpecialization[];
  travel_radius_miles?: number | null;
  open_to_long_distance?: boolean;
  open_to_price_negotiation?: boolean;
  open_to_location_negotiation?: boolean;
  instagram_username?: string | null;
}

// ── Moderation ───────────────────────────────────────────────────────

export const REPORT_REASONS = [
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Scam or fraud" },
  { value: "other", label: "Something else" },
];

export type ReportTargetType = "user" | "vendor" | "review" | "message" | "conversation";

export interface BlockedUser {
  blocked_user_id: string;
  blocked_name: string;
  blocked_vendor_id?: string | null;
}

// ── Date changes ─────────────────────────────────────────────────────
//
// Events move, and once a request is with a vendor its date is theirs to hold —
// so changing it is a request of its own rather than an edit. Turn-based, like
// a negotiation: the client proposes plan-wide, each vendor answers for their
// own booking, and only a resolution touches anything.

/** How long a vendor has to answer. Mirrors the backend's RESPONSE_WINDOW_DAYS,
 *  which reads AUTO_RELEASE_DAYS — one waiting period in the product, not two. */
export const CHANGE_RESPONSE_DAYS = 7;

/** What the vendor keeps when they can't meet a proposed date. */
export const RESCHEDULE_CANCELLATION_PCT = 10;

export interface ChangeRequest {
  change_request_id: string;
  booking_id?: string;
  /** pending | accepted | declined | withdrawn | expired */
  status: string;
  /** Null on any field means "leave this as it is". */
  date_iso?: string | null;
  date_end?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  message?: string | null;
  /** What the vendor said when declining. */
  response_message?: string | null;
  /**
   * Set when the vendor accepted and the new dates cost more. Its presence *is*
   * the "waiting on the client" state — there's no separate flag that could get
   * out of step with it.
   */
  repriced_amount_cents?: number | null;
  client_consented_at?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  expires_at?: string | null;
  /** Present on the board, so a row can name what it's moving from. */
  service_name?: string | null;
  vendor_id?: string | null;
  from_date_iso?: string | null;
  from_date_end?: string | null;
  from_time_start?: string | null;
  from_time_end?: string | null;
}

/** Whether this request is waiting on the client rather than the vendor. */
export function awaitingClientConsent(cr: ChangeRequest): boolean {
  return cr.status === "pending" && cr.repriced_amount_cents != null;
}

/** A refund is offered once a vendor has said no, or said nothing in time. */
export function refundableAfterChange(cr?: ChangeRequest | null): boolean {
  return cr?.status === "declined" || cr?.status === "expired";
}

// ── Negotiation ──────────────────────────────────────────────────────

export interface NegotiationOffer {
  offer_id?: string;
  amount_cents: number;
  proposed_by: string;
  proposed_by_name?: string | null;
  message?: string | null;
  created_at?: string | null;
}

export interface Negotiation {
  negotiation_id: string;
  booking_id: string;
  /** open | accepted | rejected */
  status: string;
  current_offer_cents: number;
  current_offer_dollars?: number;
  /** Whoever made the current offer — the *other* party responds. */
  proposed_by: string;
  proposed_by_name?: string | null;
  offers?: NegotiationOffer[];
  created_at?: string | null;
  updated_at?: string | null;
}

// ── Conversations (group chat) ───────────────────────────────────────

/**
 * What a conversation is about. Exactly one of the three ids on a summary is
 * set, and this says which.
 *
 *   bundle    the group chat for a plan — every vendor on it, and the client
 *   booking   the client and one vendor, privately, about one booking
 *   enquiry   the client and one vendor, before anything is booked
 */
export type ConversationSubject = "bundle" | "booking" | "enquiry";

/** A negotiation event, carried on an `offer` message. */
export interface OfferMeta {
  negotiation_id?: string;
  offer_id?: string;
  /** offer | counter | accept | reject */
  action?: string;
  amount_cents?: number | null;
}

/** The listing an enquiry was asked from, carried on its first message. */
export interface ServiceRefMeta {
  service_id?: string;
  service_name?: string;
}

export interface GroupMessage {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_pfp?: string | null;
  content: string;
  created_at: string;
  /**
   * text | offer | system. `content` is a human sentence whatever the kind, so
   * an unknown one still renders something true — the kind only decides
   * whether a card is drawn around it.
   */
  kind?: string | null;
  meta?: (OfferMeta & ServiceRefMeta) | null;
  read_by?: string[];
}

export interface ConversationSummary {
  conversation_id: string;
  subject_type?: ConversationSubject | null;
  bundle_id?: string | null;
  booking_id?: string | null;
  vendor_id?: string | null;
  /** Named per viewer for the two-person threads — see the server's _display_name. */
  name?: string | null;
  /** all_parties | vendors_only | direct */
  type?: string | null;
  member_count?: number;
  members?: Array<{ user_id: string; name?: string | null; pfp_url?: string | null }>;
  /** Unread in this thread, for this reader. */
  unread_count?: number;
  last_message?: {
    message_id?: string;
    content?: string | null;
    sender_id?: string | null;
    sender_name?: string | null;
    kind?: string | null;
    created_at?: string | null;
  } | null;
  created_at?: string | null;
}

// ── Vendor availability ──────────────────────────────────────────────

/** A weekly availability window. day_of_week: 0=Monday … 6=Sunday. */
export interface AvailabilitySlot {
  availability_id?: string;
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string;
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * GET /vendors/{id}/availability — a vendor's published hours plus the times
 * they're already taken, over a queried date range.
 *
 * The backend declares no response schema for this endpoint, so these fields
 * are inferred from live responses (all empty at the time of writing) and are
 * deliberately loose. lib/availability reads them defensively and fails open.
 */
export interface VendorAvailability {
  vendor_id?: string;
  /** Published working hours, keyed by day-of-week or ISO date depending on the backend. */
  baseline_hours_map?: Record<string, unknown>;
  internal_busy_times?: unknown[];
  google_busy_times?: unknown[];
  google_calendar_connected?: boolean;
  google_calendar_error?: string | null;
}

/**
 * GET /vendors/{id}/calendar-status — owner-only. `write_enabled` is false
 * for a vendor connected before booking write-back requested the broader
 * scope; Google never widens a standing grant on its own, so this is the
 * only reliable way to tell "connected" from "connected with write access."
 */
export interface CalendarStatus {
  google_calendar_connected: boolean;
  google_calendar_write_enabled: boolean;
}

// ── Vendor-side bookings ─────────────────────────────────────────────

/** A booking as the vendor sees it (the fuller `_booking_dict` payload). */
export interface VendorBooking {
  booking_id: string;
  user_id: string;
  client_name?: string | null;
  service_id?: string | null;
  service_name?: string | null;
  service_category?: string | null;
  service_subcategory?: string | null;
  price: number;
  price_unit?: string | null;
  price_pending_quantity?: boolean;
  guest_count?: number | null;
  performer_count?: number | null;
  require_guest_count?: boolean | null;
  require_performer_count?: boolean | null;
  bundle_id?: string | null;
  event_name?: string | null;
  date_iso?: string | null;
  date_end?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  /** What the client said when requesting this — see BundleBooking.client_note. */
  client_note?: string | null;
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  /** The point check-in is measured against: the venue's pin, or the event's
      own address when no venue is booked. Gate the button on this, not on
      venue_latitude — the server resolves it the same way. */
  checkin_latitude?: number | null;
  checkin_longitude?: number | null;
  /** The venue's IANA timezone — see BundleBooking.timezone. */
  timezone?: string | null;
  /** A date change this vendor still owes an answer on. */
  change_request?: ChangeRequest | null;
  status: string;
  payment_status?: string | null;
  amount_cents?: number | null;
  negotiable?: boolean;
  paid_at?: string | null;
  customer_confirmed_at?: string | null;
  vendor_confirmed_at?: string | null;
  funds_released_at?: string | null;
  vendor_checked_in_at?: string | null;
  client_checked_in_at?: string | null;
}

// ── Vendor payments ──────────────────────────────────────────────────

export interface StripeStatus {
  stripe_account_id?: string | null;
  /** Whether money can actually reach this vendor — see the backend's
   *  _onboarding_complete. Not "did they fill the form in". */
  stripe_onboarding_complete: boolean;
  /** They reached the end of Stripe's form once. Says nothing about whether
   *  Stripe has since asked for more. */
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  /** Stripe's own word for why, e.g. "requirements.past_due". */
  disabled_reason?: string | null;
  /** Raw Stripe field names the vendor still owes, e.g. "individual.id_number".
   *  Render through `requirementLabel` — these are API keys, not English. */
  requirements_due?: string[];
  /** Stripe is checking something it already has. Nothing for the vendor to do. */
  pending_verification?: boolean;
}

export interface EarningsEntry {
  booking_id: string;
  event_name?: string | null;
  client_name?: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  /** What actually reaches the vendor: amount minus the platform fee. */
  net_cents: number;
  payment_status?: string | null;
  paid_at?: string | null;
  funds_released_at?: string | null;
}

export interface Earnings {
  vendor_id: string;
  total_released_cents: number;
  in_escrow_cents: number;
  upcoming_cents: number;
  upcoming_count: number;
  disputed_cents: number;
  refunded_cents: number;
  platform_fees_cents: number;
  history: EarningsEntry[];
}

// ── Events ───────────────────────────────────────────────────────────

export interface EventItem {
  event_id: string;
  user_id: string;
  name: string;
  date_iso?: string | null;
  location?: string | null;
  event_type?: string | null;
  description?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  services_needed?: string[] | null;
  /** The event's check-in anchor, derived from its live venue booking. */
  venue_latitude?: number | null;
  venue_longitude?: number | null;
}

export interface EventCreateInput {
  name: string;
  date_iso: string;
  location: string;
  event_type?: string | null;
  description?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  services_needed?: string[] | null;
  // Where `location` actually is, so a plan held somewhere the client arranged
  // themselves can still be checked into. Distinct from the event's
  // venue_latitude/longitude, which the backend derives from a booked venue and
  // clears when that venue goes — these are the client's and survive it.
  address_latitude?: number | null;
  address_longitude?: number | null;
}

/** Booking lifecycle labels. Mirrors the backend BookingStatus values. */
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting vendor",
  negotiation_ongoing: "Negotiating",
  approved: "Approved",
  rejected: "Declined",
  payment_confirmed: "Paid",
};

/** Escrow states. Mirrors the backend payment_status values. */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Not paid",
  processing: "Processing",
  paid: "Held in escrow",
  released: "Released to vendor",
  refunded: "Refunded",
  // Set only by a post-grace client cancellation (cancel_booking):
  // the client got nothing back, and the vendor was paid their share of the
  // cancellation split — distinct from "refunded", which always means 100%
  // came back to the client.
  cancelled: "Cancelled",
  disputed: "Disputed",
};

/**
 * What quantity a service's rate is multiplied by. The booking must capture
 * that quantity up front or its total can't be resolved and checkout refuses
 * (see resolve_total_cents / price_pending_quantity on the backend).
 */
export type PriceUnitKind = "person" | "day" | "hour" | "event" | "performer";

/**
 * What quantity a rate multiplies by.
 *
 * Mirrors the backend's _normalize_unit exactly, because price_unit is free text
 * a vendor types and that function is what actually prices the booking. This
 * used to match only "person", "day" and "hour", so a caterer priced "per head"
 * read as flat-rate here — no guest count demanded before sending, no total
 * resolvable at checkout, and a vendor holding an accepted booking nobody could
 * pay for.
 */
export function priceUnitKind(unit?: string | null): PriceUnitKind {
  if (!unit) return "event";
  let u = unit.trim().toLowerCase();
  if (u.startsWith("per ")) u = u.slice(4).trim();
  if (u.startsWith("hour")) return "hour";
  if (u.startsWith("day")) return "day";
  if (u.startsWith("event")) return "event";
  if (
    u.startsWith("performer") ||
    ["dancer", "dancers", "entertainer", "entertainers"].includes(u)
  ) {
    return "performer";
  }
  if (u.startsWith("person") || ["head", "plate", "guest", "pax"].includes(u)) {
    return "person";
  }
  return "event";
}

/** Human label for a price unit, e.g. "per person"; "" for flat/event pricing. */
export function priceUnitLabel(unit?: string | null): string {
  if (!unit) return "";
  const u = unit.toLowerCase().replace(/^per\s+/, "").trim();
  if (u === "event" || u === "flat") return "";
  return `per ${u}`;
}

// ── What a booking's price figure actually is ────────────────────────
//
// `price` on a booking holds two different things over its life. While the
// quantity is unknown it's the rate — $38, captioned "per person". Once the
// guest count arrives the backend resolves the same field to the total, and
// $7,600 kept the caption "per person": a head price read as forty times too
// large, on the screen where you decide whether to pay it.
//
// The caption has to follow the figure, so it's derived from the same data
// rather than from the unit alone.

/** Fields any priced booking carries — bundle-side and vendor-side alike. */
export interface PricedBooking {
  price: number;
  price_unit?: string | null;
  price_pending_quantity?: boolean;
  guest_count?: number | null;
  performer_count?: number | null;
  date_iso?: string | null;
  date_end?: string | null;
  time_start?: string | null;
  time_end?: string | null;
}

/** Nights are counted inclusively, matching the backend's day arithmetic. */
function dayCount(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || startIso === "TBD") return null;
  const last = endIso && endIso !== "TBD" ? endIso : startIso;
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
}

/** A window that ends before it starts has crossed midnight, not gone backwards. */
function hourCount(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  let hours = eh + em / 60 - (sh + sm / 60);
  if (hours <= 0) hours += 24;
  return hours > 0 && hours <= 24 ? Math.round(hours * 100) / 100 : null;
}

/** The quantity a rate was multiplied by, or null when it can't be read. */
export function priceQuantity(b: PricedBooking): { count: number; noun: string } | null {
  const one = (n: number, noun: string) => ({ count: n, noun: n === 1 ? noun : `${noun}s` });
  switch (priceUnitKind(b.price_unit)) {
    case "person": {
      const guests = b.guest_count ?? 0;
      return guests > 0 ? one(guests, "guest") : null;
    }
    case "performer": {
      const performers = b.performer_count ?? 0;
      return performers > 0 ? one(performers, "performer") : null;
    }
    case "day": {
      const days = dayCount(b.date_iso, b.date_end);
      return days ? one(days, "day") : null;
    }
    case "hour": {
      const hours = hourCount(b.time_start, b.time_end);
      return hours ? one(hours, "hour") : null;
    }
    default:
      return null;
  }
}

export interface PriceLine {
  /** The figure to show. */
  amount: number;
  /** What it is: "per person", "Total · 200 guests", or "" for flat pricing. */
  caption: string;
  /** True when `amount` is a resolved total rather than a rate. */
  isTotal: boolean;
}

/**
 * The figure and its caption, kept in agreement.
 *
 * The rate is deliberately not recovered by dividing the total: money() rounds
 * to whole dollars, so a $37.50 head price would print "$38 × 200" beside a
 * total of $7,500 and the two wouldn't reconcile. A sum that doesn't add up is
 * worse than one that isn't shown, so the quantity is named instead — which is
 * the part worth checking anyway, and the part the app can state exactly.
 *
 * When `price_pending_quantity` is absent the quantity stands in for it: a rate
 * unit with nothing to multiply by hasn't been resolved.
 */
export function priceLine(b: PricedBooking): PriceLine {
  if (priceUnitKind(b.price_unit) === "event") {
    return { amount: b.price, caption: "", isTotal: true };
  }
  const quantity = priceQuantity(b);
  if (b.price_pending_quantity ?? quantity == null) {
    return { amount: b.price, caption: priceUnitLabel(b.price_unit), isTotal: false };
  }
  const count = quantity
    ? `${Number.isInteger(quantity.count) ? quantity.count.toLocaleString() : quantity.count} ${quantity.noun}`
    : null;
  return { amount: b.price, caption: count ? `Total · ${count}` : "Total", isTotal: true };
}

// ── Guest lists ──────────────────────────────────────────────────────
//
// A celebration here is usually several gatherings with different guest lists,
// and the number that matters is per gathering: a caterer bills against the
// headcount for the function they're working, not for the week.

/** One gathering within a celebration — a mehndi, a sangeet, a reception. */
export interface EventFunction {
  function_id: string;
  event_id: string;
  name: string;
  /** Its own day and hours. Null falls back to the celebration's. */
  date_iso?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  sort_order: number;
}

/** What a guest said about one function. */
export interface GuestInvite {
  function_id: string;
  status: "no_reply" | "attending" | "declined";
  /** What they actually committed to, which isn't always what was expected. */
  attending_count?: number | null;
  responded_at?: string | null;
}

/**
 * Somebody invited — a person or a household. One row per invitation rather
 * than per body: "the Kapoor family, 4" is how a list is kept.
 */
export interface Guest {
  guest_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** How many the host expects under this name. */
  party_size: number;
  note?: string | null;
  /** Arrived through the shared link rather than being added by the host. */
  self_added: boolean;
  /** Their own link. Sending it is how they get to reply. */
  token: string;
  invites: GuestInvite[];
}

/** What the replies add up to, per function. */
export interface FunctionHeadcount {
  function_id: string;
  name: string;
  date_iso?: string | null;
  /** Invitations, not people. */
  invited: number;
  /** People. An attending_count where given, otherwise the party size. */
  attending: number;
  declined: number;
  no_reply: number;
  /** What the host put down — the figure a plan is usually built against. */
  expected: number;
}

export interface GuestList {
  functions: EventFunction[];
  guests: Guest[];
  headcount: FunctionHeadcount[];
  /** The shared link's token, or null when there isn't one out there. */
  invite_link: string | null;
}

/** The invitation a link opens. Bounded by what an invitation should say. */
export interface Invitation {
  event_name: string;
  functions: EventFunction[];
  location?: string | null;
  date_iso?: string | null;
  /** Null when the link is the shared one and the reader is nobody yet. */
  guest: {
    name: string;
    party_size: number;
    replies: { function_id: string; status: string; attending_count?: number | null }[];
  } | null;
}

export interface RsvpReply {
  function_id: string;
  status: "attending" | "declined";
  attending_count?: number | null;
}

/**
 * The gap between what a function is planned for and what people have said.
 *
 * Deliberately reports rather than decides. A vendor booked for two hundred is
 * holding a promise, not a variable — so this is the difference the host looks
 * at, not a number anything changes on its own.
 */
export function headcountGap(
  counts: FunctionHeadcount,
  plannedFor?: number | null,
): { delta: number; settled: boolean } | null {
  if (plannedFor == null || plannedFor <= 0) return null;
  return {
    delta: counts.attending - plannedFor,
    // Everyone has answered, so the number won't move on its own.
    settled: counts.no_reply === 0 && counts.invited > 0,
  };
}
