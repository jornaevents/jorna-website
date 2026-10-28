import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  balanceLastPayment,
  BLANK,
  cancellationClause,
  CANCELLATION_KEY,
  cancellationSentence,
  customLine,
  dueDateOf,
  money,
  packageLine,
  packageTemplate,
  warningsByStep,
  withCancellationSection,
  emptyDraft,
  fromContract,
  fromRequest,
  describeWhen,
  insertClause,
  keepRequestedLine,
  layoutOf,
  moveBlock,
  presetSchedule,
  problems,
  scheduledCents,
  toCents,
  toDocument,
  toTemplate,
  totalCents,
  fitSchedule,
  canMove,
  templatePriceChanges,
  reconcileLayout,
  type ContractTermsSource,
  type Draft,
  type LineDraft,
  type RequestSource,
} from "./contractDraft";
import type { DueType } from "./contractTypes";

const pkg = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: "p",
  kind: "package",
  serviceId: "svc-1",
  addonId: null,
  name: "Reception set",
  unit: "event",
  price: "1400",
  quantity: "1",
  ...over,
});

const ready = (over: Partial<Draft> = {}): Draft => {
  const d: Draft = {
    ...emptyDraft(),
    dateIso: "2030-06-01",
    timeStart: "18:00",
    timeEnd: "22:00",
    lines: [pkg(), { ...customLine(), name: "Uplighting", price: "50", quantity: "2" }],
    discount: "100",
    ...over,
  };
  return { ...d, schedule: over.schedule ?? presetSchedule("deposit_balance", totalCents(d)) };
};

describe("totals", () => {
  it("multiplies each line and takes the discount off", () => {
    expect(totalCents(ready())).toBe(140_000 + 10_000 - 10_000);
  });

  it("doesn't let a float dollar amount drift a cent", () => {
    expect(toCents("19.99")).toBe(1999);
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
  });
});

describe("schedule presets", () => {
  it("always add up exactly, remainder on the last payment", () => {
    for (const total of [100_001, 99_999, 140_000, 1]) {
      for (const preset of ["full", "deposit_balance", "three"] as const) {
        const rows = presetSchedule(preset, total, 33);
        expect(rows.reduce((s, r) => s + toCents(r.amount), 0)).toBe(total);
      }
    }
  });

  it("put the balance where the vendor usually does, same as the backend's usual terms", () => {
    expect(presetSchedule("deposit_balance", 100_000, 30, 21).map((r) => [r.label, r.dueDays])).toEqual([
      ["Deposit", ""],
      ["Final balance", "21"],
    ]);
    // The second of three always comes well before the balance.
    expect(presetSchedule("three", 90_000, 50, 45).map((r) => r.dueDays)).toEqual(["", "75", "45"]);
    expect(presetSchedule("three", 90_000).map((r) => r.dueDays)).toEqual(["", "60", "14"]);
  });

  it("can move a gap onto the last payment", () => {
    const d = ready();
    d.schedule[0].amount = "100";
    const fixed = { ...d, schedule: balanceLastPayment(d) };
    expect(scheduledCents(fixed)).toBe(totalCents(fixed));
  });
});

describe("problems", () => {
  it("is empty for a draft that's ready to send", () => {
    expect(problems(ready(), "2030-01-01")).toEqual([]);
  });

  it("names a schedule that doesn't add up, with both numbers", () => {
    const d = ready();
    d.schedule[0].amount = "1";
    expect(problems(d, "2030-01-01").join(" ")).toMatch(/add up to .* but the total is \$1,400\.00/);
  });

  it("needs one of the vendor's packages, not just custom lines", () => {
    const d = ready({ lines: [{ ...customLine(), name: "Travel", price: "50", quantity: "1" }], discount: "" });
    expect(problems(d, "2030-01-01")).toContain("Add at least one of your packages.");
  });

  it("takes a blank venue or a full address, never a partial one", () => {
    expect(problems(ready({ location: "" }), "2030-01-01")).toEqual([]);
    expect(problems(ready({ location: "12 Maple Ave, Evanston, IL 60201" }), "2030-01-01")).toEqual([]);
    expect(problems(ready({ location: "Chicago, IL" }), "2030-01-01").join(" ")).toMatch(/street, city, state and ZIP/);
    // One already on the contract isn't the vendor's new mistake.
    expect(problems(ready({ location: "Pines Manor" }), "2030-01-01", "Pines Manor")).toEqual([]);
  });
});

