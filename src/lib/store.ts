"use client";

import { useSyncExternalStore } from "react";
import { createSeedState } from "./seed.ts";
import type { FacilityState } from "./types.ts";

// One browser = one facility. All three demo roles share this state.
const STORAGE_KEY = "factwise-fevertrack-demo-v1";

let cache: FacilityState | null = null;
let storageWorks = true;
const listeners = new Set<() => void>();

function isValidState(value: unknown): value is FacilityState {
  const s = value as FacilityState;
  return !!s && s.version === 1 && Array.isArray(s.patients) && Array.isArray(s.readings) && Array.isArray(s.visits);
}

function save(state: FacilityState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageWorks = true;
  } catch {
    storageWorks = false; // Private mode or full storage: keep working in memory.
  }
}

function load(): FacilityState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    storageWorks = false;
  }
  const seeded = createSeedState(new Date());
  save(seeded);
  return seeded;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null; // Another tab changed the data: reload it.
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): FacilityState {
  if (!cache) cache = load();
  return cache;
}

export function commitState(next: FacilityState) {
  cache = next;
  save(next);
  emit();
}

export function resetDemo() {
  commitState(createSeedState(new Date()));
}

export function isStorageAvailable() {
  return storageWorks;
}

/** Returns null during server rendering, then the browser state. */
export function useFacilityState(): FacilityState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

// Clock: re-render each minute so "today" rolls over at facility midnight.
let nowCache = 0;
function subscribeClock(listener: () => void) {
  const id = window.setInterval(listener, 30_000);
  return () => window.clearInterval(id);
}
function getNowMinute() {
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  if (minute !== nowCache) nowCache = minute;
  return nowCache;
}

/** Current minute as epoch ms, or 0 during server rendering. */
export function useNowMinute(): number {
  return useSyncExternalStore(subscribeClock, getNowMinute, () => 0);
}
