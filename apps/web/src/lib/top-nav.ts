'use client';

import { useMedia } from './use-media';

/** M219: where the menu is the bar across the top (TopNav) instead of the side menu: a computer's browser. The
 *  installed app (display-mode standalone or window-controls-overlay) and phones keep the side menu. The same
 *  query is the `topnav:` Tailwind variant in globals.css. */
export const TOP_NAV = '(min-width: 1024px) and (display-mode: browser)';

export const useTopNav = () => useMedia(TOP_NAV);
