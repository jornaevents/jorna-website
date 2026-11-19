// "Mentioned in chat" (Contract Builder from Chat, version 1): event details
// the client and vendor typed in their messages, found without a model and
// shown beside the contract editor as evidence. Nothing here decides what
// was agreed — "could we do 200?" and "no, 150 max" are both listed, newest
// first, and nothing reaches the contract until the vendor clicks Use.
//
// Runs in the browser on messages the editor already has: free, and no chat
// text leaves Jorna. Dates and times come from chrono-node; guest counts,
// hours and dollar amounts from plain patterns.

import * as chrono from "chrono-node";
import { isDetailProposal } from "@jorna/shared/components/DetailProposal";

export type MentionKind = "date" | "times" | "start" | "guests" | "hours" | "amount" | "addon" | "discount";

export interface Mention {
  /** Stable for this message and value, for React keys and dismissing. */
  id: string;
  kind: MentionKind;
  /** What Use would set: an ISO date, "HH:MM", "HH:MM-HH:MM", a count. */
  value: string;
  /** How it reads: "Sat, Mar 14, 2027", "4:00 PM – 10:00 PM", "180 guests". */
  label: string;
  /** The words it was found in, trimmed around the match. */
  quote: string;
  messageId: string;
  sender: string;
  at: string;
  /** Whether Use may change the contract at all. A plain amount never: what
   *  a figure was for isn't something a pattern can know. The rest depend on
   *  the contract as it stands (lib/mentionUse). */
  usable: boolean;
  /** Proposed and agreed in the chat (backend DECISIONS #59): exact, not
   *  just mentioned, so it's listed first. */
  agreed?: boolean;
}

export interface ChatMessage {
  message_id: string;
  sender_id?: string | null;
  sender_name?: string | null;
  content: string;
  created_at: string;
  kind?: string | null;
  meta?: object | null;
}

/** Whether a message is the client's inquiry (its card's meta.inquiry). */
function isInquiry(m: ChatMessage): boolean {
  return Boolean(m.meta && (m.meta as { inquiry?: unknown }).inquiry);
}

/** Only typed messages: offers, contracts and system lines say their own
 *  things in their own cards, and the inquiry is already on the contract. */
function typed(m: ChatMessage): boolean {
  return (!m.kind || m.kind === "text") && !isInquiry(m);
}

/** The messages since the client's latest inquiry: older chat may be about a
 *  different event, and the inquiry itself is already on the contract. */
