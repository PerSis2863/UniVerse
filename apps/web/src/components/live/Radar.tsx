'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TONES, easeOut, glow, hash, seeded, useLiveCanvas, type Frame, type Tone } from './canvas';

// A radar (M49): a beam sweeps round; each blip lights up as the beam passes and fades until the
// next turn, its name showing while it's bright. Rings say how far (`ring` 0 = the middle). For the
// people online now, open problems, anything that's "here right now".

export interface Blip { id: string; label: string; ring: 0 | 1 | 2; tone?: Tone }

const TURN = 4.2; // seconds per sweep

export function Radar({ blips, label, className }: { blips: Blip[]; label: string; className?: string }) {
  const model = useMemo(() => blips.slice(0, 60).map((b) => {
    const s = hash(b.id);
    return { ...b, a: seeded(s) * Math.PI * 2, r: (b.ring + 0.35 + seeded(s + 1) * 0.55) / 3, tone: b.tone ?? 'pink' as Tone };
  }), [blips]);

  const ref = useLiveCanvas(({ ctx, w, h, t }: Frame) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8;
    const k = easeOut(t / 0.9);
    const beam = ((t / TURN) % 1) * Math.PI * 2 - Math.PI / 2;

    // Rings and cross lines, growing in from slightly smaller.
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * f * (0.9 + 0.1 * k), 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

    // The beam: a fading wedge behind a bright edge.
    if (k > 0.2) {
      const wedge = 0.9;
      const g = ctx.createConicGradient ? ctx.createConicGradient(beam - wedge, cx, cy) : null;
      if (g) {
        g.addColorStop(0, 'rgba(254,129,209,0)');
        g.addColorStop(wedge / (Math.PI * 2), 'rgba(254,129,209,0.32)');
        g.addColorStop(wedge / (Math.PI * 2) + 0.001, 'rgba(254,129,209,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, beam - wedge, beam); ctx.closePath(); ctx.fill();
      }
      const edge = ctx.createLinearGradient(cx, cy, cx + Math.cos(beam) * R, cy + Math.sin(beam) * R);
      edge.addColorStop(0, 'rgba(255,255,255,0.1)');
      edge.addColorStop(1, 'rgba(255,250,245,0.85)');
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(beam) * R, cy + Math.sin(beam) * R); ctx.stroke();
    }

    // The blips: brightest just after the beam has passed.
    ctx.font = '600 11px Urbanist, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const b of model) {
      const since = (((beam - b.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const lit = Math.exp(-since / 1.6);
      const x = cx + Math.cos(b.a) * b.r * R * k, y = cy + Math.sin(b.a) * b.r * R * k;
      const s = 14 + 22 * lit;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (0.35 + 0.65 * lit) * k;
      ctx.drawImage(glow(b.tone), x - s / 2, y - s / 2, s, s);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,255,255,${(0.6 + 0.4 * lit) * k})`;
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      if (lit > 0.45) {
        ctx.globalAlpha = Math.min(1, (lit - 0.45) / 0.3) * k;
        ctx.fillStyle = `rgb(${TONES.white})`;
        ctx.textAlign = x > cx ? 'start' : 'end';
        ctx.fillText(b.label, x + (x > cx ? 9 : -9), y);
      }
      ctx.globalAlpha = 1;
    }

    // The middle.
    ctx.fillStyle = 'rgba(255,250,245,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  });

  return (
    <div className={cn('relative', className)}>
      <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      <ul className="sr-only">{blips.map((b) => <li key={b.id} translate="no">{b.label}</li>)}</ul>
    </div>
  );
}
