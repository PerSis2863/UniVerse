'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders `children` only once this spot is near the screen (e.g. charts below the fold), so
 * their code and work don't slow down the first view. Shows `placeholder` until then.
 */
export function WhenVisible({ children, placeholder, margin = '200px', className }: { children: ReactNode; placeholder?: ReactNode; margin?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, margin]);
  return <div ref={ref} className={className}>{visible ? children : placeholder}</div>;
}
