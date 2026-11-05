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
      if (generation === startedAt) entries.set(key, { at: Date.now(), value });
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

/** Forget every remembered read, and any read still in flight. */
export function clearDataCache() {
  generation += 1;
  entries.clear();
  inflight.clear();
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
