'use client';

import { useSyncExternalStore } from 'react';
import { MENU_EVENT, menuPlace } from './display-prefs';
import { useMedia } from './use-media';

/** M219: where the menu is the bar across the top (TopNav) instead of the side menu: a computer's browser. The
 *  installed app (display-mode standalone or window-controls-overlay) and phones keep the side menu.
 *  M231: full screen counts as the browser (it fell back to the side menu), and Settings → Appearance can choose
 *  the top or the side on any computer (`menuPlace`). The same rule is the `topnav:` Tailwind variant in globals.css. */
export const WIDE = '(min-width: 1024px)';
export const IN_BROWSER = '(display-mode: browser), (display-mode: fullscreen)';
/** Kept for the checks: a computer's browser with the menu left on Automatic. */
export const TOP_NAV = `${WIDE} and (display-mode: browser), ${WIDE} and (display-mode: fullscreen)`;

const subscribe = (on: () => void) => { window.addEventListener(MENU_EVENT, on); window.addEventListener('storage', on); return () => { window.removeEventListener(MENU_EVENT, on); window.removeEventListener('storage', on); }; };

export function useTopNav() {
  const wide = useMedia(WIDE), browser = useMedia(IN_BROWSER);
  const place = useSyncExternalStore(subscribe, menuPlace, () => 'auto' as const);
  return wide && (place === 'top' || (place === 'auto' && browser));
}
