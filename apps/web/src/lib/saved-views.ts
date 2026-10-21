'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

// Saved filters for a list ("Save view", Phase E): a few named sets of filters, kept on this device
// (like the other display choices in display-prefs.ts). Read with useSyncExternalStore so the
// server's first drawing (no views) and the browser's agree, and every list using the same key
// updates together.

export interface SavedView<T> { name: string; value: T }
const MAX_VIEWS = 8;
const EVENT = 'uv-saved-views';

const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const subscribe = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => { window.removeEventListener('storage', onChange); window.removeEventListener(EVENT, onChange); };
};

export function parseViews<T>(raw: string): SavedView<T>[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string' && x.name.trim() && 'value' in x).slice(0, MAX_VIEWS) : [];
  } catch { return []; }
}

/** Adds (or replaces, by name) a view; the newest first, at most 8. */
export function withView<T>(views: SavedView<T>[], name: string, value: T): SavedView<T>[] {
  const n = name.trim().slice(0, 40);
  return [{ name: n, value }, ...views.filter((v) => v.name.toLowerCase() !== n.toLowerCase())].slice(0, MAX_VIEWS);
}

export function useSavedViews<T>(key: string) {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => '');
  const views = useMemo(() => parseViews<T>(raw), [raw]);
  const write = useCallback((next: SavedView<T>[]) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode: not kept */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return {
    views,
    save: (name: string, value: T) => write(withView(views, name, value)),
    remove: (name: string) => write(views.filter((v) => v.name !== name)),
  };
}
