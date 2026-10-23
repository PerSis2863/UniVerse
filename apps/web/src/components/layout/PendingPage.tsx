'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePendingNav } from '@/lib/nav-pending';
import { EASE_GLIDE, EASE_IOS, LEAVE_MS, REVEAL_GAP_MS, REVEAL_MS, enterFrames, enterMs, isTall, leaveFrames, movingParts, pageEntranceShown, pageMotion, reducedMotion, revealFrames, revealParts, calmFrames, lightFrames, sweepTitle } from '@/lib/page-transition';
import { PageSkeleton, skeletonFor } from './PageSkeleton';
import { ZOOM_MS, takeOrigin, zoomFrames } from '@/lib/tap-motion';

// Past this, a page that's still downloading shows its loading skeleton (pages open without
// prefetching, to keep requests low, so a first visit takes a moment on the free plan).
const SKELETON_AFTER = 180;

type Ref<T> = { current: T };

/** Runs one animation on each target, replacing what was running. Returns the new animations. */
function animate(running: Ref<Animation[]>, targets: Element[], frames: Keyframe[], options: KeyframeAnimationOptions) {
  for (const a of running.current) a.cancel();
  running.current = [];
  // "Reduce Motion": the page fades instead of sliding (like iOS), rather than changing with no motion.
  const calm = reducedMotion();
  const keyframes = calm ? calmFrames(frames) : lightFrames(frames);
  const timing = calm ? { ...options, duration: Math.min(Number(options.duration) || 200, 200) } : options;
  running.current = targets.filter((t) => typeof (t as HTMLElement).animate === 'function').map((t) => t.animate(keyframes, timing));
  return running.current;
}

/**
 * The page area's transitions (src/lib/page-transition.ts), on every page change, including between
 * pages of the same portal:
 * - a tap on a link: the menus and tabs already highlight the new page; the old page eases back;
 * - between pages of one tab bar (Overview ↔ Timetable, Chats ↔ Calls): the title and tab bar stay
 *   put and only the content under them changes, so the tab highlight glides without a flicker;
 * - otherwise, if the new page takes more than a moment: a loading skeleton fades in (the old page
 *   stays mounted, only hidden, so it comes back as it was if the navigation is cancelled);
 * - the new page arrives: it rises in (sections), slides in from the right (deeper) or from the
 *   left (back).
 * Transform and opacity only, with nothing left behind once an animation ends, so position:fixed
 * pop-ups inside pages keep positioning against the screen. "Reduce motion" skips the movement.
 */
