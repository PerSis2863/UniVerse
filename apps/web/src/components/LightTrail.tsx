'use client';

import { useEffect, useId, useRef } from 'react';
import { lowEndDevice, reducedMotion } from '@/lib/page-transition';

// The light trail behind every page, website and app (M4, the owner's "purple line" from the Relay
// video): a bundle of fine purple strands with a soft glow, winding from the top of the page to the
// bottom. It is three viewport heights tall and slides up as the page scrolls, so the light travels
// down the page with the reader; the strands also sway slowly on their own. The cards in front are
// solid (no frosted glass to re-blur), and every move is a transform: the GPU does the work. Moved by
// the scroll itself where the browser can (CSS scroll timeline), else once a frame from a listener.
// Still for Reduce Motion and on low-memory phones; not printed.

// The path the light follows down the page (viewBox 1440 × 3000: three screens).
const PATH = 'M1560 -120 C1180 180 260 260 420 760 S1340 1220 1000 1660 S40 2140 380 2560 S1260 2980 1120 3160';
// Fine strands around it: an offset and a width each, like fibres in a bundle.
const STRANDS: [number, number, number, number][] = [
  [0, 0, 1.6, 0.95], [14, -10, 0.9, 0.7], [-16, 12, 0.8, 0.6], [30, 8, 0.6, 0.45],
  [-30, -6, 0.6, 0.4], [46, -18, 0.5, 0.3], [-44, 20, 0.5, 0.28], [62, 4, 0.4, 0.2],
];

export function LightTrail() {
  const box = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (reducedMotion() || lowEndDevice()) { el.classList.add('trail-still'); return; }
    // The CSS scroll timeline moves it where supported; otherwise follow the scroll here.
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) return;
    const track = el.querySelector<HTMLElement>('.trail-track');
    if (!track) return;
    let frame = 0;
    const move = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      track.style.transform = `translate3d(0, ${-(window.scrollY / max) * 200}vh, 0)`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(move); };
    move();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);

  const gradient = (key: string) => (
    <linearGradient id={`${id}${key}`} x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" style={{ stopColor: 'var(--trail-a)' }} stopOpacity="0" />
      <stop offset="0.12" style={{ stopColor: 'var(--trail-a)' }} />
      <stop offset="0.45" style={{ stopColor: 'var(--trail-b)' }} />
      <stop offset="0.75" style={{ stopColor: 'var(--trail-c)' }} />
      <stop offset="1" style={{ stopColor: 'var(--trail-a)' }} stopOpacity="0.2" />
    </linearGradient>
  );

  return (
    <div ref={box} aria-hidden data-no-motion className="light-trail">
      <div className="trail-track">
        {/* The glow: wide, faint bands (a glow without a blur filter). */}
        <svg className="trail-layer trail-glow" viewBox="0 0 1440 3000" preserveAspectRatio="none">
          <defs>{gradient('g')}</defs>
          <path d={PATH} fill="none" stroke={`url(#${id}g)`} strokeWidth="220" strokeLinecap="round" opacity="0.05" />
          <path d={PATH} fill="none" stroke={`url(#${id}g)`} strokeWidth="90" strokeLinecap="round" opacity="0.09" />
          <path d={PATH} fill="none" stroke={`url(#${id}g)`} strokeWidth="26" strokeLinecap="round" opacity="0.16" />
        </svg>
        {/* The strands, in two layers that sway out of step. */}
        {[STRANDS.filter((_, i) => i % 2 === 0), STRANDS.filter((_, i) => i % 2 === 1)].map((set, n) => (
          <svg key={n} className={`trail-layer trail-strands-${n + 1}`} viewBox="0 0 1440 3000" preserveAspectRatio="none">
            <defs>{gradient(`s${n}`)}</defs>
            {set.map(([dx, dy, w, o], i) => (
              <path key={i} d={PATH} transform={`translate(${dx} ${dy})`} fill="none" stroke={`url(#${id}s${n})`} strokeWidth={w} strokeLinecap="round" opacity={o} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        ))}
      </div>
    </div>
  );
}
