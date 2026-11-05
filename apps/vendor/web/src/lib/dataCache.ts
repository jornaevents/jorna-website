"use client";

// Remembered reads for the vendor pages, so moving between them doesn't start
// each one from nothing. Every page used to wait for /vendors/me, then for its
// own data, then show it — and the sidebar re-read three counts on every click.
//
// The rule is "show what you saw, then check": a read answered here within
// FRESH_MS isn't asked again; an older one is answered at once from memory and
// refreshed behind it, and pages that showed it read again when it lands
// (useDataVersion). Past MAX_AGE_MS an answer isn't shown at all.
//
// Two things make it safe to show remembered data:
// - Any write the app makes (@jorna/shared/lib/api's onApiWrite) forgets
//   everything, so no page can show a state from before your own action. A
//   read that was already in flight when the write went out isn't kept either
//   (`generation`) — its answer may be from before the write.
// - Signing out forgets everything (lib/auth's clearCaches), so the next
//   person on this browser starts clean.
//
// It also outlives a reload: answers are kept in this tab's sessionStorage,
// stamped with whose they are, and taken back only once the session says
// it's the same person (setDataCacheOwner, from lib/auth). A refresh then
// shows the pages at once instead of waiting through the whole chain again;
// they're refreshed behind as usual. sessionStorage rather than
// localStorage: it ends with the tab, and never crosses to another one.
//
// Only for what a page shows when it opens. Anything polled for live changes
// (a thread's messages, the inbox) keeps calling lib/jorna directly: an
// answer from memory would put it a poll behind.

import { useSyncExternalStore } from "react";
import { onApiWrite } from "@jorna/shared/lib/api";

export const FRESH_MS = 15_000;
export const MAX_AGE_MS = 5 * 60_000;

interface Entry {
  at: number;
  value: unknown;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let generation = 0;

// ── Kept across a reload ─────────────────────────────────────────────

export const STORAGE_KEY = "jorna.vendorData.v1";

interface Stored {
  owner: string;
  entries: Record<string, Entry>;
}

let owner: string | null = null;
let saveQueued = false;

// Until the session says who's signed in, a tab holding stored answers waits
// to hear before reading: on a reload the first reads (the role check, the
// sidebar) start before /me is back, and would otherwise go to the network
// for answers the tab already has. Waiting costs nothing — /me is the one
// round trip a reload can't skip — and OWNER_WAIT_MS bounds it if the
// session never settles.
const OWNER_WAIT_MS = 3_000;
let ownerKnown = false;
let ownerHeard: () => void = () => {};
const ownerSettled = new Promise<void>((resolve) => {
  ownerHeard = resolve;
  setTimeout(resolve, OWNER_WAIT_MS);
});

function hasStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/** Write what's remembered, once per burst of answers. Storage that's full
 *  or blocked just means a reload starts from the network, as before. */
function save() {
  if (saveQueued || !owner) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    if (!owner) return;
    try {
      const stored: Stored = { owner, entries: Object.fromEntries(entries) };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      /* quota or blocked storage */
    }
  }, 0);
}

function forgetStored() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* blocked storage */
  }
}

/** Who the remembered answers belong to: the signed-in user's id, or null
 *  while nobody is. The first time it's set, this tab's stored answers come
 *  back if they're that person's and not past MAX_AGE_MS; anyone else's are
 *  thrown away. Changing owner forgets everything. */
export function setDataCacheOwner(userId: string | null) {
  ownerKnown = true;
  ownerHeard();
  if (userId === owner) return;
  if (owner !== null) clearDataCache();
  owner = userId;
  if (!userId) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Stored) : null;
    if (!stored || stored.owner !== userId) {
      forgetStored();
      return;
    }
    const now = Date.now();
    for (const [key, entry] of Object.entries(stored.entries ?? {})) {
      if (now - entry.at < MAX_AGE_MS && !entries.has(key)) entries.set(key, entry);
    }
  } catch {
    forgetStored();
  }
}

// Bumped when a refresh behind a shown answer lands, so the pages that showed
// it read again. Batched: one refresh pass over several reads re-renders once.
let version = 0;
let bumpQueued = false;
const listeners = new Set<() => void>();

function bump() {
  if (bumpQueued) return;
  bumpQueued = true;
  setTimeout(() => {
    bumpQueued = false;
    version += 1;
    listeners.forEach((l) => l());
  }, 0);
}

function fetchInto(key: string, load: () => Promise<unknown>): Promise<unknown> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const startedAt = generation;
  const p = load()
    .then((value) => {
      if (generation === startedAt) {
        entries.set(key, { at: Date.now(), value });
        save();
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** `load()`'s answer for `key`, from memory when there is one (see the top of
 *  this file). A failure is never remembered, so a blip can't pin an error. */
export function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!ownerKnown && hasStored()) {
    return ownerSettled.then(() => {
      ownerKnown = true;
      return cachedRead(key, load);
    });
  }
  const entry = entries.get(key);
  const age = entry ? Date.now() - entry.at : Infinity;
  if (entry && age < FRESH_MS) return Promise.resolve(entry.value as T);
  if (entry && age < MAX_AGE_MS) {
    if (!inflight.has(key)) {
      fetchInto(key, load).then(bump, () => {});
    }
    return Promise.resolve(entry.value as T);
  }
  return fetchInto(key, load) as Promise<T>;
}

// ── Filling it from a combined read ──────────────────────────────────
// Overview reads five things in one request (GET /vendors/me/overview). Each
// part is started here as that key's read (prime), so anything else asking
// for the key meanwhile — the sidebar mounts at the same moment — waits on
// it instead of sending its own request, and the answer is filed under the
// key for the pages after. Same rules as cachedRead: nothing from before a
// write is kept, and nothing before the session is known is used.

/** Null when the tab's stored answers, if any, are already back; else what
 *  resolves once they are (see setDataCacheOwner). Null rather than a
 *  resolved promise so a caller with nothing to wait for can carry on in
 *  the same tick — before the sidebar, mounting alongside, asks too. */
export function ownerWait(): Promise<void> | null {
  if (ownerKnown || !hasStored()) return null;
  return ownerSettled.then(() => {
    ownerKnown = true;
  });
}

/** `key`'s remembered answer, or undefined; read without waiting. */
export function peek(key: string): unknown {
  return isRemembered(key) ? entries.get(key)!.value : undefined;
}

/** Whether `key` has an answer that cachedRead would show. */
export function isRemembered(key: string): boolean {
  const entry = entries.get(key);
  return entry != null && Date.now() - entry.at < MAX_AGE_MS;
}

/** Start `key`'s read now, with `load`, unless it's remembered or already
 *  being read. Its answer is filed and shared exactly as cachedRead's. */
export function prime(key: string, load: () => Promise<unknown>): void {
  if (isRemembered(key)) return;
  fetchInto(key, load).catch(() => {});
}

/** Forget every remembered read, and any read still in flight. */
export function clearDataCache() {
  generation += 1;
  entries.clear();
  inflight.clear();
  forgetStored();
}

onApiWrite(clearDataCache);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A number that goes up when a refresh behind a remembered answer lands. Put
 *  it in the dependencies of the effect that loads a page, and the page reads
 *  again — from memory, now fresh. */
export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
