'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { haptic } from '@/lib/haptics';

const THRESHOLD = 70; // px of pull (after resistance) that refreshes
const MAX = 110;

/** Inside a dialog, sheet, text field or a scroller that isn't at its top: the pull is theirs. */
function claimed(target: EventTarget | null) {
  let el = target instanceof Element ? target : null;
  if (el?.closest('[role="dialog"], [data-sheet], input, textarea, select, [contenteditable="true"]')) return true;
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

/**
 * Pull down at the top of a page to refresh it, in the installed app (an installed web app on
 * iPhone or Android has no pull-to-refresh of its own; in a browser tab the browser's is used).
 * It reloads the page's data in place (every list, then the page itself) without a full reload,
 * so it's quick and nothing flashes. A two-tone ring follows the finger and spins while it works.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!installed || !('ontouchstart' in window)) return;
    let startY = 0, tracking = false, dist = 0, frame = 0, armed = false;
    const show = (v: number) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setPull(v)); };

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1 || (document.scrollingElement?.scrollTop ?? 0) > 0 || claimed(e.target)) return;
      startY = e.touches[0].clientY;
      tracking = true; dist = 0; armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || (document.scrollingElement?.scrollTop ?? 0) > 0) { if (dist) { dist = 0; show(0); } return; }
      dist = Math.min(MAX, dy * 0.5); // resistance, like iOS
      if (!armed && dist >= THRESHOLD) { armed = true; haptic('tap'); }
      if (armed && dist < THRESHOLD) armed = false;
      show(dist);
    };
    const onEnd = async () => {
      if (!tracking) return;
      tracking = false;
      if (dist < THRESHOLD) { show(0); return; }
      busyRef.current = true;
      setBusy(true);
      show(56);
      try {
        // Every list on screen fetches again, and server parts of the page re-render.
        await Promise.all([mutate(() => true), new Promise((r) => setTimeout(r, 500))]);
        router.refresh();
      } finally {
        busyRef.current = false;
        setBusy(false);
        show(0);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [router]);

  if (!pull && !busy) return null;
  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div aria-hidden={!busy} role={busy ? 'status' : undefined} aria-label={busy ? 'Refreshing' : undefined}
      className="fixed left-1/2 z-[60] pointer-events-none"
      style={{ top: 'calc(var(--safe-top, 0px) + 0.5rem)', transform: `translate3d(-50%, ${pull - 44}px, 0)`, opacity: busy ? 1 : progress, transition: busy || pull === 0 ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease' : 'none' }}>
      <span className="ptr-ring block w-9 h-9 rounded-full p-[3px] shadow-lg shadow-fuchsia-500/20"
        style={{ transform: busy ? undefined : `rotate(${progress * 300}deg)`, animation: busy ? 'btn-spin 800ms linear infinite' : 'none' }}>
        <span className="block w-full h-full rounded-full bg-white dark:bg-[#121830]" />
      </span>
    </div>
  );
}
