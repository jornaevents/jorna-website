import { describe, expect, it } from "vitest";
import { findMentions, readSinceInquiry, sinceLatestInquiry, type ChatMessage } from "./chatMentions";

const TODAY = "2026-11-18";

function msg(id: string, content: string, at: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { message_id: id, content, created_at: at, sender_name: "Meera Patel", kind: "text", ...extra };
}

const kinds = (ms: ReturnType<typeof findMentions>) => ms.map((m) => `${m.kind}=${m.value}`);

describe("findMentions", () => {
  it("finds a date, a time range, a guest count, hours and an amount", () => {
    const found = findMentions(
      [msg("m1", "Can we do March 14, 2027 from 4pm to 10pm? About 180 guests, 6 hours, and $1,800 works.", "2026-11-12T15:00:00Z")],
      TODAY,
    );
    expect(kinds(found)).toEqual(
      expect.arrayContaining(["date=2027-03-14", "times=16:00-22:00", "guests=180", "hours=6", "amount=1800"]),
    );
    expect(found.find((m) => m.kind === "times")?.label).toBe("4:00 PM – 10:00 PM");
    expect(found.find((m) => m.kind === "guests")?.usable).toBe(true);
    // Which line an hour or a figure belongs to isn't a pattern's call.
    expect(found.find((m) => m.kind === "hours")?.usable).toBe(false);
    expect(found.find((m) => m.kind === "amount")?.usable).toBe(false);
  });

  it("lists every value, newest first, so the vendor decides what was agreed", () => {
    const found = findMentions(
      [
        msg("m1", "Could we do 200 guests?", "2026-11-12T15:00:00Z"),
        msg("m2", "The venue caps us at 150 people.", "2026-11-13T15:00:00Z", { sender_name: "Arjun Kapoor" }),
      ],
      TODAY,
    );
    expect(found.filter((m) => m.kind === "guests").map((m) => m.value)).toEqual(["150", "200"]);
    expect(found[0].sender).toBe("Arjun Kapoor");
  });

  it("says a repeated value once, where it was said last", () => {
    const found = findMentions(
      [msg("m1", "180 guests", "2026-11-12T15:00:00Z"), msg("m2", "Still 180 guests", "2026-11-14T15:00:00Z")],
      TODAY,
    );
    const guests = found.filter((m) => m.kind === "guests");
    expect(guests).toHaveLength(1);
    expect(guests[0].messageId).toBe("m2");
  });

  it("leaves out a time whose half of the day isn't clear", () => {
    const found = findMentions([msg("m1", "Can we start at 4 instead?", "2026-11-12T15:00:00Z")], TODAY);
    expect(found.filter((m) => m.kind === "start" || m.kind === "times")).toEqual([]);
  });

  it("takes a start time on its own", () => {
    const found = findMentions([msg("m1", "Can we start at 4:30pm instead?", "2026-11-12T15:00:00Z")], TODAY);
    expect(kinds(found)).toContain("start=16:30");
  });

  it("leaves out dates already past", () => {
    const found = findMentions([msg("m1", "We met on October 2, 2026.", "2026-11-12T15:00:00Z")], TODAY);
    expect(found.filter((m) => m.kind === "date")).toEqual([]);
  });

  it("ignores cards and the inquiry itself", () => {
    const found = findMentions(
      [
        msg("m1", "Inquiry: Sangeet\n• Guests: About 300", "2026-11-10T15:00:00Z", { meta: { inquiry: { lead_id: "l1" } } }),
        msg("m2", "Offered $2,000", "2026-11-11T15:00:00Z", { kind: "offer" }),
        msg("m3", "Contract sent", "2026-11-11T16:00:00Z", { kind: "contract" }),
      ],
      TODAY,
    );
    expect(found).toEqual([]);
  });

  it("reads a plain chat line for only what it says", () => {
    const at = "2026-11-16T15:00:00Z";
    const found = findMentions(
      [
        msg("m2", "Can we start at 4:30pm? We're now about 180 guests.", at),
        msg("m3", "Six hours is fine, and $1,800 works for us.", at),
      ],
      TODAY,
    );
    expect(kinds(found).sort()).toEqual(["amount=1800", "guests=180", "start=16:30"]);
  });

  it("keeps a date said with \"in\" or \"on\"", () => {
    const found = findMentions([msg("m1", "We're thinking sometime in March 2027, maybe on March 14, 2027.", "2026-11-12T15:00:00Z")], TODAY);
    expect(kinds(found)).toContain("date=2027-03-14");
  });

  it("odd numbers aren't guest counts", () => {
    const found = findMentions([msg("m1", "3 people from our side will come early", "2026-11-12T15:00:00Z")], TODAY);
    expect(found.filter((m) => m.kind === "guests")).toEqual([]);
  });
});

describe("sinceLatestInquiry", () => {
  it("keeps only what came after the latest inquiry", () => {
    const rows = sinceLatestInquiry([
      msg("old", "For our engagement: 50 guests", "2026-09-01T00:00:00Z"),
      msg("inq", "Inquiry", "2026-11-10T00:00:00Z", { meta: { inquiry: { lead_id: "l1" } } }),
      msg("new", "Actually 180 guests", "2026-11-12T00:00:00Z"),
    ]);
    expect(rows.map((r) => r.message_id)).toEqual(["new"]);
  });

  it("keeps everything when there's no inquiry", () => {
    expect(sinceLatestInquiry([msg("a", "hi", "2026-11-01T00:00:00Z")])).toHaveLength(1);
  });
});

describe("readSinceInquiry", () => {
  const thread = (n: number, inquiryAt?: number) =>
    Array.from({ length: n }, (_, i) =>
      msg(`m${i}`, `line ${i}`, new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), i === inquiryAt ? { meta: { inquiry: { lead_id: "l" } } } : {}),
    );
  // offset 0 = the newest page, as the API serves it.
  const pages = (rows: ChatMessage[]) => {
    const asked: number[] = [];
    const page = async (offset: number, limit: number) => {
      asked.push(offset);
      const end = rows.length - offset;
      return { items: rows.slice(Math.max(0, end - limit), Math.max(0, end)), total: rows.length };
    };
    return { page, asked };
  };

  it("pages back until the page that holds the inquiry", async () => {
    const { page, asked } = pages(thread(350, 120));
    const got = await readSinceInquiry(page);
    expect(asked).toEqual([0, 100, 200]);
    expect(got.some((m) => m.meta?.inquiry)).toBe(true);
  });

  it("stops at the start of a short thread", async () => {
    const { page, asked } = pages(thread(40));
    expect(await readSinceInquiry(page)).toHaveLength(40);
    expect(asked).toEqual([0]);
  });

  it("stops at the cap on a long thread with no inquiry", async () => {
    const { page, asked } = pages(thread(2000));
    expect(await readSinceInquiry(page, 500)).toHaveLength(500);
    expect(asked).toEqual([0, 100, 200, 300, 400]);
  });
});
