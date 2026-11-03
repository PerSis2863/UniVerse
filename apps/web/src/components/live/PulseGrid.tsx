'use client';

import { cn } from '@/lib/utils';
import { TONES, easeOut, useLiveCanvas, type Frame, type Tone } from './canvas';

// A pulse grid (M49, after the "Crew" video's engagement pulse): one row of small squares per
// series, each lit by its value; they pop in from the left on arrival, and a soft band of light
// passes over the grid every few seconds. Row names sit beside it in the page, the numbers for
// screen readers underneath.

export interface PulseRow { label: string; values: number[]; tone?: Tone }

export function PulseGrid({ rows, label, className }: { rows: PulseRow[]; label: string; className?: string }) {
  const ref = useLiveCanvas(({ ctx, w, h, t }: Frame) => {
    const cols = Math.max(1, ...rows.map((r) => r.values.length));
    const gap = 3, cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows.length - 1)) / rows.length;
    const size = Math.max(2, Math.min(cw, ch));
    const band = ((t % 4.5) / 3.2) * (cols + 8) - 4;
    rows.forEach((r, ri) => {
      const top = Math.max(1, ...r.values), rgb = TONES[r.tone ?? 'pink'];
      r.values.forEach((v, ci) => {
        const k = easeOut((t - ci * 0.018 - ri * 0.06) / 0.4);
        if (k <= 0) return;
        const level = v > 0 ? 0.18 + 0.82 * (v / top) : 0;
        const shine = Math.max(0, 1 - Math.abs(ci - band) / 3) * 0.35;
        const s = size * (0.88 + 0.12 * k);
        const x = ci * (cw + gap) + (cw - s) / 2, y = ri * (ch + gap) + (ch - s) / 2;
        ctx.globalAlpha = k;
        ctx.fillStyle = level ? `rgba(${rgb},${Math.min(1, level + shine)})` : `rgba(255,255,255,${0.06 + shine * 0.4})`;
        ctx.beginPath(); ctx.roundRect(x, y, s, s, Math.min(3, s / 4)); ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
  });

  return (
    <div className={cn('grid grid-cols-[auto_1fr] items-stretch gap-3', className)}>
      <ul className="flex flex-col justify-around text-[11px] font-semibold uppercase tracking-wider text-white/60" aria-hidden>
        {rows.map((r) => <li key={r.label}>{r.label}</li>)}
      </ul>
      <div className="relative min-h-[60px]">
        <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      </div>
      <ul className="sr-only">{rows.map((r) => <li key={r.label}>{r.label}: {r.values.reduce((a, b) => a + b, 0).toLocaleString()} in all</li>)}</ul>
    </div>
  );
}
