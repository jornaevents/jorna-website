"use client";

// The vendor pages' opening reads, remembered between pages (lib/dataCache).
// Each is lib/jorna's own call under a key naming everything it was asked
// with, so two different questions can't share an answer. Pages and the
// sidebar use these; anything that polls keeps calling lib/jorna.

import { cachedRead, isRemembered, ownerWait, peek, prime } from "./dataCache";
import {
  allVendorBookings,
  getContract,
  getEarnings,
  getMyAvailability,
  getMyVendor,
  getNewBookingsCount,
  getPipeline,
  getUnreadCount,
  getVendorOverview,
  listConversations,
  listDocuments,
  listLeads,
  listMyServices,
  listVendorBookings,
} from "./jorna";
import { loadTemplates } from "./contractTemplates";
import type { VendorOverview } from "./jorna";
import type { VendorDetail } from "./types";

/** /vendors/me: every vendor page and the sidebar ask for it first, so it
 *  used to cost a round trip before each page could start on its own data. */
// Keys the combined Overview read fills too (overviewReads below).
const VENDOR = "vendor";
const bookingsKey = (vendorId: string) => `bookings:${vendorId}:100`;
const LEADS = "leads";
const CONVERSATIONS = "conversations";
const PIPELINE = "pipeline";

export const myVendor = () => cachedRead(VENDOR, getMyVendor);

export const vendorBookings = (vendorId: string) =>
  cachedRead(bookingsKey(vendorId), () => listVendorBookings(vendorId, { limit: 100 }));

export const everyVendorBooking = (vendorId: string) =>
  cachedRead(`bookings:${vendorId}:all`, () => allVendorBookings(vendorId));

export const myServices = (vendorId: string) => cachedRead(`services:${vendorId}`, () => listMyServices(vendorId));

export const vendorEarnings = (vendorId: string) => cachedRead(`earnings:${vendorId}`, () => getEarnings(vendorId));

export const myAvailability = () => cachedRead("availability", getMyAvailability);

export const leadPipeline = () => cachedRead(PIPELINE, getPipeline);

export const myLeads = () => cachedRead(LEADS, listLeads);

export const myConversations = () => cachedRead(CONVERSATIONS, listConversations);

/** The sidebar's Messages badge, which leaves plan chats out. */
export const unreadDirect = () =>
  cachedRead("unread:direct", () => getUnreadCount({ includePlanChats: false }));

export const newBookingsCount = () => cachedRead("new-bookings", getNewBookingsCount);

export const contractTemplates = () => cachedRead("contract-templates", loadTemplates);

/** One contract, as its page shows it. The editor and the negotiation
 *  workspace read it fresh instead: they start an edit from it, and an
 *  edit should start from what the server has now. */
export const contractById = (bookingId: string) => cachedRead(`contract:${bookingId}`, () => getContract(bookingId));

/** The addenda and cancellations attached to a contract, for its page. */
export const contractDocuments = (bookingId: string) =>
  cachedRead(`documents:${bookingId}`, () => listDocuments(bookingId));

// ── Read ahead ───────────────────────────────────────────────────────

/** Each sidebar page's opening reads, started before the click lands — on
 *  hover, focus or touch — so a first visit finds them remembered. The same
 *  calls the page makes, so it can't read ahead the wrong thing. */
const AHEAD: Record<string, (vendorId: string) => Promise<unknown>[]> = {
  "/overview": (id) => [vendorBookings(id), myLeads(), myConversations(), leadPipeline()],
  "/my-bookings": (id) => [vendorBookings(id)],
  "/leads": () => [leadPipeline()],
  "/contracts": (id) => [everyVendorBooking(id), contractTemplates(), myServices(id)],
  "/my-calendar": (id) => [vendorBookings(id), myAvailability()],
  "/my-earnings": (id) => [vendorEarnings(id)],
};

/** A contract's page reads, started when its row is pointed at. */
export function prefetchContract(bookingId: string): void {
  contractById(bookingId).catch(() => {});
  contractDocuments(bookingId).catch(() => {});
}

/** Start the reads the page at `href` opens with. Never throws; a page
 *  without an entry here reads nothing ahead. */
export function prefetchFor(href: string): void {
  const reads = AHEAD[href];
  if (!reads) return;
  myVendor()
    .then((v) => {
      if (v) for (const p of reads(v.vendor_id)) p.catch(() => {});
    })
    .catch(() => {});
}

// ── Overview in one request ──────────────────────────────────────────

/** Overview's five reads. When memory doesn't already hold them all, one
 *  request (GET /vendors/me/overview, backend DECISIONS #43) fills each
 *  under its own read's key, so these are then answered from memory — and
 *  so are Bookings, Leads and the sidebar after it. A section the server
 *  couldn't give, or the whole request failing (an older backend, a
 *  blip), just means those reads go out on their own, as before. */
export async function overviewReads() {
  // No await before the combined read when there's nothing to wait for:
  // the sidebar mounts in the same tick and would send its own requests.
  const waiting = ownerWait();
  if (waiting) await waiting;
  const known = peek(VENDOR) as VendorDetail | null | undefined;
  const complete =
    known === null || // remembered as not a vendor: nothing to combine
    (known != null && [bookingsKey(known.vendor_id), LEADS, CONVERSATIONS, PIPELINE].every(isRemembered));
  // The vendor can arrive first, from the role check's own request; the
  // bookings are filed only once the combined read is back.
  if (!complete) await fillFromOverview();

  const vendor = await myVendor();
  if (!vendor) return { vendor: null } as const;
  return {
    vendor,
    bookings: vendorBookings(vendor.vendor_id),
    leads: myLeads(),
    conversations: myConversations(),
    pipeline: leadPipeline(),
  };
}

/** A part's own read, after the combined one failed — only for a vendor.
 *  Someone who isn't one gets a 404 for the whole thing, and each part's
 *  own route would refuse too. */
function ownIfVendor<T>(own: () => Promise<T>): Promise<T> {
  return myVendor().then((v) => (v ? own() : Promise.reject(new Error("Not a vendor"))));
}

/** One request for all five, each part started as its own key's read; a
 *  part the server couldn't give, or the request failing, reads on its own. */
function fillFromOverview(): Promise<unknown> {
  const combined = getVendorOverview();
  const part =
    <T>(pick: (o: VendorOverview) => T | null, own: () => Promise<T>) =>
    () =>
      combined.then((o) => pick(o) ?? own(), () => ownIfVendor(own));
  // First, so it's filed before anyone who waited on the vendor asks for
  // that vendor's bookings: reactions run in the order they're added.
  combined
    .then((o) =>
      prime(bookingsKey(o.vendor.vendor_id), part(
        (x) => x.bookings,
        () => listVendorBookings(o.vendor.vendor_id, { limit: 100 }),
      )),
    )
    .catch(() => {});
  // The vendor falls back to its own read whatever went wrong: it's what
  // says whether the others are worth asking for.
  prime(VENDOR, () => combined.then((o) => o.vendor, getMyVendor));
  prime(LEADS, part((o) => o.leads, listLeads));
  prime(CONVERSATIONS, part((o) => o.conversations, listConversations));
  prime(PIPELINE, part((o) => o.pipeline, getPipeline));
  return combined.catch(() => {});
}

