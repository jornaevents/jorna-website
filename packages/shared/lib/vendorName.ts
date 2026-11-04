/**
 * What a vendor is called to everyone else: their business name when they've
 * given one (backend 0082), else the account holder's own name — the same rule
 * as the backend's services/names.py, so a storefront here and a PDF or email
 * from the server agree. Takes either shape the API sends: a vendor profile
 * (f_name/l_name) or a search row (first_name/last_name).
 */
export interface VendorNameParts {
  business_name?: string | null;
  f_name?: string | null;
  l_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export function vendorName(v: VendorNameParts | null | undefined, fallback = ""): string {
  if (!v) return fallback;
  const business = (v.business_name ?? "").trim();
  if (business) return business;
  const person = [v.f_name ?? v.first_name, v.l_name ?? v.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return person || fallback;
}
