// What "Send a contract" offers to start from (backend DECISIONS #31): a
// template for every package, the vendor's other saved templates, and
// starting from scratch on their usual terms.
//
// A package's template is built from the package (contractDraft's
// packageTemplate) until the vendor edits one; the edit is a saved template
// with the package's service_id, and takes its place.

import { packageTemplate, type TemplateBody } from "@jorna/shared/lib/contractDraft";
import type { SavedContractTemplate, ServiceItem } from "./types";

export interface TemplateChoice {
  /** What the editor's URL and menu use: package:<service_id> or the
   *  saved template's id. */
  id: string;
  name: string;
  body: TemplateBody;
  /** Set on a package's template, edited or not. */
  serviceId?: string;
  /** A stored template behind it — the vendor's own, or their edit of a
   *  package's. */
  templateId?: string;
  /** A package's template the vendor has changed: it no longer follows the
   *  package. */
  edited?: boolean;
  price?: number;
  /** The package's own name, which an edited template may have renamed away from. */
  packageName?: string;
}

/** "2 items · 3 payments · 3 sections" — what's in a template, so picking
 *  one isn't a guess from its name (2026-10-26). */
export function templateSummary(body: TemplateBody): string {
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  return [
    body.lines?.length ? n(body.lines.length, "item") : null,
    body.schedule?.length ? n(body.schedule.length, "payment") : null,
    body.clauses?.length ? n(body.clauses.length, "section") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const packageChoiceId = (serviceId: string) => `package:${serviceId}`;

const isAgreement = (t: SavedContractTemplate) => (t.kind ?? "agreement") === "agreement";

/** Packages first, in the vendor's own order; archived ones are retired, so
 *  neither they nor an edit of theirs is offered. Private (hidden) packages
 *  are exactly what contracts are for, so they stay. */
export function templateChoices(
  services: ServiceItem[],
  saved: SavedContractTemplate[],
): { packages: TemplateChoice[]; saved: TemplateChoice[] } {
  const agreements = saved.filter(isAgreement);
  const packages = services
    .filter((s) => s.status !== "archived")
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s): TemplateChoice => {
      const own = agreements.find((t) => t.service_id === s.service_id);
      return {
        id: packageChoiceId(s.service_id),
        name: own?.name ?? s.name,
        body: own ? (own.body as unknown as TemplateBody) : packageTemplate(s),
        serviceId: s.service_id,
        templateId: own?.template_id,
        edited: Boolean(own),
        price: s.price,
        packageName: s.name,
      };
    });
  return {
    packages,
    saved: agreements
      .filter((t) => !t.service_id)
      .map((t) => ({ id: t.template_id, name: t.name, body: t.body as unknown as TemplateBody, templateId: t.template_id })),
  };
}

/** One list, for the editor's ⋯ menu and for finding a choice by its id. */
export function allChoices(c: { packages: TemplateChoice[]; saved: TemplateChoice[] }): TemplateChoice[] {
  return [...c.packages, ...c.saved];
}
