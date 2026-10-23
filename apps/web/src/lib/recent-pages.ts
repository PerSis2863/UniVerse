'use client';

import { useSyncExternalStore } from 'react';

// The pages someone opened last (M3: the app is big), shown at the top of the side menu so the
// ones they're working in are one tap away. Kept on this device only (localStorage), per person.

export type RecentPage = { path: string; title: string; at: number };
const KEY = 'universe-recent-pages';
const MAX = 6;
const listeners = new Set<() => void>();
let cache: RecentPage[] | null = null;

function read(): RecentPage[] {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentPage[]; } catch { cache = []; }
  if (!Array.isArray(cache)) cache = [];
  return cache;
}

/** Adds a page to the front of the list (once: opening it again moves it up). */
export function rememberPage(path: string, title: string, now = Date.now()) {
  if (typeof window === 'undefined' || !title || !path.startsWith('/')) return;
  const list = [{ path, title, at: now }, ...read().filter((p) => p.path !== path)].slice(0, MAX);
  cache = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: this visit only */ }
  listeners.forEach((l) => l());
}

/** Forgets the list (signing out). */
export function forgetRecentPages() {
  cache = [];
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const EMPTY: RecentPage[] = [];

/** The recent pages, newest first, without `except` (the page you're on). */
export function useRecentPages(except: string, count = 3): RecentPage[] {
  const all = useSyncExternalStore(subscribe, read, () => EMPTY);
  return all.filter((p) => p.path !== except).slice(0, count);
}
