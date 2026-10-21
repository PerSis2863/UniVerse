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
export type PageMotion = 'push' | 'pop' | 'fade' | 'tab' | 'shared';
// shared: list → detail with a title that glides into place (src/lib/shared-element.ts): the page
// only fades, so the gliding title lands where the page will stay.

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

export const reducedMotion = () => typeof window !== 'undefined' && (document.documentElement.classList.contains('reduce-motion') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Fast start, soft landing: the page is readable almost at once, then settles. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** UIKit's curve for the old page easing back. */
export const EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Arrivals: most of the way at once, then a long soft glide into place (AgentGPT's springs). */
export const EASE_GLIDE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** The old page as a tap leaves it: dims and drifts the way the new one will come from. */
export function leaveFrames(m: PageMotion): Keyframe[] {
  if (m === 'shared') return [{ opacity: 1 }, { opacity: 0.4 }];
  const to = m === 'push' ? 'translate3d(-18px, 0, 0)' : m === 'pop' ? 'translate3d(18px, 0, 0)' : m === 'tab' ? 'translate3d(0, 4px, 0)' : 'translate3d(0, 6px, 0) scale(0.996)';
  return [{ opacity: 1, transform: 'none' }, { opacity: m === 'tab' ? 0.35 : 0.4, transform: to }];
}

/** The new page coming in. */
export function enterFrames(m: PageMotion): Keyframe[] {
  // Never from fully transparent: the first frames would show an empty screen.
  if (m === 'shared') return [{ opacity: 0.3 }, { opacity: 1 }];
  const from = m === 'push' ? 'translate3d(56px, 0, 0)' : m === 'pop' ? 'translate3d(-56px, 0, 0)' : m === 'tab' ? 'translate3d(0, 16px, 0)' : 'translate3d(0, 20px, 0) scale(0.99)';
  return [{ opacity: 0.3, transform: from }, { opacity: 1, transform: 'none' }];
}

/**
 * The parts of an arriving page, in reading order, for its entrance one after another (like a page
 * assembling itself): the title, the tab bar, then each block of the content (the big content area
 * is split into its own blocks). Lists that already cascade (.stagger) and empty or hidden parts
 * are left to themselves. At most 10, the rest arrive with the last.
 */
export function revealParts(page: Element | null, m: PageMotion): Element[] {
  if (!page) return [];
  const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.width > 0; };
  const top = m === 'tab' ? movingParts(page) : Array.from(page.children);
  const parts: Element[] = [];
  for (const el of top.filter(shown)) {
    const big = el.children.length > 1 && el.getBoundingClientRect().height > window.innerHeight * 0.4 && !el.classList.contains('stagger');
    if (big) parts.push(...Array.from(el.children).filter(shown));
    else parts.push(el);
  }
  return parts.filter((el) => !el.classList.contains('stagger')).slice(0, 10);
}

/**
 * One part's entrance: the first (the title) is half there at once (never a blank screen) and
 * settles down into place; the rest rise in from below, far enough to see them glide.
 */
export function revealFrames(i: number): Keyframe[] {
  return [{ opacity: i === 0 ? 0.35 : 0, transform: i === 0 ? 'translate3d(0, -10px, 0)' : 'translate3d(0, 24px, 0)' }, { opacity: 1, transform: 'none' }];
}
export const REVEAL_MS = 560;
export const REVEAL_GAP_MS = 70;

/** Durations in ms: the old page goes quickly; the new one is readable at once and glides to rest. */
export const LEAVE_MS = 170;
export const enterMs = (m: PageMotion) => (m === 'tab' ? 420 : m === 'fade' ? 480 : 460);

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
