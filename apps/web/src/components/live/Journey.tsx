'use client';

import { cn } from '@/lib/utils';
import { easeOut, glow, useLiveCanvas, type Frame } from './canvas';

// A journey line (M50, after the "Waypoint" video's parcel timeline): a wave through every step that
// draws itself in up to where things are now; each step ticks over as the line reaches it, the
// current one pulses, and a light runs along the finished part. Step names and times sit under it in
// the page (an ordered list, so it reads in order without the picture). On light or dark cards.

export interface Step { label: string; /** When it happened, already formatted. */ at?: string | null; done: boolean }

export function Journey({ steps, label, dark = false, className }: { steps: Step[]; label: string; dark?: boolean; className?: string }) {
  const n = steps.length;
  const reached = Math.max(0, steps.reduce((a, s, i) => (s.done ? i : a), -1));
  const allDone = n > 0 && steps.every((s) => s.done);

  const ref = useLiveCanvas(({ ctx, w, h, t }: Frame) => {
    if (n < 2) return;
    // Dark card, or the app in dark mode.
    const dk = dark || document.documentElement.classList.contains('dark');
    const cx = (i: number) => ((i + 0.5) / n) * w;
    const cy = (i: number) => h / 2 + (i % 2 ? 1 : -1) * Math.min(14, h * 0.22);
    // Points along the wave (smooth between steps), for drawing part of it.
    const pts: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < 24; k++) {
        const f = k / 24, e = f * f * (3 - 2 * f);
        pts.push([cx(i) + (cx(i + 1) - cx(i)) * f, cy(i) + (cy(i + 1) - cy(i)) * e]);
      }
    }
    pts.push([cx(n - 1), cy(n - 1)]);
    const per = 24, goal = reached * per, drawn = Math.round(easeOut(t / 1.4) * goal);
    const line = (from: number, to: number) => { ctx.beginPath(); pts.slice(from, to + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };

    // The way still to go: faint dashes.
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = dk ? 'rgba(255,255,255,0.18)' : 'rgba(43,53,104,0.22)';
    ctx.lineWidth = 2;
    line(drawn, pts.length - 1); ctx.stroke();
    ctx.setLineDash([]);
    // The way done: a glowing gradient.
    if (drawn > 0) {
      const g = ctx.createLinearGradient(cx(0), 0, cx(n - 1), 0);
      g.addColorStop(0, '#8c9bff'); g.addColorStop(0.6, '#fe81d1'); g.addColorStop(1, '#74ffed');
      ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      line(0, drawn); ctx.stroke();
      // A light running along what's done, every 3 s.
      const f = ((t - 1.4) % 3) / 1.6;
      if (f > 0 && f < 1) {
        const [x, y] = pts[Math.min(drawn, Math.floor(f * drawn))];
        ctx.globalCompositeOperation = dk ? 'lighter' : 'source-over';
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.9;
        ctx.drawImage(glow(dk ? 'white' : 'pink'), x - 14, y - 14, 28, 28);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }

    // The steps.
    for (let i = 0; i < n; i++) {
      const x = cx(i), y = cy(i), on = drawn >= i * per && steps[i].done;
      const pop = on ? easeOut((t - 0.15 - (i * 1.4) / Math.max(1, reached)) / 0.3) : 0;
      const current = i === reached && !allDone;
      if (current && drawn >= goal) {
        const r = 12 + 6 * ((t * 0.8) % 1);
        ctx.strokeStyle = `rgba(254,129,209,${0.5 * (1 - ((t * 0.8) % 1))})`;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      }
      const r = 8 * (on ? 0.85 + 0.15 * pop : 0.85);
      ctx.fillStyle = on ? (i === n - 1 ? '#74ffed' : '#fe81d1') : dk ? '#1c2450' : '#ffffff';
      ctx.strokeStyle = on ? 'transparent' : dk ? 'rgba(255,255,255,0.3)' : 'rgba(43,53,104,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); if (!on) ctx.stroke();
      if (on && pop > 0.2) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        ctx.globalAlpha = Math.min(1, (pop - 0.2) / 0.5);
        ctx.beginPath(); ctx.moveTo(x - 3.2, y + 0.2); ctx.lineTo(x - 0.8, y + 2.6); ctx.lineTo(x + 3.4, y - 2.4); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  });

  return (
    <div className={cn('w-full', className)}>
      <div className="relative h-14"><canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" /></div>
      <ol className="grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={i} className="min-w-0">
            <p className={cn('truncate text-[11px] font-semibold', s.done ? (dark ? 'text-white' : 'text-zinc-900 dark:text-white') : dark ? 'text-white/60' : 'text-zinc-500 dark:text-zinc-400')}>{s.label}</p>
            {s.at && <p className={cn('truncate font-mono text-[11px]', dark ? 'text-white/60' : 'text-zinc-500 dark:text-zinc-400')}>{s.at}</p>}
            <span className="sr-only">{s.done ? 'done' : 'not yet'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
