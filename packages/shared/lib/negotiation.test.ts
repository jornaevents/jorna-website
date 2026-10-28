import { describe, expect, it } from "vitest";
import { fromContract, proposalChanges, type ContractTermsSource, type Draft } from "./contractDraft";
import { termsOf } from "./contractDiff";
import {
  attribute,
  changedValues,
  clauseToggles,
  followTotal,
  lineToggles,
  proposalProblems,
  roundOf,
  rowAttribution,
  sameValue,
  setClauseIncluded,
  setLineIncluded,
  showValue,
  valuesOf,
} from "./negotiation";

const contract: ContractTermsSource = {
  date_iso: "2030-06-14",
  date_end: null,
  time_start: "18:00",
  time_end: "23:00",
  location: "Prospect Park Boathouse",
  guest_count: 150,
  amount_cents: 160_000,
  deposit_percent: null,
  cancellation_window_hours: 90 * 24,
  overtime_rate_cents: 35_000,
  contract_terms: null,
  guest_name: "Harper & Leo",
  guest_email: "harper@example.com",
  guest_phone: null,
  line_items: [
    { id: "pkg", kind: "package", service_id: "svc", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140_000, quantity: 1, total_cents: 140_000 },
    { id: "lights", kind: "custom", service_id: null, addon_id: null, name: "Uplighting", description: null, unit: "event", unit_price_cents: 10_000, quantity: 2, total_cents: 20_000 },
  ],
  payment_schedule: [
    { id: "dep", label: "Deposit", amount_cents: 50_000, due_type: "on_signing", due_date: null, due_days: null },
    { id: "bal", label: "Final balance", amount_cents: 110_000, due_type: "before_event", due_date: null, due_days: 14 },
  ],
  terms_clauses: [
    { key: "travel", title: "Travel", body: "30 miles included." },
    { key: "meal", title: "Vendor meal", body: "A hot meal for two." },
  ],
};

const base = () => fromContract(contract);
const ids = (d: Draft, a: Draft) => changedValues(d, a).map((v) => v.id);

describe("values", () => {
  it("reads a contract as negotiable values, lines and payments by their saved id", () => {
    const v = valuesOf(base()).map((x) => x.id);
    expect(v).toContain("event.date");
    expect(v).toContain("line:lights.quantity");
    expect(v).toContain("pay:bal.dueDays");
    expect(v).not.toContain("pay:dep.dueDays"); // due on signing has no days
    expect(v).toContain("policy.overtime");
    expect(v).toContain("clause:travel");
  });

  it("finds what the other side changed, matching across separately loaded versions", () => {
    const theirs = fromContract({
      ...contract,
      overtime_rate_cents: 30_000,
      terms_clauses: [{ key: "travel", title: "Travel", body: "50 miles included." }, contract.terms_clauses![1]],
    });
    expect(ids(base(), theirs)).toEqual(["policy.overtime", "clause:travel"]);
  });

  it("sets a value in a version without touching the rest", () => {
    const d = base();
    const qty = valuesOf(d).find((v) => v.id === "line:lights.quantity")!;
    const next = qty.set(d, "3");
    expect(qty.get(next)).toBe("3");
    expect(ids(d, next)).toEqual(["line:lights.quantity"]);
  });

  it("treats the same amount typed two ways as the same", () => {
    expect(sameValue("money", "1400", "1400.00")).toBe(true);
    expect(sameValue("days", "14", "14")).toBe(true);
    expect(sameValue("money", "", "0")).toBe(false);
  });

  it("shows values the way the contract reads", () => {
    expect(showValue("money", "350")).toBe("$350.00");
    expect(showValue("time", "18:30")).toBe("6:30 PM");
    expect(showValue("days", "1")).toBe("1 day");
    expect(showValue("text", "")).toBe("—");
  });
});

