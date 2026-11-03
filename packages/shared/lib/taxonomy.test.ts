import { describe, expect, it } from "vitest";
import { expand, matchScore, popularServices, searchServices, taxonomyLabel, type Taxonomy } from "./taxonomy";

const svc = (key: string, label: string, synonyms: string[] = [], popular: number | null = null) => ({
  key,
  label,
  synonyms,
  popular,
  bundle: false,
  attributes: [],
});

const tax: Taxonomy = {
  version: "t",
  attributes: {},
  groups: [
    {
      key: "beauty",
      label: "Beauty",
      bundle: false,
      services: [
        svc("bridal_makeup", "Makeup artist", ["makeup", "MUA", "bridal makeup"], 10),
        svc("mehndi_artist", "Mehndi artist", ["mehndi", "mehendi", "henna"], 6),
      ],
    },
    {
      key: "entertainment",
      label: "Entertainment",
      bundle: true,
      services: [svc("dj", "DJ", ["disc jockey"], 5), svc("mc", "MC / emcee", ["host", "anchor"], 12)],
    },
    {
      key: "ceremony",
      label: "Ceremony",
      bundle: false,
      services: [svc("hindu_pandit", "Hindu pandit / priest", ["pandit", "priest", "purohit"])],
    },
  ],
};

describe("searchServices", () => {
  it("finds a service by its label first, then by what people call it", () => {
    expect(searchServices(tax, "dj").map((m) => m.service.key)).toEqual(["dj"]);
    expect(searchServices(tax, "mehendi").map((m) => m.service.key)).toEqual(["mehndi_artist"]);
    expect(searchServices(tax, "pandit")[0].service.key).toBe("hindu_pandit");
    expect(searchServices(tax, "Henna")[0].group.key).toBe("beauty");
    expect(searchServices(tax, "zzz")).toEqual([]);
    expect(searchServices(tax, "  ")).toEqual([]);
  });

  it("ranks a label match over a synonym, and popular ones first on a tie", () => {
    // "m": Makeup artist, Mehndi artist and MC all start with it; popular order breaks the tie.
    expect(searchServices(tax, "m").map((m) => m.service.key)).toEqual(["mehndi_artist", "bridal_makeup", "mc"]);
    expect(matchScore(tax.groups[0].services[0], "makeup artist")).toBeGreaterThan(
      matchScore(tax.groups[0].services[0], "mua"),
    );
  });
});

describe("taxonomy helpers", () => {
  it("lists popular services in their order", () => {
    expect(popularServices(tax).map((s) => s.key)).toEqual(["dj", "mehndi_artist", "bridal_makeup", "mc"]);
  });

  it("expands groups and names keys", () => {
    expect(expand(tax, ["entertainment", "mehndi_artist"])).toEqual(["mehndi_artist", "dj", "mc"]);
    expect(taxonomyLabel(tax, "mc")).toBe("MC / emcee");
    expect(taxonomyLabel(tax, "beauty")).toBe("Beauty");
    expect(taxonomyLabel(tax, "unknown_key")).toBe("unknown_key");
    expect(taxonomyLabel(null, "dj")).toBe("dj");
  });
});
