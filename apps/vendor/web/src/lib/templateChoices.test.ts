import { describe, expect, it } from "vitest";
import { templateChoices } from "./templateChoices";
import type { SavedContractTemplate, ServiceItem } from "./types";

const service = (over: Partial<ServiceItem>): ServiceItem =>
  ({ service_id: "s1", name: "Full day", price: 2500, price_unit: "event", status: "active", ...over }) as ServiceItem;

const saved = (over: Partial<SavedContractTemplate>): SavedContractTemplate => ({
  template_id: "t1", name: "Sangeet", kind: "agreement", body: { version: 1 },
  created_at: "2030-01-01", updated_at: "2030-01-01", ...over,
});

describe("templateChoices", () => {
  it("offers every package's template, in the vendor's order, built from the package", () => {
    const c = templateChoices(
      [service({ service_id: "s2", name: "Half day", sort_order: 2 }), service({ sort_order: 1 })],
      [],
    );
    expect(c.packages.map((p) => [p.id, p.name, p.edited])).toEqual([
      ["package:s1", "Full day", false],
      ["package:s2", "Half day", false],
    ]);
    expect(c.packages[0].body.lines?.[0]).toMatchObject({ serviceId: "s1", price: "2500" });
    expect(c.saved).toEqual([]);
  });

  it("puts the vendor's edit of a package's template in its place", () => {
    const edit = saved({ template_id: "t9", name: "Full day (weddings)", service_id: "s1", body: { version: 1, title: "Wedding day" } });
    const [p] = templateChoices([service({})], [edit]).packages;
    expect(p).toMatchObject({ id: "package:s1", name: "Full day (weddings)", templateId: "t9", edited: true });
    expect(p.body.title).toBe("Wedding day");
  });

  it("keeps the vendor's own templates apart, and leaves out addenda", () => {
    const c = templateChoices([service({})], [saved({}), saved({ template_id: "t2", kind: "addendum" })]);
    expect(c.saved.map((t) => t.id)).toEqual(["t1"]);
  });

  it("offers nothing of a retired package — not even its edit", () => {
    const c = templateChoices(
      [service({ status: "archived" }), service({ service_id: "s3", name: "Private", status: "hidden" })],
      [saved({ service_id: "s1" })],
    );
    expect(c.packages.map((p) => p.id)).toEqual(["package:s3"]);
    expect(c.saved).toEqual([]);
  });
});
