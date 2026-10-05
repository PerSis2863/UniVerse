'use client';

// Page transitions with an iOS feel: switching sections (menus, tabs, the tab bar) eases the old
// page back and rises the new one in; opening something deeper slides in from the right; going back
// slides in from the left. They run on the live page (src/components/layout/PendingPage.tsx), with
// the Web Animations API on transform and opacity only, so they stay smooth and never block input.
//
// (They used to be View Transitions. Those freeze the whole screen while the next page loads, up to
// 300 ms here, so a tap looked dead, the sidebar highlight slid while nobody could see it, and the
// page then jumped. Templates also don't re-mount between pages of the same portal, so their CSS
// entrance didn't play there either.)

/** tab: between pages of one tab bar (Overview ↔ Timetable, Chats ↔ Calls): the title and tabs stay
 *  still, the highlight glides, and only the content under them changes. */
export type PageMotion = 'push' | 'pop' | 'fade' | 'tab';

let nextMotion: PageMotion = 'fade';

const depth = (path: string) => path.split('/').filter(Boolean).length;

/** The motion for going from one page to another: a hint from the link, or deeper/shallower/sideways. */
export function motionFor(from: string, to: string, hint?: string | null): PageMotion {
  if (hint === 'push' || hint === 'pop' || hint === 'fade' || hint === 'tab') return hint;
  const a = depth(from), b = depth(to);
  return b > a ? 'push' : b < a ? 'pop' : 'fade';
}

/** Remembers how the next page should move (on a tap on a link, or back/forward). */
export function startPageTransition(motion: PageMotion) {
  nextMotion = motion;
}

/** How the page that's arriving should move. */
export const pageMotion = () => nextMotion;

/** The arriving page has used its motion: later changes (e.g. a redirect) just fade. */
export function pageEntranceShown() {
  nextMotion = 'fade';
}

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fast start, soft landing: the page is readable almost at once, then settles. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** UIKit's curve for the old page easing back. */
export const EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** The old page as a tap leaves it: dims and drifts the way the new one will come from. */
export function leaveFrames(m: PageMotion): Keyframe[] {
  const to = m === 'push' ? 'translate3d(-18px, 0, 0)' : m === 'pop' ? 'translate3d(18px, 0, 0)' : m === 'tab' ? 'translate3d(0, 4px, 0)' : 'translate3d(0, 6px, 0) scale(0.996)';
  return [{ opacity: 1, transform: 'none' }, { opacity: m === 'tab' ? 0.35 : 0.4, transform: to }];
}

/** The new page coming in. */
export function enterFrames(m: PageMotion): Keyframe[] {
  const from = m === 'push' ? 'translate3d(36px, 0, 0)' : m === 'pop' ? 'translate3d(-36px, 0, 0)' : m === 'tab' ? 'translate3d(0, 8px, 0)' : 'translate3d(0, 10px, 0) scale(0.996)';
  return [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }];
}

/** Durations in ms: quick enough that the page's information is there almost at once. */
export const LEAVE_MS = 170;
export const enterMs = (m: PageMotion) => (m === 'tab' ? 260 : m === 'fade' ? 300 : 340);

/**
 * What moves in a 'tab' change: everything on the page except the steady tab bar ([data-steady],
 * SectionTabs) and its ancestors, so the tabs never flicker while the content swaps.
 */
export function movingParts(page: Element | null): Element[] {
  if (!page) return [];
  const steady = page.querySelector('[data-steady]');
  if (!steady) return [page];
  const parts: Element[] = [];
  for (let el: Element = steady; el !== page && el.parentElement; el = el.parentElement) {
    for (const sib of Array.from(el.parentElement.children)) if (sib !== el) parts.push(sib);
    if (el.parentElement === page) break;
  }
  return parts;
}
