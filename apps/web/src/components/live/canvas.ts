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

/** `wake`: when it changes (data that arrived later, like the planet's land), one more frame is drawn
 *  even when the picture holds still (Reduce Motion). */
export function useLiveCanvas(draw: (f: Frame) => void, wake?: unknown) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(draw);
  const kicker = useRef<() => void>(() => {});
  useEffect(() => { latest.current = draw; });
  useEffect(() => { kicker.current(); }, [wake]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = reducedMotion();
    let w = 0, h = 0, raf = 0, seen = false, start = 0;
    let pointer: Frame['pointer'] = null;
    // The layout size, not getBoundingClientRect: a page's entrance animation scales it for a moment,
    // and a card measured then stayed squashed and blurry (M85).
    const size = (cw: number, ch: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cw; h = ch;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // M136 (the owner: "the mobile website and app both are downgrade please increase the frame"):
    // phones draw every frame the screen gives and as sharp as computers (M91 drew every other frame,
    // 30 a second, at 1.5x).
    const gap = 0;
    let drawn = 0;
    const frame = (ms: number) => {
      raf = 0;
      if (!w || !h) return;
      if (!start) start = ms;
      if (gap && !still && drawn && ms - drawn < gap) { if (seen && !document.hidden) raf = requestAnimationFrame(frame); return; }
      drawn = ms;
      ctx.clearRect(0, 0, w, h);
      latest.current({ ctx, w, h, t: still ? 30 : (ms - start) / 1000, pointer, still });
      if (!still && seen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    kicker.current = kick;
    const ro = new ResizeObserver(([e]) => { size(e.contentRect.width, e.contentRect.height); kick(); });
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

// The colours, the glow sprite and the small maths live in ./paint (no React there, so a card's
// drawing can also run on a background thread); the cards keep importing them from here.
export { TONES, TONE_ORDER, easeOut, glow, hash, seeded, type Tone } from './paint';