describe("toDocument", () => {
  it("sends cents, and only the due fields each rule uses", () => {
    const doc = toDocument(ready());
    expect(doc.line_items[1]).toMatchObject({ kind: "custom", unit_price_cents: 5000, quantity: 2 });
    expect(doc.discount_cents).toBe(10_000);
    expect(doc.payment_schedule[0]).toMatchObject({ due_type: "on_signing", due_date: null, due_days: null });
    expect(doc.payment_schedule[1]).toMatchObject({ due_type: "before_event", due_days: 14 });
  });
});

describe("templates", () => {
  it("keep the schedule as shares, so they fit a different total", () => {
    const body = toTemplate(ready());
    const services = [{ service_id: "svc-1" }];
    const bigger = applyTemplate(
      { ...emptyDraft(), lines: [] },
      { ...body, lines: [pkg({ price: "2800" })], discount: "" },
      services,
    );
    expect(totalCents(bigger)).toBe(280_000);
    expect(scheduledCents(bigger)).toBe(280_000);
    expect(bigger.schedule.map((s) => s.label)).toEqual(["Deposit", "Final balance"]);
  });

  it("drop lines for packages the vendor no longer has", () => {
    const body = toTemplate(ready());
    const applied = applyTemplate(emptyDraft(), body, []);
    expect(applied.lines.map((l) => l.kind)).toEqual(["custom"]);
  });
});

describe("fromContract", () => {
  it("turns an older single-deposit contract into a two-payment schedule", () => {
    const c = {
      booking_id: "c",
      date_iso: "2030-06-01",
      date_end: null,
      time_start: "18:00",
      time_end: "22:00",
      location: "TBD",
      guest_count: null,
      amount_cents: 100_000,
      deposit_percent: 25,
      line_items: [
        {
          id: "l", kind: "package", service_id: "svc-1", addon_id: null, name: "Set",
          description: null, unit: "event", unit_price_cents: 100_000, quantity: 1, total_cents: 100_000,
        },
      ],
      payment_schedule: null,
      contract_terms: { travel: "30 miles included" },
    } as unknown as ContractTermsSource;
    const d = fromContract(c);
    expect(d.location).toBe("");
    expect(d.schedule.map((s) => toCents(s.amount))).toEqual([25_000, 75_000]);
    expect(d.clauses[0]).toMatchObject({ title: "Travel", body: "30 miles included" });
  });
});

describe("fromRequest", () => {
  const request = (over: Partial<RequestSource> = {}) =>
    ({
      booking_id: "b",
      user_id: "u",
      client_name: "Priya Mehta",
      service_id: "svc-1",
      service_name: "Reception set",
      price: 1400,
      price_unit: "event",
      price_pending_quantity: false,
      date_iso: "2030-06-01",
      time_start: "18:00",
      time_end: "22:00",
      location: "Pines Manor",
      status: "pending",
      ...over,
    }) as RequestSource;

  it("starts from the request's total when it's known", () => {
    const d = fromRequest(request());
    expect(d.lines[0]).toMatchObject({ kind: "package", serviceId: "svc-1", price: "1400", quantity: "1" });
    expect(totalCents(d)).toBe(140_000);
    expect(d.clientName).toBe("Priya Mehta");
  });

  it("starts a per-guest request at the rate, counted by its guests if it has them", () => {
    const d = fromRequest(request({ price: 45, price_unit: "person", price_pending_quantity: true, guest_count: 200 }));
    expect(d.lines[0]).toMatchObject({ unit: "person", price: "45", quantity: "200" });
    const unknown = fromRequest(request({ price: 45, price_unit: "person", price_pending_quantity: true }));
    expect(unknown.lines[0].quantity).toBe("");
  });
});

describe("describeWhen", () => {
  it("reads like a date and a time, not the stored formats", () => {
    const when = describeWhen("2030-10-12", null, "19:00", "23:00");
    expect(when).toMatch(/Oct/);
    expect(when).toMatch(/2030/);
    expect(when).toContain("7:00 PM – 11:00 PM");
    expect(when).not.toContain("19:00");
  });

  it("shows a range for several days, and leaves out what isn't set", () => {
    expect(describeWhen("2030-10-12", "2030-10-13", null, null)).toMatch(/– .*13/);
    expect(describeWhen("", null, "", "")).toBe("No date yet");
    expect(describeWhen("2030-10-12", null, "00:30", "12:15")).toContain("12:30 AM – 12:15 PM");
  });
});


