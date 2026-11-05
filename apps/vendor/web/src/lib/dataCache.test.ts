import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The cache is module state, so each test gets a fresh copy of it (and of the
// shared api module it listens to).
async function fresh() {
  vi.resetModules();
  const cache = await import("./dataCache");
  const api = await import("@jorna/shared/lib/api");
  return { ...cache, api };
}

/** A load that answers with 1, 2, 3… and counts its calls. */
function counter() {
  let n = 0;
  const load = vi.fn(() => Promise.resolve(++n));
  return load;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cachedRead", () => {
  it("doesn't ask again while an answer is fresh", async () => {
    const { cachedRead, FRESH_MS } = await fresh();
    const load = counter();
    expect(await cachedRead("k", load)).toBe(1);
    vi.advanceTimersByTime(FRESH_MS - 1);
    expect(await cachedRead("k", load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one request between callers asking at once", async () => {
    const { cachedRead } = await fresh();
    const load = counter();
    const [a, b] = await Promise.all([cachedRead("k", load), cachedRead("k", load)]);
    expect([a, b]).toEqual([1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys apart", async () => {
    const { cachedRead } = await fresh();
    expect(await cachedRead("a", () => Promise.resolve("A"))).toBe("A");
    expect(await cachedRead("b", () => Promise.resolve("B"))).toBe("B");
  });

  it("answers an older one at once and refreshes behind it", async () => {
    const { cachedRead, FRESH_MS } = await fresh();
    const load = counter();
    await cachedRead("k", load);
    vi.advanceTimersByTime(FRESH_MS);

    expect(await cachedRead("k", load)).toBe(1); // the remembered answer, not a wait
    expect(load).toHaveBeenCalledTimes(2); // …with a refresh behind it
    await vi.runAllTimersAsync();
    expect(await cachedRead("k", load)).toBe(2); // the refreshed one, now fresh
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("doesn't show an answer past its maximum age", async () => {
    const { cachedRead, MAX_AGE_MS } = await fresh();
    const load = counter();
    await cachedRead("k", load);
    vi.advanceTimersByTime(MAX_AGE_MS);
    expect(await cachedRead("k", load)).toBe(2);
  });

  it("never remembers a failure", async () => {
    const { cachedRead } = await fresh();
    const failing = vi.fn(() => Promise.reject(new Error("blip")));
    await expect(cachedRead("k", failing)).rejects.toThrow("blip");
    expect(await cachedRead("k", () => Promise.resolve("ok"))).toBe("ok");
  });

  it("keeps the remembered answer when the refresh behind it fails", async () => {
    const { cachedRead, FRESH_MS } = await fresh();
    await cachedRead("k", () => Promise.resolve("old"));
    vi.advanceTimersByTime(FRESH_MS);
    expect(await cachedRead("k", () => Promise.reject(new Error("blip")))).toBe("old");
    await vi.runAllTimersAsync();
    expect(await cachedRead("k", () => Promise.resolve("new"))).toBe("old");
  });
});

describe("forgetting", () => {
  it("forgets everything on clearDataCache (signing out)", async () => {
    const { cachedRead, clearDataCache } = await fresh();
    const load = counter();
    await cachedRead("k", load);
    clearDataCache();
    expect(await cachedRead("k", load)).toBe(2);
  });

  it("forgets everything after any write, and nothing after a read", async () => {
    const { cachedRead, api } = await fresh();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))));
    const load = counter();
    await cachedRead("k", load);

    await api.apiFetch("/anything");
    expect(await cachedRead("k", load)).toBe(1);

    await api.apiFetch("/bookings/b1/seen", { method: "POST" });
    expect(await cachedRead("k", load)).toBe(2);
  });

  it("forgets after a write that failed, since it may have landed", async () => {
    const { cachedRead, api } = await fresh();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("network"))));
    const load = counter();
    await cachedRead("k", load);
    await expect(api.apiFetch("/x", { method: "PATCH" })).rejects.toThrow("network");
    expect(await cachedRead("k", load)).toBe(2);
  });

  it("doesn't keep a read that was in flight when a write went out", async () => {
    const { cachedRead, clearDataCache } = await fresh();
    let answer!: (v: string) => void;
    const slow = cachedRead("k", () => new Promise<string>((r) => (answer = r)));
    clearDataCache(); // a write lands while the read is out
    answer("from before the write");
    expect(await slow).toBe("from before the write"); // its own caller still gets it
    expect(await cachedRead("k", () => Promise.resolve("after"))).toBe("after");
  });
});
