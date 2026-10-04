// High-level Jorna API calls used by the UI.

import { ApiError, apiFetch, apiUpload } from "@jorna/shared/lib/api";
import type {
  BundleDetail,
  BundleRequest,
  ChangeRequest,
  AvailabilitySlot,
  BlockedUser,
  CalendarStatus,
  Contract,
  ContractCreateInput,
  ContractUpdateInput,
  SavedContractTemplate,
  TemplateKind,
  AttachedDocument,
  AttachedDocumentKind,
  ConversationSummary,
  Earnings,
  EventCreateInput,
  EventFunction,
  EventItem,
  GroupMessage,
  Guest,
  GuestBooking,
  GuestBookingDetailsInput,
  GuestList,
  Invitation,
  RsvpReply,
  Lead,
  Pipeline,
  LeadCreateInput,
  LeadUpdateInput,
  Negotiation,
  ReportTargetType,
  StripeStatus,
  User,
  TaxonomyCategory,
  VendorBooking,
  VendorCreateInput,
  VendorUpdateInput,
  MediaItem,
  MultiBundleResponse,
  Paginated,
  RefundPreview,
  Review,
  ServiceItem,
  AddOn,
  PackageStatus,
  VendorDetail,
  VendorSearchItem,
  VendorSearchParams,
  VendorAvailability,
  NegotiationDraft,
  ProposalHistory,
  TermsChanges,
  TermsVersion,
} from "./types";

