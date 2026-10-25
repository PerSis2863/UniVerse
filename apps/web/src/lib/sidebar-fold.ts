'use client';

import { useSyncExternalStore } from 'react';

// The folded menu (M33, from the owner's video "Fold the sidebar. Get a column back."): on a
// computer the side menu folds to a strip of icons and the page takes the room. The choice is kept
// on the device and set on <html data-sidebar="folded"> before the first paint (src/app/layout.tsx),
// so CSS sizes the menu and the page (--side-w in globals.css) without a jump.

const KEY = 'uv-sidebar';
const EVENT = 'uv-sidebar';
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };

export const useSidebarFolded = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.sidebar === 'folded', () => false);

export function setSidebarFolded(folded: boolean) {
  if (folded) document.documentElement.dataset.sidebar = 'folded';
  else delete document.documentElement.dataset.sidebar;
  try { localStorage.setItem(KEY, folded ? 'folded' : 'open'); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}
