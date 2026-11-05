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

describe("kept across a reload", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  /** Read once as `who`, then "reload": a fresh module with the same tab storage. */
  async function readThenReload(who: string) {
    const first = await fresh();
    first.setDataCacheOwner(who);
    await first.cachedRead("k", () => Promise.resolve("remembered"));
    await vi.runAllTimersAsync(); // the save is batched
    return fresh();
  }

  it("shows the same person's answers after a reload, without asking", async () => {
    const { cachedRead, setDataCacheOwner } = await readThenReload("u1");
    setDataCacheOwner("u1");
    const load = vi.fn(() => Promise.resolve("network"));
    expect(await cachedRead("k", load)).toBe("remembered");
    expect(load).not.toHaveBeenCalled();
  });

  it("a read that starts before the session is known waits for it, then uses the tab's answer", async () => {
    const { cachedRead, setDataCacheOwner } = await readThenReload("u1");
    const load = vi.fn(() => Promise.resolve("network"));
    const early = cachedRead("k", load); // the role check, before /me is back
    setDataCacheOwner("u1");
    expect(await early).toBe("remembered");
    expect(load).not.toHaveBeenCalled();
  });

  it("stops waiting for a session that never settles", async () => {
    const { cachedRead } = await readThenReload("u1");
    const early = cachedRead("k", () => Promise.resolve("network"));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await early).toBe("network");
  });

  it("never shows them to someone else, and throws them away", async () => {
    const { cachedRead, setDataCacheOwner, STORAGE_KEY } = await readThenReload("u1");
    setDataCacheOwner("u2");
    expect(await cachedRead("k", () => Promise.resolve("u2's own"))).toBe("u2's own");
    await vi.runAllTimersAsync();
    expect(sessionStorage.getItem(STORAGE_KEY)).toContain('"owner":"u2"');
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toContain("remembered");
  });

  it("doesn't bring back an answer past its maximum age", async () => {
    const { cachedRead, setDataCacheOwner, MAX_AGE_MS } = await readThenReload("u1");
    vi.advanceTimersByTime(MAX_AGE_MS);
    setDataCacheOwner("u1");
    expect(await cachedRead("k", () => Promise.resolve("network"))).toBe("network");
  });

  it("saves nothing while nobody is signed in", async () => {
    const { cachedRead, STORAGE_KEY } = await fresh();
    await cachedRead("k", () => Promise.resolve("v"));
    await vi.runAllTimersAsync();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("forgets the stored answers on a write and on signing out", async () => {
    const a = await fresh();
    a.setDataCacheOwner("u1");
    await a.cachedRead("k", () => Promise.resolve("v"));
    await vi.runAllTimersAsync();
    expect(sessionStorage.getItem(a.STORAGE_KEY)).not.toBeNull();
    a.clearDataCache(); // what a write and a sign-out both call
    expect(sessionStorage.getItem(a.STORAGE_KEY)).toBeNull();

    await a.cachedRead("k", () => Promise.resolve("v"));
    await vi.runAllTimersAsync();
    a.setDataCacheOwner(null); // the session ended
    expect(sessionStorage.getItem(a.STORAGE_KEY)).toBeNull();
    expect(await a.cachedRead("k", () => Promise.resolve("fresh"))).toBe("fresh");
  });

  it("carries on without storage when it's blocked", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const { cachedRead, setDataCacheOwner } = await fresh();
    setDataCacheOwner("u1");
    expect(await cachedRead("k", () => Promise.resolve("v"))).toBe("v");
    await vi.runAllTimersAsync();
    expect(await cachedRead("k", () => Promise.resolve("again"))).toBe("v");
  });
});
