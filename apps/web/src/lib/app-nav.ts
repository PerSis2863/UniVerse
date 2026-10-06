'use client';

import { startPageTransition } from './page-transition';

type Router = { back: () => void; push: (href: string) => void };

/**
 * Back, like an app: to the previous screen if there is one in the app, otherwise up to the home
 * screen (an installed app opened on an inner page has nothing to go back to). Slides like iOS.
 */
export function goBack(router: Router, fallback: string) {
  startPageTransition('pop');
  const nav = (window as Window & { navigation?: { canGoBack?: boolean } }).navigation;
  const can = typeof nav?.canGoBack === 'boolean' ? nav.canGoBack : window.history.length > 1;
  if (can) router.back();
  else router.push(fallback);
}
