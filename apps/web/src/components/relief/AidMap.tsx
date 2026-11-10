'use client';

import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { glow, toBase } from '@/components/trace/map/engine';
import { WorldCanvas, type Box, type Frame } from '@/components/trace/map/WorldCanvas';
import { useDarkMode } from '@/lib/use-dark';

// M154: an aid box's trip on the map (the donor page /aid/<code>): the places it passed, joined by a
// dashed route that flows while the box is on its way, the latest one glowing. Positions are rounded to
// about 500 m when saved, so the map never shows an exact spot. Loaded only on that page.

const ROUTE = '#f97316';
export interface AidPoint { lat: number; lng: number; place: string | null }

export default function AidMap({ points, moving }: { points: AidPoint[]; moving: boolean }) {
  const dark = useDarkMode();
  const calm = !!useReducedMotion();
  const base = useMemo(() => points.map((p) => ({ ...p, b: toBase(p.lng, p.lat) })), [points]);
  const home = useMemo<Box>(() => {
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    const pad = Math.max(0.6, (Math.max(...lats) - Math.min(...lats)) * 0.35, (Math.max(...lngs) - Math.min(...lngs)) * 0.35);
    return [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
  }, [points]);
  // The map's own city names would double the box's places: leave those out.
  const skip = useMemo(() => new Set(points.flatMap((p) => (p.place ? [p.place] : []))), [points]);
  const draw = (f: Frame) => {
    const { ctx, t } = f;
    const xy = base.map((p) => [f.sx(p.b[0]), f.sy(p.b[1])] as const);
    ctx.save();
    ctx.setLineDash([7, 7]); ctx.lineDashOffset = moving && !calm ? -t / 45 : 0;
    ctx.strokeStyle = ROUTE; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.globalAlpha = 0.95;
    ctx.beginPath(); xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.restore();
    const g = glow(ROUTE);
    xy.forEach(([x, y], i) => {
      const last = i === xy.length - 1;
      if (last) {
        const ph = moving && !calm ? (t / 1600) % 1 : 0.35;
        ctx.globalAlpha = 0.55 * (1 - ph); ctx.drawImage(g, x - 14 - ph * 26, y - 14 - ph * 26, 28 + ph * 52, 28 + ph * 52); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = last ? ROUTE : dark ? '#fafafa' : '#18181b';
      ctx.strokeStyle = dark ? '#0b0b0c' : '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, last ? 7 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const label = base[i].place;
      if (label) {
        ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = dark ? 'rgba(11,11,12,0.9)' : 'rgba(255,255,255,0.92)'; ctx.strokeText(label, x + 11, y);
        ctx.fillStyle = dark ? '#f4f4f5' : '#18181b'; ctx.fillText(label, x + 11, y);
      }
    });
  };
  const where = points.map((p) => p.place).filter(Boolean).join(', then ');
  return (
    <WorldCanvas label={`Map of the box’s trip${where ? `: ${where}` : ''}`} homeBox={home} dark={dark} live={moving && !calm} draw={draw} skipCities={skip} interactive={false} className="w-full h-56 sm:h-64 rounded-xl overflow-hidden" />
  );
}