/** Generate the three comparison bundles (Budget / Balanced / Top Rated). */
export function generateBundles(req: BundleRequest): Promise<MultiBundleResponse> {
  return apiFetch<MultiBundleResponse>("/chatbot/bundles", {
    method: "POST",
    body: req,
  });
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Browse, vendor profiles, and reviews are public — no auth — so a visitor can
// look around before creating an account.

export function searchVendors(
  params: VendorSearchParams,
): Promise<Paginated<VendorSearchItem>> {
  return apiFetch<Paginated<VendorSearchItem>>(`/vendors/search${query({ ...params })}`, {
    auth: false,
  });
}

export function getVendor(vendorId: string): Promise<VendorDetail> {
  return apiFetch<VendorDetail>(`/vendors/${vendorId}`, { auth: false });
}

export function listServices(params: {
  vendor_id?: string;
  category?: string;
  subcategory?: string;
  limit?: number;
  offset?: number;
}): Promise<Paginated<ServiceItem>> {
  return apiFetch<Paginated<ServiceItem>>(`/services${query({ ...params })}`, {
    auth: false,
  });
}

/** The signed-in vendor's own packages, hidden and archived included — the
 *  public listServices only ever returns active ones. */
export function listMyServices(vendorId: string): Promise<Paginated<ServiceItem>> {
  return apiFetch<Paginated<ServiceItem>>(
    `/services${query({ vendor_id: vendorId, limit: 100, include_unlisted: "true" })}`,
  );
}

/** Everything a vendor has been reviewed on, across all their listings. */
export function getVendorReviews(vendorId: string): Promise<Paginated<Review>> {
  return apiFetch<Paginated<Review>>(`/reviews/vendor/${vendorId}`, { auth: false });
}

/**
 * Reviews for one listing. Narrower than the vendor's on purpose — a vendor
 * excellent at one thing and ordinary at another has two honest records, and a
 * listing shouldn't borrow the other one's.
 */
export function getServiceReviews(
  serviceId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<Paginated<Review>> {
  return apiFetch<Paginated<Review>>(`/reviews/service/${serviceId}${query({ ...params })}`, {
    auth: false,
  });
}

/** The review for a booking, or null if the client hasn't left one yet. */
export async function getBookingReview(bookingId: string): Promise<Review | null> {
  try {
    return await apiFetch<Review>(`/reviews/booking/${bookingId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Leave a review (client only, after the booking is approved/paid; one per booking). */
export function createReview(
  bookingId: string,
  rating: number,
  comment?: string,
): Promise<Review> {
  return apiFetch<Review>("/reviews", {
    method: "POST",
    body: { booking_id: bookingId, rating, comment: comment || null },
  });
}

export function getService(serviceId: string): Promise<ServiceItem> {
  return apiFetch<ServiceItem>(`/services/${serviceId}`, { auth: false });
}

// ── Booking ──────────────────────────────────────────────────────────

export interface BookingCreateInput {
  service_id: string;
  event_name: string;
  date_iso: string;
  time_start: string;
  time_end: string;
  location: string;
  /** Multi-day events only. Per-day pricing counts the end date inclusively. */
  date_end?: string | null;
  /** Required for per-person services, or the total can't be resolved. */
  guest_count?: number | null;
  /** Required for per-performer services (entertainment groups billed by
   *  how many performers they're asked to provide), same reasoning. */
  performer_count?: number | null;
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  /** Omit to have the backend create a bundle for this booking. */
  bundle_id?: string | null;
  /** Shown to the vendor alongside the request, before they accept/decline.
   *  Sent optimistically — same caveat as VendorCreateInput.specializations
   *  in docs/API.md — until the backend confirms it persists and returns
   *  this on VendorBooking/BundleBooking. */
  client_note?: string | null;
}

export interface BookingCreateResult {
  message: string;
  booking_id: string;
  bundle_id: string;
  status: string;
}

/** Request a service. Creates a `pending` booking for the vendor to approve. */
export function createBooking(input: BookingCreateInput): Promise<BookingCreateResult> {
  return apiFetch<BookingCreateResult>("/bookings", { method: "POST", body: input });
}

// ── Bundles & payments (all authenticated) ───────────────────────────

/** The signed-in user's bundles. Returns full bundle objects, not summaries. */
export function listBundles(): Promise<BundleDetail[]> {
  return apiFetch<BundleDetail[]>("/bundles");
}

export function getBundle(bundleId: string): Promise<BundleDetail> {
  return apiFetch<BundleDetail>(`/bundles/${bundleId}`);
}

/** Keep one bundle from a 3-option comparison group and discard the others. */
export function selectBundle(bundleId: string): Promise<unknown> {
  return apiFetch(`/bundles/${bundleId}/select`, { method: "POST" });
}

export function renameBundle(bundleId: string, name: string): Promise<unknown> {
  return apiFetch(`/bundles/${bundleId}`, { method: "PATCH", body: { name } });
}

export function deleteBundle(bundleId: string): Promise<void> {
  return apiFetch<void>(`/bundles/${bundleId}`, { method: "DELETE" });
}

/**
 * Set the details a booking is missing before it can be sent.
 *
 * These are the same fields lib/planning's bookingGaps checks, and this is the
 * only place they can be written — a draft's bundle may have no event to hang
 * them on, so the booking is the durable home for them.
 */
export interface BookingUpdateInput {
  date_iso?: string | null;
  date_end?: string | null;
  guest_count?: number | null;
  performer_count?: number | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
}

export function updateBooking(
  bookingId: string,
  updates: BookingUpdateInput,
): Promise<unknown> {
  return apiFetch(`/bookings/${bookingId}`, { method: "PATCH", body: updates });
}

/** Take a booking out of a bundle. Returns the refreshed bundle. */
export function removeBookingFromBundle(
  bundleId: string,
  bookingId: string,
): Promise<BundleDetail> {
  return apiFetch<BundleDetail>(`/bundles/${bundleId}/bookings/${bookingId}`, {
    method: "DELETE",
  });
}

/**
 * Start a Stripe-hosted Checkout Session for one booking. `client=web` makes
 * Stripe return into this app rather than the iOS deep-link bridge.
 */
export function createCheckoutSession(
  bookingId: string,
): Promise<{ checkout_url: string }> {
  return apiFetch<{ checkout_url: string }>(
    `/payments/bookings/${bookingId}/checkout-session?client=web`,
    { method: "POST" },
  );
}

/**
 * Reconcile a booking's payment straight from Stripe. Idempotent — a safety net
 * for a delayed webhook, called when the customer returns from Checkout.
 */
export function syncBookingPayment(bookingId: string): Promise<unknown> {
  return apiFetch(`/payments/bookings/${bookingId}/sync-payment`, { method: "POST" });
}

// ── Password reset ───────────────────────────────────────────────────

/** Email a reset link. `client=web` makes the link open the web app's reset page.
 *  Always resolves the same generic message (no user enumeration). */
export function requestPasswordReset(email: string): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email, client: "web" },
  });
}

/** Complete a reset with the emailed token. */
export function resetPassword(token: string, newPassword: string): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, new_password: newPassword },
  });
}

// ── Google OAuth ─────────────────────────────────────────────────────

export interface GoogleLookupResponse {
  // Present (with refresh_token) only when a Jorna account already exists or was
  // linked by email. Null when is_new_user — the client must register.
  access_token: string | null;
  refresh_token?: string | null;
  token_type: string;
  user_id: string | null;
  email: string | null;
  is_new_user: boolean;
}

/** Exchange a verified Supabase Google token for a Jorna session. No Jorna
 *  account is created here — a new identity comes back as is_new_user=true with
 *  its email, to be completed via /auth/register. */
export function googleLookup(supabaseAccessToken: string): Promise<GoogleLookupResponse> {
  return apiFetch<GoogleLookupResponse>("/auth/google/lookup", {
    method: "POST",
    auth: false,
    body: { access_token: supabaseAccessToken },
  });
}

/** Sign in with Google, creating the account on first use — the whole sign-up in
 *  one tap. Always returns a session, so `is_new_user` here only says whether the
 *  account was just made (useful for where to send them, not whether to ask for
 *  more). Idempotent, so retrying a dropped response is safe.
 *
 *  Distinct from googleLookup, which creates nothing: iOS still shows a
 *  registration form after looking up, so that endpoint has to stay pure. */
export function googleRegister(supabaseAccessToken: string): Promise<GoogleLookupResponse> {
  return apiFetch<GoogleLookupResponse>("/auth/google/register", {
    method: "POST",
    auth: false,
    body: { access_token: supabaseAccessToken },
  });
}

// ── Account (current user) ───────────────────────────────────────────

export interface MeUpdate {
  email?: string;
  f_name?: string;
  l_name?: string;
  phone?: string | null;
  location?: string;
}

/** Partial update of the signed-in user's profile. Returns the updated user. */
export function updateMe(updates: MeUpdate): Promise<User> {
  return apiFetch<User>("/me", { method: "PATCH", body: updates });
}

/**
 * Delete the signed-in account, permanently.
 *
 * The backend removes the user, their vendor profile if they have one, its
 * services and availability, and every booking on either side of the account.
 * There is no undo and no soft-delete to recover from.
 *
 * It does not check escrow. A booking holding money is deleted like any other,
 * and deleting it doesn't return the money — it removes the record of where the
 * money went, which is why deleting a *plan* is refused while any of its
 * bookings hold funds. Callers should apply that same rule here; the profile
 * page does.
 */
export function deleteMe(): Promise<void> {
  return apiFetch<void>("/me", { method: "DELETE" });
}

/** Upload a profile picture (multipart, field `file`). Returns the updated user. */
export function uploadAvatar(file: File): Promise<{ pfp_url: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<{ pfp_url: string }>("/me/avatar", form, { method: "PUT" });
}

/**
 * Change password. The backend bumps token_version, so this invalidates the
 * current session — the caller should sign the user out afterwards.
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>("/auth/change-password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

// ── Vendor profile ───────────────────────────────────────────────────

/**
 * The authoritative category taxonomy. Public, and read rather than hardcoded:
 * the backend rejects an invalid category/subcategory pair, so a local copy
 * that drifts would produce 400s the user can't act on.
 */
export function listVendorCategories(): Promise<{ categories: TaxonomyCategory[] }> {
  return apiFetch<{ categories: TaxonomyCategory[] }>("/vendors/categories", {
    auth: false,
  });
}

/** The signed-in user's vendor profile, or null if they aren't a vendor yet. */
export async function getMyVendor(): Promise<VendorDetail | null> {
  try {
    return await apiFetch<VendorDetail>("/vendors/me");
  } catch (err) {
    // 404 is the normal "not a vendor yet" answer, not a failure.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function createVendor(input: VendorCreateInput): Promise<VendorDetail> {
  return apiFetch<VendorDetail>("/vendors", { method: "POST", body: input });
}

export function updateMyVendor(updates: VendorUpdateInput): Promise<VendorDetail> {
  return apiFetch<VendorDetail>("/vendors/me", { method: "PATCH", body: updates });
}

// ── Vendor services ──────────────────────────────────────────────────

export interface ServiceInput {
  name: string;
  price: number;
  /** Optional since backend 0063 — filled from the vendor's years_experience. */
  experience?: string;
  /** hour | day | event | person — the quantity the rate multiplies by. */
  price_unit?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  negotiable?: boolean;
  /** Opt-in requirement on top of whatever price_unit already demands. */
  require_guest_count?: boolean;
  require_performer_count?: boolean;
  /** Required for venue-category services, along with the coordinates. */
  location?: string | null;
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  status?: PackageStatus;
  included_hours?: number | null;
  inclusions?: string[];
  add_ons?: AddOn[];
  deposit_percent?: number | null;
  cancellation_window_hours?: number | null;
  overtime_rate_cents?: number | null;
  sort_order?: number | null;
  /** Marking one clears it from the vendor's other packages. */
  is_popular?: boolean;
}

export function createService(input: ServiceInput): Promise<ServiceItem> {
  return apiFetch<ServiceItem>("/services", { method: "POST", body: input });
}

export function updateService(
  serviceId: string,
  updates: Partial<ServiceInput>,
): Promise<ServiceItem> {
  return apiFetch<ServiceItem>(`/services/${serviceId}`, {
    method: "PATCH",
    body: updates,
  });
}

export function deleteService(serviceId: string): Promise<void> {
  return apiFetch<void>(`/services/${serviceId}`, { method: "DELETE" });
}

/** Upload one or more photos for a service. Multipart; field name is `files`. */
export function uploadServiceImages(
  serviceId: string,
  files: File[],
): Promise<{ media: MediaItem[] }> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return apiUpload<{ media: MediaItem[] }>(`/services/${serviceId}/images`, form);
}

export function deleteServiceImage(
  serviceId: string,
  imageUrl: string,
): Promise<unknown> {
  return apiFetch(
    `/services/${serviceId}/images?image_url=${encodeURIComponent(imageUrl)}`,
    { method: "DELETE" },
  );
}

/** Upload one or more videos for a service. Multipart; field name is `files`.
 *  Capped server-side at 50MB / 30s each — the backend rejects anything over
 *  that rather than trusting a client-side check. */
export function uploadServiceVideos(
  serviceId: string,
  files: File[],
): Promise<{ media: MediaItem[] }> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return apiUpload<{ media: MediaItem[] }>(`/services/${serviceId}/videos`, form);
}

export function deleteServiceVideo(
  serviceId: string,
  videoUrl: string,
): Promise<unknown> {
  return apiFetch(
    `/services/${serviceId}/videos?video_url=${encodeURIComponent(videoUrl)}`,
    { method: "DELETE" },
  );
}

// ── Vendor payments ──────────────────────────────────────────────────

/**
 * Start Stripe Connect onboarding. `client=web` makes Stripe return into this
 * app rather than the iOS deep-link bridge. Returns a hosted URL to redirect to.
 */
export function startStripeOnboarding(
  vendorId: string,
): Promise<{ onboarding_url: string }> {
  return apiFetch<{ onboarding_url: string }>(
    `/payments/vendors/${vendorId}/stripe-onboard?client=web`,
    { method: "POST" },
  );
}

/** Live status from Stripe. Clients can't pay a vendor who hasn't finished. */
export function getStripeStatus(vendorId: string): Promise<StripeStatus> {
  return apiFetch<StripeStatus>(`/payments/vendors/${vendorId}/stripe-status`);
}

export function getEarnings(vendorId: string): Promise<Earnings> {
  return apiFetch<Earnings>(`/payments/vendors/${vendorId}/earnings`);
}

// ── Moderation (report & block) ──────────────────────────────────────

// The moderation router is mounted with no prefix, so these are top-level paths
// (/reports, /blocks), not /moderation/*.
export function reportContent(input: {
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  details?: string;
}): Promise<unknown> {
  return apiFetch("/reports", {
    method: "POST",
    body: { ...input, details: input.details || null },
  });
}

export function listBlockedUsers(): Promise<BlockedUser[]> {
  return apiFetch<BlockedUser[]>("/blocks");
}

export function blockUser(userId: string): Promise<unknown> {
  return apiFetch(`/blocks/${userId}`, { method: "POST" });
}

export function unblockUser(userId: string): Promise<unknown> {
  return apiFetch(`/blocks/${userId}`, { method: "DELETE" });
}

// ── Negotiation ──────────────────────────────────────────────────────

/** The booking's negotiation, or null if none has been started. */
export async function getNegotiation(bookingId: string): Promise<Negotiation | null> {
  try {
    return await apiFetch<Negotiation>(`/negotiations/booking/${bookingId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function startNegotiation(
  bookingId: string,
  amountCents: number,
  message?: string,
): Promise<Negotiation> {
  return apiFetch<Negotiation>("/negotiations", {
    method: "POST",
    body: { booking_id: bookingId, amount_cents: amountCents, message: message || null },
  });
}

export function counterOffer(
  negotiationId: string,
  amountCents: number,
  message?: string,
): Promise<Negotiation> {
  return apiFetch<Negotiation>(`/negotiations/${negotiationId}/offer`, {
    method: "POST",
    body: { amount_cents: amountCents, message: message || null },
  });
}

export function acceptOffer(negotiationId: string): Promise<Negotiation> {
  return apiFetch<Negotiation>(`/negotiations/${negotiationId}/accept`, { method: "POST" });
}

export function rejectOffer(negotiationId: string, message?: string): Promise<Negotiation> {
  return apiFetch<Negotiation>(`/negotiations/${negotiationId}/reject`, {
    method: "POST",
    body: { message: message || null },
  });
}

// ── Conversations (group chat) ───────────────────────────────────────

export function listConversations(): Promise<ConversationSummary[]> {
  return apiFetch<ConversationSummary[]>("/conversations");
}

/**
 * The group chat for one plan, or null if there isn't one yet.
 *
 * Conversations are created by select_bundle — the act of sending — so every
 * sent plan has one and no draft does. There's no endpoint to fetch by bundle,
 * so this filters the list; the list is short (one or two per plan) and already
 * carries bundle_id.
 *
 * Prefers "all_parties" over "vendors_only": the latter exists so vendors can
 * talk among themselves, and the client isn't in it.
 */
export async function getBundleConversation(
  bundleId: string,
): Promise<ConversationSummary | null> {
  const all = await listConversations();
  const mine = all.filter((c) => c.bundle_id === bundleId);
  return mine.find((c) => c.type === "all_parties") ?? mine[0] ?? null;
}

export function getUnreadCount(): Promise<{ unread_count: number }> {
  return apiFetch<{ unread_count: number }>("/conversations/unread-count");
}

/** One conversation and its members, named from the caller's side of it. */
export function getConversation(conversationId: string): Promise<ConversationSummary> {
  return apiFetch<ConversationSummary>(`/conversations/${conversationId}`);
}

/**
 * Ask a vendor a question, before anything is booked.
 *
 * One thread per client and vendor, so this opens or reuses — asking about a
 * second listing continues the first conversation rather than starting a
 * near-identical one. `serviceId` is the listing it was asked from; it rides
 * along on the message as a reference card and doesn't scope the thread.
 *
 * Refused with 429 when the client has too many questions nobody has answered.
 * That message is written to be read, so show it as it comes.
 */
export function askVendor(
  vendorId: string,
  content: string,
  serviceId?: string,
): Promise<{ conversation_id: string; message: GroupMessage }> {
  return apiFetch<{ conversation_id: string; message: GroupMessage }>(
    "/conversations/enquiry",
    {
      method: "POST",
      body: { vendor_id: vendorId, content, service_id: serviceId ?? null },
    },
  );
}

/**
 * The private thread for one booking — the client and that vendor, nobody else.
 *
 * Idempotent: opening is how you get to it, so there's no "does it exist yet"
 * to ask first. The plan's group chat has every vendor on it, which is the
 * wrong room for a question about one booking.
 */
export function openBookingThread(bookingId: string): Promise<ConversationSummary> {
  return apiFetch<ConversationSummary>(`/conversations/booking/${bookingId}`, {
    method: "POST",
  });
}

/** Newest window first (offset 0 = most recent), returned oldest→newest. */
export function getConversationMessages(
  conversationId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<{ items: GroupMessage[]; total: number; limit: number; offset: number }> {
  return apiFetch<{ items: GroupMessage[]; total: number; limit: number; offset: number }>(
    `/conversations/${conversationId}/messages${query({ ...params })}`,
  );
}

/** Send a message. The backend also broadcasts it over the socket. */
export function sendConversationMessage(
  conversationId: string,
  content: string,
): Promise<GroupMessage> {
  return apiFetch<GroupMessage>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { content },
  });
}

// ── Vendor availability ──────────────────────────────────────────────

export function getMyAvailability(): Promise<AvailabilitySlot[]> {
  return apiFetch<AvailabilitySlot[]>("/vendors/me/availability");
}

/**
 * A vendor's open slots over a date range — public, like the rest of browsing,
 * so the Marketplace's date filter works for a signed-out visitor. Dates are
 * "YYYY-MM-DD"; both bounds are required by the backend.
 */
export function getVendorAvailability(
  vendorId: string,
  startDate: string,
  endDate: string,
): Promise<VendorAvailability> {
  return apiFetch<VendorAvailability>(
    `/vendors/${vendorId}/availability${query({ start_date: startDate, end_date: endDate })}`,
    { auth: false },
  );
}

// ── Google Calendar ──────────────────────────────────────────────────
//
// Reading a vendor's Google-busy days has worked for a while — the days and the
// connected flag both arrive on getVendorAvailability above, so there's still
// no wrapper here for that half of /calendar-status.
//
// write_enabled is different: it's not on getVendorAvailability (that
// endpoint is public, and whether a vendor's own connection can write to
// their calendar isn't a browsing client's business), and it's genuinely new
// information a vendor connected under the old read-only scope needs — hence
// getCalendarStatus below, just for that.

/**
 * The Google consent URL to send the vendor to. Their own vendor only — the
 * backend returns 403 otherwise, since completing this flow writes tokens onto
 * whichever vendor the URL names.
 *
 * `client=web` is what makes the return trip land back here. Without it the
 * backend finishes on its own bridge page, which exists to bounce the iOS app
 * open and is a dead end in a browser. Same convention as Stripe onboarding.
 */
export function getGoogleAuthUrl(vendorId: string): Promise<{ auth_url: string }> {
  return apiFetch(`/vendors/${vendorId}/google-auth${query({ client: "web" })}`);
}

/**
 * Whether the vendor's own Google connection covers write-back — their
 * Jorna bookings appearing on their calendar, not just busy times showing
 * up here. Their own vendor only, same reasoning as the URL above: which
 * accounts a vendor has linked, and what those accounts can do, isn't
 * something a browsing client asks about.
 */
export function getCalendarStatus(vendorId: string): Promise<CalendarStatus> {
  return apiFetch<CalendarStatus>(`/vendors/${vendorId}/calendar-status`);
}

// ── Card on file ─────────────────────────────────────────────────────
//
// Saved once, when a plan is sent, and charged by the backend the moment a
// vendor accepts. Nothing here charges anything.

export interface SavedCard {
  has_card: boolean;
  brand?: string | null;
  last4?: string | null;
}

/** What's on file. Brand and last four only — Stripe keeps the card. */
export function getSavedCard(): Promise<SavedCard> {
  return apiFetch<SavedCard>("/payments/card");
}

/**
 * Where to return after saving a card.
 *
 * Stripe's return URL is fixed server-side, so it can't carry a destination.
 * The page that sends you to Stripe leaves it here; the page you land on reads
 * it. sessionStorage rather than a query param because the round trip goes
 * through Stripe's domain and comes back on a URL we didn't write.
 */
export const CARD_RETURN_KEY = "jorna:card-return";

/** A Stripe-hosted page for entering card details. No charge attached. */
export function startCardSetup(): Promise<{ setup_url: string }> {
  return apiFetch("/payments/card/setup-session", { method: "POST" });
}

/**
 * Adopt whatever was just saved.
 *
 * Called on the way back from the hosted page. The backend reads Stripe rather
 * than trusting the redirect, so this is safe to call twice.
 */
export function syncSavedCard(): Promise<SavedCard> {
  return apiFetch("/payments/card/sync", { method: "POST" });
}

export function forgetSavedCard(): Promise<SavedCard> {
  return apiFetch("/payments/card", { method: "DELETE" });
}

/** Replace all weekly availability slots. Send [] to clear. */
export function setMyAvailability(slots: AvailabilitySlot[]): Promise<unknown> {
  const clean = slots.map((s) => ({
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    end_time: s.end_time,
  }));
  return apiFetch("/vendors/me/availability", { method: "PUT", body: { slots: clean } });
}

// ── Vendor-side bookings ─────────────────────────────────────────────

export function listVendorBookings(
  vendorId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<Paginated<VendorBooking>> {
  return apiFetch<Paginated<VendorBooking>>(
    `/bookings/vendor/${vendorId}${query({ ...params })}`,
  );
}

/**
 * Approve or decline a booking request.
 *
 * Approving can fail with 409 when the vendor already has an approved or paid
 * booking on an overlapping date — one event per day. Surface that message
 * rather than a generic error.
 */
export function setBookingStatus(
  bookingId: string,
  status: "approved" | "rejected",
): Promise<{ email_sent?: boolean | null }> {
  return apiFetch(`/bookings/${bookingId}/status`, {
    method: "PUT",
    body: { status },
  });
}

// ── Contracts (vendor-authored, no-login guest bookings) ──────────────

export function createContract(input: ContractCreateInput): Promise<Contract> {
  return apiFetch<Contract>("/contracts", { method: "POST", body: input });
}

export function getContract(bookingId: string): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}`);
}

export function updateContract(bookingId: string, updates: ContractUpdateInput): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}`, { method: "PATCH", body: updates });
}

// ── Change proposals (backend DECISIONS #23) ──────────────────────────

export function getContractProposals(bookingId: string): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/contracts/${bookingId}/proposals`);
}

/** The client's terms become the next version, resent to sign. 409s when a
 *  changed date clashes, or the proposal was already answered. */
export function acceptProposal(bookingId: string, proposalId: string, note?: string | null): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}/proposals/${proposalId}/accept`, {
    method: "POST",
    body: { note: note || null },
  });
}

export function declineProposal(bookingId: string, proposalId: string, note?: string | null): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}/proposals/${proposalId}/decline`, {
    method: "POST",
    body: { note: note || null },
  });
}

export function getGuestProposals(token: string): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/guest-bookings/${token}/proposals`);
}

