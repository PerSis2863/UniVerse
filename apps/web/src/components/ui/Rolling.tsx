'use client';

import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/** A number that rolls to its new value (straight there with Reduce Motion). */
export function Rolling({ value, digits = 0, duration = 1.1 }: { value: number; digits?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const calm = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (v: number) => { shown.current = v; el.textContent = digits ? v.toFixed(digits) : Math.round(v).toLocaleString(); };
    if (calm) { show(value); return; }
    const c = animate(shown.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: show });
    return () => c.stop();
  }, [value, digits, duration, calm]);
  return <span ref={ref} className="tabular-nums">0</span>;
}
