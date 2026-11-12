import { flushSync } from 'react-dom';
import { setPendingNav } from './nav-pending';
import { SPRING_GLIDE, startPageTransition } from './page-transition';

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

/**
 * M156: changes a list in place and slides each item to its new spot (FLIP: measure, change, then play
 * the difference as one transform per item with the Web Animations API, which the compositor runs; new
 * items grow in from 0.94). Only the list's own items move: unlike a View Transition, nothing else on a
 * heavy page (live maps) is snapshotted. Items carry `data-key`. Instant with Reduce Motion.
 */
export function morph(list: HTMLElement | null, update: () => void) {
  if (!list || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return; }
  const items = () => Array.from(list.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.key);
  const before = new Map(items().map((el) => [el.dataset.key!, el.getBoundingClientRect()]));
  flushSync(update);
  for (const el of items()) {
    const was = before.get(el.dataset.key!), now = el.getBoundingClientRect();
    const frames = was
      ? (Math.abs(was.left - now.left) + Math.abs(was.top - now.top) < 1 ? null : [{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }])
      : [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }];
    if (!frames) continue;
    try { el.animate(frames, { duration: was ? 420 : 320, easing: SPRING_GLIDE }); }
    catch { el.animate(frames, { duration: was ? 420 : 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); } // browsers without linear()
  }
}
