'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Droplets, HeartPulse, Tent, Truck, Users, Wheat } from 'lucide-react';
import { DISTRICTS, GRID, SUPPLY_KINDS, SUPPLY_LABEL, SUPPLY_MISSED, SUPPLY_WRONG, supplyPoints, supplySchedule, type Need, type SupplyKind } from '@/lib/play/supply';
import { GAMES } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';

// Supply Run (src/lib/play/supply.ts): needs pop up across the town, each asking for one supply for
// some people before its ring runs out. Pick a supply (tap, or keys 1–4), then tap the need: a truck
// drives it from the depot. The right supply helps those people; the wrong one costs time and points.

export const KIND_ICON: Record<SupplyKind, typeof Wheat> = { food: Wheat, water: Droplets, medical: HeartPulse, shelter: Tent };
export const KIND_COLOR: Record<SupplyKind, string> = { food: '#f97316', water: '#38bdf8', medical: '#ef4444', shelter: '#e879f9' };
const EXIT_MS = 400;

interface S { t: number; done: Record<number, 'ok' | 'missed'>; score: number; helped: number; step: number; wrong: { id: number; n: number } | null }
type A = { t: 'tick'; at: number } | { t: 'deliver'; need: Need; kind: SupplyKind; at: number };

function reducer(start: number, needs: Need[]) {
  return (s: S, a: A): S => {
    const at = a.at - start;
    let { score } = s;
    const done = { ...s.done };
    for (const n of needs) if (!done[n.id] && n.at + n.ttl <= at) { done[n.id] = 'missed'; score = Math.max(0, score - SUPPLY_MISSED); }
    if (a.t === 'tick') return { ...s, t: a.at, done, score };
    const n = a.need;
    if (done[n.id] || at < n.at) return { ...s, t: a.at, done, score };
    if (a.kind !== n.kind) return { ...s, t: a.at, done, score: Math.max(0, score - SUPPLY_WRONG), step: s.step + 1, wrong: { id: n.id, n: (s.wrong?.n ?? 0) + 1 } };
    done[n.id] = 'ok';
    return { ...s, t: a.at, done, score: score + supplyPoints(n.people, n.at + n.ttl - at, n.ttl), helped: s.helped + n.people, step: s.step + 1 };
  };
}

/** Where a district's middle is, as a share of the map (0–1). */
const spot = (n: { x: number; y: number }) => ({ x: (n.x + 0.5) / GRID.cols, y: (n.y + 0.5) / GRID.rows });

