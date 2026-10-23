'use client';

import { useEffect, useRef } from 'react';
import type { MessageEffect } from '@/lib/message-effects';

// Screen effects (M17, after iMessage): confetti, balloons, hearts, fireworks or lasers across the
// chat for about three seconds when a message sent with one arrives. One canvas, drawn by
// requestAnimationFrame and removed after; nothing plays with Reduce Motion.

const COLORS = ['#818cf8', '#a855f7', '#e879f9', '#f472b6', '#fbbf24', '#34d399', '#38bdf8'];
const DURATION = 3000;
type P = { x: number; y: number; vx: number; vy: number; r: number; spin: number; a: number; c: string; s: number; t0: number };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

function heart(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.3);
  ctx.bezierCurveTo(-s, -s * 0.4, -s * 0.4, -s * 1.1, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.4, -s * 1.1, s, -s * 0.4, 0, s * 0.3);
  ctx.fill();
}

function particles(effect: MessageEffect, w: number, h: number): P[] {
  const base = (o: Partial<P>): P => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, spin: 0, a: 1, c: pick(COLORS), s: 8, t0: 0, ...o });
  if (effect === 'confetti') return Array.from({ length: 170 }, () => base({ x: rnd(0, w), y: rnd(-h * 0.6, -10), vx: rnd(-0.06, 0.06), vy: rnd(0.18, 0.42), r: rnd(0, 6), spin: rnd(-0.01, 0.01), s: rnd(5, 10) }));
  if (effect === 'balloons') return Array.from({ length: 16 }, (_, i) => base({ x: ((i + rnd(0.2, 0.8)) / 16) * w, y: h + rnd(20, 380), vy: -rnd(0.22, 0.36), spin: rnd(0, 6), s: rnd(22, 34) }));
  if (effect === 'hearts') return Array.from({ length: 46 }, () => base({ x: w / 2 + rnd(-w * 0.35, w * 0.35), y: h + rnd(0, 260), vx: rnd(-0.03, 0.03), vy: -rnd(0.16, 0.34), spin: rnd(0, 6), s: rnd(8, 20), c: pick(['#f472b6', '#e879f9', '#fb7185', '#c084fc']) }));
  if (effect === 'fireworks') {
    return Array.from({ length: 5 }, (_, b) => {
      const cx = rnd(w * 0.15, w * 0.85), cy = rnd(h * 0.15, h * 0.55), c = pick(COLORS), t0 = b * 420;
      return Array.from({ length: 46 }, (_, i) => { const ang = (i / 46) * Math.PI * 2, sp = rnd(0.12, 0.3); return base({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, c, s: rnd(2, 3.5), t0 }); });
    }).flat();
  }
  return [];
}

export function ScreenEffect({ effect, onDone }: { effect: MessageEffect; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const canvas = ref.current;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || calm) { done.current(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width: w, height: h } = canvas.getBoundingClientRect();
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const ps = particles(effect, w, h);
    const start = performance.now();
    let raf = 0, last = start;
    const frame = (now: number) => {
      const t = now - start, dt = Math.min(48, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      const fade = t > DURATION - 600 ? Math.max(0, (DURATION - t) / 600) : 1;
      if (effect === 'lasers') {
        // Beams sweeping from the bottom corners over a dimmed chat.
        ctx.fillStyle = `rgba(8, 6, 30, ${0.45 * fade})`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const fromLeft = i % 2 === 0, ox = fromLeft ? 0 : w, ang = -Math.PI / 2 + (fromLeft ? 1 : -1) * (0.35 + 0.45 * Math.sin(t / 380 + i));
          const len = Math.hypot(w, h);
          const g = ctx.createLinearGradient(ox, h, ox + Math.cos(ang) * len, h + Math.sin(ang) * len);
          const c = COLORS[i % 3];
          g.addColorStop(0, c); g.addColorStop(1, 'transparent');
          ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.globalAlpha = 0.85 * fade;
          ctx.beginPath(); ctx.moveTo(ox, h); ctx.lineTo(ox + Math.cos(ang) * len, h + Math.sin(ang) * len); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } else {
        for (const p of ps) {
          const local = t - p.t0;
          if (local < 0) continue;
          p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.spin * dt;
          ctx.save();
          if (effect === 'confetti') {
            p.vy += 0.00025 * dt;
            ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = fade; ctx.fillStyle = p.c;
            ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 * Math.abs(Math.cos(p.r * 2)) + 1);
          } else if (effect === 'balloons') {
            const sway = Math.sin(t / 500 + p.spin) * 14;
            ctx.translate(p.x + sway, p.y); ctx.globalAlpha = fade;
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, p.s * 1.15); ctx.quadraticCurveTo(6, p.s * 1.8, 0, p.s * 2.6); ctx.stroke();
            const g = ctx.createRadialGradient(-p.s * 0.3, -p.s * 0.35, 1, 0, 0, p.s * 1.2);
            g.addColorStop(0, '#fff'); g.addColorStop(0.25, p.c); g.addColorStop(1, p.c);
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.85, p.s * 1.1, 0, 0, Math.PI * 2); ctx.fill();
          } else if (effect === 'hearts') {
            const grow = Math.min(1, local / 500);
            ctx.translate(p.x + Math.sin(t / 420 + p.spin) * 10, p.y); ctx.scale(grow, grow); ctx.globalAlpha = fade * 0.95; ctx.fillStyle = p.c;
            heart(ctx, p.s);
          } else if (effect === 'fireworks') {
            p.vy += 0.00018 * dt; p.vx *= 0.995; p.vy *= 0.995;
            const life = Math.max(0, 1 - local / 1400);
            ctx.globalAlpha = life * fade; ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      }
      if (t < DURATION) raf = requestAnimationFrame(frame); else done.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [effect]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-30 w-full h-full" />;
}
