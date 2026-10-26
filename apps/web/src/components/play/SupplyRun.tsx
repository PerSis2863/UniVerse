'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import { CloudRain, Droplets, HeartPulse, Package, Plane, Tent, Truck, Users, Wheat } from 'lucide-react';
import {
  AIRDROP_EVERY_MS, AIRDROP_FIRST_MS, AIRDROP_MS, DISTRICTS, DONATION, GRID, STOCK_MAX, STOCK_REFILL_MS, STOCK_START, SUPPLY_KINDS, SUPPLY_LABEL, SUPPLY_MISSED, SUPPLY_WRONG, TRUCKS,
  supplyEvents, supplyPoints, supplySchedule, travelMs, type Need, type SupplyKind,
} from '@/lib/play/supply';
import { GAMES } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { Burst } from './fx';
import type { GameProps } from './game-props';

// Supply Run (src/lib/play/supply.ts): a town drawn as a little map (river, roads, houses, parks),
// needs popping up with a ring that runs out, red ones critical. Pick a supply (tap, or keys 1–4),
// tap a need: one of three trucks drives from the depot (further takes longer), delivers and comes
// back. Each supply has a stock that refills slowly; donations top it up, rain slows the trucks.

export const KIND_ICON: Record<SupplyKind, typeof Wheat> = { food: Wheat, water: Droplets, medical: HeartPulse, shelter: Tent };
export const KIND_COLOR: Record<SupplyKind, string> = { food: '#f97316', water: '#38bdf8', medical: '#ef4444', shelter: '#e879f9' };
const EXIT_MS = 400;
const full = () => Object.fromEntries(SUPPLY_KINDS.map((k) => [k, STOCK_START])) as Record<SupplyKind, number>;

interface Trip { id: number; need: Need; kind: SupplyKind; depart: number; arrive: number; back: number; done: boolean; air?: boolean }
const trucksOut = (trips: Trip[]) => trips.filter((x) => !x.air).length;
interface S {
  t: number; done: Record<number, 'ok' | 'missed'>; score: number; helped: number; deliveries: number; critical: number; missed: number;
  stock: Record<SupplyKind, number>; trips: Trip[]; seq: number; flash: { id: number; ok: boolean; n: number } | null;
  /** When the airdrop is ready again (clock time). */
  airAt: number;
}
type A =
  | { t: 'tick'; at: number }
  | { t: 'send'; need: Need; kind: SupplyKind; at: number; rain: boolean; air?: boolean }
  | { t: 'arrive'; id: number; at: number }
  | { t: 'back'; id: number }
  | { t: 'refill' }
  | { t: 'donation' };

function reducer(start: number, needs: Need[]) {
  return (s: S, a: A): S => {
    const at = 'at' in a ? a.at - start : s.t - start;
    let { score, missed } = s;
    const done = { ...s.done };
    for (const n of needs) if (!done[n.id] && n.at + n.ttl <= at) { done[n.id] = 'missed'; score = Math.max(0, score - SUPPLY_MISSED); missed++; }
    const base = { ...s, t: 'at' in a ? a.at : s.t, done, score, missed };
    if (a.t === 'tick') return base;
    if (a.t === 'refill') return { ...base, stock: Object.fromEntries(SUPPLY_KINDS.map((k) => [k, Math.min(STOCK_MAX, s.stock[k] + 1)])) as Record<SupplyKind, number> };
    if (a.t === 'donation') return { ...base, stock: Object.fromEntries(SUPPLY_KINDS.map((k) => [k, s.stock[k] + DONATION])) as Record<SupplyKind, number> };
    if (a.t === 'back') return { ...base, trips: s.trips.filter((x) => x.id !== a.id) };
    if (a.t === 'send') {
      if (done[a.need.id] || (a.air ? s.airAt > a.at : trucksOut(s.trips) >= TRUCKS) || s.stock[a.kind] <= 0 || s.trips.some((x) => x.need.id === a.need.id && !x.done)) return base;
      const go = a.air ? AIRDROP_MS : travelMs(a.need.x, a.need.y, a.rain);
      const trip: Trip = { id: s.seq, need: a.need, kind: a.kind, depart: a.at, arrive: a.at + go, back: a.air ? a.at + go + 350 : a.at + go * 2 + 200, done: false, air: a.air };
      return { ...base, seq: s.seq + 1, trips: [...s.trips, trip], stock: { ...s.stock, [a.kind]: s.stock[a.kind] - 1 }, airAt: a.air ? a.at + AIRDROP_EVERY_MS : s.airAt };
    }
    // A truck reached its district.
    const trip = s.trips.find((x) => x.id === a.id);
    if (!trip || trip.done) return base;
    const trips = s.trips.map((x) => (x.id === a.id ? { ...x, done: true } : x));
    const n = trip.need;
    if (done[n.id]) return { ...base, trips };
    if (trip.kind !== n.kind) return { ...base, trips, score: Math.max(0, score - SUPPLY_WRONG), flash: { id: n.id, ok: false, n: (s.flash?.n ?? 0) + 1 } };
    done[n.id] = 'ok';
    return {
      ...base, trips, score: score + supplyPoints(n.people, n.at + n.ttl - at, n.ttl, n.critical), helped: s.helped + n.people, deliveries: s.deliveries + 1,
      critical: s.critical + (n.critical ? 1 : 0), flash: { id: n.id, ok: true, n: (s.flash?.n ?? 0) + 1 },
    };
  };
}