export function PendingPage({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pending = usePendingNav();
  const leaving = !!pending && pending !== pathname;
  const [skeletonOn, setSkeletonOn] = useState(false);
  // Once the tap is over (page arrived, or cancelled), the skeleton is done.
  if (!leaving && skeletonOn) setSkeletonOn(false);
  const skeleton = leaving && skeletonOn;
  const stage = useRef<HTMLDivElement>(null);
  const skeletonBox = useRef<HTMLDivElement>(null);
  // A copy of the loading skeleton, kept to fade out behind the page that replaces it.
  const skeletonCopy = useRef<HTMLElement | null>(null);
  const running = useRef<Animation[]>([]);
  const leave = useRef<Animation[] | null>(null);
  const shown = useRef(pathname);

  const page = () => stage.current?.querySelector('[data-page-path]') ?? stage.current;
  const targets = (m: string) => (m === 'tab' ? movingParts(page()) : stage.current ? [stage.current] : []);

  // A tap: the old page (or, between tabs, its content) eases back now, once even if another link
  // is tapped meanwhile; the skeleton follows if the new page is slow (not between tabs: the tab
  // bar stays and the dimmed content is the cue).
  useEffect(() => {
    if (!leaving) {
      skeletonCopy.current = null;
      // Cancelled (no new page): the old page comes back. If the new page arrived, its entrance
      // has already replaced these animations.
      if (leave.current && leave.current.length && running.current[0] === leave.current[0]) { for (const a of leave.current) a.cancel(); running.current = []; }
      leave.current = null;
      return;
    }
    const m = pageMotion();
    if (!leave.current) leave.current = animate(running, targets(m), leaveFrames(m), { duration: LEAVE_MS, easing: EASE_IOS, fill: 'forwards' });
    if (m === 'tab') return;
    const t = setTimeout(() => setSkeletonOn(true), SKELETON_AFTER);
    return () => clearTimeout(t);
  }, [leaving, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  // The skeleton glides in the way the page will: its blocks rise into place one after another
  // (from half visible, so the screen never empties while the old page goes).
  useLayoutEffect(() => {
    if (!skeleton) return;
    skeletonCopy.current = (skeletonBox.current?.cloneNode(true) as HTMLElement | undefined) ?? null;
    window.scrollTo(0, 0);
    for (const a of running.current) a.cancel();
    const blocks = Array.from(skeletonBox.current?.firstElementChild?.children ?? []);
    const calm = reducedMotion();
    running.current = blocks.map((b, i) => b.animate(
      calm ? [{ opacity: 0.5 }, { opacity: 1 }] : [{ opacity: 0.45, transform: 'translate3d(0, 18px, 0)' }, { opacity: 1, transform: 'none' }],
      { duration: calm ? 200 : 460, delay: calm ? 0 : Math.min(i, 8) * 55, easing: EASE_GLIDE, fill: 'backwards' }));
  }, [skeleton]);

  // The new page is on screen (before it's painted): it comes in. Deeper and back slide the whole
  // page; otherwise it assembles itself: the title at once, then the tabs and each block of the
  // content rising in one after another (the way a well-made app's screen loads).
  useLayoutEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    const m = pageMotion();
    pageEntranceShown();
    // The page replaces its loading skeleton: the skeleton dissolves behind it while its parts come
    // in, so the screen doesn't empty for a frame in between.
    const copy = skeletonCopy.current;
    skeletonCopy.current = null;
    const area = stage.current?.getBoundingClientRect();
    if (copy && area && !reducedMotion()) {
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelector('.skeleton-in')?.classList.remove('skeleton-in'); // no second fade-in
      Object.assign(copy.style, { position: 'fixed', left: `${area.left}px`, top: `${area.top}px`, width: `${area.width}px`, zIndex: '-1', pointerEvents: 'none' });
      document.body.appendChild(copy);
      copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 60, easing: 'ease-out', fill: 'both' }).finished.then(() => copy.remove(), () => copy.remove());
    }
    // Opened from a card a moment ago (and no skeleton in between): the page grows out of it (M2).
    const from = m === 'push' ? takeOrigin(pathname) : null;
    if (from && !copy && stage.current && !reducedMotion()) {
      animate(running, [stage.current], zoomFrames(from, stage.current.getBoundingClientRect()), { duration: ZOOM_MS, easing: EASE_GLIDE });
      return;
    }
    if (m === 'push' || m === 'pop' || m === 'shared' || reducedMotion()) {
      animate(running, targets(m), enterFrames(m), { duration: enterMs(m), easing: EASE_GLIDE });
      return;
    }
    for (const a of running.current) a.cancel();
    running.current = revealParts(page(), m).filter((t) => typeof (t as HTMLElement).animate === 'function')
      .map((t, i) => t.animate(lightFrames(revealFrames(i, isTall(t))), { duration: REVEAL_MS, delay: Math.min(i, 8) * REVEAL_GAP_MS, easing: EASE_GLIDE, fill: 'backwards' }));
    // The page's title sweeps in (not between tabs: the title stays put there).
    if (m !== 'tab') sweepTitle(page());
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data arriving where a loading placeholder was: what replaces it fades in where it stood (one
  // after another for a list), instead of popping in. Watches for placeholders leaving the page.
  useEffect(() => {
    const root = stage.current;
    if (!root || typeof MutationObserver === 'undefined') return;
    const isPlaceholder = (n: Element) => n.classList.contains('skeleton') || n.matches('[aria-busy="true"], [role="status"][aria-label="Loading"]')
      || (n.childElementCount === 1 && !!n.firstElementChild?.matches('svg.animate-spin')) // a box with just a spinner
      || (n.childElementCount > 0 && n.childElementCount < 40 && !!n.querySelector(':scope > .skeleton, :scope > * > .skeleton'));
    const observer = new MutationObserver((records) => {
      if (reducedMotion()) return;
      let placeholderLeft = false;
      const added: HTMLElement[] = [];
      for (const r of records) {
        r.removedNodes.forEach((n) => { if (!placeholderLeft && n instanceof Element && isPlaceholder(n)) placeholderLeft = true; });
        r.addedNodes.forEach((n) => { if (n instanceof HTMLElement) added.push(n); });
      }
      if (!placeholderLeft) return;
      added.filter((n) => n.isConnected && !isPlaceholder(n) && !n.matches('[data-page-path]') && !n.querySelector('[data-page-path]') && n.getBoundingClientRect().height > 0).slice(0, 12)
        .forEach((n, i) => {
          // Something as big as the screen comes in from half visible (never a blank screen).
          const big = n.getBoundingClientRect().height > window.innerHeight * 0.5;
          n.animate(big ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate3d(0, 16px, 0)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: Math.min(i, 8) * 60, easing: EASE_GLIDE, fill: 'backwards' });
        });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={stage} className="page-stage flex flex-col flex-1 min-w-0">
      <div className={skeleton ? 'hidden' : 'contents'}>{children}</div>
      {skeleton && <div ref={skeletonBox} aria-busy="true" className="flex flex-col flex-1 min-w-0"><PageSkeleton variant={skeletonFor(pending ?? pathname)} /></div>}
    </div>
  );
}
