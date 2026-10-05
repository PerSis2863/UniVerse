'use client';
import { authedFetch } from '@/lib/authed-fetch';

// Offline-first classroom (upgrade 4). Work done with no connection waits in this device's
// IndexedDB "outbox" and is sent by the page (which has the sign-in token) when the connection
// comes back, when the app starts, and after each success. Each item carries a client id the
// server dedupes on, so a retry after a dropped answer never saves twice. The same database
// keeps recent chats (read offline) and assignment drafts.

export type OutboxKind = 'quiz' | 'assignment' | 'message';
export interface OutboxItem {
  id: string; // also the client id the server dedupes on
  kind: OutboxKind;
  url: string;
  method: 'POST' | 'PUT';
  body: Record<string, unknown>;
  label: string; // shown to the student ("Quiz: Week 3 check")
  ref: string; // the quiz, assignment or conversation it belongs to
  createdAt: number;
  attempts: number;
  nextAt: number; // don't retry before this (backoff)
  error?: string | null; // the server refused it: kept until the student discards it
}
export interface OutboxEvent { type: 'queued' | 'sent' | 'failed' | 'changed'; item?: OutboxItem; result?: unknown }

const DB = 'universe-offline';
const EVENT = 'universe:outbox';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chats')) d.createObjectStore('chats', { keyPath: 'conversationId' });
      if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const outboxSupported = () => typeof window !== 'undefined' && 'indexedDB' in window;
export const newClientId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
const emit = (e: OutboxEvent) => window.dispatchEvent(new CustomEvent<OutboxEvent>(EVENT, { detail: e }));

export function onOutbox(cb: (e: OutboxEvent) => void) {
  const h = (e: Event) => cb((e as CustomEvent<OutboxEvent>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** True when a failed request means "no connection" (worth queueing), not "the server said no". */
export function isOfflineError(e: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  // fetch() rejects with a TypeError when the request never reached the server.
  const x = e as { status?: number; response?: { status?: number } } | null;
  return e instanceof TypeError && !x?.status && !x?.response?.status;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  if (!outboxSupported()) return [];
  const all = ((await tx<OutboxItem[]>('outbox', 'readonly', (s) => s.getAll())) ?? []);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Queue an action and try to send it straight away. */
export async function enqueue(item: Pick<OutboxItem, 'id' | 'kind' | 'url' | 'method' | 'body' | 'label' | 'ref'>) {
  const full: OutboxItem = { ...item, createdAt: Date.now(), attempts: 0, nextAt: 0, error: null };
  await tx('outbox', 'readwrite', (s) => s.put(full));
  emit({ type: 'queued', item: full });
  void flushOutbox();
  return full;
}

export async function discard(id: string) {
  await tx('outbox', 'readwrite', (s) => s.delete(id));
  emit({ type: 'changed' });
}

/** Try a failed item again now. */
export async function retry(id: string) {
  const item = (await listOutbox()).find((x) => x.id === id);
  if (!item) return;
  await tx('outbox', 'readwrite', (s) => s.put({ ...item, error: null, nextAt: 0 }));
  void flushOutbox();
}

const backoff = (attempts: number) => Math.min(10 * 60_000, 5_000 * 2 ** Math.min(attempts, 8));
let running: Promise<void> | null = null;

/**
 * Send what's waiting, oldest first, one at a time. Stops at the first connection problem (the
 * rest would fail too) and retries it later with backoff. Only one tab sends at a time.
 */
export function flushOutbox(): Promise<void> {
  if (!outboxSupported() || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve();
  if (running) return running;
  const work = async () => {
    for (const item of await listOutbox()) {
      if (item.error || item.nextAt > Date.now()) continue;
      let res: Response;
      try {
        res = await authedFetch(item.url, { method: item.method, body: JSON.stringify(item.body) });
      } catch {
        await tx('outbox', 'readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1, nextAt: Date.now() + backoff(item.attempts) }));
        emit({ type: 'changed' });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await tx('outbox', 'readwrite', (s) => s.delete(item.id));
        emit({ type: 'sent', item, result: data });
      } else if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) {
        // Signed out for a moment, busy, or a server problem: try again later.
        await tx('outbox', 'readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1, nextAt: Date.now() + backoff(item.attempts) }));
        emit({ type: 'changed' });
        return;
      } else {
        const error = String((data as { error?: string; message?: string }).error || (data as { message?: string }).message || `Not accepted (${res.status})`).slice(0, 300);
        await tx('outbox', 'readwrite', (s) => s.put({ ...item, error }));
        emit({ type: 'failed', item: { ...item, error } });
      }
    }
  };
  const lock = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const sent: Promise<unknown> = lock ? lock.request('universe-outbox', { ifAvailable: true }, async (l) => { if (l) await work(); }) : work();
  running = sent
    .then(() => {}, () => {})
    .finally(() => { running = null; });
  return running;
}

// ── Recent chats, readable offline ───────────────────────────────────────────────────────────

export interface CachedChat<T = unknown> { conversationId: string; savedAt: number; data: T }
const MAX_CHATS = 20;

export async function cacheChat<T extends { messages: unknown[] }>(conversationId: string, data: T) {
  if (!outboxSupported()) return;
  const slim = { ...data, messages: data.messages.slice(-50) };
  await tx('chats', 'readwrite', (s) => s.put({ conversationId, savedAt: Date.now(), data: slim }));
  // Keep only the most recent chats.
  const all = ((await tx<CachedChat[]>('chats', 'readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.savedAt - a.savedAt);
  if (all.length > MAX_CHATS) await tx('chats', 'readwrite', (s) => { for (const c of all.slice(MAX_CHATS)) s.delete(c.conversationId); });
}

export async function cachedChat<T>(conversationId: string): Promise<CachedChat<T> | null> {
  if (!outboxSupported()) return null;
  return ((await tx<CachedChat<T>>('chats', 'readonly', (s) => s.get(conversationId))) ?? null);
}

// ── Drafts (assignment answers written on this device) ───────────────────────────────────────

export interface Draft { key: string; text: string; savedAt: number }

export async function saveDraft(key: string, text: string) {
  if (!outboxSupported()) return;
  await tx('drafts', 'readwrite', (s) => (text ? s.put({ key, text, savedAt: Date.now() }) : s.delete(key)));
}

export async function getDraft(key: string): Promise<Draft | null> {
  if (!outboxSupported()) return null;
  return ((await tx<Draft>('drafts', 'readonly', (s) => s.get(key))) ?? null);
}

/** Clears everything on sign-out (another person may use this device next). */
export async function clearOffline() {
  if (!outboxSupported()) return;
  const open = dbp;
  dbp = null;
  await open?.then((d) => d.close()).catch(() => {});
  await new Promise<void>((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}
