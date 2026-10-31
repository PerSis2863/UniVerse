'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TONES, TONE_ORDER, easeOut, glow, hash, seeded, useLiveCanvas, type Frame, type Tone } from './canvas';

// A constellation (M48, after the "Crew" video's people constellation): groups of glowing points
// that turn slowly in 3D around a centre (you), joined to it by lines that light pulses travel
// along. They fly out from the centre when first seen; the pointer tilts the view and lights the
// nearest group. For courses and classmates, classes and students, apps, kinds of climate action.

export interface Group {
  label: string;
  /** How many points (drawn up to 36). */
  n: number;
  /** What the label says after the name (default: n; '' for the name alone). */
  value?: string;
  tone?: Tone;
}

const MAX = 36;

interface Star { gx: number; gy: number; gz: number; ox: number; oy: number; oz: number; big: boolean; seed: number }

export function Constellation({ groups, center, label, className }: { groups: Group[]; center?: string; label: string; className?: string }) {
  const model = useMemo(() => {
    const k = Math.max(1, groups.length);
    return groups.map((g, i) => {
      const s = hash(g.label);
      const a = (i / k) * Math.PI * 2 + seeded(s) * 0.5;
      const r = 0.74 + seeded(s + 1) * 0.12;
      const [gx, gy, gz] = [Math.cos(a) * r, (seeded(s + 2) - 0.5) * 0.36, Math.sin(a) * r];
      // At least a handful of points, so a small group still reads as a cluster.
      const n = Math.max(10, Math.min(MAX, Math.round(g.n)));
      const spread = 0.13 + Math.min(0.1, n / 300);
      const stars: Star[] = Array.from({ length: n }, (_, j) => {
        // A fuzzy ball: denser in the middle, like a cluster of people.
        const u = seeded(s + j * 3 + 7), v = seeded(s + j * 3 + 8), w = seeded(s + j * 3 + 9);
        const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1), rr = spread * Math.cbrt(w);
        return { gx, gy, gz, ox: rr * Math.sin(ph) * Math.cos(th), oy: rr * Math.cos(ph), oz: rr * Math.sin(ph) * Math.sin(th), big: j < 2, seed: s + j };
      });
      return { ...g, tone: g.tone ?? TONE_ORDER[i % TONE_ORDER.length], gx, gy, gz, stars };
    });
  }, [groups]);

  const ref = useLiveCanvas(({ ctx, w, h, t, pointer }: Frame) => {
    const cx = w / 2, cy = h / 2, S = Math.min(w * 0.44, h * 0.66);
    const tiltX = pointer ? (pointer.y / h - 0.5) * 0.35 : 0;
    const yaw = t * 0.1 + (pointer ? (pointer.x / w - 0.5) * 0.5 : 0);
    const pitch = 0.32 + tiltX;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const project = (x: number, y: number, z: number) => {
      const x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
      const y1 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
      const p = 2.6 / (2.6 + z2);
      return { x: cx + x1 * S * p, y: cy + y1 * S * p, p, z: z2 };
    };
    const arrive = (d: number) => easeOut((t - d) / 1.3);

    // Faint dust behind everything, twinkling.
    for (let i = 0; i < 70; i++) {
      const a = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.8 + i));
      ctx.fillStyle = `rgba(255,255,255,${a * arrive(0)})`;
      ctx.fillRect(seeded(i) * w, seeded(i + 99) * h, 1, 1);
    }

    // Which group the pointer is nearest (lit up).
    const heads = model.map((g) => project(g.gx, g.gy, g.gz));
    let near = -1;
    if (pointer) {
      let best = 70;
      heads.forEach((p, i) => { const d = Math.hypot(p.x - pointer.x, p.y - pointer.y); if (d < best) { best = d; near = i; } });
    }

    // Two faint orbits around you, turning with the view: the depth.
    ctx.lineWidth = 1;
    for (const [r, a] of [[0.42, 0.09], [0.8, 0.07]] as const) {
      ctx.strokeStyle = `rgba(255,255,255,${a * arrive(0.1)})`;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const th = (i / 96) * Math.PI * 2, q = project(Math.cos(th) * r, 0, Math.sin(th) * r);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    // A soft haze behind each group.
    model.forEach((g, i) => {
      const k = arrive(0.3 + i * 0.08), p = heads[i], s = 150 * p.p * (i === near ? 1.2 : 1);
      ctx.globalAlpha = 0.22 * k;
      ctx.drawImage(glow(g.tone), p.x - s / 2, p.y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
    // Lines from the centre to each group, with light pulses running out along them.
    model.forEach((g, i) => {
      const k = arrive(0.15 + i * 0.08), p = heads[i];
      if (k <= 0) return;
      const ex = cx + (p.x - cx) * k, ey = cy + (p.y - cy) * k;
      const grad = ctx.createLinearGradient(cx, cy, ex, ey);
      grad.addColorStop(0, 'rgba(255,255,255,0.32)');
      grad.addColorStop(1, `rgba(${TONES[g.tone]},${i === near ? 0.75 : 0.35})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = i === near ? 1.4 : 0.8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      for (const off of [0, 0.5]) {
        const f = (t * 0.32 + off + seeded(i)) % 1;
        const px = cx + (ex - cx) * f, py = cy + (ey - cy) * f, s = 10 * (0.6 + 0.4 * p.p);
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.9 * k;
        ctx.drawImage(glow(g.tone), px - s / 2, py - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    });

    // Every point, far ones first, each turning slowly about its group's middle.
    const pts: { x: number; y: number; p: number; z: number; tone: Tone; big: boolean; a: number; lit: boolean }[] = [];
    model.forEach((g, gi) => {
      const spin = t * (gi % 2 ? -0.35 : 0.3), cs = Math.cos(spin), sn = Math.sin(spin);
      g.stars.forEach((s, j) => {
        const k = arrive(0.2 + gi * 0.08 + (j % 12) * 0.025);
        if (k <= 0) return;
        const ox = s.ox * cs - s.oz * sn, oz = s.ox * sn + s.oz * cs;
        const q = project((s.gx + ox) * k, (s.gy + s.oy) * k, (s.gz + oz) * k);
        const tw = 0.72 + 0.28 * Math.sin(t * 1.7 + s.seed);
        pts.push({ ...q, tone: g.tone, big: s.big, a: tw * k, lit: gi === near });
      });
    });
    pts.sort((a, b) => b.z - a.z);
    for (const q of pts) {
      const depth = 0.45 + 0.55 * Math.min(1, Math.max(0, (q.p - 0.7) / 0.6));
      const size = (q.big ? 34 : 18) * q.p * (q.lit ? 1.25 : 1);
      ctx.globalAlpha = q.a * depth;
      ctx.drawImage(glow(q.tone), q.x - size / 2, q.y - size / 2, size, size);
      ctx.fillStyle = `rgba(255,255,255,${0.85 * q.a * depth})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, (q.big ? 2.8 : 1.5) * q.p, 0, Math.PI * 2); ctx.fill();
      if (q.big) {
        ctx.strokeStyle = `rgba(${TONES[q.tone]},${0.8 * q.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, 5.5 * q.p, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // You, in the middle: a warm light with a slow breathing halo.
    const k0 = arrive(0);
    const halo = 54 + 6 * Math.sin(t * 1.6);
    ctx.globalAlpha = 0.9 * k0;
    ctx.drawImage(glow('gold'), cx - halo / 2, cy - halo / 2, halo, halo);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,248,235,${k0})`;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(233,196,106,${0.9 * k0})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke();
    if (center) {
      ctx.fillStyle = `rgba(20,18,16,${k0})`;
      ctx.font = '700 10px Urbanist, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(center.slice(0, 2).toUpperCase(), cx, cy + 0.5);
    }

    // The groups' names, in small dark pills above them.
    ctx.font = '600 11px Urbanist, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    model.forEach((g, i) => {
      const k = arrive(0.6 + i * 0.08), p = heads[i];
      if (k <= 0) return;
      const shown = g.value ?? Math.round(g.n).toLocaleString();
      const text = shown ? `${g.label} · ${shown}` : g.label;
      const tw = ctx.measureText(text).width, bw = tw + 22, bh = 20;
      // Groups in front sit below the middle: their names go underneath, clear of you.
      const x = Math.min(w - bw - 6, Math.max(6, p.x - bw / 2)), y = p.p > 1 ? p.y + 30 * p.p - bh / 2 : p.y - 38 * p.p - bh / 2;
      ctx.globalAlpha = k * (0.55 + 0.45 * Math.min(1, Math.max(0, (p.p - 0.7) / 0.5))) * (near < 0 || i === near ? 1 : 0.6);
      ctx.fillStyle = 'rgba(14,14,16,0.82)';
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 10); ctx.fill();
      ctx.strokeStyle = `rgba(${TONES[g.tone]},0.45)`;
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = `rgb(${TONES[g.tone]})`;
      ctx.beginPath(); ctx.arc(x + 9, y + bh / 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.textAlign = 'start';
      ctx.fillText(text, x + 15, y + bh / 2 + 0.5);
    });
    ctx.globalAlpha = 1;
  });

  return (
    <div className={cn('relative', className)}>
      <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      <ul className="sr-only">{groups.map((g) => <li key={g.label}>{g.label}{(g.value ?? String(Math.round(g.n))) ? `: ${g.value ?? Math.round(g.n)}` : ''}</li>)}</ul>
    </div>
  );
}
