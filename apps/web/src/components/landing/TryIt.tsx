'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Bike, Bus, Car, Check, Droplets, Footprints, HandHeart, Home, Minus, Plus, Recycle, Stethoscope, Sun, Trash2, TreePine, Utensils, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { glow, toBase } from '@/components/trace/map/engine';
import { WorldCanvas, type Box, type Frame } from '@/components/trace/map/WorldCanvas';
import { GREEN_FACTORS, GREEN_KINDS, co2For, type GreenKind } from '@/lib/green';
import { URGENCY_COLOR, URGENCY_LABEL, type Urgency } from '@/lib/relief';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { tile, ghost, primary, useCalm } from './bits';

// "Try it here" on the landing's Relief and Green tabs (M43): logging a green
// action and the help map, played in the browser on made-up data. Nothing is sent or saved.

const chip = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 active:scale-[0.97]';

// ── Green: log an action, see the CO₂ it saves ──

const KIND: Record<GreenKind, { icon: LucideIcon; short: string; start: number; step: number }> = {
  TREE: { icon: TreePine, short: 'Trees', start: 1, step: 1 },
  CYCLE: { icon: Bike, short: 'Bike', start: 10, step: 5 },
  TRANSIT: { icon: Bus, short: 'Bus or train', start: 20, step: 10 },
  WALK: { icon: Footprints, short: 'Walk', start: 3, step: 1 },
  RECYCLE: { icon: Recycle, short: 'Recycle', start: 5, step: 1 },
  SOLAR: { icon: Sun, short: 'Solar', start: 20, step: 10 },
  MEATFREE: { icon: Utensils, short: 'Meat-free', start: 2, step: 1 },
  CLEANUP: { icon: Trash2, short: 'Clean-up', start: 3, step: 1 },
};

export function GreenTry() {
  const [kind, setKind] = useState<GreenKind>('CYCLE');
  const [amount, setAmount] = useState(KIND.CYCLE.start);
  const [log, setLog] = useState<{ id: number; kind: GreenKind; amount: number; kg: number }[]>([]);
  const f = GREEN_FACTORS[kind], k = KIND[kind];
  const kg = co2For(kind, amount);
  const total = Math.round(log.reduce((a, x) => a + x.kg, 0) * 10) / 10;

  const choose = (g: GreenKind) => { setKind(g); setAmount(KIND[g].start); };
  const add = () => {
    haptic('success');
    setLog((l) => [{ id: (l[0]?.id ?? 0) + 1, kind, amount, kg }, ...l].slice(0, 4));
  };

  return (
    <div className={`${tile} p-5 sm:p-7 grid lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-8`}>
      <div>
        <div role="group" aria-label="Action" className="flex flex-wrap gap-2">
          {GREEN_KINDS.map((g) => {
            const I = KIND[g].icon, on = g === kind;
            return (
              <button key={g} type="button" aria-pressed={on} onClick={() => choose(g)}
                className={cn(chip, on ? 'bg-emerald-400 text-emerald-950' : 'bg-white/[0.05] text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]')}>
                <I className="w-4 h-4" aria-hidden />{KIND[g].short}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button type="button" aria-label={`Less (${f.units})`} onClick={() => setAmount((a) => Math.max(k.step, a - k.step))} className="w-11 h-11 grid place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 text-white active:scale-95 transition-transform"><Minus className="w-4 h-4" aria-hidden /></button>
          <p className="min-w-[7rem] text-center text-2xl font-bold text-white tabular-nums" aria-live="polite">{amount} <span className="text-base font-medium text-zinc-400">{amount === 1 ? f.unit : f.units}</span></p>
          <button type="button" aria-label={`More (${f.units})`} onClick={() => setAmount((a) => Math.min(f.max, a + k.step))} className="w-11 h-11 grid place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 text-white active:scale-95 transition-transform"><Plus className="w-4 h-4" aria-hidden /></button>
        </div>
        <p className="mt-6 font-mono text-4xl sm:text-5xl font-light tabular-nums text-emerald-300">−{kg.toLocaleString('en-US')}<span className="ms-2 text-base text-zinc-400">kg CO₂</span></p>
        <p className="mt-2 text-xs text-zinc-400 max-w-sm">{f.how}.</p>
        <button type="button" onClick={add} className={`${primary} mt-6`}><Check className="w-4 h-4" aria-hidden />Log it</button>
      </div>
      <div className="rounded-3xl bg-white/[0.04] ring-1 ring-white/[0.07] p-5 flex flex-col">
        <p className="text-sm text-zinc-400">Saved on this visit</p>
        <p className="mt-1 font-mono text-4xl font-light tabular-nums text-white" aria-live="polite">{total.toLocaleString('en-US')} <span className="text-base text-zinc-400">kg</span></p>
        <ul className="mt-4 space-y-2 flex-1">
          <AnimatePresence initial={false}>
            {log.map((x) => {
              const I = KIND[x.kind].icon;
              return (
                <motion.li key={x.id} layout initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3.5 py-2.5">
                  <I className="w-4 h-4 text-emerald-300" aria-hidden />
                  <span className="flex-1 text-sm text-white">{x.amount} {x.amount === 1 ? GREEN_FACTORS[x.kind].unit : GREEN_FACTORS[x.kind].units}</span>
                  <span className="font-mono text-sm text-emerald-300">−{x.kg} kg</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {!log.length && <li className="text-sm text-zinc-400">Pick an action and log it.</li>}
        </ul>
        {log.length > 0 && <Link href="/register?app=green" className={`${ghost} mt-4 self-start`}>Keep it with an account</Link>}
      </div>
    </div>
  );
}

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
    <div className={`${tile} overflow-hidden grid lg:grid-cols-[1.4fr_1fr]`}>
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
