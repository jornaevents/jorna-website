"use client";

// A vendor's contract templates, stored on their account (backend 0065) —
// so the one they saved on a laptop is there on their phone. The body is
// lib/contractDraft's TemplateBody; the backend keeps it as-is.
//
// Templates used to live in this browser's localStorage, holding only the
// terms (deposit %, cancellation, overtime, equipment, travel). The first
// load after that changed uploads any found here and then forgets them, so
// nothing a vendor saved is lost in the move.

import {
  createContractTemplate,
  deleteContractTemplate,
  listContractTemplates,
  updateContractTemplate,
} from "./jorna";
import type { TemplateBody } from "@jorna/shared/lib/contractDraft";
import type { AttachedDocumentKind, SavedContractTemplate, TemplateKind } from "./types";

const LEGACY_KEY = "jorna_contract_templates";

interface LegacyTemplate {
  name: string;
  depositPercent?: string;
  cancellationWindowHours?: string;
  overtimeRate?: string;
  equipmentPower?: string;
  travel?: string;
}

export function fromLegacy(t: LegacyTemplate): TemplateBody {
  const deposit = Number(t.depositPercent);
  const clauses = [
    t.equipmentPower?.trim() ? { title: "Equipment & power", body: t.equipmentPower.trim() } : null,
    t.travel?.trim() ? { title: "Travel", body: t.travel.trim() } : null,
  ].filter((c): c is { title: string; body: string } => c !== null);
  return {
    version: 1,
    schedule:
      deposit > 0 && deposit < 100
        ? [
            { label: "Deposit", percent: deposit, dueType: "on_signing", dueDays: "" },
            { label: "Final balance", percent: 100 - deposit, dueType: "before_event", dueDays: "14" },
          ]
        : undefined,
    clauses: clauses.length ? clauses : undefined,
    cancellationDays: t.cancellationWindowHours
      ? String(Math.round(Number(t.cancellationWindowHours) / 24))
      : undefined,
    overtimeRate: t.overtimeRate || undefined,
  };
}

function readLegacy(): LegacyTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.name === "string") : [];
  } catch {
    return [];
  }
}

let migrating: Promise<void> | null = null;

/** Move this browser's old templates onto the account, once. Only forgets
 *  them after every upload succeeded, so a failure retries next time. */
function migrateLegacy(): Promise<void> {
  migrating ??= (async () => {
    const legacy = readLegacy();
    if (!legacy.length) return;
    await Promise.all(
      legacy.map((t) => createContractTemplate(t.name, fromLegacy(t) as unknown as Record<string, unknown>)),
    );
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* storage blocked — the next load would upload them again, harmlessly named twins */
    }
  })().finally(() => {
    migrating = null;
  });
  return migrating;
}

export async function loadTemplates(): Promise<SavedContractTemplate[]> {
  await migrateLegacy().catch(() => undefined);
  return (await listContractTemplates()).items;
}

export function saveTemplate(name: string, body: TemplateBody): Promise<SavedContractTemplate> {
  return createContractTemplate(name, body as unknown as Record<string, unknown>);
}

/** An addendum or cancellation agreement kept for reuse: its title and
 *  sections, nothing tied to one booking. */
export interface DocumentTemplateBody {
  version: 1;
  title: string;
  sections: { title: string; body: string }[];
}

export function saveDocumentTemplate(
  name: string,
  kind: AttachedDocumentKind,
  body: DocumentTemplateBody,
): Promise<SavedContractTemplate> {
  return createContractTemplate(name, body as unknown as Record<string, unknown>, kind);
}

/** Agreements are the builder's; addenda and cancellations the document
 *  editor's. A template saved before kinds existed is an agreement. */
export function templatesOfKind(all: SavedContractTemplate[], kind: TemplateKind): SavedContractTemplate[] {
  return all.filter((t) => (t.kind ?? "agreement") === kind);
}

export function deleteTemplate(templateId: string): Promise<unknown> {
  return deleteContractTemplate(templateId);
}

export function templateBody(t: SavedContractTemplate): TemplateBody {
  return t.body as unknown as TemplateBody;
}

/** Save an edited template: the stored one if there is one, or — for a
 *  package's template the vendor hasn't edited before — a new one linked to
 *  the package, which from then on takes the built one's place (backend
 *  DECISIONS #31). */
export function saveEditedTemplate(
  target: { templateId?: string; serviceId?: string },
  name: string,
  body: TemplateBody,
): Promise<SavedContractTemplate> {
  const b = body as unknown as Record<string, unknown>;
  if (target.templateId) return updateContractTemplate(target.templateId, { name, body: b });
  return createContractTemplate(name, b, "agreement", target.serviceId);
}

export function renameTemplate(templateId: string, name: string): Promise<SavedContractTemplate> {
  return updateContractTemplate(templateId, { name });
}

/** A copy is an ordinary template, even of a package's: it doesn't follow
 *  or belong to anything. */
export function duplicateTemplate(name: string, body: TemplateBody, kind: TemplateKind = "agreement") {
  return createContractTemplate(`${name} (copy)`, body as unknown as Record<string, unknown>, kind);
}

