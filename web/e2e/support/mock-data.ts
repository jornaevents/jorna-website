// Plain literals shaped like web/src/lib/types.ts, kept minimal — only the
// fields the pages under test actually read. Not imported from the app's own
// types so a mock can never accidentally typecheck against a stale shape;
// if the backend contract drifts, that shows up as a rendering assertion
// failing, which is the point of an E2E test.

export const ACCESS_TOKEN = "e2e-mock-access-token";
export const REFRESH_TOKEN = "e2e-mock-refresh-token";

export function mockTokenPair() {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    token_type: "bearer",
  };
}

export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    email: "priya@example.com",
    username: "priya",
    f_name: "Priya",
    l_name: "Shah",
    phone: null,
    location: "Chicago, IL",
    pfp_url: null,
    ...overrides,
  };
}

export function mockVendorSearchItem(overrides: Record<string, unknown> = {}) {
  return {
    vendor_id: "vendor-1",
    user_id: "vendor-user-1",
    first_name: "Anjali",
    last_name: "Kapoor",
    category: "photography",
    service_id: "service-1",
    service_name: "Full Day Wedding Photography",
    service_price: 2500,
    distance_miles: 4,
    rating: 4.8,
    service_rating: 4.9,
    service_num_reviews: 32,
    location: "Chicago, IL",
    pfp_url: null,
    service_photo_url: null,
    ...overrides,
  };
}

export function mockVendorSearchResponse(items = [mockVendorSearchItem()]) {
  return { items, total: items.length, limit: 24, offset: 0 };
}

export function mockBundleOption(overrides: Record<string, unknown> = {}) {
  return {
    label: "Balanced",
    description: "A well-rounded team at a mid-range budget.",
    factors: ["Highly rated", "Within budget"],
    bundle_id: "bundle-1",
    bundle: {
      items: [
        {
          category: "photography",
          vendor_id: "vendor-1",
          service_id: "service-1",
          service_name: "Full Day Wedding Photography",
          vendor_name: "Anjali Kapoor",
          pfp_url: null,
          price_min: 2500,
          price_max: 2500,
          price_unit: "flat",
          price_pending_quantity: false,
        },
      ],
      estimated_total_min: 2500,
      estimated_total_max: 2500,
      pending_quantity_count: 0,
      unfilled_categories: [],
    },
    ...overrides,
  };
}

export function mockMultiBundleResponse() {
  return {
    options: [
      mockBundleOption({ label: "Budget-friendly", bundle_id: "bundle-budget" }),
      mockBundleOption({ label: "Balanced", bundle_id: "bundle-balanced" }),
      mockBundleOption({ label: "Top Rated", bundle_id: "bundle-top" }),
    ],
  };
}

export function mockBundleBooking(overrides: Record<string, unknown> = {}) {
  return {
    booking_id: "booking-1",
    status: "approved",
    payment_status: "unpaid",
    date_iso: "2026-11-14",
    time_start: "17:00",
    time_end: "23:00",
    location: "Chicago, IL",
    service_name: "Full Day Wedding Photography",
    service_category: "photography",
    vendor_name: "Anjali Kapoor",
    vendor_id: "vendor-1",
    price: 2500,
    amount_cents: 250000,
    price_unit: "flat",
    price_pending_quantity: false,
    guest_count: 150,
    ...overrides,
  };
}

export function mockTaxonomyCategories() {
  return [
    {
      value: "photography",
      label: "Photography",
      subcategories: [{ value: "wedding-photography", label: "Wedding Photography" }],
    },
    { value: "catering", label: "Catering", subcategories: [] },
  ];
}

export function mockVendorDetail(overrides: Record<string, unknown> = {}) {
  return {
    vendor_id: "vendor-1",
    user_id: "user-1",
    bio: "Full-service wedding photography team.",
    category: "photography",
    subcategory: null,
    specializations: [{ category: "photography", subcategory: null }],
    rating: 4.8,
    num_events: 40,
    travel_radius_miles: 50,
    open_to_long_distance: false,
    open_to_price_negotiation: true,
    ...overrides,
  };
}

export function mockStripeStatus(overrides: Record<string, unknown> = {}) {
  return {
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    details_submitted: false,
    payouts_enabled: false,
    disabled_reason: null,
    requirements_due: [],
    pending_verification: false,
    ...overrides,
  };
}

export function mockEarnings(overrides: Record<string, unknown> = {}) {
  return {
    vendor_id: "vendor-1",
    total_released_cents: 500000,
    in_escrow_cents: 250000,
    upcoming_cents: 100000,
    upcoming_count: 1,
    disputed_cents: 0,
    refunded_cents: 0,
    platform_fees_cents: 50000,
    history: [],
    ...overrides,
  };
}

export function mockVendorBooking(overrides: Record<string, unknown> = {}) {
  return {
    booking_id: "vbooking-1",
    user_id: "client-1",
    client_name: "Priya Shah",
    service_id: "service-1",
    service_name: "Full Day Wedding Photography",
    service_category: "photography",
    price: 2500,
    price_unit: "flat",
    price_pending_quantity: false,
    guest_count: 150,
    event_name: "Priya's Wedding",
    date_iso: "2026-11-14",
    time_start: "17:00",
    time_end: "23:00",
    location: "Chicago, IL",
    status: "pending",
    payment_status: "unpaid",
    ...overrides,
  };
}

export function mockBundleDetail(overrides: Record<string, unknown> = {}) {
  return {
    bundle_id: "bundle-1",
    user_id: "user-1",
    name: "Priya's Wedding",
    event_name: "Priya's Wedding",
    status: "draft",
    event_id: "event-1",
    event: { event_id: "event-1", name: "Priya's Wedding" },
    bookings: [mockBundleBooking()],
    booking_count: 1,
    total_estimated_cost: 2500,
    status_breakdown: { approved: 1 },
    ...overrides,
  };
}
