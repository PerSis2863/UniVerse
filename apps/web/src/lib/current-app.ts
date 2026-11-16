'use client';

import { useSyncExternalStore } from 'react';
import { APPS, appFor, type AppId } from './apps';
import { shownOr, subscribeShown } from './shown-apps';

// The app someone is in, on any page (M179): the page's own app, otherwise the one they last used
// (shared pages such as Messages keep it: the side menu writes it, Sidebar.tsx), otherwise the one
// chosen on the website's tabs, otherwise UniVersity. Each app's Messages shows that app's chats.

export const LAST_APP = 'uv-last-app';
const valid = (v: string | null): v is AppId => !!v && APPS.some((a) => a.id === v);

/** The app now, outside React (when a chat is started). */
export function currentAppNow(path = typeof location === 'undefined' ? '/' : location.pathname): AppId {
  const here = appFor(path)?.id;
  if (here) return here;
  // M203: never an app the owner hides.
  try { const last = localStorage.getItem(LAST_APP); if (valid(last)) return shownOr(last); } catch { /* private mode */ }
  try { const chosen = sessionStorage.getItem('uv-app'); if (valid(chosen)) return shownOr(chosen); } catch { /* private mode */ }
  return shownOr('campus');
}

/** The same, kept up to date in a component (another tab changing app updates it too). */
export function useCurrentApp(): AppId {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('storage', cb); const off = subscribeShown(cb); return () => { window.removeEventListener('storage', cb); off(); }; },
    () => currentAppNow(),
    () => 'campus',
  );
}
