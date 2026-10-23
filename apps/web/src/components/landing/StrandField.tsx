'use client';

import { useEffect, useRef } from 'react';
import { lowEndDevice, reducedMotion } from '@/lib/page-transition';

// The landing page's light (after the owner's Relay video, in UniVerse's two tones): a bundle of
// fine strands that pours in from the top, bends hard in a white-hot knot and fans out to the
// bottom, swaying, with sparks drifting along it. A 2D canvas, drawn additively (bright where
// strands cross, like light); fewer strands on phones and low-memory devices, one still frame for
// Reduce Motion, and nothing drawn while it's off screen or the tab is hidden.

type Pt = [number, number];
const bez = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
};

export function StrandField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = reducedMotion();
    const few = lowEndDevice() || window.innerWidth < 640;
    const N = few ? 18 : 36;
    const strands = Array.from({ length: N }, (_, i) => {
      const o = i / (N - 1) - 0.5; // -0.5 … 0.5 across the bundle
      return { o, phase: i * 1.7, speed: 0.25 + ((i * 37) % 10) / 30, width: 0.5 + ((i * 13) % 7) / 6, alpha: 0.18 + 0.55 * (1 - Math.abs(o) * 1.7) };
    });
    const sparks = Array.from({ length: few ? 26 : 70 }, (_, i) => ({ s: (i * 7) % N, u: ((i * 53) % 100) / 100, v: 0.0006 + ((i * 11) % 9) / 9000, r: 0.6 + ((i * 17) % 10) / 10 }));
    let w = 0, h = 0, frame = 0, visible = true;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // One strand's two curves (in and out of the bend), swaying with time.
    const path = (o: number, phase: number, t: number): [Pt, Pt, Pt, Pt, Pt, Pt, Pt] => {
      const s = Math.sin(t + phase) * 0.012, c = Math.cos(t * 0.8 + phase) * 0.014;
      const X = (x: number) => x * w, Y = (y: number) => y * h;
      // The bend sits in the gap between the hero's words and its card (on phones, behind both).
      const k = w < 1024 ? -0.1 : 0.13;
      return [
        [X(0.8 + k + o * 0.16), Y(-0.08)],
        [X(0.56 + k + o * 0.22 + s), Y(0.06 + c)],
        [X(0.3 + k + o * 0.03 + c), Y(0.26)],
        [X(0.35 + k + o * 0.035 + s * 0.4), Y(0.46)],
        [X(0.4 + k + o * 0.05 - c), Y(0.66)],
        [X(0.6 + k + o * 0.42 + s), Y(0.8 - c)],
        [X(0.88 + k + o * 0.5), Y(1.08)],
      ];
    };
    const tint = () => {
      const g = ctx.createLinearGradient(0, 0, w * 0.2, h);
      g.addColorStop(0, 'rgba(99, 102, 241, 0)');
      g.addColorStop(0.25, 'rgba(129, 140, 248, 0.9)');
      g.addColorStop(0.45, 'rgba(232, 121, 249, 1)');
      g.addColorStop(0.7, 'rgba(167, 139, 250, 0.85)');
      g.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
      return g;
    };
    const stroke = (p: ReturnType<typeof path>) => {
      ctx.beginPath();
      ctx.moveTo(...p[0]);
      ctx.bezierCurveTo(...p[1], ...p[2], ...p[3]);
      ctx.bezierCurveTo(...p[4], ...p[5], ...p[6]);
      ctx.stroke();
    };
    const draw = (ms: number) => {
      const t = ms / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const g = tint();
      ctx.strokeStyle = g;
      // The glow: a few wide, faint passes of the middle strand (no blur filter: cheap to draw).
      const mid = path(0, 0, t * 0.5);
      for (const [lw, a] of [[90, 0.035], [40, 0.06], [16, 0.1]] as const) { ctx.globalAlpha = a; ctx.lineWidth = lw; stroke(mid); }
      for (const st of strands) {
        ctx.globalAlpha = st.alpha;
        ctx.lineWidth = st.width;
        stroke(path(st.o, st.phase, t * st.speed));
      }
      // The white-hot bend.
      const [bx, by] = mid[3];
      const hot = ctx.createRadialGradient(bx, by, 0, bx, by, Math.min(w, h) * 0.22);
      hot.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      hot.addColorStop(0.18, 'rgba(240, 171, 252, 0.35)');
      hot.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = hot;
      ctx.fillRect(0, 0, w, h);
      // Sparks drifting along the strands.
      ctx.fillStyle = '#f5d0fe';
      for (const sp of sparks) {
        if (!still) sp.u = (sp.u + sp.v) % 1;
        const st = strands[sp.s];
        const p = path(st.o, st.phase, t * st.speed);
        const [x, y] = sp.u < 0.5 ? bez(p[0], p[1], p[2], p[3], sp.u * 2) : bez(p[3], p[4], p[5], p[6], sp.u * 2 - 1);
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + sp.s));
        ctx.beginPath();
        ctx.arc(x + Math.sin(t + sp.s) * 6, y, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    const loop = (ms: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      draw(ms);
      frame = requestAnimationFrame(loop);
    };
    const start = () => { if (!frame && !still) frame = requestAnimationFrame(loop); };
    resize();
    draw(4000);
    const ro = new ResizeObserver(() => { resize(); if (still) draw(4000); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); });
    io.observe(cv);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => { cancelAnimationFrame(frame); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
