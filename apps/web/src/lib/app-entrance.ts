'use client';

import { EASE_GLIDE, lightFrames, reducedMotion, revealParts, sweepTitle } from './page-transition';

// The app's entrance when it opens (a reload, a new tab, just signed in), choreographed the way
// AgentGPT's screen arrives: nothing snaps in; the page's blocks rise into place one after another
// (a big card opens out a little, like a window), the tab bar rises from below and, on a computer,
// the sidebar slides in, about 1.2 s in all. The start-up placeholder dissolves behind it (DashboardShell's
// .boot-cover). Web Animations on transform and opacity only, so it runs on the GPU even while the
// page is still busy loading, with nothing left behind afterwards.

let played = false;

/** Whether the entrance still has to play in this page load (once only). */
export const entrancePending = () => !played;

const rtl = () => document.documentElement.dir === 'rtl';

/** Plays the entrance on the shell's parts (call before the first paint, in a layout effect). */
export function playAppEntrance(shell: HTMLElement | null) {
  if (played || !shell) return;
  played = true;
  const calm = reducedMotion();
  const run = (el: Element | null | undefined, frames: Keyframe[], duration: number, delay = 0) => {
    if (!el || typeof (el as HTMLElement).animate !== 'function') return;
    // "Reduce Motion": a short fade instead of the movement.
    const keyframes = calm ? frames.map(({ opacity }) => ({ opacity })) : lightFrames(frames);
    el.animate(keyframes, { duration: calm ? 220 : duration, delay: calm ? 0 : delay, easing: EASE_GLIDE, fill: 'backwards' });
  };
  const desktop = window.matchMedia('(min-width: 1024px)').matches;

  // The phone's top bar stays put: the placeholder's bar already showed the same brand in the same
  // place. The sidebar (desktop) slides in from its edge. (nav/aside[aria-label]: not the
  // placeholder's look-alikes in .boot-cover, whose bars are hidden so nothing shows twice.)
  if (desktop) run(shell.querySelector('aside[aria-label="Navigation"]'), [{ opacity: 0, transform: `translate3d(${rtl() ? 32 : -32}px, 0, 0)` }, { opacity: 1, transform: 'none' }], 750);

  // The page: its blocks rise in, top to bottom; a block as tall as a third of the screen opens out
  // from its top edge instead (AgentGPT's window).
  const page = shell.querySelector('[data-page-path]') ?? shell.querySelector('.page-stage');
  revealParts(page, 'fade').forEach((part, i) => {
    const tall = part.getBoundingClientRect().height > window.innerHeight * 0.34;
    run(part, tall
      ? [{ opacity: 0, transform: 'translate3d(0, 40px, 0) scale(0.96, 0.9)', transformOrigin: '50% 0', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', transformOrigin: '50% 0', filter: 'blur(0)' }]
      : [{ opacity: 0, transform: 'translate3d(0, 48px, 0) scale(0.97)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    950, 120 + Math.min(i, 6) * 90);
  });
  // The page's title sweeps in out of a blur (M1).
  sweepTitle(page, 160);

  // The floating tab bar (phones) rises into place from below.
  run(shell.querySelector('nav.ios-tabbar'), [{ opacity: 0, transform: 'translate3d(0, 48px, 0)' }, { opacity: 1, transform: 'none' }], 700, 40);
}
