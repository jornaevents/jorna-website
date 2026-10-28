import { describe, expect, it } from "vitest";
import { display, effectiveAnswers, estimateTotal, followTotal, kindOf, paperIds, previewTerms, sendLabel, valueProblem, waitingOn } from "./fieldNegotiation";
import type { NegotiationFieldView, TermsVersion } from "./contractTypes";

const terms: TermsVersion = {
  date_iso: "2027-11-13",
  date_end: null,
  time_start: "19:00",
  time_end: "23:00",
  location: "Pines Manor",
  guest_count: 150,
  line_items: [
    { id: "pkg", kind: "package", service_id: "s1", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140_000, quantity: 1, total_cents: 140_000 },
    { id: "lights", kind: "custom", service_id: null, addon_id: null, name: "Uplighting", description: null, unit: "item", unit_price_cents: 10_000, quantity: 2, total_cents: 20_000 },
  ],
  discount_cents: null,
  amount_cents: 160_000,
  payment_schedule: null,
  terms_clauses: null,
  cancellation_window_hours: 720,
  overtime_rate_cents: 15_000,
};

const field = (key: string, over: Partial<NegotiationFieldView> = {}): NegotiationFieldView => ({
  key, group: "items", label: key, value: null, state: "agreed", proposed: null,
  proposed_by: null, round: null, note: null, locked: false, can_change: true, ...over,
});

describe("fieldNegotiation", () => {
  it("knows each field's input", () => {
    expect(kindOf("event.date")).toBe("date");
    expect(kindOf("line:pkg.price")).toBe("money");
    expect(kindOf("line:pkg.quantity")).toBe("count");
    expect(kindOf("clause:travel.included")).toBe("bool");
    expect(kindOf("policy.cancellation")).toBe("hours");
    expect(kindOf("line:new:ab12")).toBe("newline");
  });

  it("reads values in plain words", () => {
    expect(display("line:pkg.price", 140_000)).toBe("$1,400");
    expect(display("policy.cancellation", 720)).toBe("30 days");
    expect(display("event.time", { time_start: "19:00", time_end: "23:30" })).toBe("7:00 PM – 11:30 PM");
    expect(display("clause:x.included", false)).toBe("Left out");
    expect(display("event.guests", null)).toBe("Not set");
  });

  it("points each field at the words it highlights on the contract page", () => {
    expect(paperIds("line:lights.quantity")).toEqual(["line:lights.quantity"]);
    expect(paperIds("line:lights.included")).toEqual(["line:lights"]);
    expect(paperIds("clause:travel.included")).toEqual(["clause:travel"]);
    expect(paperIds("event.time")).toEqual(["event.start", "event.end"]);
    // A new item is drawn on the page by previewTerms, so it lights up too.
    expect(paperIds("line:new:x")).toEqual(["line:new:x"]);
  });

  it("estimates the total if this send's answers settle", () => {
    const fields = [
      field("line:lights.quantity", { value: 2, proposed: 3, state: "waiting_vendor" }),
      field("discount", { value: 0 }),
    ];
    expect(estimateTotal(terms, fields, [])).toBe(160_000);
    expect(estimateTotal(terms, fields, [{ key: "line:lights.quantity", action: "accept" }])).toBe(170_000);
    expect(estimateTotal(terms, fields, [{ key: "line:lights.quantity", action: "keep" }])).toBe(160_000);
    expect(
      estimateTotal(terms, fields, [
        { key: "discount", action: "change", value: 5_000 },
        { key: "line:lights.included", action: "change", value: false },
        { key: "line:new:a", action: "change", value: { quantity: 2, unit_price_cents: 2_500 } },
      ]),
    ).toBe(140_000 - 5_000 + 5_000);
  });

  it("lists what's waiting on each side", () => {
    const fields = [field("a", { state: "waiting_vendor" }), field("b", { state: "waiting_client" }), field("c")];
    expect(waitingOn(fields, "vendor").map((f) => f.key)).toEqual(["a"]);
  });
});

describe("what a send does (#153, #168)", () => {
  it("drops a field opened but left as it was", () => {
    const f = field("event.guests", { group: "event", value: 150 });
    expect(effectiveAnswers([f], [{ key: "event.guests", action: "change", value: 150 }])).toEqual([]);
    expect(effectiveAnswers([f], [{ key: "event.guests", action: "change", value: 120 }])).toHaveLength(1);
  });

  it("refuses the values the server does", () => {
    expect(valueProblem("event.guests", 0)).toMatch(/1 to 100,000/);
    expect(valueProblem("event.guests", 100_001)).toMatch(/1 to 100,000/);
    expect(valueProblem("event.guests", 150)).toBeNull();
    expect(valueProblem("line:pkg.price", 0)).toMatch(/above \$0/);
    expect(valueProblem("discount", 0)).toBeNull();
    expect(valueProblem("event.location", "Chicago, IL")).toMatch(/street, city, state and ZIP/);
    expect(valueProblem("event.location", "12 Maple Ave, Evanston, IL 60201")).toBeNull();
  });

  it("says what's being sent", () => {
    expect(sendLabel([{ key: "a", action: "change", value: 1 }, { key: "b", action: "change", value: 2 }])).toBe("Send 2 changes");
    expect(sendLabel([{ key: "a", action: "accept" }])).toBe("Send 1 answer");
    expect(sendLabel([{ key: "a", action: "keep" }, { key: "b", action: "change", value: 1 }])).toBe("Send 1 answer and 1 change");
  });

  it("puts the reader's answers into the contract it draws", () => {
    const fields = [
      field("event.guests", { group: "event", value: 150 }),
      field("line:pkg.price", { value: 140_000, state: "waiting_client", proposed: 120_000, proposed_by: "vendor" }),
      field("line:lights.included", { value: true }),
    ];
    const t = previewTerms(terms, fields, [
      { key: "event.guests", action: "change", value: 120 },
      { key: "line:pkg.price", action: "accept" },
      { key: "line:lights.included", action: "change", value: false },
      { key: "line:new:x1", action: "change", value: { name: "Second shooter", quantity: 1, unit_price_cents: 40_000, service_id: "s1", addon_id: "a1" } },
    ]);
    expect(t.guest_count).toBe(120);
    expect(t.line_items?.map((l) => [l.id, l.total_cents])).toEqual([["pkg", 120_000], ["new:x1", 40_000]]);
    expect(t.amount_cents).toBe(160_000);
    expect(paperIds("line:new:x1")).toEqual(["line:new:x1"]);
  });
});

describe("followTotal", () => {
  const pay = (id: string, cents: number) => ({
    id, label: id, amount_cents: cents, due_type: "on_signing" as const, due_date: null, due_days: null,
  });

  it("rescales in proportion with the remainder on the last payment", () => {
    const out = followTotal([pay("a", 40_000), pay("b", 40_000), pay("c", 40_000)], 50_000);
    expect(out?.map((i) => i.amount_cents)).toEqual([16_667, 16_667, 16_666]);
  });

  it("leaves a schedule that already adds up alone", () => {
    const schedule = [pay("a", 10_000)];
    expect(followTotal(schedule, 10_000)).toBe(schedule);
  });
});
