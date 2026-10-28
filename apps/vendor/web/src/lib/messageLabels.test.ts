import { describe, expect, it } from "vitest";
import { LABEL_TEXT, relationFor, showInInbox, tabFor } from "./messageLabels";
import { bookingTab } from "./vendorPlan";
import type { ConversationSummary, Pipeline, PipelineItem, VendorBooking } from "./types";

const VENDOR = "vendor-user";
const CLIENT = "client-priya";
const FUTURE = "2099-06-14";
const LATER = "2099-09-01";
const PAST = "2020-06-14";

function conv(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    conversation_id: "c1",
    subject_type: "enquiry",
    booking_id: null,
    members: [
      { user_id: VENDOR, name: "Arjun" },
      { user_id: CLIENT, name: "Priya Sharma" },
    ],
    ...overrides,
  };
}

function booking(overrides: Partial<VendorBooking> = {}): VendorBooking {
  return {
    booking_id: "b1",
    user_id: CLIENT,
    service_name: "Gold Photography",
    date_iso: FUTURE,
    location: "Pines Manor",
    status: "pending",
    payment_status: "unpaid",
    price: 2000,
    ...overrides,
  } as VendorBooking;
}

/** A signed contract booking. */
function signed(overrides: Partial<VendorBooking> = {}): VendorBooking {
  return booking({
    status: "approved",
    contract_token: "tok",
    contract_status: "signed",
    signed_at: "2026-09-01T00:00:00Z",
    amount_cents: 250_000,
    ...overrides,
  } as Partial<VendorBooking>);
}

