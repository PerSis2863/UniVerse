import { reducedMotion } from './page-transition';

// Motion that answers a tap (M2), like iOS:
// - a tab bar or side menu icon gives a short spring bounce when tapped (SF Symbols' "bounce");
// - a card that opens a page is remembered for a moment, so the page can grow out of it
//   (iOS 18's zoom transition; PendingPage plays it with zoomFrames).
// One listener for the whole app; nothing for Reduce Motion.

const NAV_ICON = '.ios-tabbar :is(a, button), aside[aria-label="Navigation"] a';
const CARD = '.panel, .card, .card-hover, [class*="rounded-2xl"], [class*="rounded-3xl"], [class*="rounded-xl"], li';

type Origin = { rect: DOMRect; path: string; at: number };
let origin: Origin | null = null;

/** The springy bounce of a tapped icon: squash, overshoot, settle. */
export const BOUNCE: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(0.8)', offset: 0.25 },
  { transform: 'scale(1.16)', offset: 0.6 },
  { transform: 'scale(0.97)', offset: 0.82 },
  { transform: 'scale(1)' },
];

const pathOf = (href: string) => { try { return new URL(href, location.href).pathname; } catch { return ''; } };

/** The card the person tapped to open `path`, if it was a moment ago (then forgotten). */
export function takeOrigin(path: string, now = Date.now()): DOMRect | null {
  const o = origin;
  origin = null;
  return o && o.path === path && now - o.at < 1500 ? o.rect : null;
}

/**
 * The new page opening out of the tapped card: a window that starts as the card's outline (its
 * corners rounded like it) and widens to the page, while the content settles from a little smaller.
 * `rect` and `stage` are in screen coordinates.
 */
export function zoomFrames(rect: DOMRect, stage: DOMRect, radius = 18): Keyframe[] {
  const top = Math.max(0, rect.top - stage.top), left = Math.max(0, rect.left - stage.left);
  const right = Math.max(0, stage.right - rect.right), bottom = Math.max(0, stage.bottom - rect.bottom);
  const ox = rect.left + rect.width / 2 - stage.left, oy = rect.top + rect.height / 2 - stage.top;
  return [
    { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`, transform: 'scale(0.94)', transformOrigin: `${ox}px ${oy}px`, opacity: 0.6 },
    { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'none', transformOrigin: `${ox}px ${oy}px`, opacity: 1 },
  ];
}
export const ZOOM_MS = 560;

/** Starts the tap motion for the whole app (once). Returns a stop function. */
export function startTapMotion(): () => void {
  if (typeof window === 'undefined') return () => {};
  const tap = (e: Event) => {
    if (reducedMotion()) return;
    const target = e.target as Element | null;
    const icon = target?.closest?.(NAV_ICON)?.querySelector('svg');
    if (icon && typeof icon.animate === 'function') icon.animate(BOUNCE, { duration: 460, easing: 'ease-out' });
    // A link inside a page (not the menus): remember the card it sits in.
    const link = target?.closest?.('main a[href]') as HTMLAnchorElement | null;
    if (!link || link.target === '_blank') return;
    const card = (link.matches(CARD) ? link : link.closest(CARD)) ?? link;
    const rect = card.getBoundingClientRect();
    // Only something card-sized: not a word in a sentence, not a whole-page wrapper.
    if (rect.width < 120 || rect.height < 48 || rect.height > window.innerHeight * 0.8) return;
    origin = { rect, path: pathOf(link.href), at: Date.now() };
  };
  document.addEventListener('click', tap, { capture: true, passive: true });
  return () => document.removeEventListener('click', tap, { capture: true });
}
