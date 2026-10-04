'use client';

import { useSyncExternalStore } from 'react';
import { mutate } from 'swr';
import { authedFetch } from './authed-fetch';
import { isSampleMode } from './sample-mode';
import { bootstrapTicket } from './bootstrap';
import { useLowData } from '@/store/low-data';

// Live updates in the browser: one WebSocket per tab (see cloudflare/worker.ts). Server events make
// the matching SWR data refetch at once; while connected, chat and notifications don't poll.

type ServerEvent = { type: 'hello' } | { type: 'chat'; conversationId: string; call?: boolean } | { type: 'typing'; conversationId: string; name: string } | { type: 'notification' } | { type: 'refresh'; keys: string[] };

// Who is typing in each chat, from live 'typing' events (shown for 6 seconds, like the server's
// own record). Kept here instead of refetching the whole chat for every "typing…".
const TYPING_MS = 6000;
const typingNow = new Map<string, Map<string, number>>(); // conversationId → name → until
const typingListeners = new Set<() => void>();
const typingSnapshots = new Map<string, string[]>();
const EMPTY: string[] = [];
function typingChanged(conversationId: string) {
  const until = typingNow.get(conversationId);
  const now = Date.now();
  const names = until ? [...until].filter(([, t]) => t > now).map(([n]) => n) : [];
  typingSnapshots.set(conversationId, names.length ? names : EMPTY);
  typingListeners.forEach((l) => l());
}
function noteTyping(conversationId: string, name: string) {
  const until = typingNow.get(conversationId) ?? new Map<string, number>();
  until.set(name, Date.now() + TYPING_MS);
  typingNow.set(conversationId, until);
  typingChanged(conversationId);
  setTimeout(() => typingChanged(conversationId), TYPING_MS + 50);
}
/** First names of people typing in this chat right now (live updates only). */
export function useLiveTyping(conversationId: string): string[] {
  return useSyncExternalStore(
    (l) => { typingListeners.add(l); return () => typingListeners.delete(l); },
    () => typingSnapshots.get(conversationId) ?? EMPTY,
    () => EMPTY,
  );
}

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
  const lowData = useLowData((st) => st.enabled); // low-data mode: poll a third as often
  const ms = connected ? live : normal;
  return useUserActive() ? (lowData && ms ? ms * 3 : ms) : 0;
}

let helloCount = 0;

function handle(event: ServerEvent) {
  switch (event.type) {
    case 'hello': // reconnected: catch up on anything missed while disconnected
      // (not on the first connection of the page: that data was just loaded)
      if (helloCount++ === 0) break;
      void mutate(startsWith('/api/chat/'));
      void mutate('/api/notifications');
      break;
    case 'chat':
      void mutate('/api/chat/conversations');
      void mutate('/api/calls'); // a call started or ended (only refetches if the Calls page is open)
      void mutate(startsWith(`/api/chat/conversations/${event.conversationId}/`));
      // Only a new call can change the ringing card (other chat events used to refetch it too).
      if (event.call) void mutate('/api/chat/incoming');
      break;
    case 'typing':
      noteTyping(event.conversationId, event.name);
      break;
    case 'notification':
      void mutate('/api/notifications');
      // Application decisions and new applications arrive as notifications.
      void mutate(startsWith('/applications'));
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
  let openedAt = 0;
  // Each attempt costs two requests (ticket + connection), so retries back off (1 s … 5 min, with
  // jitter) and stop after MAX_ATTEMPTS failures in a row until the tab is used again. The counter
  // only resets once a connection has stayed up for a while: a connection that opens and drops at
  // once used to reset it and retry every second, forever.
  const MAX_ATTEMPTS = 8;
  const STABLE_MS = 60_000;
  const backoff = () => Math.min(5 * 60_000, 1000 * 2 ** attempt++) * (0.8 + Math.random() * 0.4);

  const schedule = (ms: number) => {
    clearTimeout(retry);
    if (stopped) return;
    if (attempt > MAX_ATTEMPTS) return; // give up for now; polling covers it; onVisible restarts
    retry = setTimeout(connect, ms);
  };

  async function connect() {
    if (stopped || ws || document.visibilityState === 'hidden') return;
    let path: string;
    try {
      const fromBoot = await bootstrapTicket(); // the first connection uses the startup bundle's ticket
      if (fromBoot) path = fromBoot;
      else {
        const res = await authedFetch('/api/realtime/ticket', { method: 'POST' });
        if (res.status === 503 || res.status === 404) return schedule(5 * 60_000); // not available here; keep polling
        if (!res.ok) throw new Error(String(res.status));
        path = ((await res.json()) as { path: string }).path;
      }
    } catch {
      return schedule(backoff());
    }
    if (stopped || ws) return;

    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`);
    ws = socket;
    socket.onopen = () => {
      openedAt = Date.now();
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
      if (openedAt && Date.now() - openedAt > STABLE_MS) attempt = 0; // it was working: retry soon
      openedAt = 0;
      schedule(backoff());
    };
  }

  // Phones suspend background tabs: reconnect as soon as the tab is visible again.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !ws) {
      attempt = Math.min(attempt, 3); // someone is here: try again, without restarting the backoff
      schedule(500);
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
