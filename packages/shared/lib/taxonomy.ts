"use client";

// The service taxonomy (backend DECISIONS #35): groups → services →
// attributes, from GET /taxonomy. Every picker selects a service; a group is
// for browsing, and stands for "any of these" where that makes sense
// (search, a client who isn't sure yet). Both apps read it from here, so a
// service is named and found the same way everywhere.
//
// Loaded once per page load and kept in memory; the last copy is also kept
// in localStorage so a repeat visit draws the picker before the request
// returns. It's reference data, not the user's: nothing breaks if storage is
// unavailable.

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type AttributeType = "single" | "multi" | "number" | "bool";

export interface TaxonomyAttribute {
  key: string;
  label: string;
  type: AttributeType;
  options?: { key: string; label: string }[];
  unit?: string;
}

export interface TaxonomyService {
  key: string;
  label: string;
  synonyms: string[];
  /** Order of the chips shown before typing; null = not shown there. */
  popular: number | null;
  bundle: boolean;
  attributes: string[];
}

export interface TaxonomyGroup {
  key: string;
  label: string;
  bundle: boolean;
  services: TaxonomyService[];
}

export interface Taxonomy {
  version: string;
  groups: TaxonomyGroup[];
  attributes: Record<string, TaxonomyAttribute>;
}

const STORAGE_KEY = "jorna_taxonomy";

let cached: Taxonomy | null = null;
let inflight: Promise<Taxonomy> | null = null;

function stored(): Taxonomy | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Taxonomy) : null;
  } catch {
    return null;
  }
}

export function loadTaxonomy(): Promise<Taxonomy> {
  if (cached) return Promise.resolve(cached);
  inflight ??= apiFetch<Taxonomy>("/taxonomy", { auth: false })
    .then((t) => {
      cached = t;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
      } catch {
        /* storage full or blocked — the in-memory copy is enough */
      }
      return t;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The taxonomy, or null until it's loaded. A copy from a previous visit is
 *  used straight away while the current one loads. */
export function useTaxonomy(): Taxonomy | null {
  // Not read from storage while rendering: the pages are pre-rendered, and
  // the first render has to match that HTML.
  const [tax, setTax] = useState<Taxonomy | null>(cached);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => {
        const previous = cached ? null : stored();
        if (live && previous) setTax((t) => t ?? previous);
      })
      .catch(() => {});
    loadTaxonomy()
      .then((t) => live && setTax(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return tax;
}

// ── Reading it ───────────────────────────────────────────────────────

export function allServices(tax: Taxonomy): TaxonomyService[] {
  return tax.groups.flatMap((g) => g.services);
}

export function findService(tax: Taxonomy, key: string): TaxonomyService | null {
  return allServices(tax).find((s) => s.key === key) ?? null;
}

export function groupOf(tax: Taxonomy, serviceKey: string): TaxonomyGroup | null {
  return tax.groups.find((g) => g.services.some((s) => s.key === serviceKey)) ?? null;
}

/** A service's or a group's name; the key itself if it's unknown (an older
 *  copy of the taxonomy). */
export function taxonomyLabel(tax: Taxonomy | null, key: string): string {
  if (!tax) return key;
  return findService(tax, key)?.label ?? tax.groups.find((g) => g.key === key)?.label ?? key;
}

/** Service keys for any mix of service and group keys, in taxonomy order. */
export function expand(tax: Taxonomy, keys: string[]): string[] {
  const wanted = new Set<string>();
  for (const key of keys) {
    const group = tax.groups.find((g) => g.key === key);
    if (group) group.services.forEach((s) => wanted.add(s.key));
    else wanted.add(key);
  }
  return allServices(tax)
    .map((s) => s.key)
    .filter((k) => wanted.has(k));
}

export function popularServices(tax: Taxonomy, limit = 8): TaxonomyService[] {
  return allServices(tax)
    .filter((s) => s.popular != null)
    .sort((a, b) => (a.popular ?? 0) - (b.popular ?? 0))
    .slice(0, limit);
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How well a service matches what was typed: 0 for no match, higher for a
 *  better one. A label that starts with it beats a word inside it, which
 *  beats a synonym ("mehendi" finds Mehndi artist; "pandit" the priest). */
export function matchScore(service: TaxonomyService, query: string): number {
  const q = normalise(query);
  if (!q) return 0;
  const label = normalise(service.label);
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(" ").some((w) => w.startsWith(q))) return 60;
  const synonyms = service.synonyms.map(normalise);
  if (synonyms.some((s) => s === q)) return 50;
  if (synonyms.some((s) => s.startsWith(q) || s.split(" ").some((w) => w.startsWith(q)))) return 40;
  if (label.includes(q) || synonyms.some((s) => s.includes(q))) return 20;
  return 0;
}

export interface ServiceMatch {
  service: TaxonomyService;
  group: TaxonomyGroup;
}

/** Services matching a query, best first; popular ones break ties. */
export function searchServices(tax: Taxonomy, query: string, limit = 8): ServiceMatch[] {
  return tax.groups
    .flatMap((group) => group.services.map((service) => ({ service, group, score: matchScore(service, query) })))
    .filter((m) => m.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.service.popular ?? 99) - (b.service.popular ?? 99) ||
        a.service.label.localeCompare(b.service.label),
    )
    .slice(0, limit)
    .map(({ service, group }) => ({ service, group }));
}