describe("layout", () => {
  const types = (d: Draft) => layoutOf(d).map((b) => (b.type === "terms" ? `terms:${b.id}` : b.type));

  it("places clauses the layout doesn't know yet before the signature", () => {
    const d = { ...emptyDraft(), clauses: [{ key: "travel", title: "Travel", body: "30 miles." }] };
    expect(types(d)).toEqual(["parties", "event", "items", "schedule", "terms:travel", "signature"]);
  });

  it("drops a removed clause's block, and moves blocks within bounds", () => {
    let d: Draft = { ...emptyDraft(), clauses: [{ key: "a", title: "A", body: "a" }] };
    d = { ...d, layout: moveBlock(d, "a", -1) };
    expect(types(d).slice(3, 5)).toEqual(["terms:a", "schedule"]);
    expect(moveBlock(d, "parties", -1)[0].type).toBe("parties");
    expect(types({ ...d, clauses: [] })).not.toContain("terms:a");
  });

  it("inserts a section where it's asked for", () => {
    const d = emptyDraft();
    const next = { ...d, ...insertClause(d, { title: "Scope", body: "DJ." }, 1) };
    expect(layoutOf(next)[1].type).toBe("terms");
    expect(next.clauses[0].title).toBe("Scope");
  });

  it("sends terms in the document's order, inside the layout", () => {
    let d: Draft = ready({
      title: " Wedding DJ agreement ",
      clauses: [
        { key: "x", title: "Travel", body: "30 miles." },
        { key: "y", title: "Meals", body: "Dinner." },
      ],
    });
    d = { ...d, layout: moveBlock(d, "y", -1) };
    const doc = toDocument(d);
    expect(doc.document_title).toBe("Wedding DJ agreement");
    expect(doc.terms_clauses.map((c) => c.key)).toEqual(["y", "x"]);
    expect(doc.document_layout.find((b) => b.id === "y")).toMatchObject({ type: "terms", title: "Meals", body: "Dinner." });
  });

  it("a template keeps the block order and lays it over new clause keys", () => {
    let d: Draft = ready({ clauses: [{ key: "x", title: "Scope", body: "DJ." }] });
    d = { ...d, layout: moveBlock(d, "x", -1) };
    d = { ...d, layout: moveBlock(d, "x", -1) };
    const body = toTemplate(d);
    expect(body.layout).toEqual(["parties", "event", "terms", "items", "schedule", "signature"]);
    const applied = applyTemplate(emptyDraft(), body, [{ service_id: "svc-1" }]);
    expect(types(applied)[2]).toMatch(/^terms:/);
    expect(applied.clauses[0].title).toBe("Scope");
  });
});