/** Client: suggest changes to the version they're reading. 409s if the
 *  vendor has edited since. */
export function proposeGuestChanges(
  token: string,
  baseRevision: number,
  changes: TermsChanges,
  message: string | null,
): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/guest-bookings/${token}/proposals`, {
    method: "POST",
    body: { base_revision: baseRevision, changes, message },
  });
}

export function withdrawGuestProposal(token: string, proposalId: string): Promise<ProposalHistory> {
  return apiFetch<ProposalHistory>(`/guest-bookings/${token}/proposals/${proposalId}/withdraw`, { method: "POST" });
}

// ── Negotiation drafts (backend 0069, DECISIONS #24) ─────────────────

export interface DraftInput {
  base_revision: number;
  changes: Partial<TermsVersion>;
  message?: string | null;
  proposal_id?: string | null;
}

export function saveContractDraft(bookingId: string, draft: DraftInput): Promise<NegotiationDraft> {
  return apiFetch<NegotiationDraft>(`/contracts/${bookingId}/proposals/draft`, { method: "PUT", body: draft });
}

export function dropContractDraft(bookingId: string): Promise<void> {
  return apiFetch<void>(`/contracts/${bookingId}/proposals/draft`, { method: "DELETE" });
}

export function saveGuestDraft(token: string, draft: Omit<DraftInput, "proposal_id">): Promise<NegotiationDraft> {
  return apiFetch<NegotiationDraft>(`/guest-bookings/${token}/proposals/draft`, { method: "PUT", body: draft });
}

export function dropGuestDraft(token: string): Promise<void> {
  return apiFetch<void>(`/guest-bookings/${token}/proposals/draft`, { method: "DELETE" });
}

/** Send a draft, or resend an expired offer — restarts the date hold. 409s
 *  if the date has been taken meanwhile. */
export function sendContract(
  bookingId: string,
  opts: { holdDays?: number; emailClient?: boolean } = {},
): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}/send`, {
    method: "POST",
    body: {
      ...(opts.holdDays ? { hold_days: opts.holdDays } : {}),
      ...(opts.emailClient ? { email_client: true } : {}),
    },
  });
}

