import { useEffect, useRef, type RefObject } from 'react';

/**
 * Ctrl / ⌘ + scroll (a trackpad pinch) over `ref` zooms what is there instead of the whole page (M86).
 * React's own onWheel listens passively, so calling preventDefault there can't stop the page zooming;
 * this listens on the element itself. `on`: false leaves pinches to the page.
 */
export function usePinchWheel(ref: RefObject<HTMLElement | null>, onPinch: (e: WheelEvent) => void, on = true) {
  const latest = useRef(onPinch);
  useEffect(() => { latest.current = onPinch; });
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); latest.current(e); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [ref, on]);
}
