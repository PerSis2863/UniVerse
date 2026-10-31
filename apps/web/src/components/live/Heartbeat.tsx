'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { easeOut, glow, useLiveCanvas, type Frame } from './canvas';

// A heartbeat line (M49): a live series drawn as one glowing line that draws itself in, glides to
// the new values when they change (no jump on a refresh), a pulse of light running along it every
// few seconds like a monitor, a breathing light on the latest value, and red sparks where something
// failed (`marks`, red only for that state). For the console's requests, anything per minute or hour.

export function Heartbeat({ values, marks, label, className }: { values: number[]; marks?: number[]; label: string; className?: string }) {
  // The values being glided from, and when the glide started (read only while drawing).
  const glide = useRef<{ from: number[]; to: number[]; at: number }>({ from: values, to: values, at: 0 });
  useEffect(() => {
    const g = glide.current;
    if (g.to === values) return;
    const now = performance.now(), k = Math.min(1, (now - g.at) / 700);
    g.from = g.to.map((v, i) => (g.from[i] ?? v) + (v - (g.from[i] ?? v)) * easeOut(k));
    g.to = values; g.at = now;
  }, [values]);

  const ref = useLiveCanvas(({ ctx, w, h, t }: Frame) => {
    const g = glide.current;
    const k = g.at ? easeOut((performance.now() - g.at) / 700) : 1;
    const vals = g.to.map((v, i) => (g.from[i] ?? v) + (v - (g.from[i] ?? v)) * k);
    const n = vals.length;
    if (n < 2) return;
    // Room at both ends for the breathing light on the latest value.
    const top = Math.max(1e-6, ...vals) * 1.15, padY = 10, padX = 12, x = (i: number) => padX + (i / (n - 1)) * (w - padX * 2), y = (v: number) => h - padY - (v / top) * (h - padY * 2);

    // Three faint guide lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke(); }

    // The line, through the midpoints (smooth, never overshooting), drawn in from the left.
    const drawn = easeOut(t / 1.2) * (n - 1);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x(0), y(vals[0]));
      for (let i = 1; i <= Math.floor(drawn); i++) {
        const mx = (x(i - 1) + x(i)) / 2, my = (y(vals[i - 1]) + y(vals[i])) / 2;
        ctx.quadraticCurveTo(x(i - 1), y(vals[i - 1]), mx, my);
      }
      const last = Math.min(n - 1, Math.floor(drawn));
      ctx.lineTo(x(last), y(vals[last]));
      return last;
    };
    const last = path();
    ctx.lineTo(x(last), h); ctx.lineTo(x(0), h); ctx.closePath();
    const area = ctx.createLinearGradient(0, 0, 0, h);
    area.addColorStop(0, 'rgba(236,72,153,0.28)');
    area.addColorStop(1, 'rgba(236,72,153,0)');
    ctx.fillStyle = area;
    ctx.fill();
    path();
    const stroke = ctx.createLinearGradient(0, 0, w, 0);
    stroke.addColorStop(0, 'rgba(168,85,247,0.9)');
    stroke.addColorStop(0.7, 'rgba(236,72,153,1)');
    stroke.addColorStop(1, 'rgba(255,250,245,1)');
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    // Sparks where something failed.
    marks?.forEach((m, i) => {
      if (!m || i > last) return;
      const s = 14 + Math.min(16, m * 3);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(248,113,113,0.95)';
      ctx.beginPath(); ctx.arc(x(i), y(vals[i]), 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glow('pink'), x(i) - s / 2, y(vals[i]) - s / 2, s, s);
    });
    // The pulse: a light running along the line every 3.5 s.
    if (drawn >= n - 1) {
      const f = ((t - 1.2) % 3.5) / 2.4;
      if (f >= 0 && f <= 1) {
        const at = f * (n - 1), i = Math.floor(at), r = at - i;
        const px = x(at), py = y(vals[i] + (vals[Math.min(n - 1, i + 1)] - vals[i]) * r), s = 34;
        ctx.globalAlpha = Math.sin(f * Math.PI);
        ctx.drawImage(glow('white'), px - s / 2, py - s / 2, s, s);
      }
    }
    // The latest value, breathing.
    const hx = x(last), hy = y(vals[last]), hs = 30 + 8 * Math.sin(t * 2.4);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(glow('pink'), hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
  });

  return <canvas ref={ref} role="img" aria-label={label} className={cn('block h-full w-full', className)} />;
}