/** Accept a signed-in client's request by sending them this proposal to
 *  sign (backend DECISIONS #17). Anything left out comes from the request
 *  and the vendor's usual terms. */
export function proposeFromRequest(
  bookingId: string,
  input: Omit<ContractCreateInput, "date_iso" | "date_end" | "time_start" | "time_end">,
): Promise<Contract> {
  return apiFetch<Contract>(`/bookings/${bookingId}/propose`, { method: "POST", body: input });
}

/** Vendor: one scheduled payment arrived (marked by the client or not). */
export function confirmInstallment(bookingId: string, installmentId: string): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}/payments/${installmentId}/confirm`, {
    method: "POST",
  });
}

// Contract templates live on the account (backend 0065). The body is the
// builder's — see lib/contractDraft.

export function listContractTemplates(): Promise<{ items: SavedContractTemplate[]; total: number }> {
  return apiFetch("/contract-templates");
}

export function createContractTemplate(
  name: string,
  body: Record<string, unknown>,
  kind: TemplateKind = "agreement",
): Promise<SavedContractTemplate> {
  return apiFetch("/contract-templates", { method: "POST", body: { name, body, kind } });
}

export function deleteContractTemplate(templateId: string): Promise<{ message: string }> {
  return apiFetch(`/contract-templates/${templateId}`, { method: "DELETE" });
}

// Addenda and cancellation agreements attached to an agreed booking
// (backend DECISIONS #21). Text only — signing one changes nothing on the
// booking itself.

export function listDocuments(bookingId: string): Promise<{ items: AttachedDocument[]; total: number }> {
  return apiFetch(`/contracts/${bookingId}/documents`);
}

export function createDocument(
  bookingId: string,
  input: {
    kind: AttachedDocumentKind;
    title?: string | null;
    sections: { key?: string; title: string; body: string }[];
    send?: boolean;
    email_client?: boolean;
  },
): Promise<AttachedDocument> {
  return apiFetch(`/contracts/${bookingId}/documents`, { method: "POST", body: input });
}

export function updateDocument(
  documentId: string,
  input: { title?: string | null; sections?: { key?: string; title: string; body: string }[] },
): Promise<AttachedDocument> {
  return apiFetch(`/contract-documents/${documentId}`, { method: "PATCH", body: input });
}

/** Copying the link calls this too, without email — that's what makes the
 *  link open. */
export function sendDocument(documentId: string, emailClient = false): Promise<AttachedDocument> {
  return apiFetch(`/contract-documents/${documentId}/send`, {
    method: "POST",
    body: emailClient ? { email_client: true } : {},
  });
}

export function voidDocument(documentId: string): Promise<AttachedDocument> {
  return apiFetch(`/contract-documents/${documentId}/void`, { method: "POST" });
}

/** Withdraw an unsigned contract, freeing its date. Signed ones 400. */
export function voidContract(bookingId: string): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${bookingId}/void`, { method: "POST" });
}

