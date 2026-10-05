'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePendingNav } from '@/lib/nav-pending';
import { EASE_IOS, EASE_OUT, LEAVE_MS, enterFrames, enterMs, leaveFrames, pageEntranceShown, pageMotion, reducedMotion } from '@/lib/page-transition';
import { PageSkeleton } from './PageSkeleton';

// Past this, a page that's still downloading shows its loading skeleton (pages open without
// prefetching, to keep requests low, so a first visit takes a moment on the free plan).
const SKELETON_AFTER = 260;

type Ref<T> = { current: T };

/** Runs one animation on the page area, replacing the one that was running. */
function animateStage(stage: Ref<HTMLDivElement | null>, running: Ref<Animation | null>, frames: Keyframe[], options: KeyframeAnimationOptions) {
  running.current?.cancel();
  running.current = null;
  const el = stage.current;
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return null;
  const a = el.animate(frames, options);
  running.current = a;
  a.onfinish = () => { if (running.current === a && !options.fill) running.current = null; };
  return a;
}

/**
 * The page area's transitions (src/lib/page-transition.ts), on every page change, including between
 * pages of the same portal:
 * - a tap on a link: the menus already highlight the new page; the old page eases back at once;
 * - if the new page takes more than a moment: a loading skeleton fades in (the old page stays
 *   mounted, only hidden, so it comes back as it was if the navigation is cancelled);
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
  const running = useRef<Animation | null>(null);
  const leave = useRef<Animation | null>(null);
  const shown = useRef(pathname);

  // A tap: the old page eases back now (once, even if another link is tapped meanwhile); the
  // skeleton follows if the new page is slow.
  useEffect(() => {
    if (!leaving) {
      // Cancelled (no new page): the old page comes back. If the new page arrived, its entrance
      // has already replaced this animation.
      if (leave.current && running.current === leave.current) { leave.current.cancel(); running.current = null; }
      leave.current = null;
      return;
    }
    if (!leave.current) leave.current = animateStage(stage, running, leaveFrames(pageMotion()), { duration: LEAVE_MS, easing: EASE_IOS, fill: 'forwards' });
    const t = setTimeout(() => setSkeletonOn(true), SKELETON_AFTER);
    return () => clearTimeout(t);
  }, [leaving, pending]);

  // The skeleton fades in from the top of the page, like the new page will be.
  useLayoutEffect(() => {
    if (!skeleton) return;
    window.scrollTo(0, 0);
    animateStage(stage, running, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }, [skeleton]);

  // The new page is on screen (before it's painted): it comes in.
  useLayoutEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    const m = pageMotion();
    pageEntranceShown();
    animateStage(stage, running, enterFrames(m), { duration: enterMs(m), easing: EASE_OUT });
  }, [pathname]);

  return (
    <div ref={stage} className="page-stage flex flex-col flex-1 min-w-0">
      <div className={skeleton ? 'hidden' : 'contents'}>{children}</div>
      {skeleton && <PageSkeleton />}
    </div>
  );
}
