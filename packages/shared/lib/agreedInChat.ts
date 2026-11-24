// What a client–vendor chat agreed and still stands (backend DECISIONS #59,
// #60): the latest agreed proposal per field, unless an inquiry sent after it
// said something else for that field. The inquiry form starts from these, and
// the contract editor lists them, so a detail agreed before the inquiry isn't
// lost once the inquiry is sent — and one the inquiry changed doesn't return.

import { isDetailProposal, type DetailField, type DetailProposalMeta } from "../components/DetailProposal";

export interface AgreedMessage {
  message_id: string;
  created_at: string;
  kind?: string | null;
  meta?: unknown;
}

/** The parts of an inquiry card's meta.inquiry that can overrule an agreement. */
interface InquiryFields {
  service_id?: string | null;
  event_date_iso?: string | null;
  guest_count?: number | null;
  time_start?: string | null;
  time_end?: string | null;
}

export interface Agreement<M extends AgreedMessage = AgreedMessage> {
  message: M;
  meta: DetailProposalMeta;
}

function inquiryOf(m: AgreedMessage): InquiryFields | null {
  const inquiry = (m.meta as { inquiry?: InquiryFields } | null | undefined)?.inquiry;
  return inquiry && typeof inquiry === "object" ? inquiry : null;
}

/** Whether the inquiry gave this field a different value. A field it left
 *  blank says nothing, so the agreement stands. */
function overruled(meta: DetailProposalMeta, inquiry: InquiryFields): boolean {
  switch (meta.field) {
    case "date":
      return Boolean(inquiry.event_date_iso) && inquiry.event_date_iso !== meta.value;
    case "times":
      return Boolean(inquiry.time_start && inquiry.time_end) && `${inquiry.time_start}-${inquiry.time_end}` !== meta.value;
    case "guests":
      return inquiry.guest_count != null && String(inquiry.guest_count) !== meta.value;
    case "price":
      // A price for one package says nothing once they ask about another.
      return Boolean(meta.package && inquiry.service_id) && inquiry.service_id !== meta.package?.service_id;
    default:
      // The inquiry has no add-ons.
      return false;
  }
}

/** The standing agreements, one per field, oldest first. */
export function agreedInChat<M extends AgreedMessage>(messages: M[]): Agreement<M>[] {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const standing = new Map<DetailField, Agreement<M>>();
  for (const m of sorted) {
    if (m.kind === "detail_proposal" && isDetailProposal(m.meta) && m.meta.status === "agreed") {
      standing.set(m.meta.field, { message: m, meta: m.meta });
      continue;
    }
    const inquiry = inquiryOf(m);
    if (!inquiry) continue;
    for (const [field, a] of standing) if (overruled(a.meta, inquiry)) standing.delete(field);
  }
  return [...standing.values()];
}

/** What the inquiry form takes from the agreements: the event's fields, and
 *  the package an agreed price was for. */
export interface AgreedPrefill {
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  guests?: number;
  serviceId?: string;
}

/** `today` is "YYYY-MM-DD": an agreed date that has passed isn't offered. */
export function agreedPrefill(messages: AgreedMessage[], today: string): AgreedPrefill | null {
  const out: AgreedPrefill = {};
  for (const { meta } of agreedInChat(messages)) {
    if (meta.field === "date" && meta.value >= today) out.date = meta.value;
    if (meta.field === "times") [out.timeStart, out.timeEnd] = meta.value.split("-");
    if (meta.field === "guests") out.guests = Number(meta.value);
    if (meta.field === "price" && meta.package) out.serviceId = meta.package.service_id;
  }
  return Object.keys(out).length ? out : null;
}
