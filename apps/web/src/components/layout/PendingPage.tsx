'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePendingNav } from '@/lib/nav-pending';
import { EASE_IOS, EASE_OUT, LEAVE_MS, enterFrames, enterMs, leaveFrames, movingParts, pageEntranceShown, pageMotion, reducedMotion } from '@/lib/page-transition';
import { PageSkeleton } from './PageSkeleton';

// Past this, a page that's still downloading shows its loading skeleton (pages open without
// prefetching, to keep requests low, so a first visit takes a moment on the free plan).
const SKELETON_AFTER = 260;

type Ref<T> = { current: T };

/** Runs one animation on each target, replacing what was running. Returns the new animations. */
function animate(running: Ref<Animation[]>, targets: Element[], frames: Keyframe[], options: KeyframeAnimationOptions) {
  for (const a of running.current) a.cancel();
  running.current = [];
  if (reducedMotion()) return [];
  running.current = targets.filter((t) => typeof (t as HTMLElement).animate === 'function').map((t) => t.animate(frames, options));
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

  // The skeleton fades in from the top of the page, like the new page will be.
  useLayoutEffect(() => {
    if (!skeleton) return;
    window.scrollTo(0, 0);
    animate(running, stage.current ? [stage.current] : [], [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }, [skeleton]);

  // The new page is on screen (before it's painted): it comes in.
  useLayoutEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    const m = pageMotion();
    pageEntranceShown();
    animate(running, targets(m), enterFrames(m), { duration: enterMs(m), easing: EASE_OUT });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={stage} className="page-stage flex flex-col flex-1 min-w-0">
      <div className={skeleton ? 'hidden' : 'contents'}>{children}</div>
      {skeleton && <PageSkeleton />}
    </div>
  );
}
