// A contract's timeline in words — shared by the contract page and the Leads
// drawer, so the two can't describe the same event differently.

import { money } from "@jorna/shared/lib/contractDraft";
import { display } from "@jorna/shared/lib/fieldNegotiation";
import type { ContractEvent } from "@/lib/types";

export function prettyDate(iso?: string | null): string {
  if (!iso || iso === "TBD") return "TBD";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function cents(detail: ContractEvent["detail"]): string {
  return typeof detail?.amount_cents === "number" ? ` (${money(detail.amount_cents)})` : "";
}

function docTitle(detail: Record<string, unknown>): string {
  return typeof detail.title === "string" ? detail.title : "a document";
}

/** A signature that isn't the name on the contract still signs; the backend
 *  flags it (DECISIONS #27) and this says so. */
function forName(detail: Record<string, unknown>): string {
  return typeof detail.name_on_contract === "string" ? ` — the contract is for ${detail.name_on_contract}` : "";
}

/** The rows worth reading. A vendor's negotiation answer is one send, but
 *  the backend also writes it into the contract ("edited") and restarts the
 *  hold ("resent") in the same moment. Those two are dropped next to it, so
 *  an answer doesn't read as an edit and a resend (web #150). */
export function visibleEvents(events: ContractEvent[]): ContractEvent[] {
  const answers = events
    .filter((e) => e.kind === "negotiation_sent" && e.actor === "vendor")
    .map((e) => new Date(e.at).getTime());
  return events.filter(
    (e) =>
      !((e.kind === "edited" || e.kind === "resent") &&
        answers.some((t) => Math.abs(new Date(e.at).getTime() - t) < 5_000)),
  );
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One timeline row in words. */
export function describeEvent(e: ContractEvent, c: { signer_name?: string | null }): string {
  const d = e.detail ?? {};
  switch (e.kind) {
    case "created":
      return d.draft ? "Created as a draft" : "Created";
    case "sent":
    case "resent":
      return `${e.kind === "sent" ? "Sent" : "Resent"}${
        typeof d.hold_expires_at === "string" ? ` — date held until ${prettyDate(d.hold_expires_at)}` : ""
      }`;
    case "emailed":
      return `Link emailed to ${typeof d.to === "string" ? d.to : "your client"}`;
    case "email_failed":
      return `Couldn't email the link to ${typeof d.to === "string" ? d.to : "your client"}`;
    case "viewed":
      return "Your client opened it";
    case "edited":
      return `You edited it${typeof d.revision === "number" ? ` (version ${d.revision})` : ""}`;
    case "signed":
      return `Signed by ${typeof d.signer_name === "string" ? d.signer_name : c.signer_name ?? "your client"}${forName(d)}`;
    // The vendor's half (backend DECISIONS #34).
    case "countersigned":
      return `You signed it${typeof d.signer_name === "string" ? ` as ${d.signer_name}` : ""} — it's booked`;
    case "signature_declined":
      return `You didn't sign${typeof d.reason === "string" && d.reason ? ` — “${d.reason}”` : ""}`;
    case "countersign_reminder":
      return d.which === "day3" ? "Reminded you to sign — 3 days since your client did" : "Reminded you to sign";
    case "declined":
      return `Your client declined${typeof d.reason === "string" && d.reason ? ` — “${d.reason}”` : ""}`;
    case "voided":
      return "You voided it";
    case "payment_marked": {
      const via = d.paid_via === "venmo" ? " by Venmo" : d.paid_via === "zelle" ? " by Zelle" : "";
      return `Your client says ${typeof d.label === "string" ? d.label : "a payment"}${cents(d)} is sent${via}`;
    }
    case "payment_not_received":
      // The vendor undid one step from Earnings (backend DECISIONS #33).
      return d.step === "unmarked"
        ? `You told your client ${typeof d.label === "string" ? d.label : "a payment"}${cents(d)} hasn't arrived`
        : `You took back confirming ${typeof d.label === "string" ? d.label : "a payment"}${cents(d)}`;
    case "payment_confirmed":
      return `You confirmed ${typeof d.label === "string" ? d.label : "a payment"}${cents(d)} arrived`;
    case "payment_reminder": {
      // Sent by the backend's payment reminder sweep: the client before and
      // on the due date, this vendor once it's overdue.
      const what = `${typeof d.label === "string" ? d.label : "a payment"}${cents(d)}`;
      const due = typeof d.due_on === "string" ? prettyDate(d.due_on) : "its due date";
      return d.reminder === "manual"
        ? `You reminded your client ${what} is overdue`
        : d.reminder === "overdue"
        ? `Overdue: ${what} was due ${due} — we let you know`
        : d.reminder === "due"
          ? `Reminded your client ${what} is due today`
          : `Reminded your client ${what} is due ${due}`;
    }
    case "expired":
      return "The hold ended — the date opened up again";
    // Change proposals (backend 0068, DECISIONS #23).
    case "proposal_sent": {
      const n = Array.isArray(d.fields) ? d.fields.length : 0;
      return `Your client proposed changes${n ? ` (${n} part${n === 1 ? "" : "s"} of the contract)` : ""}`;
    }
    case "proposal_accepted":
      return `You accepted their changes${typeof d.revision === "number" ? ` (version ${d.revision})` : ""}`;
    case "proposal_declined":
      return `You kept your version${typeof d.note === "string" && d.note ? ` — “${d.note}”` : ""}`;
    case "proposal_revised":
      return `You answered with a new version${typeof d.revision === "number" ? ` (version ${d.revision})` : ""}`;
    case "proposal_superseded":
      return e.actor === "client" ? "Your client replaced their proposal" : "Their proposal was overtaken by your edit";
    case "proposal_withdrawn":
      return "Your client withdrew their proposal";
    // Addenda and cancellation agreements attached to it (backend 0067).
    // Only some events carry the document's title.
    case "document_created":
      return `You wrote “${docTitle(d)}”`;
    case "document_sent":
      return `You sent “${docTitle(d)}”`;
    case "document_emailed":
      return `A document was emailed to ${typeof d.to === "string" ? d.to : "your client"}`;
    case "document_edited":
      return "You edited an attached document";
    case "document_viewed":
      return "Your client opened an attached document";
    case "document_signed":
      return `${typeof d.signer_name === "string" ? d.signer_name : "Your client"} signed “${docTitle(d)}”${forName(d)}`;
    // An addendum's priced items applied once both signed (backend DECISIONS #38).
    case "addendum_applied":
      return typeof d.total_before === "number" && typeof d.total_after === "number"
        ? `${docTitle(d)} changed the total from ${money(d.total_before)} to ${money(d.total_after)}`
        : `${docTitle(d)} changed what's included`;
    case "document_countersigned":
      return `You signed “${docTitle(d)}”`;
    case "document_signature_declined":
      return `You didn't sign “${docTitle(d)}”${typeof d.reason === "string" && d.reason ? ` — “${d.reason}”` : ""}`;
    case "document_declined":
      return `Your client declined an attached document${typeof d.reason === "string" && d.reason ? ` — “${d.reason}”` : ""}`;
    case "document_voided":
      return "You voided an attached document";
    // Signing evidence (backend DECISIONS #27). The IP each event carries
    // stays in the signed PDF's certificate, not here.
    case "code_sent":
      return d.document_id ? "Your client asked for a code to sign a document" : "Your client asked for a code to sign";
    case "details_updated": {
      const fields = Array.isArray(d.fields) ? d.fields.filter((f): f is string => typeof f === "string") : [];
      // A client may give a different email than the one the vendor typed
      // (the link's first step); the backend says which, so say it here.
      if (typeof d.email_to === "string" && d.email_to) {
        const rest = fields.filter((f) => f !== "email");
        return `Your client changed their email to ${d.email_to}${rest.length ? `, and their ${rest.join(" and ")}` : ""}`;
      }
      return `Your client changed their ${fields.length ? fields.join(" and ") : "details"} on the contract`;
    }
    // Field-by-field negotiation (backend DECISIONS #26): one side's turn.
    case "negotiation_sent": {
      // Newer events name each answer (backend DECISIONS #37): say what
      // moved, not "accepted 2 changes" (2026-10-26).
      if (Array.isArray(d.answers) && d.answers.length) {
        const who = e.actor === "vendor" ? "You" : "Your client";
        const said = (d.answers as { key: string; label: string; action: string; value: unknown }[]).map((a) => {
          const v = display(a.key, a.value);
          const what = a.label.replace(/^Include /, "");
          if (a.key.endsWith(".included") || a.key.startsWith("clause:")) {
            const out = a.value === false;
            return a.action === "accept" ? `accepted ${out ? "leaving out" : "keeping"} ${what}` : `asked to ${out ? "leave out" : "keep"} ${what}`;
          }
          if (a.action === "accept") return `accepted ${what}: ${v}`;
          if (a.action === "counter") return `countered ${what} at ${v}`;
          if (a.action === "keep") return `held ${what} at ${v}`;
          if (a.action === "reopen") return `reopened ${what} at ${v}`;
          return `asked for ${what}: ${v}`;
        });
        const shown = said.slice(0, 3).join(", ");
        return `${who} ${shown}${said.length > 3 ? `, and ${said.length - 3} more` : ""}`;
      }
      const keys = Array.isArray(d.keys) ? d.keys.length : 0;
      const settled = Array.isArray(d.settled) ? d.settled.length : 0;
      const rest = Math.max(0, keys - settled);
      if (e.actor === "vendor") {
        if (!settled) return `You answered ${count(rest, "change")}`;
        return rest ? `You accepted ${settled} and answered ${count(rest, "other change")}` : `You accepted ${count(settled, "change")}`;
      }
      if (!settled) return `Your client asked for ${count(rest, "change")}`;
      return rest
        ? `Your client accepted ${settled} and asked for ${count(rest, "change")}`
        : `Your client accepted ${count(settled, "change")}`;
    }
    case "cancelled":
      // A vendor cancelling a booking both signed (backend DECISIONS #37).
      if (e.actor === "vendor") return `You cancelled the booking${typeof d.reason === "string" && d.reason ? ` — “${d.reason}”` : ""}`;
      return "Your client cancelled their request";
    case "copy_sent":
      return d.to === "vendor" ? "A signed copy was emailed to you" : "A signed copy was emailed to your client";
    default:
      return e.kind;
  }
}
