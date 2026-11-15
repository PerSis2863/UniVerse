'use client';

import { useSyncExternalStore } from 'react';
import { APPS, type AppId } from './apps';
import { shownOr, subscribeShown } from './shown-apps';

// The app a visitor picked on the website's tabs or the sign-in page (src/lib/apps.ts), kept for this
// tab (sessionStorage) so signing in, signing up and finishing registration all open that app
// (homeFor in src/lib/role-home.ts reads it too).

const KEY = 'uv-app';
const subs = new Set<() => void>();
const read = (): AppId => {
  try {
    const q = new URLSearchParams(location.search).get('app');
    const v = (q && APPS.some((a) => a.id === q) ? q : sessionStorage.getItem(KEY)) as AppId | null;
    // M203: an app the owner hides gives way to a shown one.
    return shownOr(v && APPS.some((a) => a.id === v) ? v : 'campus');
  } catch { return shownOr('campus'); }
};
let current: AppId | null = null;

export function setChosenApp(id: AppId) {
  current = shownOr(id);
  try { sessionStorage.setItem(KEY, current); } catch { /* private mode: kept in memory */ }
  subs.forEach((f) => f());
}

export function useChosenApp(): AppId {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); const off = subscribeShown(cb); return () => { subs.delete(cb); off(); }; },
    () => shownOr(current ??= read()),
    () => 'campus',
  );
}
