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
export const exitSampleMode = () => { setVisitor(false); set(false); };

// A visitor trying the live demo without an account (the "Try the live demo" buttons): a made-up
// person in the browser, no session, and nothing sent to the server (lib/sample/router).
const VISITOR = 'universe:sample-visitor';
export function isSampleVisitor(): boolean {
  if (typeof window === 'undefined') return false;
  try { return sessionStorage.getItem(VISITOR) === '1'; } catch { return false; }
}
export function setVisitor(on: boolean) {
  try { if (on) sessionStorage.setItem(VISITOR, '1'); else sessionStorage.removeItem(VISITOR); } catch { /* private mode */ }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useSampleMode() {
  return useSyncExternalStore(subscribe, isSampleMode, () => false);
}

/** Ends a visitor's demo just before the page is left: storage only, so open pages don't refetch for real first. */
export function clearVisitorStorage() {
  try { for (const k of [KEY, VISITOR, 'universe-auth']) sessionStorage.removeItem(k); } catch { /* storage unavailable */ }
}
/**
 * A real sign-in or sign-up in a tab that ran the demo (sign-in and sign-up pages): the demo ends
 * first, or its made-up answers stand in for the real account (the owner's "Login successful, but
 * failed to retrieve user data", 25 Oct 2026). True when one was on: the page then opens afresh, so
 * the account store leaves the demo's storage too.
 */
export function endDemoForSignIn(): boolean {
  if (!isSampleMode() && !isSampleVisitor()) return false;
  clearVisitorStorage();
  exitSampleMode();
  return true;
}
