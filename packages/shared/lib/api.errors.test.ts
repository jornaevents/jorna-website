import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";

// What a refusal says to the reader.
describe("error messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function refusal(status: number, body: unknown): Promise<ApiError> {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    try {
      await apiFetch("/x", { auth: false });
    } catch (err) {
      return err as ApiError;
    }
    throw new Error("expected a refusal");
  }

  it("keeps a 429's own message, like a vendor's daily inquiry cap", async () => {
    const err = await refusal(429, { detail: "Arjun has had a lot of inquiries today — try again tomorrow" });
    expect(err.status).toBe(429);
    expect(err.message).toBe("Arjun has had a lot of inquiries today — try again tomorrow");
  });

  it("turns the rate limiter's own 429 into plain words", async () => {
    const err = await refusal(429, { error: "Rate limit exceeded: 5 per 1 minute" });
    expect(err.message).toBe("Too many attempts. Please wait a minute and try again.");
  });
});
