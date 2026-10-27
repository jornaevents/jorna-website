"use client";

import { useState } from "react";
import {
  addonLine,
  customLine,
  lineTotalCents,
  money,
  packageLine,
  subtotalCents,
  type Draft,
  type LineDraft,
} from "@jorna/shared/lib/contractDraft";
import { priceUnitLabel, type ServiceItem } from "@/lib/types";
import { inputClass, smallButton, UNIT_WORD, type SetDraft } from "./shared";

/** What's included: packages from the vendor's listing, their add-ons,
 *  custom lines, a discount and the total. */
export function ItemsBlock({
  draft,
  set,
  services,
  total,
}: {
  draft: Draft;
  set: SetDraft;
  /** The vendor's bookable packages (archived ones already left out). */
  services: ServiceItem[];
  total: number;
}) {
  const packagesInDraft = services.filter((s) =>
    draft.lines.some((l) => l.kind === "package" && l.serviceId === s.service_id),
  );

  function addPackage(serviceId: string) {
    const svc = services.find((s) => s.service_id === serviceId);
    if (!svc) return;
    const patch: Partial<Draft> = { lines: [...draft.lines, packageLine(svc)] };
    // A package's own terms (backend 0063) beat the vendor-wide defaults the
    // form started from. Only the ones the package sets; the rest stay put.
    if (svc.cancellation_window_hours != null) {
      patch.cancellationDays = String(Math.round(svc.cancellation_window_hours / 24));
    }
    if (svc.overtime_rate_cents != null) patch.overtimeRate = String(svc.overtime_rate_cents / 100);
    set(patch);
  }

  function addAddon(svc: ServiceItem, addonId: string) {
    const line = addonLine(svc, addonId);
    if (line) set({ lines: [...draft.lines, line] });
  }

  // A new custom line starts with an empty name, so it gets the cursor. Left
  // empty, it stays on screen but isn't part of the contract (isBlankLine):
  // removing it when focus left made the rows below jump, and the click that
  // left it landed on the wrong thing.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  function addCustom() {
    const line = customLine();
    setFocusKey(line.key);
    set({ lines: [...draft.lines, line] });
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    set({ lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  }

  return (
    <div>
      {services.length === 0 ? (
        <p className="text-sm text-ink-faint">You don&apos;t have any packages listed yet — add one on your listing first.</p>
      ) : null}
      {draft.lines.length ? (
        <div className="grid gap-2">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_5rem_7.5rem_6.5rem_3.5rem] gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-ink-faint sm:grid"
          >
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {draft.lines.map((l) => (
            <div
              key={l.key}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-line-soft p-2 sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_6.5rem_3.5rem] sm:border-0 sm:p-0"
            >
              <div className="col-span-4 min-w-0 sm:col-span-1">
                <input
                  aria-label="Item"
                  value={l.name}
                  onChange={(e) => updateLine(l.key, { name: e.target.value })}
                  autoFocus={l.key === focusKey}
                  placeholder="e.g. Uplighting"
                  className={inputClass}
                />
                <p className="mt-0.5 text-[0.68rem] text-ink-faint">
                  {l.kind === "package" ? "Package" : l.kind === "addon" ? "Add-on" : "Custom"} · {UNIT_WORD[l.unit]}
                  {l.description ? ` · ${l.description}` : ""}
                </p>
              </div>
              <input
                aria-label="Qty"
                type="number"
                min={0}
                step="any"
                value={l.quantity}
                onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                className={inputClass}
              />
              <input
                aria-label={`Price ($ ${UNIT_WORD[l.unit]})`}
                type="number"
                min={0}
                step="0.01"
                value={l.price}
                onChange={(e) => updateLine(l.key, { price: e.target.value })}
                className={inputClass}
              />
              <span className="text-right text-sm text-ink">{money(lineTotalCents(l))}</span>
              <button
                type="button"
                aria-label={`Remove ${l.name || "line"}`}
                onClick={() => set({ lines: draft.lines.filter((x) => x.key !== l.key) })}
                className="justify-self-end text-xs text-ink-faint hover:text-maroon"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Said before they build a custom-only quote that can't be sent
          (decision E, 2026-10-26). */}
      {!draft.lines.some((l) => l.kind === "package") ? (
        <p className="mt-3 text-xs text-ink-faint">A contract needs at least one of your packages; add custom items alongside it.</p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {services.length > 0 ? (
          <select
            aria-label="Add a package"
            value=""
            onChange={(e) => addPackage(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              + Add a package
            </option>
            {services.map((s) => (
              <option key={s.service_id} value={s.service_id}>
                {s.name} — {money(Math.round(s.price * 100))}
                {s.price_unit && s.price_unit !== "event" ? ` ${priceUnitLabel(s.price_unit)}` : ""}
                {s.status === "hidden" ? " (private)" : ""}
              </option>
            ))}
          </select>
        ) : null}
        {packagesInDraft
          .filter((s) => s.add_ons?.length)
          .map((s) => (
            <div key={s.service_id}>
              <p className="text-xs text-ink-faint">Add-ons for {s.name}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {s.add_ons!.map((a) => (
                  <button key={a.id} type="button" onClick={() => a.id && addAddon(s, a.id)} className={smallButton}>
                    + {a.name} ({money(Math.round(a.price * 100))}
                    {a.price_unit !== "event" ? ` ${priceUnitLabel(a.price_unit)}` : ""})
                  </button>
                ))}
              </div>
            </div>
          ))}
        <div>
          <button type="button" onClick={addCustom} className={smallButton}>
            + Add a custom item
          </button>
        </div>
      </div>

      <div className="mt-5 ml-auto grid max-w-xs gap-1 border-t border-line-soft pt-3 text-sm">
        <div className="flex justify-between text-ink-soft">
          <span>Subtotal</span>
          <span>{money(subtotalCents(draft))}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-ink-soft">
          <label htmlFor="discount">Discount ($)</label>
          <input
            id="discount"
            type="number"
            min={0}
            step="0.01"
            value={draft.discount}
            onChange={(e) => set({ discount: e.target.value })}
            className="w-28 rounded-lg border border-card-edge bg-ground-2 px-2.5 py-1.5 text-right text-ink outline-none focus:border-gold"
          />
        </div>
        <div className="flex justify-between text-base font-semibold text-ink">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>
    </div>
  );
}