function item(overrides: Partial<PipelineItem> = {}): PipelineItem {
  return {
    id: "booking:b1",
    source: "request",
    stage: "inquiry",
    booking_id: "b1",
    lead_id: null,
    conversation_id: null,
    name: "Priya Sharma",
    email: null,
    phone: null,
    event_name: null,
    event_date: FUTURE,
    event_date_end: null,
    location: "Pines Manor",
    service_name: "Gold Photography",
    estimated_value_cents: 200_000,
    contract_status: null,
    hold_expires_at: null,
    attention: "needs_you",
    attention_reason: "new_request",
    archived: false,
    outcome: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function pipeline(...items: PipelineItem[]): Pipeline {
  return { items, counts: { inquiries: 0, negotiations: 0, needs_you: 0, waiting: 0 } } as Pipeline;
}

describe("showInInbox", () => {
  it("leaves plan chats out and keeps every two-person thread", () => {
    expect(showInInbox(conv({ subject_type: "bundle" }))).toBe(false);
    expect(showInInbox(conv({ subject_type: "enquiry" }))).toBe(true);
    expect(showInInbox(conv({ subject_type: "booking" }))).toBe(true);
  });

  it("keeps a thread from a backend that doesn't send subject_type", () => {
    expect(showInInbox(conv({ subject_type: undefined }))).toBe(true);
    expect(showInInbox(conv({ subject_type: null }))).toBe(true);
  });
});

describe("LABEL_TEXT", () => {
  it("uses the words the Leads and Bookings pages use", () => {
    expect(LABEL_TEXT).toEqual({ inquiry: "Inquiry", negotiation: "Negotiation", booked: "Booked", closed: "Closed" });
  });
});

describe("relationFor", () => {
  describe("with nothing to go on", () => {
    it("is nothing, under Enquiries", () => {
      const r = relationFor(conv(), [], null, VENDOR);
      expect(r).toMatchObject({ kind: "none", label: null, href: null, linkLabel: null, contractId: null });
      expect(tabFor(r)).toBe("enquiries");
    });

    it("ignores another client's bookings and leads", () => {
      const other = booking({ booking_id: "b9", user_id: "client-someone-else" });
      const r = relationFor(conv(), [signed({ booking_id: "b9", user_id: "client-someone-else" }), other],
        pipeline(item({ booking_id: "b9", id: "booking:b9" })), VENDOR);
      expect(r.label).toBeNull();
    });

    it("ignores a pipeline item that points at no booking and no thread", () => {
      const r = relationFor(conv(), [], pipeline(item({ booking_id: null, conversation_id: null })), VENDOR);
      expect(r.label).toBeNull();
    });
  });

  describe("Inquiry and Negotiation, from the Leads pipeline", () => {
    it("a lead added from this thread is an Inquiry that links to it", () => {
      const lead = item({ id: "lead:l1", source: "lead", booking_id: null, lead_id: "l1", conversation_id: "c1" });
      const r = relationFor(conv(), [], pipeline(lead), VENDOR);
      expect(r).toMatchObject({
        kind: "lead", label: "inquiry", href: "/leads?open=lead%3Al1", linkLabel: "View lead", contractId: null,
      });
      expect(tabFor(r)).toBe("bookings");
    });

    it("the thread's own request is an Inquiry", () => {
      const r = relationFor(conv({ subject_type: "booking", booking_id: "b1" }), [booking()], pipeline(item()), VENDOR);
      expect(r).toMatchObject({ kind: "lead", label: "inquiry", href: "/leads?open=booking%3Ab1" });
    });

    it("a draft contract is still an Inquiry, and links its contract", () => {
      const draft = item({ source: "contract", stage: "inquiry", contract_status: "draft" });
      const r = relationFor(conv({ booking_id: "b1" }), [], pipeline(draft), VENDOR);
      expect(r).toMatchObject({ label: "inquiry", contractId: "b1" });
    });

    it("a contract with the client is a Negotiation", () => {
      const sent = item({ source: "contract", stage: "negotiation", contract_status: "sent" });
      const r = relationFor(conv({ booking_id: "b1" }), [], pipeline(sent), VENDOR);
      expect(r).toMatchObject({ kind: "lead", label: "negotiation", contractId: "b1" });
      expect(tabFor(r)).toBe("bookings");
    });

    it("a question thread picks up the client's request even when Leads linked it to another thread", () => {
      // The request's own booking thread exists, so the pipeline points there;
      // the client's question thread should still say Inquiry.
      const request = item({ conversation_id: "c-booking-thread" });
      const r = relationFor(conv({ conversation_id: "c-question" }), [booking()], pipeline(request), VENDOR);
      expect(r).toMatchObject({ label: "inquiry", href: "/leads?open=booking%3Ab1" });
    });

    it("a lead the vendor archived without closing keeps its stage", () => {
      const hidden = item({ archived: true, outcome: null, stage: "negotiation", source: "contract" });
      const r = relationFor(conv({ booking_id: "b1" }), [], pipeline(hidden), VENDOR);
      expect(r.label).toBe("negotiation");
    });

    it("prefers the thread's own booking over the client's others", () => {
      const own = item({ booking_id: "b1", id: "booking:b1", stage: "inquiry" });
      const other = item({ booking_id: "b2", id: "booking:b2", stage: "negotiation", source: "contract" });
      const r = relationFor(
        conv({ booking_id: "b1" }),
        [booking(), booking({ booking_id: "b2" })],
        pipeline(other, own),
        VENDOR,
      );
      expect(r).toMatchObject({ label: "inquiry", href: "/leads?open=booking%3Ab1" });
    });

    it("among the client's others, the one further along wins", () => {
      const a = item({ booking_id: "b1", id: "booking:b1", stage: "inquiry", updated_at: "2026-10-20T00:00:00Z" });
      const b = item({ booking_id: "b2", id: "booking:b2", stage: "negotiation", source: "contract", updated_at: "2026-10-01T00:00:00Z" });
      const r = relationFor(conv(), [booking(), booking({ booking_id: "b2" })], pipeline(a, b), VENDOR);
      expect(r).toMatchObject({ label: "negotiation", href: "/leads?open=booking%3Ab2" });
    });

    it("between two at the same stage, the most recently touched wins", () => {
      const older = item({ booking_id: "b1", id: "booking:b1", updated_at: "2026-10-01T00:00:00Z" });
      const newer = item({ booking_id: "b2", id: "booking:b2", updated_at: "2026-10-20T00:00:00Z" });
      const r = relationFor(conv(), [booking(), booking({ booking_id: "b2" })], pipeline(older, newer), VENDOR);
      expect(r.href).toBe("/leads?open=booking%3Ab2");
    });

    it("falls back to created_at when an item has no updated_at", () => {
      const older = item({ booking_id: "b1", id: "booking:b1", updated_at: null, created_at: "2026-10-01T00:00:00Z" });
      const newer = item({ booking_id: "b2", id: "booking:b2", updated_at: null, created_at: "2026-10-20T00:00:00Z" });
      const r = relationFor(conv(), [booking(), booking({ booking_id: "b2" })], pipeline(older, newer), VENDOR);
      expect(r.href).toBe("/leads?open=booking%3Ab2");
    });

    it("carries the lead's details for the side panel", () => {
      const r = relationFor(conv({ booking_id: "b1" }), [], pipeline(item()), VENDOR);
      expect(r).toMatchObject({ date: FUTURE, venue: "Pines Manor", pkg: "Gold Photography", valueCents: 200_000 });
    });
  });

  describe("Booked, from the vendor's bookings", () => {
    it("the thread's own signed booking is Booked and links to it", () => {
      const r = relationFor(conv({ subject_type: "booking", booking_id: "b1" }), [signed()], null, VENDOR);
      expect(r).toMatchObject({
        kind: "booking", label: "booked", href: "/my-bookings?id=b1", linkLabel: "View booking",
        contractId: "b1", date: FUTURE, venue: "Pines Manor", pkg: "Gold Photography", valueCents: 250_000,
      });
      expect(tabFor(r)).toBe("bookings");
    });

    it("an approved request from before contracts is Booked, with no contract to link", () => {
      const r = relationFor(conv({ booking_id: "b1" }), [booking({ status: "approved" })], null, VENDOR);
      expect(r).toMatchObject({ label: "booked", contractId: null, valueCents: 200_000 });
    });

    it("a booking with a deposit still due is Booked", () => {
      const due = signed({ deposit_percent: 50, deposit_confirmed_received_at: null } as Partial<VendorBooking>);
      expect(bookingTab(due)).toBe("deposit_due");
      expect(relationFor(conv(), [due], null, VENDOR).label).toBe("booked");
    });

    it("a client-signed contract waiting on the vendor isn't Booked yet", () => {
      const waiting = booking({ contract_token: "tok", contract_status: "awaiting_vendor", client_signed_at: "2026-10-01T00:00:00Z" } as Partial<VendorBooking>);
      const r = relationFor(conv({ booking_id: "b1" }), [waiting],
        pipeline(item({ source: "contract", stage: "negotiation", contract_status: "awaiting_vendor" })), VENDOR);
      expect(r.label).toBe("negotiation");
    });

    it("a question thread shows Booked once the client's booking is signed", () => {
      const r = relationFor(conv({ conversation_id: "c-question" }), [signed()], null, VENDOR);
      expect(r).toMatchObject({ label: "booked", href: "/my-bookings?id=b1" });
    });

    it("an upcoming booking wins over an open lead", () => {
      const r = relationFor(
        conv(),
        [signed(), booking({ booking_id: "b2" })],
        pipeline(item({ booking_id: "b2", id: "booking:b2" })),
        VENDOR,
      );
      expect(r).toMatchObject({ label: "booked", href: "/my-bookings?id=b1" });
    });

    it("the thread's own booking is Booked even once the event is over", () => {
      const r = relationFor(
        conv({ booking_id: "b1" }),
        [signed({ date_iso: PAST }), booking({ booking_id: "b2" })],
        pipeline(item({ booking_id: "b2", id: "booking:b2" })),
        VENDOR,
      );
      expect(r).toMatchObject({ label: "booked", href: "/my-bookings?id=b1" });
    });

    it("a new request after a past event shows the request, not the old booking", () => {
      const r = relationFor(
        conv(),
        [signed({ date_iso: PAST }), booking({ booking_id: "b2" })],
        pipeline(item({ booking_id: "b2", id: "booking:b2" })),
        VENDOR,
      );
      expect(r).toMatchObject({ label: "inquiry", href: "/leads?open=booking%3Ab2" });
    });

    it("a past booking with nothing open is still Booked", () => {
      const r = relationFor(conv(), [signed({ date_iso: PAST })], pipeline(), VENDOR);
      expect(r).toMatchObject({ label: "booked", href: "/my-bookings?id=b1" });
    });

    it("a past booking beats a lead that ended", () => {
      const r = relationFor(
        conv(),
        [signed({ date_iso: PAST }), booking({ booking_id: "b2", status: "rejected" })],
        pipeline(item({ booking_id: "b2", id: "booking:b2", archived: true, outcome: "declined" })),
        VENDOR,
      );
      expect(r).toMatchObject({ label: "booked", href: "/my-bookings?id=b1" });
    });

    it("of two upcoming bookings, the sooner one is shown", () => {
      const r = relationFor(
        conv(),
        [signed({ booking_id: "b-later", date_iso: LATER }), signed({ booking_id: "b-sooner", date_iso: FUTURE })],
        null,
        VENDOR,
      );
      expect(r.href).toBe("/my-bookings?id=b-sooner");
    });

    it("of two past bookings, the most recent is shown", () => {
      const r = relationFor(
        conv(),
        [signed({ booking_id: "b-old", date_iso: "2019-01-01" }), signed({ booking_id: "b-recent", date_iso: PAST })],
        null,
        VENDOR,
      );
      expect(r.href).toBe("/my-bookings?id=b-recent");
    });
  });

  describe("Closed", () => {
    it("a lead that ended is Closed and still links to it", () => {
      const declined = item({ archived: true, outcome: "declined", attention: null });
      const r = relationFor(conv({ booking_id: "b1" }), [booking({ status: "rejected" })], pipeline(declined), VENDOR);
      expect(r).toMatchObject({ kind: "lead", label: "closed", href: "/leads?open=booking%3Ab1" });
      expect(tabFor(r)).toBe("bookings");
    });

    it.each(["declined", "cancelled_by_client", "contract_declined", "not_going_ahead"] as const)(
      "every way a lead ends is Closed (%s)",
      (outcome) => {
        const r = relationFor(conv({ booking_id: "b1" }), [], pipeline(item({ archived: true, outcome })), VENDOR);
        expect(r.label).toBe("closed");
      },
    );

    it("an open lead wins over one that ended", () => {
      const ended = item({ booking_id: "b1", id: "booking:b1", archived: true, outcome: "declined", updated_at: "2026-10-25T00:00:00Z" });
      const open = item({ booking_id: "b2", id: "booking:b2", updated_at: "2026-10-01T00:00:00Z" });
      const r = relationFor(conv(), [booking(), booking({ booking_id: "b2" })], pipeline(ended, open), VENDOR);
      expect(r).toMatchObject({ label: "inquiry", href: "/leads?open=booking%3Ab2" });
    });

    it("a signed booking that was later cancelled is Closed, with nowhere to link", () => {
      // Signed bookings leave the pipeline, so there's no lead to point at.
      const r = relationFor(conv({ booking_id: "b1" }), [signed({ status: "cancelled" })], pipeline(), VENDOR);
      expect(r).toMatchObject({ kind: "booking", label: "closed", href: null, linkLabel: null });
      expect(tabFor(r)).toBe("bookings");
    });

    it("a refunded booking is Closed", () => {
      const r = relationFor(conv(), [signed({ payment_status: "refunded" })], null, VENDOR);
      expect(r.label).toBe("closed");
    });
  });

  describe("finding the client", () => {
    it("without the vendor's id, only the thread's own booking and the pipeline's own link count", () => {
      expect(relationFor(conv(), [signed()], null).label).toBeNull();
      expect(relationFor(conv({ booking_id: "b1" }), [signed()], null).label).toBe("booked");
      const lead = item({ booking_id: null, conversation_id: "c1", id: "lead:l1", source: "lead" });
      expect(relationFor(conv(), [], pipeline(lead)).label).toBe("inquiry");
    });

    it("never matches a guest booking, which has no client account", () => {
      const guest = signed({ user_id: null, is_guest_booking: true } as Partial<VendorBooking>);
      expect(relationFor(conv(), [guest], null, VENDOR).label).toBeNull();
    });

    it("doesn't take the vendor's own bookings for the client's", () => {
      const r = relationFor(conv({ members: [{ user_id: VENDOR }] }), [signed({ user_id: VENDOR })], null, VENDOR);
      expect(r.label).toBeNull();
    });

    it("doesn't guess when the members aren't known", () => {
      expect(relationFor(conv({ members: undefined }), [signed()], null, VENDOR).label).toBeNull();
      expect(relationFor(conv({ members: [] }), [signed()], null, VENDOR).label).toBeNull();
    });

    it("doesn't guess in a thread with more than one other person", () => {
      const crowded = conv({ members: [{ user_id: VENDOR }, { user_id: CLIENT }, { user_id: "someone-else" }] });
      expect(relationFor(crowded, [signed()], null, VENDOR).label).toBeNull();
    });

    it("doesn't match a plan chat to one client's bookings", () => {
      const plan = conv({ subject_type: "bundle", type: "all_parties" });
      expect(relationFor(plan, [signed()], null, VENDOR).label).toBeNull();
    });
  });
});

describe("tabFor", () => {
  it("is Bookings for every label and Enquiries for none", () => {
    const base = relationFor(conv(), [], null, VENDOR);
    expect(tabFor(base)).toBe("enquiries");
    for (const label of ["inquiry", "negotiation", "booked", "closed"] as const) {
      expect(tabFor({ ...base, label })).toBe("bookings");
    }
  });
});
