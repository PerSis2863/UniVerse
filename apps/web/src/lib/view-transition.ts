import { setPendingNav } from './nav-pending';
import { startPageTransition } from './page-transition';

type Router = { push: (href: string) => void };

/**
 * Opens a page from code (not a link) with the same transition as a tap on a link: the current page
 * eases back and the new one slides in from the right (src/lib/page-transition.ts).
 */
export function navigateWithTransition(router: Router, href: string) {
  startPageTransition('push');
  setPendingNav(new URL(href, window.location.href).pathname);
  router.push(href);
}

/** CSS-safe view-transition-name for a record id. */
export const vtName = (kind: string, id: string) => `${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