// ── Leads ────────────────────────────────────────────────────────────

export function createLead(input: LeadCreateInput): Promise<Lead> {
  return apiFetch<Lead>("/leads", { method: "POST", body: input });
}

export function listLeads(): Promise<{ items: Lead[]; total: number }> {
  return apiFetch("/leads");
}

export function updateLead(leadId: string, updates: LeadUpdateInput): Promise<Lead> {
  return apiFetch<Lead>(`/leads/${leadId}`, { method: "PATCH", body: updates });
}

export function deleteLead(leadId: string): Promise<{ message: string }> {
  return apiFetch(`/leads/${leadId}`, { method: "DELETE" });
}

export function convertLead(leadId: string, input: ContractCreateInput): Promise<Contract> {
  return apiFetch<Contract>(`/leads/${leadId}/convert`, { method: "POST", body: input });
}

// ── Leads pipeline ───────────────────────────────────────────────────

/** Everything before a signed contract, labelled inquiry/negotiation, with
 *  why each needs the vendor — the server owns those rules (DECISIONS #20). */
export function getPipeline(): Promise<Pipeline> {
  return apiFetch<Pipeline>("/leads/pipeline");
}

/** Hide a request or unsigned contract from the active leads, or bring it
 *  back. Declines, voids and notifies nothing. */
