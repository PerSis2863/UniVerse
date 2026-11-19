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

/** M331 (the owner, 18 Nov 2026: "change it to how the apple maps look like as it is dark colours"): maps are drawn in
 *  Apple Maps' dark colours whatever the page's theme, unless Settings → Appearance → Maps says to match the page
 *  (`uv-map-look` = 'page', MAP_LOOK_EVENT on change). */
export const MAP_LOOK_EVENT = 'uv-map-look';
const mapLookPage = () => { try { return localStorage.getItem('uv-map-look') === 'page'; } catch { return false; } };
export function useMapDark() {
  const page = useDarkMode();
  const matchPage = useSyncExternalStore(
    (onChange) => { window.addEventListener(MAP_LOOK_EVENT, onChange); window.addEventListener('storage', onChange); return () => { window.removeEventListener(MAP_LOOK_EVENT, onChange); window.removeEventListener('storage', onChange); }; },
    mapLookPage,
    () => false,
  );
  return matchPage ? page : true;
}
