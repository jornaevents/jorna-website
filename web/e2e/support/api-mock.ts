import type { Page, Route } from "@playwright/test";
import { MOCK_API_BASE } from "./api-base";

type HandlerArgs = { route: Route; url: URL };
// A handler either returns a JSON-serializable value (fulfilled as 200
// application/json) or calls route.fulfill/abort itself and returns nothing.
type Handler = (args: HandlerArgs) => unknown | Promise<unknown>;

function pathToRegex(path: string): RegExp {
  const escaped = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:([^/]+)/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/**
 * Routes every request under MOCK_API_BASE to a per-test table of handlers,
 * keyed by method + path (":id"-style params supported). Anything not
 * registered fails fast with a 404 instead of hanging on a fake host —
 * a missing mock should break the test loudly, not time out mysteriously.
 */
export class ApiMock {
  private exact = new Map<string, Handler>();
  private patterns: { method: string; regex: RegExp; handler: Handler }[] = [];
  private calls: { method: string; pathname: string; body: unknown }[] = [];

  constructor(private page: Page) {}

  async install() {
    await this.page.route(`${MOCK_API_BASE}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();

      let body: unknown = undefined;
      try {
        const raw = request.postData();
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        // non-JSON body; leave undefined
      }
      this.calls.push({ method, pathname: url.pathname, body });

      const exact = this.exact.get(`${method} ${url.pathname}`);
      const handler =
        exact ?? this.patterns.find((p) => p.method === method && p.regex.test(url.pathname))?.handler;

      if (!handler) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: `No e2e mock registered for ${method} ${url.pathname}` }),
        });
        return;
      }

      const result = await handler({ route, url });
      if (result === undefined) return; // handler fulfilled/aborted itself
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
  }

  private register(method: string, path: string, data: unknown | Handler) {
    const handler: Handler = typeof data === "function" ? (data as Handler) : () => data;
    if (path.includes(":")) {
      this.patterns.push({ method, regex: pathToRegex(path), handler });
    } else {
      this.exact.set(`${method} ${path}`, handler);
    }
    return this;
  }

  get(path: string, data: unknown | Handler) {
    return this.register("GET", path, data);
  }
  post(path: string, data: unknown | Handler) {
    return this.register("POST", path, data);
  }
  patch(path: string, data: unknown | Handler) {
    return this.register("PATCH", path, data);
  }
  put(path: string, data: unknown | Handler) {
    return this.register("PUT", path, data);
  }
  delete(path: string, data: unknown | Handler) {
    return this.register("DELETE", path, data);
  }

  /** Register an error response (a non-2xx status with a FastAPI-style detail). */
  error(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, status: number, detail: string) {
    return this.register(method, path, ({ route }: HandlerArgs) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ detail }) }),
    );
  }

  /** Requests seen so far, for asserting a call happened with the right body. */
  requestsTo(method: string, pathname: string) {
    return this.calls.filter((c) => c.method === method && c.pathname === pathname);
  }
}