export function archiveBooking(bookingId: string, archived = true): Promise<VendorBooking> {
  return apiFetch<VendorBooking>(`/bookings/${bookingId}/archive`, { method: "POST", body: { archived } });
}

/** "Add to leads" from a Messages thread; returns the thread's open lead if it has one. */
export function leadFromConversation(conversationId: string): Promise<Lead> {
  return apiFetch<Lead>(`/conversations/${conversationId}/lead`, { method: "POST" });
}

/** Counts the thread as unread for you until you next open it. */
export function markConversationUnread(conversationId: string): Promise<ConversationSummary> {
  return apiFetch<ConversationSummary>(`/conversations/${conversationId}/unread`, { method: "POST" });
}

// ── Guest booking link (public, no login — see /booking-link) ─────────
//
// None of these go through the normal Authorization-bearer path — there's no
// session to attach. The contract_token in the URL is the entire credential,
// same trust model as the RSVP system's invitation token.

/** preview: the vendor's own "View as client" — doesn't mark it viewed. */
export function getGuestBooking(token: string, preview = false): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}${preview ? "?preview=true" : ""}`);
}

/** An addendum or cancellation agreement, by its own link. */
export function getGuestDocument(token: string, preview = false): Promise<AttachedDocument> {
  return apiFetch(`/guest-documents/${token}${preview ? "?preview=true" : ""}`);
}

export function signGuestDocument(token: string, signerName: string): Promise<AttachedDocument> {
  return apiFetch(`/guest-documents/${token}/sign`, { method: "POST", body: { signer_name: signerName } });
}

export function declineGuestDocument(token: string, reason: string | null): Promise<AttachedDocument> {
  return apiFetch(`/guest-documents/${token}/decline`, { method: "POST", body: { reason } });
}

/** The client turns the offer down; frees the vendor's date. */
export function declineGuestBooking(token: string, reason: string | null): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/decline`, {
    method: "POST",
    body: { reason },
  });
}

export function fillGuestBookingDetails(
  token: string,
  details: GuestBookingDetailsInput,
): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}`, { method: "PATCH", body: details });
}

/** revision: the version the client was shown — the backend 409s if the
 *  vendor has edited since. */
export function signGuestBooking(
  token: string,
  signerName: string,
  revision?: number | null,
): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/sign`, {
    method: "POST",
    body: { signer_name: signerName, ...(revision != null ? { revision } : {}) },
  });
}

/** Client: one scheduled payment is sent. Returns the refreshed booking. */
export function guestMarkInstallmentPaid(token: string, installmentId: string): Promise<GuestBooking> {
  return apiFetch<GuestBooking>(`/guest-bookings/${token}/payments/${installmentId}/mark-paid`, {
    method: "POST",
  });
}

export function guestMarkFullPaid(
  token: string,
): Promise<{ message: string; payment_status: string }> {
  return apiFetch(`/guest-bookings/${token}/mark-paid`, { method: "POST" });
}

export function guestMarkDepositPaid(
  token: string,
): Promise<{ message: string; deposit_marked_paid_at: string }> {
  return apiFetch(`/guest-bookings/${token}/mark-deposit-paid`, { method: "POST" });
}

// ── Events ───────────────────────────────────────────────────────────
//
// There's no GET /events/{id}; the list is the source of detail. A booking has
// no event_id of its own either — it reaches its event through its bundle — so
// an event's bookings are assembled by matching bundles on event_id.

export function listEvents(): Promise<EventItem[]> {
  return apiFetch<EventItem[]>("/events");
}

export function createEvent(input: EventCreateInput): Promise<EventItem> {
  return apiFetch<EventItem>("/events", { method: "POST", body: input });
}

export function updateEvent(
  eventId: string,
  updates: Partial<EventCreateInput>,
): Promise<EventItem> {
  return apiFetch<EventItem>(`/events/${eventId}`, { method: "PATCH", body: updates });
}

