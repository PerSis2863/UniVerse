'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CITIES } from '@/components/trace/map/cities';
import { arcPoints, glow, quad, toBase } from '@/components/trace/map/engine';
import { WorldCanvas, type Box, type Frame, type MapHandle } from '@/components/trace/map/WorldCanvas';

// The landing page's live map: the same engine as the brand's market map (src/components/trace/map),
// drawing an illustration, not anyone's data: scans glowing in big cities, flows from three made-up
// factories, a ripple wherever a "scan" lands and one shipment on the road, while the view glides
// from region to region by itself. It doesn't take the wheel, so the page scrolls as usual.

const TOURS: Box[] = [[-12, 34, 32, 60], [64, 5, 94, 33], [-126, 14, -62, 54], [-20, -40, 150, 62]];
const FACTORIES: [number, number][] = [[37.78, -3.78], [18.52, 73.86], [22.54, 114.06]];
const ROUTE: [number, number][] = [[37.78, -3.78], [39.45, -0.32], [45.76, 4.84], [48.86, 2.35]];
const PINK = '#ec4899', AMBER = '#f59e0b';

/** A stable pseudo-random number for an index. */
const noise = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

export function LiveMapShowcase({ className }: { className?: string }) {
  const map = useRef<MapHandle>(null);
  const calm = useReducedMotion();
  const ripples = useRef<{ bx: number; by: number; born: number; amber: boolean }[]>([]);
  const model = useMemo(() => {
    const cities = CITIES.filter((c) => c[3] < 3).map(([name, lat, lng, rank], i) => { const [bx, by] = toBase(lng, lat); return { name, bx, by, w: (rank === 1 ? 0.6 : 0.25) + noise(i) * 0.4 }; });
    const factories = FACTORIES.map(([lat, lng]) => toBase(lng, lat));
    const flows = cities.filter((c) => c.w > 0.65).slice(0, 22).map((c, i) => {
      const f = factories.reduce((a, b) => (Math.hypot(b[0] - c.bx, b[1] - c.by) < Math.hypot(a[0] - c.bx, a[1] - c.by) ? b : a));
      return { f, c, phase: noise(i + 99) };
    });
    const route = ROUTE.map(([lat, lng]) => toBase(lng, lat));
    return { cities, factories, flows, route };
  }, []);

  // The view glides between regions; a "scan" lands somewhere every moment.
  useEffect(() => {
    if (calm) return;
    let i = 0;
    const tour = setInterval(() => { i = (i + 1) % TOURS.length; map.current?.flyTo(TOURS[i], { pad: 30 }); }, 7000);
    const scans = setInterval(() => {
      const c = model.cities[Math.floor(Math.random() * model.cities.length)];
      ripples.current.push({ bx: c.bx, by: c.by, born: performance.now(), amber: Math.random() < 0.08 });
    }, 650);
    return () => { clearInterval(tour); clearInterval(scans); };
  }, [calm, model]);

  const draw = (f: Frame) => {
    const { ctx, view, t } = f, k = view.k, still = !!calm;
    const sx = (b: number) => view.x + b * k, sy = (b: number) => view.y + b * view.k;
    const zf = Math.min(2.2, Math.max(1, Math.pow(f.zoom, 0.3)));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Flows and their comets.
    for (const fl of model.flows) {
      const c = arcPoints([sx(fl.f[0]), sy(fl.f[1])], [sx(fl.c.bx), sy(fl.c.by)], 0.2);
      ctx.strokeStyle = 'rgba(236,72,153,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke();
      if (!still) {
        const p = (t / 4200 + fl.phase) % 1;
        for (let j = 0; j < 5; j++) {
          const q = p - j * 0.02; if (q < 0) continue;
          const [px, py] = quad(c, q);
          ctx.globalAlpha = (1 - j / 5) * 0.9; ctx.fillStyle = j ? '#f472b6' : '#fff';
          ctx.beginPath(); ctx.arc(px, py, 1.8 - j * 0.25, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    // Cities glowing by how much "sells" there.
    const sprite = glow(PINK);
    model.cities.forEach((c, i) => {
      const x = sx(c.bx), y = sy(c.by);
      if (x < -40 || x > f.w + 40 || y < -40 || y > f.h + 40) return;
      const g = (8 + c.w * 22) * zf * (still ? 1 : 1 + 0.08 * Math.sin(t / 900 + i));
      ctx.globalAlpha = 0.25 + c.w * 0.45;
      ctx.drawImage(sprite, x - g, y - g, g * 2, g * 2);
    });
    ctx.restore();
    model.cities.forEach((c) => {
      const x = sx(c.bx), y = sy(c.by);
      if (x < -10 || x > f.w + 10 || y < -10 || y > f.h + 10) return;
      ctx.fillStyle = '#f472b6'; ctx.strokeStyle = 'rgba(10,23,33,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 1.5 + c.w * 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // Factories.
    for (const [bx, by] of model.factories) {
      ctx.save(); ctx.translate(sx(bx), sy(by)); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#d6d3ce'; ctx.strokeStyle = '#0a1721'; ctx.lineWidth = 2; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.strokeRect(-3.5, -3.5, 7, 7); ctx.restore();
    }
    // One shipment on the road (Jaén to Paris), round and round.
    const pts = model.route.map(([bx, by]) => [sx(bx), sy(by)] as [number, number]);
    ctx.strokeStyle = 'rgba(214,211,206,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = still ? 0 : -t / 50;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = lens.reduce((a, b) => a + b, 0);
    let goal = ((t / 16000) % 1) * total, seg = 0;
    while (seg < lens.length - 1 && goal > lens[seg]) { goal -= lens[seg]; seg++; }
    const e = lens[seg] ? goal / lens[seg] : 0, a = pts[seg], b = pts[seg + 1];
    const mx = a[0] + (b[0] - a[0]) * e, my = a[1] + (b[1] - a[1]) * e;
    ctx.fillStyle = PINK; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Ripples where "scans" land.
    ripples.current = ripples.current.filter((r) => t - r.born < 1800);
    for (const r of ripples.current) {
      const p = (t - r.born) / 1800;
      if (p < 0) continue;
      ctx.globalAlpha = Math.pow(1 - p, 1.5); ctx.strokeStyle = r.amber ? AMBER : PINK; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx(r.bx), sy(r.by), 3 + p * 26, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  return <WorldCanvas ref={map} interactive={false} label="An illustration of the live market map: products scanned in cities around the world" homeBox={TOURS[0]} dark live={!calm} draw={draw} className={className} />;
}