export function sinceLatestInquiry(messages: ChatMessage[]): ChatMessage[] {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let start = 0;
  sorted.forEach((m, i) => {
    if (isInquiry(m)) start = i + 1;
  });
  return sorted.slice(start);
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function clock(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}

function clockLabel(h: number, m: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** The words around a match, so the vendor can see what it was said in. */
function around(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 40);
  const to = Math.min(text.length, index + length + 40);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/** A time is only taken when its half of the day is clear ("4pm", "16:00"):
 *  "at 4" could be either, and guessing would put a wrong hour in front of
 *  the vendor as if it had been said. */
function clearTime(c: chrono.ParsedComponents | null | undefined): { h: number; m: number } | null {
  if (!c || !c.isCertain("hour")) return null;
  const h = c.get("hour") ?? 0;
  if (!c.isCertain("meridiem") && h < 13) return null;
  return { h, m: c.get("minute") ?? 0 };
}

const RELATIVE = /\b(ago|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?)\b/i;
const GUESTS = /\b(\d{1,3}(?:,\d{3})?|\d{2,4})\s*\+?\s*(guests|people|persons|pax|attendees|ppl)\b/gi;
const GUEST_COUNT = /\bguest\s+count\s+(?:of|is|will be|would be|:)?\s*(?:about|around|~)?\s*(\d{2,4})\b/gi;
const HOURS = /\b(\d{1,2}(?:\.5)?)\s*(hours|hrs|hr)\b/gi;
const DISCOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?\s*(?:off|discount)\b|\bdiscount\s+of\s+\$\s?(\d{1,3}(?:,\d{3})+|\d+)/gi;
const AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;

/**
 * What the messages mention, newest first, one entry per value (its latest
 * mention). `today` is the venue's calendar day as "YYYY-MM-DD": dates before
 * it are left out, since a contract can't be for them.
 */
export function findMentions(messages: ChatMessage[], today: string, addons: { id: string; name: string }[] = []): Mention[] {
  // An add-on is matched by its own name, whole words, any case: never a
  // guess at what someone meant.
  const named = addons
    .filter((a) => a.name.trim().length >= 3)
    .map((a) => ({ ...a, re: new RegExp(`\\b${a.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") }));
  const found: Mention[] = [];
  const agreed: Mention[] = [];
  const since = sinceLatestInquiry(messages);
  for (const m of since) {
    if (m.kind !== "detail_proposal" || !isDetailProposal(m.meta) || m.meta.status !== "agreed") continue;
    const { field, value, label, addon } = m.meta;
    const kind: MentionKind = field === "addon" ? "addon" : field;
    agreed.push({
      id: `${m.message_id}:agreed`,
      kind,
      value: field === "addon" ? (addon?.id ?? value) : value,
      label,
      quote: "Agreed in chat",
      messageId: m.message_id,
      sender: m.sender_name || "Someone",
      at: m.created_at,
      usable: true,
      agreed: true,
    });
  }
  for (const m of since.filter(typed)) {
    const text = m.content ?? "";
    const base = { messageId: m.message_id, sender: m.sender_name || "Someone", at: m.created_at };
    const add = (kind: MentionKind, value: string, label: string, index: number, length: number, usable = true) =>
      found.push({ id: `${m.message_id}:${kind}:${value}`, kind, value, label, quote: around(text, index, length), usable, ...base });

    for (const r of chrono.parse(text, new Date(m.created_at), { forwardDate: true })) {
      // Only a date or time someone wrote out. chrono also reads "now",
      // "tomorrow" or "six hours" against the message's own timestamp, which
      // would list when the message was sent as if it had been proposed.
      if (!/\d/.test(r.text) || RELATIVE.test(r.text)) continue;
      const s = r.start;
      if (s.isCertain("day") && s.isCertain("month")) {
        const iso = isoDay(s.date());
        if (iso >= today) add("date", iso, dayLabel(iso), r.index, r.text.length);
      }
      const from = clearTime(s);
      const to = clearTime(r.end);
      if (from && to) {
        add("times", `${clock(from.h, from.m)}-${clock(to.h, to.m)}`, `${clockLabel(from.h, from.m)} – ${clockLabel(to.h, to.m)}`, r.index, r.text.length);
      } else if (from) {
        add("start", clock(from.h, from.m), `Starts ${clockLabel(from.h, from.m)}`, r.index, r.text.length);
      }
    }

    for (const re of [GUESTS, GUEST_COUNT]) {
      for (const x of text.matchAll(re)) {
        const n = Number(x[1].replace(/,/g, ""));
        if (n >= 10 && n <= 5000) add("guests", String(n), `${n.toLocaleString("en-US")} guests`, x.index ?? 0, x[0].length);
      }
    }
    for (const x of text.matchAll(HOURS)) {
      const n = Number(x[1]);
      // Usable when the contract says what the hours are for (lib/mentionUse).
      if (n >= 1 && n <= 24) add("hours", String(n), `${n} hours`, x.index ?? 0, x[0].length);
    }
    for (const a of named) {
      const x = a.re.exec(text);
      if (x) add("addon", a.id, a.name.trim(), x.index, x[0].length);
    }
    // A figure said as a discount ("$200 off", "a $200 discount") can be
    // used as one; any other figure is only shown.
    const discounted = new Set<number>();
    for (const x of text.matchAll(DISCOUNT)) {
      const dollars = Number((x[1] ?? x[2]).replace(/,/g, ""));
      if (dollars > 0) {
        add("discount", String(dollars), `$${dollars.toLocaleString("en-US")} off`, x.index ?? 0, x[0].length);
        discounted.add(dollars);
      }
    }
    for (const x of text.matchAll(AMOUNT)) {
      const dollars = Number(x[1].replace(/,/g, ""));
      if (dollars > 0 && !discounted.has(dollars)) add("amount", String(dollars), `$${dollars.toLocaleString("en-US")}${x[2] && x[2] !== "00" ? `.${x[2]}` : ""}`, x.index ?? 0, x[0].length, false);
    }
  }

  // Agreed first, then the rest, newest first; a value is listed once, where
  // it was agreed or said last.
  const newest = new Map<string, Mention>();
  const byNewest = (a: Mention, b: Mention) => b.at.localeCompare(a.at);
  for (const f of [...agreed.sort(byNewest), ...found.sort(byNewest)]) {
    const key = `${f.kind}:${f.value}`;
    if (!newest.has(key)) newest.set(key, f);
  }
  return [...newest.values()];
}

/** One page of a thread, newest window first (offset 0 = the latest). */
export type MessagePage = (offset: number, limit: number) => Promise<{ items: ChatMessage[]; total: number }>;

/**
 * The thread back to the client's latest inquiry: pages of 100, newest first,
 * until a page holds an inquiry, the thread runs out, or `max` messages are in
 * hand. A long chat used to be read only as far as its newest 100.
 */
export async function readSinceInquiry(page: MessagePage, max = 500, limit = 100): Promise<ChatMessage[]> {
  const all: ChatMessage[] = [];
  for (let offset = 0; offset < max; offset += limit) {
    const res = await page(offset, limit);
    all.push(...res.items);
    if (res.items.some((m) => isInquiry(m))) break;
    if (res.items.length < limit || all.length >= res.total) break;
  }
  return all;
}
