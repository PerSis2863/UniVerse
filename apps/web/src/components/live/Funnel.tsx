'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { easeOut, glow, seeded, useLiveCanvas, type Frame } from './canvas';

// A funnel of light (M48, after the "Crew" video's hiring pipeline): a stream of glowing points
// flows left to right through the stages; the tube is as wide as each stage's count, and points
// drift out and fade where fewer go on. The last stage ends in a warm light. Counts sit above in
// plain text (the page's motion layer counts them up). For help asked → on the way → given, actions
// logged → verified, and the like.

export interface Stage { label: string; value: number }

const N = 220;

export function Funnel({ stages, label, className }: { stages: Stage[]; label: string; className?: string }) {
  const model = useMemo(() => {
    const top = Math.max(...stages.map((s) => s.value));
    // Nothing yet: an even, calm stream rather than one that empties.
    const empty = top <= 0;
    // Each stage's height (a square root, so a small stage still shows) and the share that goes on.
    const half = stages.map((s) => (empty ? 0.5 : 0.16 + 0.84 * Math.sqrt(Math.max(0, s.value) / top)));
    const keep = stages.map((s, i) => (empty || i === 0 ? 1 : Math.min(1, s.value / Math.max(1, stages[i - 1].value))));
    const reach = keep.map((_, i) => keep.slice(0, i + 1).reduce((a, b) => a * b, 1));
    const dots = Array.from({ length: N }, (_, i) => ({ lane: seeded(i) * 2 - 1, speed: 0.07 + seeded(i + 500) * 0.06, phase: seeded(i + 900), life: seeded(i + 1300) }));
    return { half, reach, dots };
  }, [stages]);

  const ref = useLiveCanvas(({ ctx, w, h, t }: Frame) => {
    const k = stages.length, cy = h / 2, H = h * 0.42, pad = 8;
    const x0 = pad, x1 = w - pad, span = x1 - x0;
    // The tube's half height at x: eased between the stages' heights.
    const at = (x: number) => {
      const f = Math.min(k - 1e-6, Math.max(0, ((x - x0) / span) * k));
      const i = Math.floor(f), local = f - i;
      const next = model.half[Math.min(k - 1, i + 1)], here = model.half[i];
      const s = local < 0.7 ? 0 : (local - 0.7) / 0.3;
      return H * (here + (next - here) * (s * s * (3 - 2 * s)));
    };
    const open = easeOut(t / 1.1);

    // The tube: a soft fill and two thin edges, drawn open from the left.
    const reachX = x0 + span * open;
    ctx.beginPath();
    for (let x = x0; x <= reachX; x += 4) ctx.lineTo(x, cy - at(x));
    for (let x = reachX; x >= x0; x -= 4) ctx.lineTo(x, cy + at(x));
    ctx.closePath();
    const fill = ctx.createLinearGradient(x0, 0, x1, 0);
    fill.addColorStop(0, 'rgba(236,72,153,0.10)');
    fill.addColorStop(0.6, 'rgba(168,85,247,0.08)');
    fill.addColorStop(1, 'rgba(233,196,106,0.10)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let x = x0; x <= reachX; x += 4) ctx.lineTo(x, cy + side * at(x));
      ctx.stroke();
    }
    // Where one stage hands over to the next.
    ctx.setLineDash([2, 4]);
    for (let i = 1; i < k; i++) {
      const x = x0 + (span * i) / k;
      if (x > reachX) break;
      ctx.beginPath(); ctx.moveTo(x, cy - H - 4); ctx.lineTo(x, cy + H + 4); ctx.stroke();
    }
    ctx.setLineDash([]);

    // The stream.
    ctx.globalCompositeOperation = 'lighter';
    for (const d of model.dots) {
      const p = (t * d.speed + d.phase) % 1;
      const x = x0 + span * p;
      if (x > reachX) continue;
      const stage = Math.min(k - 1, Math.floor(p * k));
      const goesOn = d.life < model.reach[stage];
      // A point that doesn't go on drifts out of the tube and fades over its last stage.
      const into = p * k - stage;
      const drop = goesOn ? 0 : easeOut(into);
      const y = cy + d.lane * at(x) * 0.86 + drop * Math.sign(d.lane || 1) * H * 0.7;
      const a = (goesOn ? 1 : 1 - drop) * (p < 0.04 ? p / 0.04 : 1);
      const tone = p < 0.45 ? 'pink' : p < 0.8 ? 'violet' : 'gold';
      const s = 11 + 6 * Math.abs(Math.sin(t * 2 + d.phase * 9));
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(glow(tone), x - s / 2, y - s / 2, s, s);
    }
    // The goal: a warm light at the end, breathing.
    if (open > 0.95) {
      const g = 46 + 8 * Math.sin(t * 2.2);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(glow('gold'), x1 - g / 2 - 2, cy - g / 2, g, g);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  });

  return (
    <div className={cn('flex flex-col', className)}>
      <dl className="grid gap-2 px-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/60">{s.label}</dt>
            <dd className="mt-0.5 text-2xl font-light tabular-nums text-white">{s.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <div className="relative mt-2 min-h-[120px] flex-1">
        <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}
