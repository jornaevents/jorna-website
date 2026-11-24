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
    // What a figure was for isn't a pattern's call; hours depend on the contract.
    expect(found.find((m) => m.kind === "hours")?.usable).toBe(true);
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

  it("pages back to the page that holds the inquiry, and one more", async () => {
    const { page, asked } = pages(thread(450, 220));
    const got = await readSinceInquiry(page);
    expect(asked).toEqual([0, 100, 200, 300]);
    expect(got.some((m) => Boolean((m.meta as { inquiry?: unknown } | null)?.inquiry))).toBe(true);
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

describe("agreed proposals", () => {
  const proposal = (id: string, field: string, value: string, label: string, status: string, at: string) =>
    msg(id, `Meera proposed ${label}`, at, { kind: "detail_proposal", meta: { field, value, label, status, proposed_by: "c" } });

  it("lists agreed details first, marked agreed, and skips open or declined ones", () => {
    const found = findMentions(
      [
        msg("m1", "Maybe 200 guests?", "2026-11-14T15:00:00Z"),
        proposal("p1", "guests", "150", "150 guests", "agreed", "2026-11-13T15:00:00Z"),
        proposal("p2", "times", "16:00-22:00", "4:00 PM – 10:00 PM", "open", "2026-11-15T15:00:00Z"),
        proposal("p3", "date", "2027-03-14", "Sun, Mar 14, 2027", "declined", "2026-11-15T15:00:00Z"),
      ],
      TODAY,
    );
    expect(found[0]).toMatchObject({ kind: "guests", value: "150", agreed: true, usable: true, quote: "Agreed in chat" });
    expect(kinds(found)).toEqual(["guests=150", "guests=200"]);
  });

  it("an agreed add-on can be used", () => {
    const found = findMentions(
      [msg("p1", "x", "2026-11-13T15:00:00Z", { kind: "detail_proposal", meta: { field: "addon", value: "ao-1", label: "Drone coverage", status: "agreed", proposed_by: "c", addon: { id: "ao-1", name: "Drone coverage" } } })],
      TODAY,
    );
    expect(found).toEqual([expect.objectContaining({ kind: "addon", value: "ao-1", usable: true, agreed: true })]);
  });
});

describe("agreed prices", () => {
  it("carry their unit and package", () => {
    const found = findMentions(
      [msg("p1", "x", "2026-11-13T15:00:00Z", { kind: "detail_proposal", meta: { field: "price", value: "2400", label: "$2,400 per hour for DJ set", status: "agreed", proposed_by: "v", unit: "hour", package: { service_id: "svc-1", name: "DJ set" } } })],
      TODAY,
    );
    expect(found).toEqual([expect.objectContaining({ kind: "price", value: "2400/hour", serviceId: "svc-1", usable: true, agreed: true })]);
  });
});

describe("agreed before the inquiry", () => {
  const agreed = (id: string, field: string, value: string, at: string): ChatMessage =>
    msg(id, "x", at, { kind: "detail_proposal", meta: { field, value, label: value, status: "agreed", proposed_by: "c" } });
  const inquiry = (at: string, fields: object): ChatMessage => msg("i1", "Inquiry", at, { meta: { inquiry: { lead_id: "l", ...fields } } });

  it("still listed unless the inquiry changed it", () => {
    const found = findMentions(
      [
        agreed("p1", "guests", "150", "2026-11-10T15:00:00Z"),
        agreed("p2", "times", "16:00-22:00", "2026-11-10T16:00:00Z"),
        inquiry("2026-11-11T15:00:00Z", { guest_count: 200 }),
      ],
      TODAY,
    );
    expect(kinds(found)).toEqual(["times=16:00-22:00"]);
    expect(found[0]).toMatchObject({ agreed: true, usable: true });
  });
});

describe("add-ons and discounts", () => {
  const ADDONS = [{ id: "ao-drone", name: "Drone coverage" }, { id: "ao-dhol", name: "Dhol" }];

  it("names an add-on by its own name, any case, whole words", () => {
    const found = findMentions([msg("m1", "Could you add DRONE COVERAGE for the baraat?", "2026-11-12T15:00:00Z")], TODAY, ADDONS);
    expect(found).toEqual([expect.objectContaining({ kind: "addon", value: "ao-drone", label: "Drone coverage", usable: true })]);
    expect(findMentions([msg("m1", "dholak music", "2026-11-12T15:00:00Z")], TODAY, ADDONS)).toEqual([]);
  });

  it("a figure said as a discount is a discount, not just an amount", () => {
    const off = findMentions([msg("m1", "I can do $200 off if you book this week.", "2026-11-12T15:00:00Z")], TODAY);
    expect(kinds(off)).toEqual(["discount=200"]);
    expect(off[0]).toMatchObject({ label: "$200 off", usable: true });
    const of = findMentions([msg("m1", "We'll give a discount of $150.", "2026-11-12T15:00:00Z")], TODAY);
    expect(kinds(of)).toEqual(["discount=150"]);
    const plain = findMentions([msg("m1", "The total would be $1,800.", "2026-11-12T15:00:00Z")], TODAY);
    expect(plain).toEqual([expect.objectContaining({ kind: "amount", usable: false })]);
  });
});