describe("editor checks (web #166)", () => {
  const today = "2030-01-01";

  it("refuses a payment counted back past today, and warns about one after the event", () => {
    const d = ready({ dateIso: "2030-06-01" });
    d.schedule[1].dueDays = "400";
    expect(problems(d, today).join(" ")).toMatch(/“Final balance” would be due .*which has passed/);
    d.schedule[1] = { ...d.schedule[1], dueType: "date", dueDate: "2030-07-15" };
    expect(problems(d, today)).toEqual([]);
    expect(warningsByStep(d).map((w) => w.message).join(" ")).toMatch(/after the event/);
  });

  it("names the discount when it's the reason there's no total, without a misleading schedule problem", () => {
    const d = ready({ discount: "2000" });
    d.schedule = [];
    const found = problems(d, today);
    expect(found.join(" ")).toMatch(/discount \(\$2,000\.00\) is as much as the items/);
    expect(found).not.toContain("Add at least one payment to the schedule.");
    expect(money(-50_000)).toBe("−$500.00");
  });

  it("keeps an empty custom row out of the contract instead of flagging it", () => {
    const d = ready();
    d.lines.push(customLine());
    expect(problems(d, today)).toEqual([]);
    expect(toDocument(d).line_items).toHaveLength(2);
  });

  it("checks the hold and the blanks a suggested section leaves", () => {
    expect(problems(ready({ holdDays: "-2" }), today)).toContain("Hold the date for between 1 and 60 days.");
    expect(problems(ready({ holdDays: "14" }), today)).toEqual([]);
    const d = ready({ clauses: [{ key: "t", title: "Travel", body: `Billed at $${BLANK} per mile.` }] });
    expect(problems(d, today)).toContain(`Fill in the blank (${BLANK}) in “Travel”.`);
  });

  it("gives a window a Cancellation section, which goes out only when it has words of its own", () => {
    const d = withCancellationSection(ready({ cancellationDays: "30" }));
    expect(cancellationClause(d)?.key).toBe(CANCELLATION_KEY);
    expect(layoutOf(d).some((b) => b.id === CANCELLATION_KEY)).toBe(true);
    expect(problems(d, today)).toEqual([]);
    const sent = toDocument(d);
    expect(sent.cancellation_window_hours).toBe(720);
    expect(sent.terms_clauses.map((c) => c.key)).not.toContain(CANCELLATION_KEY);

    const worded = { ...d, clauses: d.clauses.map((c) => ({ ...c, body: "The deposit is non-refundable." })) };
    expect(toDocument(worded).terms_clauses.map((c) => c.key)).toContain(CANCELLATION_KEY);
    // An older contract's section titled that way is the one, not a second.
    const older = withCancellationSection(ready({ cancellationDays: "30", clauses: [{ key: "x1", title: "Cancellation policy", body: "Non-refundable." }] }));
    expect(older.clauses).toHaveLength(1);
    expect(cancellationSentence(30)).toBe("Cancelling within 30 days of the event may forfeit what's been paid.");
  });

  it("works out when a payment falls", () => {
    expect(dueDateOf({ dueType: "before_event", dueDate: "", dueDays: "14" }, "2030-03-10")).toBe("2030-02-24");
    expect(dueDateOf({ dueType: "on_signing", dueDate: "", dueDays: "" }, "2030-03-10")).toBeNull();
  });

  it("puts a package's included hours in its line", () => {
    expect(packageLine({ service_id: "s", name: "Coverage", price: 2500, included_hours: 5 }).description).toBe("5 hours included");
  });
});

describe("package templates (backend DECISIONS #31)", () => {
  const service = {
    service_id: "svc-1",
    name: "Full day",
    price: 2500,
    price_unit: "event",
    included_hours: 8,
    inclusions: ["Second shooter", " ", "Online gallery"],
  };

  it("sell the package, with its hours and what's included", () => {
    const body = packageTemplate(service);
    expect(body.title).toBe("Full day agreement");
    expect(body.lines).toEqual([
      expect.objectContaining({
        kind: "package", serviceId: "svc-1", name: "Full day", price: "2500", quantity: "1",
        description: "8 hours included. Includes Second shooter, Online gallery",
      }),
    ]);
    // Nothing of the vendor's defaults is copied in: the editor starts from them.
    expect(body.schedule).toBeUndefined();
    expect(body.clauses).toBeUndefined();
  });

  it("carry the package's own terms, where it sets them", () => {
    expect(packageTemplate(service).cancellationDays).toBeUndefined();
    const own = packageTemplate({ ...service, cancellation_window_hours: 720, overtime_rate_cents: 15000 });
    expect(own).toMatchObject({ cancellationDays: "30", overtimeRate: "150" });
  });

  it("follow the package — a new price is the template's price", () => {
    const applied = applyTemplate(emptyDraft(), packageTemplate({ ...service, price: 2800 }), [service]);
    expect(totalCents(applied)).toBe(280_000);
  });

  it("read plainly with nothing to describe", () => {
    const bare = packageTemplate({ service_id: "svc-2", name: "Mehndi", price: 400 });
    expect(bare.lines?.[0].description).toBeNull();
  });
});

describe("keepRequestedLine", () => {
  const asked = { ...emptyDraft(), lines: [pkg({ price: "45", unit: "person", quantity: "200" })] };

  it("answers a request with the client's own line for the package they asked for", () => {
    const applied = { ...emptyDraft(), lines: [pkg({ description: "8 hours included" }), { ...customLine(), name: "Travel" }] };
    const kept = keepRequestedLine(applied, asked, "svc-1");
    expect(kept.lines[0]).toMatchObject({ price: "45", quantity: "200", description: "8 hours included" });
    expect(kept.lines[1].name).toBe("Travel");
  });

  it("leaves a template for another package as the vendor chose it", () => {
    const other = { ...emptyDraft(), lines: [pkg({ serviceId: "svc-9", price: "900" })] };
    expect(keepRequestedLine(other, asked, "svc-1")).toBe(other);
  });
});