export function SupplyRun({ seed, startsAt, clock, onProgress }: GameProps) {
  const needs = useMemo(() => supplySchedule(seed, GAMES.supply.seconds), [seed]);
  const run = useMemo(() => reducer(startsAt, needs), [startsAt, needs]);
  const [s, dispatch] = useReducer(run, startsAt, (t): S => ({ t, done: {}, score: 0, helped: 0, step: 0, wrong: null }));
  const [kind, setKind] = useState<SupplyKind>('food');
  const [trips, setTrips] = useState<{ id: number; x: number; y: number; ok: boolean }[]>([]);
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

  useEffect(() => { onProgress(s.score, s.step); }, [s.score, s.step, onProgress]);

  const deliver = (n: Need) => {
    const ok = kind === n.kind;
    const at = clock();
    dispatch({ t: 'deliver', need: n, kind, at });
    navigator.vibrate?.(ok ? 12 : [30, 40, 30]);
    const id = at + n.id / 1000;
    setTrips((t) => [...t.slice(-5), { id, ...spot(n), ok }]);
    setTimeout(() => setTrips((t) => t.filter((x) => x.id !== id)), 900);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = ['1', '2', '3', '4'].indexOf(e.key);
      if (k >= 0 && !e.metaKey && !e.ctrlKey) setKind(SUPPLY_KINDS[k]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const now = s.t - startsAt;
  const shown = needs.filter((n) => n.at <= now && now < n.at + n.ttl + (s.done[n.id] ? EXIT_MS : 0));
  const open = shown.filter((n) => !s.done[n.id]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-zinc-500 dark:text-zinc-400"><Users className="inline w-4 h-4 me-1 -mt-0.5" aria-hidden /><span className="tabular-nums text-zinc-900 dark:text-zinc-100">{s.helped}</span> people helped</p>
        <p className="text-zinc-500 dark:text-zinc-400"><span className="tabular-nums text-zinc-900 dark:text-zinc-100">{open.length}</span> waiting</p>
      </div>

      <div className="relative mt-3 aspect-[3/2] w-full overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 p-1.5 dark:border-white/10 dark:bg-[#101012]">
        <div className="grid h-full w-full gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`, gridTemplateRows: `repeat(${GRID.rows}, 1fr)` }} aria-hidden>
          {DISTRICTS.map((d, k) => (
            <div key={d} className={cn('rounded-xl p-1.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400', (k + Math.floor(k / GRID.cols)) % 2 ? 'bg-white dark:bg-white/[0.05]' : 'bg-white/70 dark:bg-white/[0.03]')}>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        {/* The depot, in the middle of town */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[#141416] text-white shadow-lg ring-4 ring-white dark:ring-[#101012]" aria-hidden>
          <Truck className="w-5 h-5" />
        </div>

        {shown.map((n) => {
          const p = spot(n), Icon = KIND_ICON[n.kind], state = s.done[n.id];
          return (
            <NeedPin key={n.id} need={n} at={p} appearedAgo={now - n.at} state={state} shake={s.wrong?.id === n.id ? s.wrong.n : 0} calm={!!calm} onPick={() => deliver(n)}>
              <Icon className="w-5 h-5" aria-hidden />
            </NeedPin>
          );
        })}

        {/* Trucks: a full-size layer slid by a share of the map, so the truck crosses town on the GPU */}
        <AnimatePresence>
          {trips.map((t) => (
            <motion.div key={t.id} className="pointer-events-none absolute inset-0" initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: `${(t.x - 0.5) * 100}%`, y: `${(t.y - 0.5) * 100}%`, opacity: [1, 1, 0] }}
              transition={calm ? { duration: 0.2 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1], opacity: { times: [0, 0.75, 1], duration: 0.8 } }} aria-hidden>
              <span className={cn('absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg', t.ok ? 'bg-emerald-500' : 'bg-red-500')}>
                <Truck className="w-4 h-4" />
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Supply to send">
        {SUPPLY_KINDS.map((k, i) => {
          const Icon = KIND_ICON[k], on = kind === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setKind(k)}
              className={cn('relative flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-xs font-semibold transition-[border-color,color,transform] duration-150 active:scale-[0.97]',
                on ? 'border-transparent text-white' : 'border-zinc-200 text-zinc-700 dark:border-white/10 dark:text-zinc-200')}>
              {on && <motion.span layoutId="supply-pick" className="absolute inset-0 rounded-2xl bg-[#141416] dark:bg-[#2a2927]" style={{ boxShadow: `0 0 0 2px ${KIND_COLOR[k]}, 0 6px 20px ${KIND_COLOR[k]}55` }} transition={spring.snappy} aria-hidden />}
              <Icon className="relative w-5 h-5" style={{ color: KIND_COLOR[k] }} aria-hidden />
              <span className="relative">{SUPPLY_LABEL[k]}</span>
              <span className={cn('relative hidden text-[11px] font-normal sm:block', on ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400')} aria-hidden>key {i + 1}</span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{open.length ? `${open.length} needs waiting. Newest: ${DISTRICTS[open.at(-1)!.y * GRID.cols + open.at(-1)!.x]} needs ${SUPPLY_LABEL[open.at(-1)!.kind]}.` : ''}</p>
    </div>
  );
}

function NeedPin({ need, at, appearedAgo, state, shake, calm, onPick, children }: {
  need: Need; at: { x: number; y: number }; appearedAgo: number; state?: 'ok' | 'missed'; shake: number; calm: boolean; onPick: () => void; children: React.ReactNode;
}) {
  // How far the ring had run when this pin first showed (kept, so the ring never jumps).
  const [ago] = useState(appearedAgo);
  const color = KIND_COLOR[need.kind];
  const where = DISTRICTS[need.y * GRID.cols + need.x];
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}>
      <motion.button type="button" disabled={!!state} onClick={onPick}
        initial={{ opacity: 0, scale: calm ? 1 : 0.85 }} animate={{ opacity: state ? 0 : 1, scale: state === 'ok' && !calm ? 1.15 : 1 }} transition={state ? { duration: 0.4 } : spring.bouncy}
        className="relative flex flex-col items-center rounded-full outline-offset-4">
        <span className="sr-only">{where} needs {SUPPLY_LABEL[need.kind].toLowerCase()} for {need.people} {need.people === 1 ? 'person' : 'people'}</span>
        {!state && <span className="play-ripple absolute inset-x-0 top-0 mx-auto h-11 w-11 rounded-full" style={{ background: color }} aria-hidden />}
        <span key={shake} className={cn('relative grid h-11 w-11 place-items-center rounded-full text-white shadow-lg ring-2 ring-white dark:ring-[#101012]', shake ? 'play-shake' : '')} style={{ background: color }} aria-hidden>
          {children}
          <span className="absolute -end-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#141416] px-1 text-[11px] font-bold tabular-nums text-white">{need.people}</span>
        </span>
        <span className="relative mt-1 h-1 w-9 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" aria-hidden>
          <span className="play-drain absolute inset-0 rounded-full" style={{ background: color, animationDuration: `${need.ttl}ms`, animationDelay: `${-ago}ms`, animationPlayState: state ? 'paused' : 'running' }} />
        </span>
      </motion.button>
      {state === 'ok' && <span className="play-float pointer-events-none absolute left-1/2 -top-4 whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white" aria-hidden>+{need.people} helped</span>}
    </div>
  );
}
