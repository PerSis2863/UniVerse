'use client';

import { captureError } from './error-monitor';

// A brake for a runaway tab. On Workers Free the whole site gets 100,000 requests a day; one tab
// stuck in a loop (re-fetching pages or data many times a second) used them all up in an hour on
// 5 Oct 2026 and the site went offline until midnight UTC. A person using the app makes a few
// dozen requests a minute at most, so a tab making more than LIMIT in a minute is broken: its
// background reads (page and data fetches) pause, a minute at first and longer if it keeps
// happening, and the owner console gets one error report naming the addresses it was hammering.
// Writes (sending a message, saving) always go through, and a full page load still works.

const WINDOW_MS = 60_000;
const LIMIT = 300;
const MAX_PAUSE_MS = 15 * 60_000;

let installed = false;

export function installRequestGuard() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  let stamps: number[] = [];
  const paths = new Map<string, number>();
  let pausedUntil = 0;
  let strikes = 0;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    } catch {
      return realFetch(input, init);
    }
    if (url.origin !== location.origin || url.pathname.startsWith('/_next/static/')) return realFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const read = method === 'GET' || method === 'HEAD';
    const now = Date.now();
    if (read && now < pausedUntil) return Promise.reject(new TypeError('This tab is paused for a moment: it sent too many requests.'));

    stamps.push(now);
    while (stamps.length && stamps[0] < now - WINDOW_MS) stamps.shift();
    paths.set(url.pathname, (paths.get(url.pathname) ?? 0) + 1);
    if (stamps.length > LIMIT) {
      strikes++;
      const pause = Math.min(MAX_PAUSE_MS, WINDOW_MS * 2 ** (strikes - 1));
      pausedUntil = now + pause;
      const top = [...paths].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => `${p} ×${n}`);
      captureError(new Error(`Request loop on ${location.pathname}: over ${LIMIT} requests in a minute, reads paused ${Math.round(pause / 1000)} s. Top: ${top.join(', ')}`), 'manual', { top, strikes });
      stamps = [];
      paths.clear();
    }
    return realFetch(input, init);
  };
}
