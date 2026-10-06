'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { haptic } from '@/lib/haptics';

// The iPhone's edge swipe to go back, for the installed app (an installed web app on iOS has no
// back gesture of its own; Android has its system back). Drag from the left edge: the page follows
// the finger with a shadow, and letting go past a third of the screen (or with a flick) goes back.

const EDGE = 24;

/** Inside a dialog, sheet or text field: the touch is theirs. */
const claimed = (t: EventTarget | null) => t instanceof Element && !!t.closest('[role="dialog"], [data-sheet], input, textarea, select, [contenteditable="true"]');

export function SwipeBack({ enabled, pathname, onBack }: { enabled: boolean; pathname: string; onBack: () => void }) {
  const back = useRef(onBack);
  useEffect(() => { back.current = onBack; }, [onBack]);
  const leaving = useRef(false);

  // The previous page is on screen: put the page area back (before paint, so it never flashes).
  useLayoutEffect(() => {
    if (!leaving.current) return;
    leaving.current = false;
    const stage = document.querySelector<HTMLElement>('.page-stage');
    if (stage) { stage.style.transition = ''; stage.style.transform = ''; stage.style.boxShadow = ''; }
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & { standalone?: boolean };
    const iosApp = nav.standalone === true || (window.matchMedia('(display-mode: standalone)').matches && /iP(hone|ad|od)/.test(navigator.userAgent));
    if (!iosApp) return;
    let startX = 0, startY = 0, dx = 0, t0 = 0, tracking = false, decided = false;
    let stage: HTMLElement | null = null;
    const reset = () => {
      if (!stage) return;
      const s = stage;
      s.style.transition = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 260ms ease';
      s.style.transform = 'translate3d(0, 0, 0)';
      s.style.boxShadow = '';
      setTimeout(() => { if (!leaving.current) { s.style.transition = ''; s.style.transform = ''; } }, 280);
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || leaving.current) return;
      const t = e.touches[0];
      if (t.clientX > EDGE || claimed(e.target)) return;
      startX = t.clientX; startY = t.clientY; dx = 0; t0 = performance.now();
      tracking = true; decided = false;
      stage = document.querySelector<HTMLElement>('.page-stage');
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking || !stage) return;
      const t = e.touches[0];
      const mx = t.clientX - startX, my = t.clientY - startY;
      if (!decided) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { tracking = false; return; }
        if (mx < 8) return;
        decided = true;
      }
      e.preventDefault(); // a sideways drag: the page shouldn't scroll meanwhile
      dx = Math.max(0, mx);
      stage.style.transition = 'none';
      stage.style.transform = `translate3d(${dx}px, 0, 0)`;
      stage.style.boxShadow = '-14px 0 32px -16px rgba(0, 0, 0, 0.45)';
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!decided || !stage) return;
      const speed = dx / Math.max(1, performance.now() - t0);
      if (dx > window.innerWidth * 0.33 || (speed > 0.6 && dx > 40)) {
        leaving.current = true;
        haptic('tap');
        const s = stage;
        s.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
        s.style.transform = `translate3d(${window.innerWidth}px, 0, 0)`;
        setTimeout(() => back.current(), 180);
        // If the previous page doesn't come (nothing to go back to), bring this one back.
        setTimeout(() => { if (leaving.current) { leaving.current = false; reset(); } }, 1200);
      } else {
        reset();
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  return null;
}
