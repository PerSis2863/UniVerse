'use client';

import { useState } from 'react';
import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';

// Live impact map (upgrade 5): verified volunteer hours as dots, drawn as plain SVG. No map tiles:
// the CSP blocks third-party images and tiles would cost requests. The view fits the places shown.

export interface Place { lat: number; lng: number; label: string; hours: number; people: number }

export function ImpactMap({ places, height = 260 }: { places: Place[]; height?: number }) {
  const [hover, setHover] = useState<Place | null>(null);
  if (!places.length) return <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-6 text-sm text-zinc-500 text-center">Verified hours appear here as dots once volunteers check out of shifts that have a location.</div>;
  const W = 600, H = height;
  const lats = places.map((p) => p.lat), lngs = places.map((p) => p.lng);
  // Fit the places with some margin (at least about 0.2° across, so one place isn't infinitely zoomed).
  const pad = (a: number, b: number) => Math.max(0.2, (b - a) * 0.25);
  const minLng = Math.min(...lngs) - pad(Math.min(...lngs), Math.max(...lngs)), maxLng = Math.max(...lngs) + pad(Math.min(...lngs), Math.max(...lngs));
  const minLat = Math.min(...lats) - pad(Math.min(...lats), Math.max(...lats)), maxLat = Math.max(...lats) + pad(Math.min(...lats), Math.max(...lats));
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
  const most = Math.max(...places.map((p) => p.hours), 1);
  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-white/[0.07] bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-500/[0.05] dark:to-indigo-500/[0.05]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Map of ${places.length} places with verified volunteer hours`}>
        {[0.25, 0.5, 0.75].map((f) => <line key={`h${f}`} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-zinc-300/60 dark:stroke-white/10" strokeDasharray="4 6" />)}
        {[0.25, 0.5, 0.75].map((f) => <line key={`v${f}`} y1={0} y2={H} x1={W * f} x2={W * f} className="stroke-zinc-300/60 dark:stroke-white/10" strokeDasharray="4 6" />)}
        {places.map((p, i) => (
          <motion.circle key={`${p.lat},${p.lng}`} cx={x(p.lng)} cy={y(p.lat)} initial={{ r: 0 }} animate={{ r: 5 + 14 * Math.sqrt(p.hours / most) }} transition={{ ...spring.gentle, delay: i * 0.03 }}
            className="fill-emerald-500/60 stroke-emerald-600 dark:stroke-emerald-300 cursor-pointer" strokeWidth={1.5} tabIndex={0}
            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}>
            <title>{`${p.label}: ${p.hours} h by ${p.people} volunteer${p.people === 1 ? '' : 's'}`}</title>
          </motion.circle>
        ))}
      </svg>
      {hover && <p className="absolute left-3 bottom-3 rounded-lg bg-white/90 dark:bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 shadow">{hover.label} · <b>{hover.hours} h</b> · {hover.people} volunteer{hover.people === 1 ? '' : 's'}</p>}
    </div>
  );
}