describe("fitSchedule", () => {
  const row = (dueType: DueType, dueDays: string) => ({ key: dueDays, label: "P", amount: "1", dueType, dueDate: "", dueDays });

  it("moves a payment that would already be past due to the day before", () => {
    const out = fitSchedule([row("on_signing", ""), row("before_event", "60"), row("before_event", "14")], "2026-12-12", "2026-10-26");
    expect(out.map((i) => [i.dueType, i.dueDays])).toEqual([["on_signing", ""], ["before_event", "46"], ["before_event", "14"]]);
  });

  it("makes one that can't fit due on signing, and leaves a fitting schedule alone", () => {
    expect(fitSchedule([row("before_event", "14")], "2026-10-27", "2026-10-26")[0].dueType).toBe("on_signing");
    const fine = [row("before_event", "14")];
    expect(fitSchedule(fine, "2026-12-12", "2026-10-26")).toBe(fine);
  });
});

describe("the document's order", () => {
  const clauses = [{ key: "travel" }, { key: "meals" }];

  it("puts a saved layout's structured blocks back in their order, signatures last", () => {
    const saved = [
      { id: "signature", type: "signature" as const },
      { id: "parties", type: "parties" as const },
      { id: "travel", type: "terms" as const },
      { id: "event", type: "event" as const },
      { id: "items", type: "items" as const },
      { id: "schedule", type: "schedule" as const },
      { id: "meals", type: "terms" as const },
    ];
    expect(reconcileLayout(saved, clauses).map((b) => b.id)).toEqual([
      "parties", "travel", "event", "items", "schedule", "meals", "signature",
    ]);
  });

  it("moves only terms sections, and never below the signatures", () => {
    const draft = { ...emptyDraft(), clauses: clauses.map((c) => ({ ...c, title: c.key, body: "x" })) };
    expect(canMove(draft, "signature", -1)).toBe(false);
    expect(canMove(draft, "items", 1)).toBe(false);
    expect(canMove(draft, "meals", 1)).toBe(false);
    expect(moveBlock(draft, "meals", -1).map((b) => b.id).slice(-3)).toEqual(["meals", "travel", "signature"]);
  });
});

describe("templates and the package's price", () => {
  const svc = (price: number) => [{ service_id: "svc-1", price }];
  const draftWith = (price: string) => ({
    ...emptyDraft(),
    lines: [pkg({ price })],
    cancellationDays: "",
    overtimeRate: "",
  });

  it("a saved template follows the package's price until the vendor typed another", () => {
    const body = toTemplate(draftWith("1000"), svc(1000));
    expect(body.lines?.[0].packagePrice).toBe("1000");
    expect(applyTemplate(emptyDraft(), body, svc(1200)).lines[0].price).toBe("1200");
    expect(templatePriceChanges(body, svc(1200))).toEqual([]);

    const typed = toTemplate(draftWith("900"), svc(1000));
    expect(applyTemplate(emptyDraft(), typed, svc(1200)).lines[0].price).toBe("900");
    expect(templatePriceChanges(typed, svc(1200))).toEqual([{ name: typed.lines![0].name, was: "900", now: "1200" }]);
  });

  it("an older template without the package's price says the price changed", () => {
    const old = { version: 1 as const, lines: [{ ...toTemplate(draftWith("1000")).lines![0] }] };
    expect(templatePriceChanges(old, svc(1200))).toHaveLength(1);
  });

  it("blank values don't override the vendor's defaults", () => {
    const body = toTemplate(draftWith("1000"), svc(1000));
    expect(body.overtimeRate).toBeUndefined();
    const start = { ...emptyDraft(), overtimeRate: "175", cancellationDays: "45" };
    const applied = applyTemplate(start, { ...body, overtimeRate: "", cancellationDays: "" }, svc(1000));
    expect([applied.overtimeRate, applied.cancellationDays]).toEqual(["175", "45"]);
  });
});
