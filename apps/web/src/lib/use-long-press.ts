'use client';

import { useRef, type MouseEvent, type PointerEvent } from 'react';
import { haptic } from './haptics';

// A press and hold (half a second, by finger) or a right-click opens something's menu (Phase E);
// the tap that ends a long press doesn't also open the thing itself. A finger that moves (a scroll
// or a drag) cancels it.

export function useLongPress<T>(onLong: (item: T) => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  return {
    /** The handlers to spread on the element. */
    bind: (item: T) => ({
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => { fired.current = true; haptic('tap'); onLong(item); }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); cancel(); fired.current = true; onLong(item); },
    }),
    /** Call first thing in onClick: true when the click is the end of a long press. */
    wasLong: () => { const f = fired.current; fired.current = false; return f; },
  };
}
