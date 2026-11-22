import { describe, expect, it } from "vitest";
import { emptyDraft, type Draft, type LineDraft } from "@jorna/shared/lib/contractDraft";
import { EXTRA_HOURS, mentionPatch } from "./mentionUse";
import type { Mention } from "./chatMentions";
import type { ServiceItem } from "./types";

const mention = (kind: Mention["kind"], value: string, usable = true): Mention => ({
  id: "x", kind, value, label: value, quote: "", messageId: "m", sender: "Meera", at: "2026-11-12T00:00:00Z", usable,
});

const pkgLine = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: "pkg", kind: "package", serviceId: "svc-1", addonId: null, name: "DJ set", unit: "event", price: "1400", quantity: "1", ...over,
});

const SERVICES = [
  { service_id: "svc-1", vendor_id: "v", name: "DJ set", price: 1400, price_unit: "event", included_hours: 4, status: "active",
    add_ons: [{ id: "ao-drone", name: "Drone coverage", price: 400, price_unit: "event" }] },
] as unknown as ServiceItem[];

const draftWith = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), lines: [pkgLine()], overtimeRate: "250", ...over });

describe("mentionPatch", () => {
  it("fills the event fields, and has nothing to do when they already say so", () => {
    expect(mentionPatch(mention("date", "2027-03-14"), draftWith(), SERVICES)).toEqual({ dateIso: "2027-03-14" });
    expect(mentionPatch(mention("times", "16:00-22:00"), draftWith(), SERVICES)).toEqual({ timeStart: "16:00", timeEnd: "22:00" });
    expect(mentionPatch(mention("guests", "180"), draftWith({ guestCount: "180" }), SERVICES)).toBeNull();
  });

  it("hours set an hourly package's quantity", () => {
    const patch = mentionPatch(mention("hours", "6"), draftWith({ lines: [pkgLine({ unit: "hour" })] }), SERVICES);
    expect(patch?.lines?.[0].quantity).toBe("6");
  });

  it("hours past the package's included ones go on an Extra hours line at the overtime rate", () => {
    const patch = mentionPatch(mention("hours", "6"), draftWith(), SERVICES);
    const extra = patch?.lines?.find((l) => l.name === EXTRA_HOURS);
    expect(extra).toMatchObject({ kind: "custom", unit: "hour", price: "250", quantity: "2", description: "Past the 4 hours included" });
    // Said again with a new number: the same line, updated.
    const again = mentionPatch(mention("hours", "7"), draftWith({ lines: patch!.lines! }), SERVICES);
    expect(again?.lines?.filter((l) => l.name === EXTRA_HOURS).map((l) => l.quantity)).toEqual(["3"]);
  });

  it("hours within what's included, or with no package, change nothing", () => {
    expect(mentionPatch(mention("hours", "3"), draftWith(), SERVICES)).toBeNull();
    expect(mentionPatch(mention("hours", "6"), draftWith({ lines: [] }), SERVICES)).toBeNull();
  });

  it("an add-on is added once, from its package", () => {
    const patch = mentionPatch(mention("addon", "ao-drone"), draftWith(), SERVICES);
    expect(patch?.lines?.[1]).toMatchObject({ kind: "addon", addonId: "ao-drone", name: "Drone coverage", price: "400" });
    expect(mentionPatch(mention("addon", "ao-drone"), draftWith({ lines: patch!.lines! }), SERVICES)).toBeNull();
    expect(mentionPatch(mention("addon", "ao-gone"), draftWith(), SERVICES)).toBeNull();
  });

  it("a discount sets the discount; a plain amount never changes anything", () => {
    expect(mentionPatch(mention("discount", "200"), draftWith(), SERVICES)).toEqual({ discount: "200" });
    expect(mentionPatch(mention("amount", "1800", false), draftWith(), SERVICES)).toBeNull();
  });

  it("an agreed price sets its package line's price and unit", () => {
    const priced = (value: string, serviceId?: string): Mention => ({ ...mention("price", value), ...(serviceId ? { serviceId } : {}) });
    expect(mentionPatch(priced("1600/hour", "svc-1"), draftWith(), SERVICES)).toEqual({ lines: [pkgLine({ price: "1600", unit: "hour" })] });
    // No package named: the contract's package.
    expect(mentionPatch(priced("1600/event"), draftWith(), SERVICES)).toEqual({ lines: [pkgLine({ price: "1600" })] });
    // Already says so, a package not on the contract, or no package line: nothing to do.
    expect(mentionPatch(priced("1400/event"), draftWith(), SERVICES)).toBeNull();
    expect(mentionPatch(priced("1600/event", "svc-other"), draftWith(), SERVICES)).toBeNull();
    expect(mentionPatch(priced("1600/event"), draftWith({ lines: [] }), SERVICES)).toBeNull();
  });
});
