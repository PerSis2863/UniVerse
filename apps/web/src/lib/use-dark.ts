'use client';

import { useSyncExternalStore } from 'react';

/** Whether the site is in dark mode (a "dark" class on <html>), following the switch. */
export function useDarkMode() {
  return useSyncExternalStore(
    (onChange) => {
      const o = new MutationObserver(onChange);
      o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => o.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}
