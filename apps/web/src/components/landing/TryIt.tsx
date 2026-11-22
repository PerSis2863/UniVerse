'use client';

import { useMemo, useState } from 'react';
import { Car, Check, Droplets, HandHeart, Home, Stethoscope, Utensils, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { glow, toBase } from '@/components/trace/map/engine';
import { WorldCanvas, type Box, type Frame } from '@/components/trace/map/WorldCanvas';
import { URGENCY_COLOR, URGENCY_LABEL, type Urgency } from '@/lib/relief';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tile, primary, useCalm } from './bits';

// "Try it here" on the landing's Relief tab (M43; Green's left with Green, M395): the help map, played in the browser
// on made-up data. Nothing is sent or saved.

// ── Relief: the help map with made-up needs; offer help and watch it reach them ──

const CENTER = { lat: 12.97, lng: 77.59 };
const HOME: Box = [CENTER.lng - 0.9, CENTER.lat - 0.55, CENTER.lng + 0.9, CENTER.lat + 0.55];
const NEEDS: { id: string; icon: LucideIcon; what: string; urgency: Urgency; dlat: number; dlng: number }[] = [
  { id: 'water', icon: Droplets, what: 'Drinking water, 40 L', urgency: 'CRITICAL', dlat: 0.21, dlng: -0.38 },
  { id: 'food', icon: Utensils, what: 'Food for a family of 5', urgency: 'HIGH', dlat: -0.26, dlng: 0.31 },
  { id: 'clinic', icon: Stethoscope, what: 'A lift to the clinic', urgency: 'MEDIUM', dlat: 0.3, dlng: 0.42 },
  { id: 'shelter', icon: Home, what: 'Shelter for 2 nights', urgency: 'HIGH', dlat: -0.18, dlng: -0.5 },
  { id: 'van', icon: Car, what: 'Van to move supplies', urgency: 'MEDIUM', dlat: 0.05, dlng: 0.64 },
];
const TRIP_MS = 1400;
const HELPED = '#34d399';

export function ReliefTry() {
  const calm = useCalm();
  const [selected, setSelected] = useState(NEEDS[0].id);
  const [helped, setHelped] = useState<Record<string, number>>({});
  const pts = useMemo(() => NEEDS.map((n) => { const [bx, by] = toBase(CENTER.lng + n.dlng, CENTER.lat + n.dlat); return { ...n, bx, by }; }), []);
  const [hx, hy] = useMemo(() => toBase(CENTER.lng, CENTER.lat), []);
  const sel = NEEDS.find((n) => n.id === selected)!;
  const count = Object.keys(helped).length;

  const offer = () => {
    if (helped[selected]) return;
    haptic('success');
    setHelped((h) => ({ ...h, [selected]: performance.now() }));
    const next = NEEDS.find((n) => n.id !== selected && !helped[n.id]);
    // Then the next need, unless another was picked meanwhile.
    if (next) setTimeout(() => setSelected((cur) => (cur === selected ? next.id : cur)), TRIP_MS + 400);
  };

  const draw = (f: Frame) => {
    const { ctx, t } = f;
    const x0 = f.sx(hx), y0 = f.sy(hy);
    // Trips from you to the needs you said you'd help: a line that grows, then the need turns green.
    for (const p of pts) {
      const at = helped[p.id];
      if (!at) continue;
      const k = calm ? 1 : Math.min(1, (t - at) / TRIP_MS), x = f.sx(p.bx), y = f.sy(p.by);
      ctx.strokeStyle = 'rgba(52,211,153,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x - x0) * k, y0 + (y - y0) * k); ctx.stroke(); ctx.setLineDash([]);
    }
    const g = glow(HELPED);
    for (const p of pts) {
      const x = f.sx(p.bx), y = f.sy(p.by), at = helped[p.id], arrived = at && (calm || t - at >= TRIP_MS);
      const color = arrived ? HELPED : URGENCY_COLOR[p.urgency];
      if (arrived) { ctx.globalAlpha = 0.5; ctx.drawImage(g, x - 22, y - 22, 44, 44); ctx.globalAlpha = 1; }
      else if (!calm && (p.urgency === 'CRITICAL' || p.urgency === 'HIGH')) {
        const ph = ((t / (p.urgency === 'CRITICAL' ? 1100 : 1800)) + (p.bx % 1)) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7; ctx.strokeStyle = color; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, 7 + ph * 22, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color; ctx.strokeStyle = '#0c0c0e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (p.id === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 13 + (calm ? 0 : Math.sin(t / 260) * 1.5), 0, Math.PI * 2); ctx.stroke(); }
    }
    // You, in the middle.
    ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x0, y0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };

  return (
    <div className={`${tile} overflow-hidden grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]`}>
      <div className="relative">
        <WorldCanvas label="A sample map of needs around you" homeBox={HOME} dark live={!calm} draw={draw} interactive={false} className="w-full h-[300px] sm:h-[380px] lg:h-full lg:min-h-[440px]" />
        <span className="absolute top-3 start-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-zinc-200">sample</span>
        <span className="absolute bottom-3 start-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-zinc-200"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white" />you</span>
      </div>
      <div className="p-5 sm:p-6 flex flex-col">
        <p className="text-sm text-zinc-400" aria-live="polite">{count ? `${count} of ${NEEDS.length} helped` : 'Needs near you'}</p>
        <ul className="mt-3 space-y-2">
          {NEEDS.map((n) => {
            const on = n.id === selected, done = !!helped[n.id];
            return (
              <li key={n.id}>
                <button type="button" aria-pressed={on} onClick={() => setSelected(n.id)}
                  className={cn('w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-start ring-1 transition-[background-color,box-shadow] duration-150', on ? 'bg-white/[0.09] ring-white/30' : 'bg-white/[0.04] ring-white/[0.06] hover:bg-white/[0.07]')}>
                  <n.icon className="w-4 h-4 shrink-0 text-orange-300" aria-hidden />
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white">{n.what}</span>
                  {done ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"><Check className="w-3 h-3" aria-hidden />on the way</span>
                    : <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: URGENCY_COLOR[n.urgency], background: `${URGENCY_COLOR[n.urgency]}22` }}>{URGENCY_LABEL[n.urgency]}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto pt-5">
          {helped[selected]
            ? <Link href="/register?app=relief" className={primary}><HandHeart className="w-4 h-4" aria-hidden />Help for real</Link>
            : <button type="button" onClick={offer} className={primary}><HandHeart className="w-4 h-4" aria-hidden />Offer help<span className="sr-only">: {sel.what}</span></button>}
        </div>
      </div>
    </div>
  );
}
