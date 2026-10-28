// What each Messages thread is to the vendor — its lead or booking, and the
// label that goes with it — so the list, the thread header and the side
// panel all say the same thing.
//
// Nothing here works out a stage of its own. The labels are the ones the
// vendor already sees elsewhere: Inquiry and Negotiation are the Leads
// pipeline's stage, Booked is vendorPlan's bookingTab (a signed contract, or
// an approved request from before contracts), and Closed is a lead the
// pipeline archived with an outcome, or a booking that was called off.

import { bookingTab, isDeadVendorBooking } from "./vendorPlan";
import type { ConversationSummary, Pipeline, PipelineItem, VendorBooking } from "./types";

export type MessageLabel = "inquiry" | "negotiation" | "booked" | "closed";
export type MessageTab = "enquiries" | "bookings";

export const LABEL_TEXT: Record<MessageLabel, string> = {
  inquiry: "Inquiry",
  negotiation: "Negotiation",
  booked: "Booked",
  closed: "Closed",
};

/** What a thread is to the vendor, for the list and the side panel. */
export interface Relation {
  kind: "booking" | "lead" | "none";
  label: MessageLabel | null;
  href: string | null;
  linkLabel: string | null;
  date: string | null;
  venue: string | null;
  pkg: string | null;
  valueCents: number | null;
  contractId: string | null;
}

const NONE: Relation = {
  kind: "none", label: null, href: null, linkLabel: null, date: null, venue: null, pkg: null, valueCents: null, contractId: null,
};

/** Plan group chats aren't part of Messages V1; they stay reachable by link. */
export function showInInbox(c: ConversationSummary): boolean {
  return c.subject_type !== "bundle";
}

/** The client in a two-person thread: whoever isn't the vendor reading it.
 *  Null for a plan chat, or when the members aren't known. */
function clientIdOf(c: ConversationSummary, vendorUserId: string | null | undefined): string | null {
  if (c.subject_type === "bundle") return null;
  const others = (c.members ?? []).filter((m) => m.user_id !== vendorUserId);
  return others.length === 1 ? others[0].user_id : null;
}

/** The thread's own booking first, then the client's others with this vendor. */
function bookingsFor(c: ConversationSummary, bookings: VendorBooking[], clientId: string | null): VendorBooking[] {
  const own = c.booking_id ? bookings.filter((b) => b.booking_id === c.booking_id) : [];
  const theirs = clientId
    ? bookings.filter((b) => b.user_id === clientId && b.booking_id !== c.booking_id)
    : [];
  return [...own, ...theirs];
}

function itemsFor(
  c: ConversationSummary,
  items: PipelineItem[],
  related: VendorBooking[],
): PipelineItem[] {
  const ids = new Set(related.map((b) => b.booking_id));
  const matches = items.filter(
    (i) =>
      (i.booking_id != null && (i.booking_id === c.booking_id || ids.has(i.booking_id))) ||
      (i.conversation_id != null && i.conversation_id === c.conversation_id),
  );
  // The thread's own booking, then anything still open, then the furthest
  // along, then the most recently touched.
  const rank = (i: PipelineItem) => [
    c.booking_id != null && i.booking_id === c.booking_id ? 0 : 1,
    i.outcome ? 1 : 0,
    i.stage === "negotiation" ? 0 : 1,
  ];
  return matches.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let k = 0; k < ra.length; k++) if (ra[k] !== rb[k]) return ra[k] - rb[k];
    return (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? "");
  });
}

function fromBooking(b: VendorBooking, label: MessageLabel): Relation {
  return {
    kind: "booking",
    label,
    href: label === "booked" ? `/my-bookings?id=${b.booking_id}` : null,
    linkLabel: label === "booked" ? "View booking" : null,
    date: b.date_iso ?? null,
    venue: b.location ?? null,
    pkg: b.service_name ?? null,
    valueCents: b.amount_cents ?? Math.round((b.price ?? 0) * 100),
    contractId: b.contract_token ? b.booking_id : null,
  };
}

function fromItem(i: PipelineItem): Relation {
  return {
    kind: "lead",
    label: i.outcome ? "closed" : i.stage === "negotiation" ? "negotiation" : "inquiry",
    href: `/leads?open=${encodeURIComponent(i.id)}`,
    linkLabel: "View lead",
    date: i.event_date,
    venue: i.location,
    pkg: i.service_name,
    valueCents: i.estimated_value_cents,
    contractId: i.source === "contract" ? i.booking_id : null,
  };
}

/**
 * The thread's relation, in priority order:
 *
 * 1. Its own booking, once agreed (Booked).
 * 2. Another agreed booking with this client that hasn't happened yet
 *    (Booked) — a question thread whose request was later signed.
 * 3. An open lead or request for this client (Inquiry or Negotiation), so a
 *    new request after a past event isn't hidden behind the old booking.
 * 4. A past booking with this client (Booked).
 * 5. A lead that ended, or a booking that was called off (Closed).
 *
 * `vendorUserId` lets a two-person thread find its client among the members;
 * without it only the thread's own booking and the pipeline's own link
 * (conversation_id) are used.
 */
export function relationFor(
  c: ConversationSummary,
  bookings: VendorBooking[],
  pipeline: Pipeline | null,
  vendorUserId?: string | null,
): Relation {
  const related = bookingsFor(c, bookings, clientIdOf(c, vendorUserId));
  const agreed = related.filter((b) => bookingTab(b) != null);
  const ownAgreed = agreed.find((b) => b.booking_id === c.booking_id);
  if (ownAgreed) return fromBooking(ownAgreed, "booked");

  const upcoming = agreed.filter((b) => bookingTab(b) !== "over");
  if (upcoming.length) {
    const next = [...upcoming].sort((a, b) => (a.date_iso ?? "").localeCompare(b.date_iso ?? ""))[0];
    return fromBooking(next, "booked");
  }

  const items = itemsFor(c, pipeline?.items ?? [], related);
  const open = items.find((i) => !i.outcome);
  if (open) return fromItem(open);

  if (agreed.length) {
    const last = [...agreed].sort((a, b) => (b.date_iso ?? "").localeCompare(a.date_iso ?? ""))[0];
    return fromBooking(last, "booked");
  }

  if (items.length) return fromItem(items[0]);
  const calledOff = related.find(isDeadVendorBooking);
  if (calledOff) return fromBooking(calledOff, "closed");
  return NONE;
}

/** Enquiries until the client has a lead or booking with the vendor. */
export function tabFor(relation: Relation): MessageTab {
  return relation.label ? "bookings" : "enquiries";
}