export function deleteEvent(eventId: string): Promise<void> {
  return apiFetch<void>(`/events/${eventId}`, { method: "DELETE" });
}

// ── Escrow release ───────────────────────────────────────────────────

/**
 * Confirm the event happened. The backend derives your role (customer vs
 * vendor) from your identity. Funds release automatically once *both* sides
 * have confirmed — and never before the event's last day.
 */
export function confirmBookingEvent(bookingId: string): Promise<unknown> {
  return apiFetch(`/payments/bookings/${bookingId}/confirm`, { method: "POST" });
}

/**
 * GPS check-in at the venue. One endpoint, two meanings — the backend derives
 * your role and never trusts a client-supplied flag:
 *  • vendor — this is their half of releasing escrow (records
 *    vendor_confirmed_at). Funds still can't release until the customer
 *    confirms too (date-gated), so a vendor may check in early.
 *  • client — pure presence (records client_checked_in_at) and notifies the
 *    vendor they've arrived. It does NOT confirm the event or release funds;
 *    that stays the date-gated confirmBookingEvent.
 * Either way the caller must be within ~0.2mi of the venue anchor, and the
 * anchor comes from the bundle's live venue booking — no venue, no check-in.
 */
export function checkInBooking(
  bookingId: string,
  latitude: number,
  longitude: number,
): Promise<unknown> {
  return apiFetch(`/bookings/${bookingId}/check-in`, {
    method: "POST",
    body: { latitude, longitude },
  });
}

/**
 * Send one vendor their check-in email again. Client only, one booking at a
 * time — four vendors are here and the fifth hasn't checked in, and mailing all
 * five to reach one is how a marketplace teaches its vendors to filter its post.
 *
 * The backend holds the cooldown and every other condition, and reports them on
 * the booking as can_resend_checkin.
 */
export function resendCheckInEmail(
  bookingId: string,
): Promise<{ sent: boolean; message: string; resent_at: string }> {
  return apiFetch(`/bookings/${bookingId}/resend-checkin`, { method: "POST" });
}

/**
 * Cancel a paid booking. Full refund for 24h after the vendor accepted;
 * after that, nothing back to the client — the payment splits between the
 * platform and the vendor instead (see cancellation_split on the backend).
 * Customer only.
 */
export function cancelBooking(
  bookingId: string,
): Promise<{ message: string; refund_cents: number; vendor_cancellation_cents: number; payment_status: string }> {
  return apiFetch(`/payments/bookings/${bookingId}/cancel`, { method: "POST" });
}

/**
 * What cancelling this booking would pay out right now. Normally read
 * straight off the booking (BundleBooking.refund_preview) — this is the
 * standalone lookup for a caller that only has a booking id.
 */
export function getCancellationPreview(bookingId: string): Promise<RefundPreview> {
  return apiFetch(`/payments/bookings/${bookingId}/cancellation-preview`);
}

/**
 * Client: mark a manual-track booking as paid. Self-reported — Jorna never
 * touches this money. The vendor still needs to confirm receiving it (see
 * confirmPaymentReceived).
 */
export function markBookingPaid(
  bookingId: string,
): Promise<{ message: string; payment_status: string }> {
  return apiFetch(`/payments/bookings/${bookingId}/mark-paid`, { method: "POST" });
}

/**
 * Vendor: confirm receiving a manual-track client's direct payment. Same
 * self-reported contract as markBookingPaid.
 */
export function confirmPaymentReceived(
  bookingId: string,
): Promise<{ message: string; payment_status: string }> {
  return apiFetch(`/payments/bookings/${bookingId}/confirm-received`, { method: "POST" });
}

/**
 * Client: mark a contract booking's deposit as paid — the authenticated
 * sibling of guestMarkDepositPaid, for a real-account booking that has a
 * deposit configured. Self-reported, same as markBookingPaid above.
 */
export function markDepositPaid(
  bookingId: string,
): Promise<{ message: string; deposit_marked_paid_at: string }> {
  return apiFetch(`/payments/bookings/${bookingId}/mark-deposit-paid`, { method: "POST" });
}

/**
 * Vendor: confirm receiving a contract booking's deposit. Works for a guest
 * booking too — only checks the vendor's identity, never who the client is.
 */
export function confirmDepositReceived(
  bookingId: string,
): Promise<{ message: string; deposit_confirmed_received_at: string }> {
  return apiFetch(`/payments/bookings/${bookingId}/confirm-deposit-received`, { method: "POST" });
}

/**
 * Freeze this one booking's funds for review. Customer only, and only while the
 * money is still held (payment_status "paid"). Siblings are unaffected.
 */
export function disputeBooking(bookingId: string, reason?: string): Promise<unknown> {
  return apiFetch(`/payments/bookings/${bookingId}/dispute`, {
    method: "POST",
    body: { reason: reason || null },
  });
}

// ── Date changes ─────────────────────────────────────────────────────
//
// Once a plan is with its vendors its date is theirs to hold, so moving it is a
// request rather than an edit. The client proposes plan-wide; each vendor
// answers for their own booking. Nothing is charged or refunded by a proposal —
// only by a resolution.

export interface ChangeProposal {
  /** Every field optional — move only the date, only the hours, or both. */
  date_iso?: string | null;
  date_end?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  message?: string | null;
}

/** Ask every vendor on a plan to move. One call, one request per booking. */
export function proposeChange(
  bundleId: string,
  proposal: ChangeProposal,
): Promise<{ requests: ChangeRequest[]; count: number }> {
  return apiFetch(`/bundles/${bundleId}/change-request`, {
    method: "POST",
    body: proposal,
  });
}

/** Where each vendor stands on the current proposal. */
export function getChangeRequests(
  bundleId: string,
): Promise<{ requests: ChangeRequest[] }> {
  return apiFetch(`/bundles/${bundleId}/change-request`);
}

/** Take back every outstanding request on a plan. */
export function withdrawChange(bundleId: string): Promise<{ withdrawn: number }> {
  return apiFetch(`/bundles/${bundleId}/change-request`, { method: "DELETE" });
}

/**
 * The vendor's answer.
 *
 * Accepting re-runs their double-booking check server-side and 409s on a clash,
 * naming it — the same guard approving a booking uses. Surface that message
 * rather than a generic one; it tells them exactly what to do instead.
 */