/** Where a district's middle is, as a share of the map (0–1). */
const spot = (n: { x: number; y: number }) => ({ x: (n.x + 0.5) / GRID.cols, y: (n.y + 0.5) / GRID.rows });

/** The town, drawn once: land, a river with bridges, roads, houses and parks (the same every round). */
function Town() {
  const houses: React.ReactNode[] = [];
  for (let k = 0; k < GRID.cols * GRID.rows; k++) {
    const cx = (k % GRID.cols) * 100, cy = Math.floor(k / GRID.cols) * 100;
    if ((k * 7) % 5 === 0) {
      for (let j = 0; j < 4; j++) houses.push(<circle key={`t${k}-${j}`} cx={cx + 26 + ((j * 23 + k * 11) % 52)} cy={cy + 28 + ((j * 31 + k * 7) % 46)} r={9 + ((j + k) % 3) * 2} fill={j % 2 ? '#1e3a2b' : '#24472f'} />);
      continue;
    }
    for (let j = 0; j < 3; j++) {
      const x = cx + 18 + ((j * 29 + k * 13) % 50), y = cy + 22 + ((j * 23 + k * 17) % 44), w = 16 + ((j + k) % 3) * 4;
      houses.push(<g key={`h${k}-${j}`}><rect x={x} y={y} width={w} height={w * 0.8} rx={2} fill={['#2c3036', '#33373e', '#3a3f46'][(j + k) % 3]} /><path d={`M${x - 2} ${y}l${w / 2 + 2} -${w * 0.45} ${w / 2 + 2} ${w * 0.45}z`} fill="#4a4f57" /><rect x={x + w * 0.35} y={y + w * 0.35} width={w * 0.3} height={w * 0.45} fill="#facc15" opacity={0.35} /></g>);
    }
  }
  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="600" height="400" fill="#16191c" />
      <path d="M-20 70 C 120 60, 180 170, 300 160 S 470 300, 620 330" fill="none" stroke="#173b52" strokeWidth="34" />
      <path d="M-20 70 C 120 60, 180 170, 300 160 S 470 300, 620 330" fill="none" stroke="#1f5675" strokeWidth="22" />
      <path d="M-20 70 C 120 60, 180 170, 300 160 S 470 300, 620 330" fill="none" stroke="#7dd3fc" strokeWidth="1" strokeDasharray="6 14" opacity="0.35" />
      {[100, 200, 300].map((y) => <line key={`r${y}`} x1="0" y1={y} x2="600" y2={y} stroke="#25292e" strokeWidth="7" />)}
      {[100, 200, 300, 400, 500].map((x) => <line key={`c${x}`} x1={x} y1="0" x2={x} y2="400" stroke="#25292e" strokeWidth="7" />)}
      {[100, 200, 300].map((y) => <line key={`d${y}`} x1="0" y1={y} x2="600" y2={y} stroke="#4b5058" strokeWidth="1" strokeDasharray="8 10" />)}
      {[100, 200, 300, 400, 500].map((x) => <line key={`e${x}`} x1={x} y1="0" x2={x} y2="400" stroke="#4b5058" strokeWidth="1" strokeDasharray="8 10" />)}
      {houses}
      <rect x="262" y="176" width="76" height="48" rx="8" fill="#0b0b0c" stroke="#ec4899" strokeOpacity="0.6" />
    </svg>
  );
}

