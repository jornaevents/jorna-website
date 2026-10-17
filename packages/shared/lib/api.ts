// Typed client for the Jorna backend. Handles bearer auth, one automatic token
// refresh on a 401, and JSON (de)serialization. Token storage is pluggable so
// the auth layer owns persistence (localStorage) — this module stays UI-free.

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// Unset means a local backend under `next dev`, so a fresh clone can't write
// to production by accident; a production build without it still reaches the
// live API. CI sets it explicitly for every build it ships (app.yml). `||`,
// not `??`: an Actions variable that isn't defined arrives as "".
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://desiconnect-production.up.railway.app")
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Token access is injected by the auth provider so this module has no React
// dependency and can be used from anywhere (including future server actions).
type TokenAccess = {
  getAccess: () => string | null;
  getRefresh: () => string | null;
  onRefreshed: (tokens: TokenPair) => void;
  onAuthLost: () => void;
};

let tokens: TokenAccess = {
  getAccess: () => null,
  getRefresh: () => null,
  onRefreshed: () => {},
  onAuthLost: () => {},
};

export function configureTokens(access: TokenAccess) {
  tokens = access;
}

/** The current bearer token, for the WebSocket (which auths via ?token=). */
export function currentAccessToken(): string | null {
  return tokens.getAccess();
}

/** What to say when the body carries no message we recognize. A 429 comes from
 *  slowapi, whose body is {"error": "Rate limit exceeded: 3 per 1 minute"} —
 *  neither shape parseError knows, and developer-facing besides. The auth routes
 *  are the tight ones (register 3/min, login 5/min), so a person fumbling a
 *  sign-up is the likeliest way to see this. */
function fallbackMessage(status: number): string {
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  return `Request failed (${status})`;
}

async function parseError(res: Response): Promise<string> {
  // A 429 with its own detail (a vendor's daily inquiry cap) says it; slowapi's
  // {"error": …} has none and falls through to the fallback.
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      // FastAPI validation errors. Pydantic v2 prefixes messages raised by a
      // field validator with "Value error, " — internal noise to a reader.
      return (
        data.detail
          .map((d: { msg?: string; loc?: string[] }) =>
            (d.msg ?? "").replace(/^Value error,\s*/, ""),
          )
          .filter(Boolean)
          .join(", ") || fallbackMessage(res.status)
      );
    }
    return data?.message ?? fallbackMessage(res.status);
  } catch {
    return fallbackMessage(res.status);
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach bearer token (default true)
  retry?: boolean; // internal — prevents infinite refresh loop
}

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, retry = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const access = auth ? tokens.getAccess() : null;
  if (access) headers.Authorization = `Bearer ${access}`;
  const sentWith = tokens.getRefresh();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // One transparent refresh attempt on an expired token.
  if (res.status === 401 && auth && retry && tokens.getRefresh()) {
    const refreshed = await tryRefresh(sentWith);
    if (refreshed) return apiFetch<T>(path, { ...opts, retry: false });
    tokens.onAuthLost();
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Multipart upload, with the same auth + one-retry refresh behaviour.
 *
 * Deliberately does NOT set Content-Type — the browser has to write that itself
 * so it can include the multipart boundary. Setting it by hand yields a body
 * the server can't parse.
 */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  opts: { method?: string; retry?: boolean } = {},
): Promise<T> {
  const { method = "POST", retry = true } = opts;
  const headers: Record<string, string> = {};
  const access = tokens.getAccess();
  if (access) headers.Authorization = `Bearer ${access}`;
  const sentWith = tokens.getRefresh();

  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: form });

  if (res.status === 401 && retry && tokens.getRefresh()) {
    const refreshed = await tryRefresh(sentWith);
    if (refreshed) return apiUpload<T>(path, form, { ...opts, retry: false });
    tokens.onAuthLost();
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * A file the backend sends as an attachment (a contract PDF), with the same
 * auth + one-retry refresh. The filename is the server's, from
 * Content-Disposition, so every copy of a file is named the same way.
 */
export async function apiDownload(
  path: string,
  opts: { auth?: boolean; retry?: boolean } = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const { auth = true, retry = true } = opts;
  const headers: Record<string, string> = {};
  const access = auth ? tokens.getAccess() : null;
  if (access) headers.Authorization = `Bearer ${access}`;
  const sentWith = tokens.getRefresh();

  const res = await fetch(`${API_BASE}${path}`, { headers });

  if (res.status === 401 && auth && retry && tokens.getRefresh()) {
    const refreshed = await tryRefresh(sentWith);
    if (refreshed) return apiDownload(path, { ...opts, retry: false });
    tokens.onAuthLost();
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return { blob: await res.blob(), filename: match?.[1] ?? null };
}

// One refresh at a time. The backend rotates the refresh token on every
// use and treats a second use of the old one as theft — it wipes every
// session the user has. So parallel 401s (a page loading several things as
// the access token expires) must share one refresh, and tabs must take turns
// (navigator.locks) and pick up the pair another tab already got.
let refreshing: Promise<boolean> | null = null;

/** `seen`: the refresh token in storage when the failed request went out. */
function tryRefresh(seen: string | null): Promise<boolean> {
  refreshing ??= refreshOnce(seen).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refreshOnce(seen: string | null): Promise<boolean> {
  if (!seen) return false;
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request("jorna-auth-refresh", () => refreshFrom(seen)) : refreshFrom(seen);
}

async function refreshFrom(seen: string): Promise<boolean> {
  const current = tokens.getRefresh();
  if (!current) return false;
  // Another tab refreshed while this one waited: its new pair is already
  // in storage, and using the old token now would be the replay.
  if (current !== seen) return true;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: current }),
    });
    if (!res.ok) return false;
    const pair = (await res.json()) as TokenPair;
    tokens.onRefreshed(pair);
    return true;
  } catch {
    return false;
  }
}
