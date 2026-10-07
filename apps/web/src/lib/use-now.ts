'use client';

import { useSyncExternalStore } from 'react';

// The time now for render code (React's rules don't allow Date.now() while rendering). One timer,
// every 30 s, shared by every component that asks; it stops when nobody is listening. Good for
// "2 min ago", "edit for 24 hours", Join buttons that switch on by themselves. Countdowns that
// need seconds use useTick.

let now = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    now = Date.now(); // after a quiet spell, start from the real time
    timer = setInterval(() => { now = Date.now(); subs.forEach((f) => f()); }, 30_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) { clearInterval(timer); timer = null; }
  };
}

/** The time now (ms), updated every 30 s. 0 while rendering on the server. */
export const useNow = () => useSyncExternalStore(subscribe, () => now, () => 0);

// The time now, to the second, while something counts down.
const everySecond = (cb: () => void) => { const t = setInterval(cb, 500); return () => clearInterval(t); };
const never = () => () => {};
// Rounded up, so a fresh 15-minute timer reads 15:00, not 15:01.
const thisSecond = () => Math.ceil(Date.now() / 1000) * 1000;
/** The time now, updated every second while `on` (countdowns). */
export function useTick(on: boolean) {
  return useSyncExternalStore(on ? everySecond : never, thisSecond, thisSecond);
}
