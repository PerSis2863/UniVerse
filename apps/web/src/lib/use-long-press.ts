'use client';

import { useRef, type MouseEvent, type PointerEvent } from 'react';
import { haptic } from './haptics';

// A press and hold (half a second, by finger) or a right-click opens something's menu (Phase E);
// the tap that ends a long press doesn't also open the thing itself. A finger that moves (a scroll
// or a drag) cancels it.

/**
 * The click that comes when the finger lifts would land on whatever the long press opened (a
 * sheet's backdrop, which then closes it): swallow that one click.
 */
function swallowNextClick() {
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); stop(); };
  // Only the click from this finger lifting (it comes right after): a tap after that goes through.
  const lifted = () => setTimeout(stop, 400);
  const stop = () => { window.removeEventListener('click', swallow, { capture: true }); window.removeEventListener('pointerup', lifted, { capture: true }); };
  window.addEventListener('click', swallow, { capture: true });
  window.addEventListener('pointerup', lifted, { capture: true, once: true });
}

export function useLongPress<T>(onLong: (item: T) => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  // Only the finger that started it ends it: phones also send a "mouse left" right after a touch
  // starts, which used to cancel every press.
  const end = (e: PointerEvent) => { if (start.current && e.pointerType === 'touch' && e.pointerId === start.current.id) cancel(); };
  return {
    /** The handlers to spread on the element. */
    bind: (item: T) => ({
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      timer.current = setTimeout(() => { fired.current = true; haptic('tap'); swallowNextClick(); onLong(item); }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current && e.pointerId === start.current.id && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    // No click follows a right-click (or the menu key), so nothing to swallow afterwards.
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); cancel(); onLong(item); },
    }),
    /** Call first thing in onClick: true when the click is the end of a long press. */
    wasLong: () => { const f = fired.current; fired.current = false; return f; },
  };
}