export function respondToChange(
  changeRequestId: string,
  accept: boolean,
  message?: string,
): Promise<ChangeRequest> {
  return apiFetch(`/change-requests/${changeRequestId}/respond`, {
    method: "POST",
    body: { accept, message: message || null },
  });
}

/** The client agreeing to pay more for the new dates. Charges the difference. */
export function consentToChangePrice(
  changeRequestId: string,
): Promise<ChangeRequest & { additional_cents?: number; message?: string }> {
  return apiFetch(`/change-requests/${changeRequestId}/consent`, { method: "POST" });
}

/**
 * Refund a booking whose vendor couldn't meet the new date.
 *
 * Not the 24-hour window — that one is about changing your mind shortly after
 * paying. This has its own gate (a declined or expired change on this booking)
 * and is partial: the vendor keeps RESCHEDULE_CANCELLATION_PCT for the date they
 * held.
 */
export function refundAfterFailedReschedule(
  bookingId: string,
): Promise<{ message: string; refunded_cents: number; retained_cents: number }> {
  return apiFetch(`/payments/bookings/${bookingId}/reschedule-refund`, {
    method: "POST",
  });
}

// ── Guest lists ──────────────────────────────────────────────────────

/** The list, its functions, and what the replies add up to. Host only. */
export function getGuestList(eventId: string): Promise<GuestList> {
  return apiFetch<GuestList>(`/events/${eventId}/guests`);
}

export function addGuest(
  eventId: string,
  guest: {
    name: string;
    email?: string | null;
    phone?: string | null;
    party_size?: number;
    /** Omit for every function — what adding somebody without saying which parts means. */
    function_ids?: string[];
    note?: string | null;
  },
): Promise<Guest> {
  return apiFetch<Guest>(`/events/${eventId}/guests`, { method: "POST", body: guest });
}

/**
 * Add many from pasted lines — "Anita Sharma, anita@example.com, 3". Name is
 * the only part required; blank lines are skipped rather than becoming guests.
 */
export function addGuestsBulk(
  eventId: string,
  lines: string[],
  functionIds: string[] = [],
): Promise<{ added: number; guests: Guest[] }> {
  return apiFetch(`/events/${eventId}/guests/bulk`, {
    method: "POST",
    body: { lines, function_ids: functionIds },
  });
}

export function updateGuest(
  guestId: string,
  updates: Partial<{
    name: string;
    email: string | null;
    phone: string | null;
    party_size: number;
    function_ids: string[];
    note: string | null;
  }>,
): Promise<Guest> {
  return apiFetch<Guest>(`/guests/${guestId}`, { method: "PATCH", body: updates });
}

export function removeGuest(guestId: string): Promise<void> {
  return apiFetch<void>(`/guests/${guestId}`, { method: "DELETE" });
}

export function addFunction(
  eventId: string,
  fn: {
    name: string;
    date_iso?: string | null;
    time_start?: string | null;
    time_end?: string | null;
    location?: string | null;
  },
): Promise<EventFunction> {
  return apiFetch<EventFunction>(`/events/${eventId}/functions`, {
    method: "POST",
    body: fn,
  });
}

export function updateFunction(
  functionId: string,
  updates: Partial<{
    name: string;
    date_iso: string | null;
    time_start: string | null;
    time_end: string | null;
    location: string | null;
  }>,
): Promise<EventFunction> {
  return apiFetch<EventFunction>(`/functions/${functionId}`, {
    method: "PATCH",
    body: updates,
  });
}

/** Guests stay — they're invited to the celebration, not only to one part of it. */
export function removeFunction(functionId: string): Promise<void> {
  return apiFetch<void>(`/functions/${functionId}`, { method: "DELETE" });
}

/**
 * The celebration's shareable link, minted on first ask. One link for a family
 * group chat, where whoever opens it adds themselves.
 */
export function getInviteLink(eventId: string): Promise<{ token: string }> {
  return apiFetch(`/events/${eventId}/invite-link`, { method: "POST" });
}

/** Stop the shared link working. Guests it already brought keep their replies. */
export function revokeInviteLink(eventId: string): Promise<{ token: null }> {
  return apiFetch(`/events/${eventId}/invite-link`, { method: "DELETE" });
}

// ── What a guest sees ────────────────────────────────────────────────
//
// No login: the token in the link is the whole credential, so these are the
// only calls made with auth off.

/** Works for either kind of link — a guest can't tell which they were sent. */
export function getInvitation(token: string): Promise<Invitation> {
  return apiFetch<Invitation>(`/rsvp/${encodeURIComponent(token)}`, { auth: false });
}

export function sendRsvp(token: string, replies: RsvpReply[]): Promise<Invitation> {
  return apiFetch<Invitation>(`/rsvp/${encodeURIComponent(token)}`, {
    method: "POST",
    body: { replies },
    auth: false,
  });
}

/** Add yourself from the shared link. Returns a token of your own. */
export function joinViaInviteLink(
  token: string,
  who: { name: string; email?: string | null; party_size: number; replies: RsvpReply[] },
): Promise<Invitation & { token: string }> {
  return apiFetch(`/rsvp/${encodeURIComponent(token)}/join`, {
    method: "POST",
    body: who,
    auth: false,
  });
}

// ── Checking in from the emailed link ────────────────────────────────
//
// No account: the token in the link is the credential, so these go out with
// auth off. It isn't sufficient on its own — the backend still measures the
// GPS fix against the venue, exactly as it does for the in-app button.

export interface CheckInInvite {
  booking_id: string;
  location?: string | null;
  date_iso?: string | null;
  time_start?: string | null;
  /** The real moment it starts, in the venue's own timezone. */
  starts_at?: string | null;
  already_checked_in: boolean;
}

export function getCheckInInvite(token: string): Promise<CheckInInvite> {
  return apiFetch<CheckInInvite>(`/checkin/${encodeURIComponent(token)}`, { auth: false });
}

export function checkInWithToken(
  token: string,
  latitude: number,
  longitude: number,
): Promise<{ message?: string; distance_miles?: number; funds_released?: boolean }> {
  return apiFetch(`/checkin/${encodeURIComponent(token)}`, {
    method: "POST",
    body: { latitude, longitude },
    auth: false,
  });
}
