'use client';

import { useSyncExternalStore } from 'react';
import { mutate } from 'swr';
import { authedFetch } from './authed-fetch';
import { isSampleMode } from './sample-mode';

// Live updates in the browser: one WebSocket per tab (see cloudflare/worker.ts). Server events make
// the matching SWR data refetch at once; while connected, chat and notifications don't poll.

type ServerEvent = { type: 'hello' } | { type: 'chat'; conversationId: string } | { type: 'notification' } | { type: 'refresh'; keys: string[] };

const startsWith = (prefix: string) => (key: unknown) => typeof key === 'string' && key.startsWith(prefix);

let connected = false;
const listeners = new Set<() => void>();
function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  listeners.forEach((l) => l());
}

/** True while live updates are connected (so polling can slow down). */
export function useRealtimeConnected() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connected,
    () => false,
  );
}

// Is someone actually using this tab? Visible, focused and touched in the last few minutes.
// Polling stops otherwise: a tab left open all day used to cost ~65,000 requests.
const IDLE_MS = 3 * 60_000;
let lastInput = Date.now();
let active = false;
const activeListeners = new Set<() => void>();
let tracking = false;

function computeActive() {
  return document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastInput < IDLE_MS;
}
function refreshActive() {
  const next = computeActive();
  if (next === active) return;
  active = next;
  activeListeners.forEach((l) => l());
  // Back after a break: catch up once instead of having polled all along.
  if (next) {
    void mutate(startsWith('/api/chat/'));
    void mutate('/api/notifications');
  }
}
function startTracking() {
  if (tracking || typeof window === 'undefined') return;
  tracking = true;
  active = computeActive();
  let last = 0;
  const onInput = () => {
    lastInput = Date.now();
    if (!active && Date.now() - last > 500) {
      last = Date.now();
      refreshActive();
    }
  };
  for (const e of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(e, onInput, { passive: true, capture: true });
  window.addEventListener('focus', () => {
    lastInput = Date.now();
    refreshActive();
  });
  window.addEventListener('blur', refreshActive);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastInput = Date.now();
    refreshActive();
  });
  setInterval(refreshActive, 15_000);
}

/** True while someone is using this tab. */
export function useUserActive() {
  return useSyncExternalStore(
    (l) => {
      startTracking();
      activeListeners.add(l);
      return () => activeListeners.delete(l);
    },
    () => active,
    () => false,
  );
}

/**
 * Polling interval for SWR: `normal` without live updates, `live` while connected (0 = rely on
 * live updates alone), and no polling at all while nobody is using the tab.
 */
export function useLiveInterval(normal: number, live: number) {
  const connected = useRealtimeConnected();
  return useUserActive() ? (connected ? live : normal) : 0;
}

function handle(event: ServerEvent) {
  switch (event.type) {
    case 'hello': // (re)connected: catch up on anything missed while offline
      void mutate(startsWith('/api/chat/'));
      void mutate('/api/notifications');
      break;
    case 'chat':
      void mutate('/api/chat/conversations');
      void mutate(startsWith(`/api/chat/conversations/${event.conversationId}/`));
      void mutate('/api/chat/incoming');
      break;
    case 'notification':
      void mutate('/api/notifications');
      break;
    case 'refresh':
      for (const k of event.keys) void mutate(k.endsWith('*') ? startsWith(k.slice(0, -1)) : k);
      break;
  }
}

/** Connects and keeps the connection up until the returned function is called. */
export function startRealtime(): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined' || isSampleMode()) return () => {};

  let ws: WebSocket | null = null;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let attempt = 0;

  const schedule = (ms: number) => {
    clearTimeout(retry);
    if (!stopped) retry = setTimeout(connect, ms);
  };

  async function connect() {
    if (stopped || ws || document.visibilityState === 'hidden') return;
    let path: string;
    try {
      const res = await authedFetch('/api/realtime/ticket', { method: 'POST' });
      if (res.status === 503 || res.status === 404) return schedule(5 * 60_000); // not available here; keep polling
      if (!res.ok) throw new Error(String(res.status));
      path = ((await res.json()) as { path: string }).path;
    } catch {
      return schedule(Math.min(30_000, 1000 * 2 ** attempt++));
    }
    if (stopped || ws) return;

    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`);
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      setConnected(true);
      clearInterval(ping);
      ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('ping'), 25_000);
    };
    socket.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        handle(JSON.parse(e.data) as ServerEvent);
      } catch {
        /* ignore malformed */
      }
    };
    socket.onclose = () => {
      if (ws === socket) ws = null;
      clearInterval(ping);
      setConnected(false);
      schedule(Math.min(30_000, 1000 * 2 ** attempt++));
    };
  }

  // Phones suspend background tabs: reconnect as soon as the tab is visible again.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !ws) {
      attempt = 0;
      schedule(0);
    }
  };
  const onOnline = () => onVisible();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  void connect();

  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(ping);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    ws?.close(1000);
    ws = null;
    setConnected(false);
  };
}
