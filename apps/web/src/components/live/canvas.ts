'use client';

import { useEffect, useRef } from 'react';
import { reducedMotion } from '@/lib/page-transition';

// The live cards' drawing loop (M48, after the owner's "Crew" video): one canvas sized to its box in
// device pixels, frames only while it is on screen and the tab is open, one still frame with Reduce
// Motion. Time starts when the card is first seen, so its arrival plays where someone can see it.

export interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Seconds since the card was first seen (a settled moment with Reduce Motion). */
  t: number;
  /** Where the pointer is over the canvas, if it is. */
  pointer: { x: number; y: number } | null;
  still: boolean;
}

export function useLiveCanvas(draw: (f: Frame) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(draw);
  useEffect(() => { latest.current = draw; });
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = reducedMotion();
    let w = 0, h = 0, raf = 0, seen = false, start = 0;
    let pointer: Frame['pointer'] = null;
    const size = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const frame = (ms: number) => {
      raf = 0;
      if (!w || !h) return;
      if (!start) start = ms;
      ctx.clearRect(0, 0, w, h);
      latest.current({ ctx, w, h, t: still ? 30 : (ms - start) / 1000, pointer, still });
      if (!still && seen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const ro = new ResizeObserver(() => { size(); kick(); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen) kick(); });
    io.observe(cv);
    const onVisible = () => { if (!document.hidden) kick(); };
    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; if (still) kick(); };
    const leave = () => { pointer = null; if (still) kick(); };
    document.addEventListener('visibilitychange', onVisible);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerleave', leave);
    };
  }, []);
  return ref;
}

/** The Karma light: hot pink with a little purple, white, and the warm gold of the headline cards. */
export const TONES = { pink: '236,72,153', violet: '168,85,247', white: '255,250,245', gold: '233,196,106' } as const;
export type Tone = keyof typeof TONES;
export const TONE_ORDER: Tone[] = ['pink', 'violet', 'gold', 'white'];

const sprites = new Map<string, HTMLCanvasElement>();
/** A soft round glow in one colour, drawn once and stamped many times (cheap: no shadows, no blur). */
export function glow(tone: Tone): HTMLCanvasElement {
  let s = sprites.get(tone);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const c = s.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${TONES[tone]},1)`);
  g.addColorStop(0.18, `rgba(${TONES[tone]},0.55)`);
  g.addColorStop(0.5, `rgba(${TONES[tone]},0.12)`);
  g.addColorStop(1, `rgba(${TONES[tone]},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  sprites.set(tone, s);
  return s;
}

/** A repeatable random number in [0, 1) for a seed (the same picture every time for the same data). */
export const seeded = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
export const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** Ease out (fast start, soft landing), for arrivals. */
export const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