export function SupplyRun({ seed, startsAt, clock, onProgress, onStats }: GameProps) {
  const needs = useMemo(() => supplySchedule(seed, GAMES.supply.seconds), [seed]);
  const events = useMemo(() => supplyEvents(seed, GAMES.supply.seconds), [seed]);
  const run = useMemo(() => reducer(startsAt, needs), [startsAt, needs]);
  const [s, dispatch] = useReducer(run, startsAt, (t): S => ({ t, done: {}, score: 0, helped: 0, deliveries: 0, critical: 0, missed: 0, stock: full(), trips: [], seq: 0, flash: null, airAt: t + AIRDROP_FIRST_MS }));
  const [armed, setArmed] = useState(false);
  const [kind, setKind] = useState<SupplyKind>('food');
  const [rain, setRain] = useState(false);
  const { announce, shake, sfx } = useArena();
  const calm = useReducedMotion();

  // Wake at the next moment something changes: a need appears or runs out.
  useEffect(() => {
    const now = s.t - startsAt;
    let next = Infinity;
    for (const n of needs) {
      if (n.at > now) next = Math.min(next, n.at);
      else if (!s.done[n.id] && n.at + n.ttl > now) next = Math.min(next, n.at + n.ttl);
      else if (n.at + n.ttl + EXIT_MS > now) next = Math.min(next, n.at + n.ttl + EXIT_MS);
    }
    if (next === Infinity) return;
    const id = setTimeout(() => dispatch({ t: 'tick', at: clock() }), Math.max(0, startsAt + next - clock()));
    return () => clearTimeout(id);
  }, [s.t, s.done, needs, startsAt, clock]);
  // Trucks arrive and come back on time.
  useEffect(() => {
    const ids = s.trips.map((x) => x.done ? setTimeout(() => dispatch({ t: 'back', id: x.id }), Math.max(0, x.back - clock())) : setTimeout(() => dispatch({ t: 'arrive', id: x.id, at: clock() }), Math.max(0, x.arrive - clock())));
    return () => ids.forEach(clearTimeout);
  }, [s.trips, clock]);
  // The depot restocks slowly; the day's events.
  useEffect(() => { const id = setInterval(() => dispatch({ t: 'refill' }), STOCK_REFILL_MS); return () => clearInterval(id); }, []);
  useEffect(() => {
    const ids = events.flatMap((e) => e.kind === 'donation'
      ? [setTimeout(() => { dispatch({ t: 'donation' }); announce(`Donation! +${DONATION} of everything`, 'good'); sfx('power'); }, Math.max(0, startsAt + e.at - clock()))]
      : [setTimeout(() => { setRain(true); announce('Rain: trucks are slower', 'bad'); sfx('splash'); }, Math.max(0, startsAt + e.at - clock())), setTimeout(() => setRain(false), Math.max(0, startsAt + e.until - clock()))]);
    return () => ids.forEach(clearTimeout);
  }, [events, startsAt, clock, announce, sfx]);

  useEffect(() => { onProgress(s.score, s.deliveries); }, [s.score, s.deliveries, onProgress]);
  useEffect(() => {
    onStats?.([
      { label: 'People helped', value: String(s.helped) }, { label: 'Deliveries', value: String(s.deliveries) },
      { label: 'Critical saved', value: String(s.critical) }, { label: 'Missed', value: String(s.missed) },
    ]);
  }, [s.helped, s.deliveries, s.critical, s.missed, onStats]);
  useEffect(() => {
    if (!s.flash) return;
    const n = needs.find((x) => x.id === s.flash!.id);
    if (s.flash.ok) { sfx('right', Math.min(8, s.deliveries)); if (n?.critical) announce('Critical need met! ×2', 'gold'); else if (s.deliveries % 5 === 0) announce(`${s.helped} people helped!`, 'good'); }
    else { sfx('wrong'); shake(0.6); announce('Wrong supply', 'bad'); }
  }, [s.flash, needs, s.deliveries, s.helped, sfx, announce, shake]);

  const airReady = s.t >= s.airAt;
  // Wake when the airdrop is ready again (so its button lights up).
  useEffect(() => {
    if (airReady) return;
    const id = setTimeout(() => { dispatch({ t: 'tick', at: clock() }); sfx('power'); }, Math.max(0, s.airAt - clock()));
    return () => clearTimeout(id);
  }, [airReady, s.airAt, clock, sfx]);
  const send = (n: Need) => {
    if (armed && airReady) {
      if (s.stock[kind] <= 0) { announce(`Out of ${SUPPLY_LABEL[kind].toLowerCase()}`, 'bad'); sfx('wrong'); return; }
      dispatch({ t: 'send', need: n, kind, at: clock(), rain, air: true });
      setArmed(false); sfx('boost'); announce('Airdrop!', 'gold');
      return;
    }
    if (trucksOut(s.trips) >= TRUCKS) { announce('All trucks are out', 'bad'); sfx('wrong'); return; }
    if (s.stock[kind] <= 0) { announce(`Out of ${SUPPLY_LABEL[kind].toLowerCase()}`, 'bad'); sfx('wrong'); return; }
    if (s.trips.some((x) => x.need.id === n.id && !x.done)) { announce('A truck is on its way', 'pink'); return; }
    dispatch({ t: 'send', need: n, kind, at: clock(), rain });
    sfx('whoosh');
    navigator.vibrate?.(8);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = ['1', '2', '3', '4'].indexOf(e.key);
      if (k >= 0 && !e.metaKey && !e.ctrlKey) setKind(SUPPLY_KINDS[k]);
      if (e.key.toLowerCase() === 'h') document.getElementById('supply-air')?.click();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const now = s.t - startsAt;
  const shown = needs.filter((n) => n.at <= now && now < n.at + n.ttl + (s.done[n.id] ? EXIT_MS : 0));
  const open = shown.filter((n) => !s.done[n.id]);
  const serving = new Set(s.trips.filter((x) => !x.done).map((x) => x.need.id));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <p className="font-medium text-zinc-300"><Users className="inline w-4 h-4 me-1 -mt-0.5 text-pink-300" aria-hidden /><span className="tabular-nums text-white">{s.helped}</span> people helped</p>
        <p className="text-zinc-400"><span className="tabular-nums text-white">{open.length}</span> waiting</p>
        <button id="supply-air" type="button" onClick={() => setArmed((a) => airReady && !a)} disabled={!airReady} aria-pressed={armed}
          className={cn('ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-[background-color,opacity,transform] duration-150 active:scale-95 disabled:opacity-40',
            armed ? 'bg-amber-300 text-amber-950 ring-amber-200' : 'bg-white/[0.06] text-zinc-100 ring-white/15 hover:bg-white/[0.12]')}>
          <Plane className="w-3.5 h-3.5" aria-hidden />{armed ? 'Tap a need' : airReady ? 'Airdrop' : 'Airdrop soon'}<kbd className="hidden rounded bg-black/30 px-1 text-[11px] font-medium sm:inline">H</kbd>
        </button>
        <p className="flex items-center gap-1.5 text-zinc-400" aria-label={`${TRUCKS - trucksOut(s.trips)} of ${TRUCKS} trucks free`}>
          {Array.from({ length: TRUCKS }, (_, i) => <Truck key={i} className={cn('w-5 h-5 transition-colors', i < TRUCKS - trucksOut(s.trips) ? 'text-white' : 'text-zinc-600')} aria-hidden />)}
        </p>
        {rain && <p className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-200 ring-1 ring-sky-400/30"><CloudRain className="w-4 h-4" aria-hidden />Rain</p>}
      </div>

      <div className="relative mt-3 aspect-[3/2] w-full overflow-hidden rounded-[1.75rem] ring-1 ring-white/10">
        <Town />
        {rain && <div className="play-rain pointer-events-none absolute -inset-[20%] opacity-60" aria-hidden />}
        <div className="pointer-events-none absolute inset-0 hidden grid-cols-6 grid-rows-4 sm:grid" aria-hidden>
          {DISTRICTS.map((d) => <span key={d} className="p-1.5 text-[11px] font-medium text-zinc-500">{d}</span>)}
        </div>
        {/* The depot */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center" aria-hidden>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pink-600 text-white shadow-[0_0_30px_rgba(236,72,153,0.5)]"><Package className="w-6 h-6" /></span>
        </div>

        {shown.map((n) => {
          const p = spot(n), Icon = KIND_ICON[n.kind], state = s.done[n.id];
          return (
            <NeedPin key={n.id} need={n} at={p} appearedAgo={now - n.at} state={state} serving={serving.has(n.id)} shake={s.flash && !s.flash.ok && s.flash.id === n.id ? s.flash.n : 0} calm={!!calm} onPick={() => send(n)}>
              <Icon className="w-5 h-5" aria-hidden />
            </NeedPin>
          );
        })}

        {/* Trucks: a full-size layer slid by a share of the map, so each truck crosses town on the GPU and comes back. */}
        {s.trips.map((t) => {
          const p = spot(t.need), total = t.back - t.depart, outShare = (t.arrive - t.depart) / total;
          if (t.air) return (
            // The helicopter flies straight over the rooftops, drops, and is gone.
            <motion.div key={t.id} className="pointer-events-none absolute inset-0" initial={{ x: '0%', y: '0%', opacity: 1 }}
              animate={{ x: `${(p.x - 0.5) * 100}%`, y: `${(p.y - 0.5) * 100}%`, opacity: [1, 1, 0] }}
              transition={calm ? { duration: 0 } : { duration: total / 1000, times: [0, outShare, 1], ease: 'easeOut' }} aria-hidden>
              <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-300 text-amber-950 shadow-[0_0_24px_rgba(252,211,77,0.6)] ring-2 ring-[#0b0b0c]">
                <Plane className="w-5 h-5" />
              </span>
            </motion.div>
          );
          return (
            <motion.div key={t.id} className="pointer-events-none absolute inset-0" initial={{ x: '0%', y: '0%' }}
              animate={{ x: ['0%', `${(p.x - 0.5) * 100}%`, `${(p.x - 0.5) * 100}%`, '0%'], y: ['0%', `${(p.y - 0.5) * 100}%`, `${(p.y - 0.5) * 100}%`, '0%'] }}
              transition={calm ? { duration: 0 } : { duration: total / 1000, times: [0, outShare, Math.min(0.99, outShare + 200 / total), 1], ease: 'easeInOut' }} aria-hidden>
              <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg ring-2 ring-[#0b0b0c]" style={{ background: KIND_COLOR[t.kind] }}>
                <Truck className="w-4 h-4" />
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Supply to send">
        {SUPPLY_KINDS.map((k, i) => {
          const Icon = KIND_ICON[k], on = kind === k, left = s.stock[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setKind(k)}
              className={cn('relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-xs font-semibold ring-1 transition-[box-shadow,color,transform] duration-150 active:scale-[0.97]',
                on ? 'text-white ring-transparent' : 'text-zinc-200 ring-white/10')}>
              {on && <motion.span layoutId="supply-pick" className="absolute inset-0 rounded-2xl bg-[#1e1e21]" style={{ boxShadow: `0 0 0 2px ${KIND_COLOR[k]}, 0 8px 24px ${KIND_COLOR[k]}55` }} transition={spring.snappy} aria-hidden />}
              <Icon className="relative w-5 h-5" style={{ color: KIND_COLOR[k] }} aria-hidden />
              <span className="relative">{SUPPLY_LABEL[k]} <span className="tabular-nums text-zinc-400">{left}</span></span>
              <span className="relative flex gap-0.5" aria-hidden>
                {Array.from({ length: Math.max(STOCK_MAX, left) }, (_, j) => <span key={j} className="h-1.5 w-2 rounded-full transition-colors" style={{ background: j < left ? KIND_COLOR[k] : 'rgba(255,255,255,0.12)' }} />)}
              </span>
              <span className="relative hidden text-[11px] font-normal text-zinc-400 sm:block" aria-hidden>key {i + 1}</span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{open.length ? `${open.length} needs waiting. Newest: ${DISTRICTS[open.at(-1)!.y * GRID.cols + open.at(-1)!.x]} needs ${SUPPLY_LABEL[open.at(-1)!.kind]}${open.at(-1)!.critical ? ', critical' : ''}.` : ''}</p>
    </div>
  );
}

function NeedPin({ need, at, appearedAgo, state, serving, shake, calm, onPick, children }: {
  need: Need; at: { x: number; y: number }; appearedAgo: number; state?: 'ok' | 'missed'; serving: boolean; shake: number; calm: boolean; onPick: () => void; children: React.ReactNode;
}) {
  // How far the ring had run when this pin first showed (kept, so the ring never jumps).
  const [ago] = useState(appearedAgo);
  const color = KIND_COLOR[need.kind];
  const where = DISTRICTS[need.y * GRID.cols + need.x];
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}>
      <motion.button type="button" disabled={!!state} onClick={onPick}
        initial={{ opacity: 0, scale: calm ? 1 : 0.85, y: calm ? 0 : -8 }} animate={{ opacity: state ? 0 : 1, scale: state === 'ok' && !calm ? 1.2 : 1, y: 0 }} transition={state ? { duration: 0.4 } : spring.bouncy}
        className="relative flex flex-col items-center rounded-full outline-offset-4">
        <span className="sr-only">{where} needs {SUPPLY_LABEL[need.kind].toLowerCase()} for {need.people} {need.people === 1 ? 'person' : 'people'}{need.critical ? ', critical' : ''}</span>
        {!state && <span className={cn('play-ripple absolute inset-x-0 top-0 mx-auto h-12 w-12 rounded-full', need.critical && '[animation-duration:0.9s]')} style={{ background: need.critical ? '#ef4444' : color }} aria-hidden />}
        <span key={shake} className={cn('relative grid h-12 w-12 place-items-center rounded-full text-white shadow-lg ring-2', need.critical ? 'ring-red-400' : 'ring-[#0b0b0c]', shake ? 'play-shake' : '')} style={{ background: color }} aria-hidden>
          {children}
          <span className="absolute -end-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#0b0b0c] px-1 text-[11px] font-bold tabular-nums text-white ring-1 ring-white/20">{need.people}</span>
          {need.critical && <span className="absolute -start-2 -top-2 rounded-full bg-red-500 px-1.5 text-[11px] font-black text-white">×2</span>}
          {serving && <span className="absolute -bottom-1.5 -end-2 grid h-5 w-5 place-items-center rounded-full bg-white text-[#0b0b0c]"><Truck className="w-3 h-3" /></span>}
        </span>
        <span className="relative mt-1 h-1.5 w-10 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <span className="play-drain absolute inset-0 rounded-full" style={{ background: need.critical ? '#ef4444' : color, animationDuration: `${need.ttl}ms`, animationDelay: `${-ago}ms`, animationPlayState: state ? 'paused' : 'running' }} />
        </span>
      </motion.button>
      {state === 'ok' && (
        <>
          <span className="pointer-events-none absolute left-1/2 top-6 h-0 w-0" aria-hidden><Burst color={color} spread={60} /></span>
          <span className="play-float pointer-events-none absolute left-1/2 -top-4 whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white" aria-hidden>+{need.people} helped</span>
        </>
      )}
    </div>
  );
}
