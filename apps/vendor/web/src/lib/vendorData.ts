"use client";

// The vendor pages' opening reads, remembered between pages (lib/dataCache).
// Each is lib/jorna's own call under a key naming everything it was asked
// with, so two different questions can't share an answer. Pages and the
// sidebar use these; anything that polls keeps calling lib/jorna.

import { cachedRead } from "./dataCache";
import {
  allVendorBookings,
  getContract,
  getEarnings,
  getMyAvailability,
  getMyVendor,
  getNewBookingsCount,
  getPipeline,
  getUnreadCount,
  listConversations,
  listDocuments,
  listLeads,
  listMyServices,
  listVendorBookings,
} from "./jorna";
import { loadTemplates } from "./contractTemplates";

/** /vendors/me: every vendor page and the sidebar ask for it first, so it
 *  used to cost a round trip before each page could start on its own data. */
export const myVendor = () => cachedRead("vendor", getMyVendor);

export const vendorBookings = (vendorId: string) =>
  cachedRead(`bookings:${vendorId}:100`, () => listVendorBookings(vendorId, { limit: 100 }));

export const everyVendorBooking = (vendorId: string) =>
  cachedRead(`bookings:${vendorId}:all`, () => allVendorBookings(vendorId));

export const myServices = (vendorId: string) => cachedRead(`services:${vendorId}`, () => listMyServices(vendorId));

export const vendorEarnings = (vendorId: string) => cachedRead(`earnings:${vendorId}`, () => getEarnings(vendorId));

export const myAvailability = () => cachedRead("availability", getMyAvailability);

export const leadPipeline = () => cachedRead("pipeline", getPipeline);

export const myLeads = () => cachedRead("leads", listLeads);

export const myConversations = () => cachedRead("conversations", listConversations);

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
