// The label on a chat between a client and one vendor — the vendor's Leads
// and Bookings words, so both sides of a chat call it the same thing. The
// vendor app works out which one applies itself (apps/vendor/web/src/lib/
// messageLabels.ts); the client app gets it from the backend, worked out by
// the same rule (jorna-backend app/services/message_labels.py, DECISIONS #42).

import type { Tone } from "../components/ui";

export type MessageLabel = "inquiry" | "negotiation" | "booked" | "closed";

export const LABEL_TEXT: Record<MessageLabel, string> = {
  inquiry: "Inquiry",
  negotiation: "Negotiation",
  booked: "Booked",
  closed: "Closed",
};

/** Inquiry and Booked match the Leads and Bookings pages' own pills. */
export const LABEL_TONE: Record<MessageLabel, Tone> = {
  inquiry: "amber",
  negotiation: "maroon",
  booked: "green",
  closed: "grey",
};

/** The `label` on a chat row, for its client: the stage and the booking
 *  it's about. Null for the vendor, for plan chats, and when nothing has
 *  been requested. */
export interface ConversationLabel {
  stage: MessageLabel;
  booking_id: string;
  service_name: string | null;
}

/** A label the backend sent, if it's one this app knows how to show. A
 *  newer backend could add a stage; an unknown one is left off rather than
 *  shown as a blank pill. */
export function knownLabel(label: ConversationLabel | null | undefined): ConversationLabel | null {
  return label && Object.hasOwn(LABEL_TEXT, label.stage) ? label : null;
}
