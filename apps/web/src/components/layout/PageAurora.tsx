'use client';

import { useEffect, useId, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { lowEndDevice } from '@/lib/page-transition';

// Glowing ribbons of light behind the top of every page (M1, like the "Relay" site the owner
// sent): three soft bands that drift and sway on slow loops and bloom in again on each new page.
// Only behind the title area, fading out before the frosted cards below, and paused once scrolled
// away: a moving background under frosted glass makes the browser redo each blur on every frame
// (see .ambient-bg in globals.css). Each ribbon is its own layer moved by transform only (the GPU).
// Still for Reduce Motion; nothing printed.

const RIBBONS = [
  { d: 'M-80 250 C 180 120, 420 330, 700 170 S 1180 40, 1500 150', w: 90, core: 2, cls: 'aurora-ribbon aurora-ribbon-1' },
  { d: 'M-120 320 C 220 230, 520 380, 820 240 S 1260 170, 1540 260', w: 70, core: 1.5, cls: 'aurora-ribbon aurora-ribbon-2' },
  { d: 'M-60 180 C 260 260, 560 90, 900 150 S 1300 300, 1520 210', w: 56, core: 1.2, cls: 'aurora-ribbon aurora-ribbon-3' },
];

export function PageAurora({ hero = false }: { hero?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const id = useId().replace(/:/g, '');

  // Paused while off screen (no work for a layer nobody sees).
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Low-end phones keep the light still.
    if (lowEndDevice()) { el.classList.add('aurora-paused'); return; }
    const io = new IntersectionObserver(([e]) => el.classList.toggle('aurora-paused', !e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Each new page: the light blooms in again.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof el.animate !== 'function' || document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0, transform: 'translate3d(0, -24px, 0) scale(1.08)' }, { opacity: 1, transform: 'none' }], { duration: 1400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }, [pathname]);

  return (
    <div aria-hidden data-no-motion className={hero ? 'page-aurora page-aurora-hero' : 'page-aurora'}>
      {/* The bloom moves this inner layer: the outer one keeps its own (lighter in light mode) opacity. */}
      <div ref={box} className="absolute inset-0">
      {RIBBONS.map((r, i) => (
        <svg key={i} className={r.cls} viewBox="0 0 1440 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${id}g${i}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--aurora-a)' }} stopOpacity="0" />
              <stop offset="0.35" style={{ stopColor: 'var(--aurora-a)' }} />
              <stop offset="0.7" style={{ stopColor: 'var(--aurora-b)' }} />
              <stop offset="1" style={{ stopColor: 'var(--aurora-c)' }} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* A wide faint band, a narrower brighter one and a thin bright core: a glow without a blur filter. */}
          <path d={r.d} fill="none" stroke={`url(#${id}g${i})`} strokeWidth={r.w} strokeLinecap="round" opacity="0.10" />
          <path d={r.d} fill="none" stroke={`url(#${id}g${i})`} strokeWidth={r.w * 0.35} strokeLinecap="round" opacity="0.18" />
          <path d={r.d} fill="none" stroke={`url(#${id}g${i})`} strokeWidth={r.core} strokeLinecap="round" opacity="0.9" />
        </svg>
      ))}
      </div>
    </div>
  );
}