describe("items and clauses", () => {
  it("only offers a checkbox for a line that some version doesn't have", () => {
    const original = base();
    const theirs = { ...original, lines: original.lines.filter((l) => l.id !== "lights") };
    const toggles = lineToggles(original, theirs, theirs);
    expect(toggles.map((t) => [t.id, t.included, t.inProposed])).toEqual([["lights", false, false]]);
    const back = setLineIncluded(theirs, toggles[0].item, true);
    expect(back.lines.map((l) => l.id)).toEqual(["pkg", "lights"]);
  });

  it("lists every clause plus library ones the contract doesn't have, matched by title", () => {
    const d = base();
    const t = clauseToggles(d, d, d, [
      { title: "Travel", body: "Library travel" },
      { title: "Force majeure", body: "Neither side is liable…" },
    ]);
    expect(t.map((x) => [x.item.title, x.included])).toEqual([
      ["Travel", true],
      ["Vendor meal", true],
      ["Force majeure", false],
    ]);
    const added = setClauseIncluded(d, t[2].item, true);
    expect(added.clauses.map((c) => c.title)).toEqual(["Travel", "Vendor meal", "Force majeure"]);
    expect(added.layout.filter((b) => b.type === "terms")).toHaveLength(3);
    const removed = setClauseIncluded(d, t[1].item, false);
    expect(removed.clauses.map((c) => c.key)).toEqual(["travel"]);
    expect(removed.layout.some((b) => b.id === "meal")).toBe(false);
  });
});

describe("sending", () => {
  it("keeps the payments adding up when a line changes", () => {
    const d = base();
    const qty = valuesOf(d).find((v) => v.id === "line:lights.quantity")!;
    const next = followTotal(qty.set(d, "3"));
    expect(next.schedule.map((i) => i.amount)).toEqual(["500", "1200"]);
    expect(proposalProblems(next)).toEqual([]);
  });

  it("says when the payments don't add up", () => {
    const d = base();
    const qty = valuesOf(d).find((v) => v.id === "line:lights.quantity")!;
    expect(proposalProblems(qty.set(d, "3"))[0]).toMatch(/add up to \$1,600.00 but the total is \$1,700.00/);
  });

  it("wants a full address for a venue the client changed, not for one they left", () => {
    const d = { ...base(), location: "Chicago, IL" };
    expect(proposalProblems(d, { location: "Chicago, IL" })).toEqual([]);
    expect(proposalProblems(d, { location: "TBD" })[0]).toMatch(/street, city, state and ZIP/);
    expect(proposalProblems({ ...d, location: "12 Maple Ave, Evanston, IL 60201" }, { location: "TBD" })).toEqual([]);
  });

  it("sends only what changed", () => {
    const d = base();
    const overtime = valuesOf(d).find((v) => v.id === "policy.overtime")!;
    expect(proposalChanges(overtime.set(d, "300"), termsOf(contract as never))).toEqual({ overtime_rate_cents: 30_000 });
  });
});

describe("rounds", () => {
  const p = (status: string) => ({ status }) as never;
  it("counts every turn: the contract, each proposal, each answer", () => {
    expect(roundOf({ proposals: [] })).toBe(1);
    expect(roundOf({ proposals: [p("open")] })).toBe(2);
    expect(roundOf({ proposals: [p("revised")] })).toBe(3);
    expect(roundOf({ proposals: [p("open"), p("declined")] })).toBe(4);
    // Withdrawn or replaced: a turn the couple took, with no answer.
    expect(roundOf({ proposals: [p("withdrawn"), p("superseded")] })).toBe(3);
  });
});

describe("who asked for what", () => {
  const before = base();
  const v = (id: string) => valuesOf(before).find((x) => x.id === id)!;
  const set = (d: Draft, id: string, raw: string) => v(id).set(d, raw);
  // The couple asked for 3 lights, 50 miles and $120/hr.
  const ask = set(set(set(before, "line:lights.quantity", "3"), "clause:travel", "50 miles included."), "policy.overtime", "120");
  // The vendor took the lights, offered 40 miles, kept overtime, and moved the start time on their own.
  const answer = set(set(set(before, "line:lights.quantity", "3"), "clause:travel", "40 miles included."), "event.start", "17:00");

  it("credits an ask the other side took to the side that asked", () => {
    expect(attribute(v("line:lights.quantity"), before, answer, ask)).toBe("accepted");
    expect(attribute(v("clause:travel"), before, answer, ask)).toBe("countered");
    expect(attribute(v("policy.overtime"), before, answer, ask)).toBe("kept");
    expect(attribute(v("event.start"), before, answer, ask)).toBe("theirs");
    expect(attribute(v("event.venue"), before, answer, ask)).toBeNull();
  });

  it("without an ask, every difference is the other side's", () => {
    expect(attribute(v("line:lights.quantity"), before, answer, null)).toBe("theirs");
  });

  it("does the same for items and clauses added or removed", () => {
    expect(rowAttribution(false, true, true)).toBe("accepted");
    expect(rowAttribution(false, false, true)).toBe("kept");
    expect(rowAttribution(true, false, null)).toBe("theirs");
    expect(rowAttribution(true, true, true)).toBeNull();
  });
});
