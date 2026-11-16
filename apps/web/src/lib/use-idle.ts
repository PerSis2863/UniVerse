'use client';

import { useSyncExternalStore } from 'react';

// M225: whether the person has left the page alone for a while (no pointer, key, wheel, touch or scroll for 30 s).
// Decorative motion rests then (the scene behind the page, the landing's looping demos): nobody is watching, and a
// laptop or phone kept busy by them answers the next tap late. Any input wakes it at once. One set of passive
// listeners for the whole page, attached only while something asks.

const QUIET_MS = 30_000;
let idle = false, last = 0, timer = 0;
const subs = new Set<() => void>();
const EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

const tell = () => subs.forEach((f) => f());
const check = () => {
  timer = 0;
  const left = QUIET_MS - (performance.now() - last);
  if (left > 0) { timer = window.setTimeout(check, left); return; }
  if (!idle) { idle = true; tell(); }
};
const input = () => {
  last = performance.now();
  if (idle) { idle = false; tell(); }
  if (!timer) timer = window.setTimeout(check, QUIET_MS);
};

function subscribe(cb: () => void) {
  if (!subs.size) {
    for (const e of EVENTS) window.addEventListener(e, input, { passive: true, capture: true });
    input();
  }
  subs.add(cb);
  return () => {
    subs.delete(cb);
    if (subs.size) return;
    for (const e of EVENTS) window.removeEventListener(e, input, { capture: true });
    if (timer) { clearTimeout(timer); timer = 0; }
    idle = false;
  };
}

/** Left alone for 30 s (false on the server). */
export const useIdle = () => useSyncExternalStore(subscribe, () => idle, () => false);
/** For code outside React: called when the idle state changes; returns the way to stop listening. */
export const onIdleChange = (cb: (idle: boolean) => void) => subscribe(() => cb(idle));
export const isIdle = () => idle;
