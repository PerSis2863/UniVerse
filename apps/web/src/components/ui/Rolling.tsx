'use client';

import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/** A number that rolls to its new value (straight there with Reduce Motion). */
export function Rolling({ value, digits = 0, duration = 1.1 }: { value: number; digits?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const calm = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (v: number) => { el.textContent = digits ? v.toFixed(digits) : Math.round(v).toLocaleString(); };
    if (calm) { show(value); return; }
    const from = Number(el.dataset.v) || 0;
    el.dataset.v = String(value);
    const c = animate(from, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: show });
    return () => c.stop();
  }, [value, digits, duration, calm]);
  return <span ref={ref} className="tabular-nums">0</span>;
}
