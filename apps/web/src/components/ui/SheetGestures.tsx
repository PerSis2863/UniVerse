'use client';

import { useEffect } from 'react';
import { haptic } from '@/lib/haptics';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const CLOSE_DISTANCE = 110; // px
const CLOSE_VELOCITY = 0.55; // px per ms

function scrollParentWithin(el: HTMLElement | null, stop: HTMLElement): HTMLElement | null {
  for (let n = el; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    if (n === stop) break;
  }
  return null;
}

function findClose(panel: HTMLElement): HTMLElement | null {
  const labelled = panel.querySelector<HTMLElement>('[aria-label="Close" i], [aria-label="Cancel" i], [aria-label^="Close " i]');
  if (labelled) return labelled;
  const x = panel.querySelector('svg.lucide-x');
  return (x?.closest('button') as HTMLElement | null) ?? null;
}

/**
 * iOS-style swipe-down-to-dismiss for every dialog panel on phones (.sheet-in or [data-sheet]).
 * Mounted once; it drives the panel with transforms and closes it through the dialog's own
 * close button (or its backdrop), so each dialog keeps its normal close logic.
 */
export function SheetGestures() {
  useEffect(() => {
    let panel: HTMLElement | null = null;
    let backdrop: HTMLElement | null = null;
    let startY = 0, startX = 0, lastY = 0, lastT = 0, velocity = 0;
    let dragging = false, eligible = false;

    const reset = (animate: boolean) => {
      if (!panel) return;
      panel.style.transition = animate ? `transform 320ms ${EASE}` : '';
      panel.style.transform = '';
      if (backdrop) { backdrop.style.transition = animate ? `background-color 320ms ${EASE}` : ''; backdrop.style.opacity = ''; }
      const p = panel;
      if (animate) setTimeout(() => { p.style.transition = ''; }, 340);
    };

    const onStart = (e: TouchEvent) => {
      if (window.innerWidth >= 640 || e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      const p = target.closest<HTMLElement>('.sheet-in, [data-sheet]');
      if (!p || target.closest('input, textarea, select, canvas, [contenteditable], [data-no-swipe]')) return;
      const t = e.touches[0];
      const nearTop = t.clientY - p.getBoundingClientRect().top < 64;
      const scroller = scrollParentWithin(target, p);
      eligible = nearTop || !scroller || scroller.scrollTop <= 0;
      if (!eligible) return;
      panel = p;
      backdrop = p.parentElement;
      startY = lastY = t.clientY;
      startX = t.clientX;
      lastT = e.timeStamp;
      velocity = 0;
      dragging = false;
      // Only listen non-passively while a finger is on a sheet, so normal page scrolling stays fully smooth.
      document.addEventListener('touchmove', onMove, { passive: false });
    };

    const onMove = (e: TouchEvent) => {
      if (!panel || !eligible) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = Math.abs(t.clientX - startX);
      if (!dragging) {
        if (dy < 8 || dx > dy) { if (dy < -4 || dx > 12) eligible = false; return; }
        dragging = true;
        panel.style.transition = 'none';
      }
      e.preventDefault(); // we own this gesture now, don't scroll the page
      const dt = Math.max(1, e.timeStamp - lastT);
      velocity = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastT = e.timeStamp;
      const y = Math.max(0, dy);
      panel.style.transform = `translate3d(0, ${y}px, 0)`;
      if (backdrop) backdrop.style.opacity = String(Math.max(0.35, 1 - y / 500));
    };

    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      if (!panel) return;
      const p = panel, b = backdrop;
      const dy = lastY - startY;
      if (!dragging) { panel = null; return; }
      dragging = false;
      if (dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        haptic('tap');
        p.style.transition = `transform 240ms ${EASE}`;
        p.style.transform = `translate3d(0, ${window.innerHeight}px, 0)`;
        if (b) { b.style.transition = `opacity 240ms ${EASE}`; b.style.opacity = '0'; }
        setTimeout(() => {
          const btn = findClose(p);
          if (btn) btn.click();
          else if (b) { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
          // If the dialog refused to close (e.g. while saving), bring it back.
          setTimeout(() => { if (p.isConnected) { panel = p; backdrop = b; reset(true); panel = null; } }, 120);
        }, 200);
      } else {
        reset(true);
      }
      panel = null;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return null;
}
