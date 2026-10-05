import { startPageTransition } from './page-transition';

type Router = { push: (href: string) => void };

/**
 * Navigate with a View Transition so elements sharing a `view-transition-name`
 * (e.g. a course card and the Blackboard header) morph from one page to the next.
 * Falls back to a normal navigation where unsupported or with "Reduce motion".
 */
export function navigateWithTransition(router: Router, href: string) {
  // A tap on a link has already started the page transition (NavProgress); a call from code
  // starts one here. Elements sharing a view-transition-name morph within it either way.
  startPageTransition('push');
  router.push(href);
}

/** CSS-safe view-transition-name for a record id. */
export const vtName = (kind: string, id: string) => `${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
