'use client';

import { useSyncExternalStore } from 'react';
import { APPS, type AppId } from './apps';

// The app a visitor picked on the website's tabs or the sign-in page (src/lib/apps.ts), kept for this
// tab (sessionStorage) so signing in, signing up and finishing registration all open that app
// (homeFor in src/lib/role-home.ts reads it too).

const KEY = 'uv-app';
const subs = new Set<() => void>();
const read = (): AppId => {
  try {
    const q = new URLSearchParams(location.search).get('app');
    const v = (q && APPS.some((a) => a.id === q) ? q : sessionStorage.getItem(KEY)) as AppId | null;
    return v && APPS.some((a) => a.id === v) ? v : 'campus';
  } catch { return 'campus'; }
};
let current: AppId | null = null;

export function setChosenApp(id: AppId) {
  current = id;
  try { sessionStorage.setItem(KEY, id); } catch { /* private mode: kept in memory */ }
  subs.forEach((f) => f());
}

export function useChosenApp(): AppId {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => (current ??= read()),
    () => 'campus',
  );
}
