'use client';

import { useSyncExternalStore } from 'react';

/** Whether a media query matches now, kept up to date; `server` while rendering on the server. */
export function useMedia(query: string, server = false): boolean {
  return useSyncExternalStore(
    (cb) => { const q = window.matchMedia(query); q.addEventListener('change', cb); return () => q.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => server,
  );
}
