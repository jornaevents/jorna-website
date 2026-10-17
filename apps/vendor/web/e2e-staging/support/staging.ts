import type { Page } from "@playwright/test";

// Talking to the staging backend directly: two long-lived test accounts, and
// whatever a flow needs set up or checked behind the page's back.

export const API = (process.env.STAGING_API_BASE_URL ?? "").replace(/\/$/, "");

// The secrets are random base64; the backend wants an uppercase letter, a
// lowercase one and a digit, which random text only nearly always has. A
// fixed tail makes every value qualify.
const password = (secret: string | undefined) => (secret ? `${secret}Aa1` : "");

// A run from a laptop sets STAGING_E2E_ACCOUNT_SUFFIX (say "-local") so it
// gets accounts of its own instead of claiming CI's with the wrong password.
const suffix = process.env.STAGING_E2E_ACCOUNT_SUFFIX ?? "";

export const VENDOR = {
  email: `e2e-staging-vendor${suffix}@example.com`,
  username: `e2e_staging_vendor${suffix.replace(/\W/g, "_")}`,
  password: password(process.env.STAGING_E2E_VENDOR_PASSWORD),
  f_name: "Staging",
  l_name: "Vendor",
};

export const CLIENT = {
  email: `e2e-staging-client${suffix}@example.com`,
  username: `e2e_staging_client${suffix.replace(/\W/g, "_")}`,
  password: password(process.env.STAGING_E2E_CLIENT_PASSWORD),
  f_name: "Staging",
  l_name: "Client",
};

export function configured(): string | null {
  if (!API) return "STAGING_API_BASE_URL isn't set";
  if (!VENDOR.password || !CLIENT.password) return "the STAGING_E2E_* passwords aren't set";
  if (/jornaevents\.com|supabase/.test(API) && !/staging/.test(API)) return "that looks like production";
  return null;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Sign in, creating the account the first time. */
export async function signIn(who: typeof VENDOR): Promise<Tokens> {
  try {
    return await api<Tokens>("/auth/login", { method: "POST", body: { identifier: who.email, password: who.password } });
  } catch (err) {
    if (!String(err).includes("→ 401") && !String(err).includes("→ 404")) throw err;
  }
  await api("/auth/register", {
    method: "POST",
    body: {
      ...who,
      age: 30,
      location: "Edison, NJ",
      latitude: 40.5187,
      longitude: -74.4121,
      gender: "Prefer not to say",
      language: "English",
      phone: "7325550100",
    },
  });
  return api<Tokens>("/auth/login", { method: "POST", body: { identifier: who.email, password: who.password } });
}

export interface StagingVendor {
  tokens: Tokens;
  vendorId: string;
  serviceId: string;
}

/** The test vendor, with a profile, a Venmo handle and one package — made the
 *  first time, found after that. */
export async function ensureVendor(): Promise<StagingVendor> {
  const tokens = await signIn(VENDOR);
  const token = tokens.access_token;
  let vendor = await api<{ vendor_id: string } | null>("/vendors/me", { token }).catch(() => null);
  if (!vendor) {
    vendor = await api<{ vendor_id: string }>("/vendors", {
      method: "POST",
      token,
      body: { bio: "Staging test vendor for automated checks. Not a real business.", category: "photography" },
    });
  }
  await api("/vendors/me", { method: "PATCH", token, body: { payment_method: "manual", venmo_handle: "@e2e-staging" } });
  const services = await api<{ items: { service_id: string; name: string; status?: string }[] }>(
    `/services?vendor_id=${vendor.vendor_id}&limit=100&include_unlisted=true`,
    { token },
  );
  let service = services.items.find((s) => s.name === "Staging check package" && s.status !== "archived");
  if (!service) {
    service = await api<{ service_id: string; name: string }>("/services", {
      method: "POST",
      token,
      body: { name: "Staging check package", price: 1200, price_unit: "event", category: "photography", description: "Used by the automated staging checks." },
    });
  }
  return { tokens, vendorId: vendor.vendor_id, serviceId: service.service_id };
}

/** A date years out, picked at random so runs rarely clash. Every signed run
 *  keeps its booking, so they still can: `onFreeDate` tries again. */
export function farDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  d.setDate(d.getDate() + Math.floor(Math.random() * 3650));
  return d.toISOString().slice(0, 10);
}

/** Run `make` with a far date, and with another whenever the vendor already
 *  has a booking on it (409 overlap). */
export async function onFreeDate<T>(make: (dateIso: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await make(farDate());
    } catch (err) {
      if (attempt >= 8 || !/→ 409: .*overlaps/.test(String(err))) throw err;
    }
  }
}

/** Put a session in the page the way the app stores one (lib/auth). */
export async function signInPage(page: Page, tokens: Tokens) {
  await page.addInitScript(([access, refresh]) => {
    localStorage.setItem("jorna_access", access);
    localStorage.setItem("jorna_refresh", refresh);
  }, [tokens.access_token, tokens.refresh_token]);
}
