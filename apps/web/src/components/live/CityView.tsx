'use client';

import { useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { easeOut, glow, hash, seeded, useLiveCanvas, type Frame } from './canvas';

// A night city (M50, after the "Waypoint" video's live map): blocks seen from above at an angle with
// lit windows, the warehouse hub glowing in the middle, and each shipment as a small van on its way
// from a factory at the edge, through the hub, to its shop. The way done glows pink; light streams
// ahead of the van toward where it's going. A picture of the journey, not a street map: the real
// positions are on the world map below it. The still city is drawn once per size; each frame draws
// only the lights.

export interface Van { id: string; label: string; /** 0 to 1 along the whole journey. */ progress: number; state: 'moving' | 'done' | 'parked'; note?: string }

const G = 8; // blocks per side
type P = [number, number];

export function CityView({ vans, label, className }: { vans: Van[]; label: string; className?: string }) {
  const cache = useRef<{ key: string; city: HTMLCanvasElement; windows: P[] } | null>(null);
  const routes = useMemo(() => vans.slice(0, 14).map((v) => {
    const s = hash(v.id), side = s % 4, along = 1 + (s >> 3) % (G - 1);
    const start: P = side === 0 ? [along, 0] : side === 1 ? [G, along] : side === 2 ? [along, G] : [0, along];
    let dest: P = [1 + ((s >> 6) % (G - 1)), 1 + ((s >> 9) % (G - 1))];
    if (dest[0] === G / 2 && dest[1] === G / 2) dest = [dest[0] + 1, dest[1]];
    // Along the streets: across first, then down (or the other way round), via the hub.
    const leg = (a: P, b: P, xFirst: boolean): P[] => (xFirst ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b]);
    const hub: P = [G / 2, G / 2];
    const pts = [...leg(start, hub, s % 2 === 0), ...leg(hub, dest, s % 3 === 0).slice(1)];
    const lens = pts.slice(1).map((p, i) => Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1]));
    return { v, pts, lens, total: lens.reduce((a, b) => a + b, 0) || 1 };
  }), [vans]);

  const ref = useLiveCanvas(({ ctx, w, h, t, pointer }: Frame) => {
    const s = Math.min(w * 0.96 / (2 * 0.866 * G), h * 0.95 / (G + 1));
    const ox = w / 2, oy = (h - s * G) / 2 + s * 0.5;
    const iso = (x: number, y: number, z = 0): P => [ox + (x - y) * s * 0.866, oy + (x + y) * s * 0.5 - z * s];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = `${w}x${h}x${dpr}`;

    // The still city, drawn once for this size.
    if (cache.current?.key !== key) {
      const c = document.createElement('canvas');
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const quad = (pts: P[], fill: string) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
      quad([iso(0, 0), iso(G, 0), iso(G, G), iso(0, G)], '#0c0c0e');
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
      for (let i = 0; i <= G; i++) {
        g.beginPath(); g.moveTo(...iso(i, 0)); g.lineTo(...iso(i, G)); g.stroke();
        g.beginPath(); g.moveTo(...iso(0, i)); g.lineTo(...iso(G, i)); g.stroke();
      }
      const windows: P[] = [];
      for (let d = 0; d < G * 2 - 1; d++) {
        for (let i = 0; i < G; i++) {
          const j = d - i;
          if (j < 0 || j >= G) continue;
          if (i === G / 2 - 1 && j === G / 2 - 1) continue; // the hub's square stays open
          const r = seeded(i * 31 + j * 7), z = 0.2 + r * r * 1.1;
          const x0 = i + 0.16, x1 = i + 0.84, y0 = j + 0.16, y1 = j + 0.84;
          quad([iso(x0, y1), iso(x1, y1), iso(x1, y1, z), iso(x0, y1, z)], '#151518');
          quad([iso(x1, y0), iso(x1, y1), iso(x1, y1, z), iso(x1, y0, z)], '#101013');
          quad([iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], '#1d1d21');
          // Windows on both faces, some lit warm.
          const rows = Math.max(1, Math.floor(z * 7));
          for (let k = 0; k < rows; k++) {
            for (let m = 0; m < 3; m++) {
              const lit = seeded(i * 97 + j * 13 + k * 5 + m) < 0.38;
              const zz = (k + 0.35) / rows * z * 0.92;
              for (const face of [0, 1]) {
                const u = x0 + (m + 0.3) / 3 * (x1 - x0);
                const [px, py] = face === 0 ? iso(u, y1, zz) : iso(x1, y0 + (m + 0.3) / 3 * (y1 - y0), zz);
                g.fillStyle = lit ? `rgba(233,196,106,${0.35 + seeded(k + m * 3 + i) * 0.5})` : 'rgba(255,255,255,0.035)';
                g.fillRect(px, py, Math.max(1, s * 0.07), Math.max(1, s * 0.05));
                if (lit && windows.length < 500) windows.push([px, py]);
              }
            }
          }
        }
      }
      cache.current = { key, city: c, windows };
    }
    const { city, windows } = cache.current;
    const arrive = easeOut(t / 1.1);
    ctx.globalAlpha = arrive;
    ctx.drawImage(city, 0, 0, w, h);
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    // A few windows breathing.
    for (let i = 0; i < 28 && windows.length; i++) {
      const [x, y] = windows[Math.floor(seeded(i + Math.floor(t / 3) * 17) * windows.length)];
      ctx.globalAlpha = 0.5 * Math.max(0, Math.sin((t / 3) * Math.PI * 2 + i));
      ctx.drawImage(glow('gold'), x - 5, y - 5, 10, 10);
    }
    ctx.globalAlpha = 1;

    // The hub: a warm light with rings going out.
    const [hx, hy] = iso(G / 2, G / 2);
    for (let r = 0; r < 2; r++) {
      const f = ((t * 0.5 + r * 0.5) % 1);
      ctx.strokeStyle = `rgba(233,196,106,${0.5 * (1 - f) * arrive})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(hx, hy, s * (0.3 + f * 0.9), s * (0.3 + f * 0.9) * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const hs = s * 1.6 + Math.sin(t * 2) * 4;
    ctx.globalAlpha = 0.9 * arrive;
    ctx.drawImage(glow('gold'), hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.globalAlpha = 1;

    // Each van's way, the van, and the light ahead of it.
    const at = (r: (typeof routes)[number], f: number): P => {
      let d = Math.max(0, Math.min(1, f)) * r.total;
      for (let i = 0; i < r.lens.length; i++) {
        if (d <= r.lens[i] || i === r.lens.length - 1) {
          const k = r.lens[i] ? Math.min(1, d / r.lens[i]) : 0, a = r.pts[i], b = r.pts[i + 1];
          return iso(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 0.02);
        }
        d -= r.lens[i];
      }
      return iso(...r.pts[r.pts.length - 1]);
    };
    // Name pills already placed this frame, so the next one steps up instead of covering it.
    const placed: [number, number, number, number][] = [];
    let near = -1;
    if (pointer) {
      let best = 26;
      routes.forEach((r, i) => { const [x, y] = at(r, r.v.progress); const d = Math.hypot(x - pointer.x, y - pointer.y); if (d < best) { best = d; near = i; } });
    }
    routes.forEach((r, i) => {
      const k = easeOut((t - 0.4 - i * 0.06) / 0.8);
      if (k <= 0) return;
      const p = r.v.progress * k, lit = i === near;
      const steps = 60;
      // The way done.
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = r.v.state === 'parked' ? 'rgba(255,255,255,0.12)' : `rgba(236,72,153,${lit ? 0.95 : 0.7})`;
      ctx.lineWidth = lit ? 3 : 2;
      ctx.beginPath();
      for (let q = 0; q <= steps; q++) { const [x, y] = at(r, (q / steps) * p); if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      // The way to go: a faint line and light streaming along it.
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let q = 0; q <= steps; q++) { const [x, y] = at(r, p + (q / steps) * (1 - p)); if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      if (r.v.state === 'moving') {
        for (let j = 0; j < 4; j++) {
          const f = p + (((t * 0.18 + j / 4 + seeded(i)) % 1)) * (1 - p);
          const [x, y] = at(r, f);
          ctx.globalAlpha = 0.8 * (1 - (f - p) / Math.max(0.01, 1 - p));
          ctx.drawImage(glow('pink'), x - 6, y - 6, 12, 12);
        }
      }
      // Where it's going.
      const [dx, dy] = at(r, 1);
      ctx.globalAlpha = r.v.state === 'done' ? 0.95 : 0.5;
      ctx.drawImage(glow(r.v.state === 'done' ? 'gold' : 'violet'), dx - 9, dy - 9, 18, 18);
      // The van: a small bright box with a glow.
      const [vx, vy] = at(r, p);
      ctx.globalAlpha = r.v.state === 'parked' ? 0.4 : 1;
      const gs = lit ? 34 : 26;
      ctx.drawImage(glow(r.v.state === 'done' ? 'gold' : 'pink'), vx - gs / 2, vy - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fffaf5';
      ctx.beginPath(); ctx.roundRect(vx - 3.5, vy - 3, 7, 5, 1.5); ctx.fill();
      ctx.globalAlpha = 1;
      // Its name, in a small pill.
      // Names for vans on the move (others when pointed at): delivered ones glow gold where they arrived.
      if (r.v.state === 'moving' || lit) {
        ctx.font = '600 11px Urbanist, system-ui, sans-serif';
        const text = r.v.note ? `${r.v.label} · ${r.v.note}` : r.v.label;
        const tw = ctx.measureText(text).width, bw = tw + 14, bh = 18;
        const x = Math.min(w - bw - 4, Math.max(4, vx - bw / 2));
        let y = vy - 30;
        while (placed.some(([px, py, pw, ph]) => x < px + pw && x + bw > px && y < py + ph && y + bh > py)) y -= bh + 4;
        placed.push([x, y, bw, bh]);
        ctx.globalAlpha = k * (near < 0 || lit ? 1 : 0.55);
        ctx.fillStyle = 'rgba(12,12,14,0.86)';
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9); ctx.fill();
        ctx.strokeStyle = r.v.state === 'done' ? 'rgba(233,196,106,0.5)' : 'rgba(236,72,153,0.5)';
        ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'start';
        ctx.fillText(text, x + 7, y + bh / 2 + 0.5);
        ctx.globalAlpha = 1;
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  });

  return (
    <div className={cn('relative', className)}>
      <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      <ul className="sr-only">{vans.map((v) => <li key={v.id} translate="no">{v.label}: {v.state === 'done' ? 'delivered' : v.state === 'parked' ? 'not shipped yet' : `${Math.round(v.progress * 100)}% of the way${v.note ? `, ${v.note}` : ''}`}</li>)}</ul>
    </div>
  );
}
