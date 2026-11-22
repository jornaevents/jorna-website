// What Use does for a mention in the Mentioned in chat panel, given the
// contract as it stands and the vendor's packages. Pure, so each rule can be
// tested on its own. Null when there's nothing it can safely change, and the
// panel then shows the mention without a Use button.

import { addonLine, newKey, type Draft, type LineDraft } from "@jorna/shared/lib/contractDraft";
import type { LineUnit } from "@jorna/shared/lib/contractTypes";
import type { Mention } from "./chatMentions";
import type { ServiceItem } from "./types";

/** The line hours past the package's included ones go on. */
export const EXTRA_HOURS = "Extra hours";

const LINE_UNITS: LineUnit[] = ["event", "person", "hour", "day", "item"];

function hoursPatch(hours: number, draft: Draft, services: ServiceItem[]): Partial<Draft> | null {
  const pkg = draft.lines.find((l) => l.kind === "package");
  if (!pkg) return null;
  // Priced by the hour: the hours are the quantity.
  if (pkg.unit === "hour") {
    if (pkg.quantity === String(hours)) return null;
    return { lines: draft.lines.map((l) => (l.key === pkg.key ? { ...l, quantity: String(hours) } : l)) };
  }
  // Priced per event with hours included: only the hours past them are
  // extra, at the overtime rate (left blank for the vendor when there's none).
  const included = services.find((s) => s.service_id === pkg.serviceId)?.included_hours ?? null;
  if (!included || hours <= included) return null;
  const extra = String(hours - included);
  const existing = draft.lines.find((l) => l.kind === "custom" && l.name === EXTRA_HOURS);
  if (existing) {
    if (existing.quantity === extra) return null;
    return { lines: draft.lines.map((l) => (l.key === existing.key ? { ...l, quantity: extra } : l)) };
  }
  const line: LineDraft = {
    key: newKey(),
    kind: "custom",
    serviceId: null,
    addonId: null,
    name: EXTRA_HOURS,
    unit: "hour",
    price: draft.overtimeRate || "",
    quantity: extra,
    description: `Past the ${included} hour${included === 1 ? "" : "s"} included`,
  };
  return { lines: [...draft.lines, line] };
}

function addonPatch(addonId: string, draft: Draft, services: ServiceItem[]): Partial<Draft> | null {
  if (draft.lines.some((l) => l.addonId === addonId)) return null;
  // The add-on of the package on the contract, else of whichever package has it.
  const onContract = draft.lines.find((l) => l.kind === "package")?.serviceId;
  const owner =
    services.find((s) => s.service_id === onContract && s.add_ons?.some((a) => a.id === addonId)) ??
    services.find((s) => s.status !== "archived" && s.add_ons?.some((a) => a.id === addonId));
  const line = owner ? addonLine(owner, addonId) : null;
  return line ? { lines: [...draft.lines, line] } : null;
}

/** An agreed price goes on the package line it was for; with no package
 *  named, on the contract's package. Not added as a line of its own: the
 *  vendor's package is what's being priced. */
function pricePatch(m: Mention, draft: Draft): Partial<Draft> | null {
  const [dollars, unit] = m.value.split("/");
  if (!dollars || !LINE_UNITS.includes(unit as LineUnit)) return null;
  const line = m.serviceId
    ? draft.lines.find((l) => l.kind === "package" && l.serviceId === m.serviceId)
    : draft.lines.find((l) => l.kind === "package");
  if (!line || (Number(line.price) === Number(dollars) && line.unit === unit)) return null;
  return { lines: draft.lines.map((l) => (l.key === line.key ? { ...l, price: dollars, unit: unit as LineUnit } : l)) };
}

export function mentionPatch(m: Mention, draft: Draft, services: ServiceItem[]): Partial<Draft> | null {
  if (!m.usable) return null;
  switch (m.kind) {
    case "date":
      return draft.dateIso === m.value ? null : { dateIso: m.value };
    case "times": {
      const [timeStart, timeEnd] = m.value.split("-");
      return draft.timeStart === timeStart && draft.timeEnd === timeEnd ? null : { timeStart, timeEnd };
    }
    case "start":
      return draft.timeStart === m.value ? null : { timeStart: m.value };
    case "guests":
      return draft.guestCount === m.value ? null : { guestCount: m.value };
    case "hours":
      return hoursPatch(Number(m.value), draft, services);
    case "addon":
      return addonPatch(m.value, draft, services);
    case "price":
      return pricePatch(m, draft);
    case "discount":
      return draft.discount === m.value ? null : { discount: m.value };
    default:
      return null;
  }
}
