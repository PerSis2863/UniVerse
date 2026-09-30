'use client';

import { useSyncExternalStore } from 'react';

// The page a tap is opening, from the tap until the page is shown. Menus highlight it at once and
// the content area shows a loading skeleton, instead of the old page sitting still while the new
// one downloads. Set by NavProgress (which sees every tap on an internal link).

let pending: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setPendingNav(path: string | null) {
  if (pending === path) return;
  pending = path;
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** The pathname a tap is opening, or null. */
export function usePendingNav() {
  return useSyncExternalStore(subscribe, () => pending, () => null);
}

/** `pathname`, or the page being opened while a tap is pending: for highlighting menus right away. */
export function useOptimisticPath(pathname: string) {
  return usePendingNav() ?? pathname;
}
