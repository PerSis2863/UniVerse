import { useSyncExternalStore } from 'react';

/*
 * Sample mode: lets a new user explore the whole app filled with example data.
 * It is per browser tab (sessionStorage), never touches the real database, and
 * is switched off with one click. Requests are answered by lib/sample/router.
 */

const KEY = 'universe:sample-mode';
const listeners = new Set<() => void>();
let cached: boolean | null = null;

export function isSampleMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (cached === null) {
    try { cached = sessionStorage.getItem(KEY) === '1'; } catch { cached = false; }
  }
  return cached;
}

function set(on: boolean) {
  cached = on;
  try { if (on) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch { /* private mode: stays in memory */ }
  listeners.forEach((l) => l());
  window.dispatchEvent(new Event('universe:sample-mode'));
}

export const enterSampleMode = () => set(true);
export const exitSampleMode = () => set(false);

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useSampleMode() {
  return useSyncExternalStore(subscribe, isSampleMode, () => false);
}
