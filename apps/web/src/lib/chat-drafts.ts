'use client';

import { useSyncExternalStore } from 'react';
import { authedFetch } from './authed-fetch';

// Drafts (Stage 4 · 1.4): what you were writing in a chat stays there when you switch chats or
// close the app, and follows you to your other devices. Every change is kept on this device at
// once; your account gets it a couple of seconds after you stop typing (PATCH …/prefs { draft }).
// When a chat opens, the newer of the two wins. Text '' marks a draft cleared at that time, so an
// older copy can't come back.

export interface Draft { text: string; at: number }

const KEY = 'universe:drafts';
const MAX_AGE_MS = 30 * 86_400_000;
const EMPTY: Record<string, Draft> = {};
let drafts: Record<string, Draft> | null = null;
const listeners = new Set<() => void>();
// The chat list hears about changes half a second after typing pauses, not on every key (it
// doesn't show the open chat's draft anyway, and reads the latest whenever it draws).
let tell: ReturnType<typeof setTimeout> | undefined;
const notify = () => { clearTimeout(tell); tell = setTimeout(() => listeners.forEach((l) => l()), 500); };

function all(): Record<string, Draft> {
  if (drafts) return drafts;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    drafts = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    drafts = {};
  }
  return drafts!;
}

/** This device's draft for a chat, if any. */
export function localDraft(conversationId: string): Draft | null {
  if (typeof window === 'undefined') return null;
  return all()[conversationId] ?? null;
}

/** Keeps a chat's draft on this device (and tells the chat list). */
export function keepDraft(conversationId: string, text: string) {
  const cur = all();
  if ((cur[conversationId]?.text ?? '') === text) return;
  const now = Date.now();
  const next: Record<string, Draft> = {};
  for (const [id, d] of Object.entries(cur)) if (now - d.at < MAX_AGE_MS && (d.text || now - d.at < 86_400_000)) next[id] = d;
  next[conversationId] = { text, at: now };
  drafts = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode or full: kept for this visit */ }
  notify();
}

/** Saves a chat's draft to the account (null or '' clears it). Quiet: a draft isn't worth an error. */
export function saveDraft(conversationId: string, text: string, opts: { keepalive?: boolean } = {}) {
  return authedFetch(`/api/chat/conversations/${conversationId}/prefs`, { method: 'PATCH', body: JSON.stringify({ draft: text.trim() ? text : null }), keepalive: opts.keepalive }).catch(() => undefined);
}

/** The draft to show: whichever of this device's and the account's is newer. */
export function pickDraft(local: Draft | null, account: { text?: string | null; at?: string | null }): string {
  const accountAt = account.at ? Date.parse(account.at) : 0;
  if (local && local.at >= accountAt) return local.text;
  return account.text ?? '';
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed them.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { drafts = null; onChange(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(onChange); window.removeEventListener('storage', onStorage); };
}

/** This device's drafts, for the chat list (updates as you type). */
export function useLocalDrafts(): Record<string, Draft> {
  return useSyncExternalStore(subscribe, all, () => EMPTY);
}
