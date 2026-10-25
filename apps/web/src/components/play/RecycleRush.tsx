'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Leaf, Zap } from 'lucide-react';
import { BINS, BIN_COLOR, BIN_LABEL, ITEMS, SORT_MISSED, SORT_WRONG, sortMultiplier, sortPoints, sortSequence, type BeltItem, type Bin } from '@/lib/play/sort';
import { GAMES } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';

// Recycle Rush (src/lib/play/sort.ts): things ride the belt; sort the one at the front into its bin
// (tap a bin, or keys 1–4) before it drops off the end. Streaks raise the multiplier, and each right
// sort adds the CO₂ it saves. The belt moves on the GPU (one animation per item, nothing per frame).

const EXIT_MS = 450;
type Done = 'ok' | 'wrong' | 'missed';
interface S { t: number; done: Record<number, Done>; score: number; streak: number; co2: number; step: number; last: { bin: Bin; ok: boolean; n: number; gained: number } | null }
type A = { t: 'tick'; at: number } | { t: 'sort'; bin: Bin; at: number };

function reducer(start: number, belt: BeltItem[]) {
  return (s: S, a: A): S => {
    const at = a.at - start;
    let { score, streak } = s;
    const done = { ...s.done };
    for (const b of belt) if (!done[b.id] && b.at + b.travel <= at) { done[b.id] = 'missed'; score = Math.max(0, score - SORT_MISSED); streak = 0; }
    if (a.t === 'tick') return { ...s, t: a.at, done, score, streak };
    const front = belt.find((b) => !done[b.id] && b.at <= at && at < b.at + b.travel);
    if (!front) return { ...s, t: a.at, done, score, streak };
    const [, , bin, kg] = ITEMS[front.item];
    const ok = bin === a.bin;
    done[front.id] = ok ? 'ok' : 'wrong';
    const gained = ok ? sortPoints(streak) : 0;
    return {
      ...s, t: a.at, done, step: s.step + 1, streak: ok ? streak + 1 : 0, co2: s.co2 + (ok ? kg : 0),
      score: ok ? score + gained : Math.max(0, score - SORT_WRONG), last: { bin: a.bin, ok, n: (s.last?.n ?? 0) + 1, gained },
    };
  };
}

export function RecycleRush({ seed, startsAt, clock, onProgress }: GameProps) {
  const belt = useMemo(() => sortSequence(seed, GAMES.sort.seconds), [seed]);
  const run = useMemo(() => reducer(startsAt, belt), [startsAt, belt]);
  const [s, dispatch] = useReducer(run, startsAt, (t): S => ({ t, done: {}, score: 0, streak: 0, co2: 0, step: 0, last: null }));
  const calm = useReducedMotion();

  // Wake when an item comes on, drops off, or has finished leaving.
  useEffect(() => {
    const now = s.t - startsAt;
    let next = Infinity;
    for (const b of belt) {
      const end = b.at + b.travel;
      if (b.at > now) next = Math.min(next, b.at);
      else if (!s.done[b.id] && end > now) next = Math.min(next, end);
      else if (end + EXIT_MS > now) next = Math.min(next, end + EXIT_MS);
    }
    if (next === Infinity) return;
    const id = setTimeout(() => dispatch({ t: 'tick', at: clock() }), Math.max(0, startsAt + next - clock()));
    return () => clearTimeout(id);
  }, [s.t, s.done, belt, startsAt, clock]);

  useEffect(() => { onProgress(s.score, s.step); }, [s.score, s.step, onProgress]);
  useEffect(() => { if (s.last) navigator.vibrate?.(s.last.ok ? 10 : [30, 40, 30]); }, [s.last]);

  const sort = (bin: Bin) => dispatch({ t: 'sort', bin, at: clock() });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = ['1', '2', '3', '4'].indexOf(e.key);
      if (k >= 0 && !e.metaKey && !e.ctrlKey) dispatch({ t: 'sort', bin: BINS[k], at: clock() });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [clock]);

  const now = s.t - startsAt;
  const onBelt = belt.filter((b) => b.at <= now && now < b.at + b.travel + (s.done[b.id] ? EXIT_MS : 0));
  const front = onBelt.find((b) => !s.done[b.id]);
  const mult = sortMultiplier(s.streak);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-zinc-500 dark:text-zinc-400"><Leaf className="inline w-4 h-4 me-1 -mt-0.5 text-emerald-500" aria-hidden /><span className="tabular-nums text-zinc-900 dark:text-zinc-100">{s.co2.toFixed(2)}</span> kg CO₂ saved</p>
        <motion.span key={mult} initial={{ scale: calm ? 1 : 1.2 }} animate={{ scale: 1 }} transition={spring.bouncy}
          className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold tabular-nums', mult > 1 ? 'bg-pink-600 text-white shadow-[0_0_24px_rgba(236,72,153,0.45)]' : 'bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-300')}>
          <Zap className="w-4 h-4" aria-hidden />×{mult}
          <span className="font-medium opacity-80">· {s.streak} in a row</span>
        </motion.span>
      </div>

      {/* The belt */}
      <div className="relative mt-4 h-32 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-[#101012]">
        <div className="absolute inset-x-0 bottom-5 h-3 overflow-hidden bg-zinc-300 dark:bg-white/10" aria-hidden>
          <div className="play-stripes h-full w-[calc(100%+48px)] bg-[repeating-linear-gradient(90deg,transparent_0_20px,rgba(0,0,0,0.12)_20px_24px)] dark:bg-[repeating-linear-gradient(90deg,transparent_0_20px,rgba(255,255,255,0.12)_20px_24px)]" />
        </div>
        <div className="absolute inset-y-0 end-0 w-16 bg-gradient-to-l from-red-500/20 to-transparent rtl:bg-gradient-to-r" aria-hidden />
        <div className="absolute inset-x-3 top-3 bottom-8 [container-type:inline-size]">
          {onBelt.map((b) => <OnBelt key={b.id} b={b} start={startsAt} clock={clock} front={b === front} done={s.done[b.id]} />)}
        </div>
      </div>

      {/* What to sort now */}
      <div className="mt-3 flex min-h-12 items-center justify-center gap-3 text-center" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {front ? (
            <motion.p key={front.id} initial={{ opacity: 0, y: calm ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: calm ? 0 : -8 }} transition={spring.smooth} className="text-sm text-zinc-600 dark:text-zinc-300">
              Sort: <span className="text-base font-semibold text-zinc-900 dark:text-white">{ITEMS[front.item][0]}</span>
            </motion.p>
          ) : <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-zinc-500 dark:text-zinc-400">Next one coming…</motion.p>}
        </AnimatePresence>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 sm:gap-3">
        {BINS.map((bin, i) => {
          const hit = s.last?.bin === bin ? s.last : null;
          return (
            <button key={bin} type="button" onClick={() => sort(bin)}
              className="group relative flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-1 pb-2.5 pt-3 text-xs font-semibold text-zinc-800 transition-[border-color,transform] duration-150 hover:border-zinc-300 active:scale-[0.97] dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100">
              <span key={hit?.n ?? 0} className={cn('relative grid h-12 w-12 place-items-center rounded-xl text-white shadow-md', hit && (hit.ok ? 'play-tick' : 'play-shake'))} style={{ background: BIN_COLOR[bin] }} aria-hidden>
                <BinIcon bin={bin} />
                {hit?.ok && <span className="play-float absolute left-1/2 -top-3 whitespace-nowrap rounded-full bg-emerald-700 px-1.5 py-0.5 text-[11px] font-bold">+{hit.gained}</span>}
              </span>
              <span className="leading-tight">{BIN_LABEL[bin]}</span>
              <span className="hidden text-[11px] font-normal text-zinc-500 dark:text-zinc-400 sm:block" aria-hidden>key {i + 1}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
        {s.last && !s.last.ok ? 'Wrong bin. Batteries, phones and chargers go to e-waste; food scraps to compost.' : 'Right bin: points and CO₂ saved. Wrong bin or dropped: points lost.'}
      </p>
    </div>
  );
}

function BinIcon({ bin }: { bin: Bin }) {
  // Simple drawn bins: a lid and a body, the recycling one with arrows.
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14" />
      {bin === 'recycle' && <path d="M10 12l2-2 2 2M12 10v6" />}
      {bin === 'compost' && <path d="M9 15c0-3 3-5 6-5-0 3-2 6-6 5z" />}
      {bin === 'ewaste' && <path d="M13 9l-3 4h4l-3 4" />}
      {bin === 'landfill' && <path d="M10 10v7M14 10v7" />}
    </svg>
  );
}

function OnBelt({ b, start, clock, front, done }: { b: BeltItem; start: number; clock: () => number; front: boolean; done?: Done }) {
  const ref = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const [name, emoji] = ITEMS[b.item];
  // Start to end of the belt, picked up wherever it should be now.
  useEffect(() => {
    const el = ref.current;
    if (!el?.animate) return;
    const sign = getComputedStyle(el).direction === 'rtl' ? '-1 * ' : '';
    const a = el.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(calc(${sign}(100cqw - 100%)), 0, 0)` }], { duration: b.travel, easing: 'linear', fill: 'forwards' });
    a.currentTime = Math.min(b.travel, Math.max(0, clock() - (start + b.at)));
    anim.current = a;
    return () => a.cancel();
  }, [b, start, clock]);
  useEffect(() => { if (done && done !== 'missed') anim.current?.pause(); }, [done]);
  return (
    <div ref={ref} className="absolute start-0 top-0 flex w-16 flex-col items-center">
      <div className={cn('flex flex-col items-center', done === 'ok' ? 'play-sorted' : done === 'wrong' || done === 'missed' ? 'play-dropped' : '')}>
        <span className={cn('grid h-14 w-14 place-items-center rounded-2xl bg-white text-3xl shadow-md transition-[box-shadow,transform] duration-200 dark:bg-[#1B1B1E]',
          front ? 'scale-110 shadow-[0_0_0_3px_#ec4899,0_8px_24px_rgba(236,72,153,0.35)]' : '')} aria-hidden>{emoji}</span>
        <span className="mt-1 w-20 truncate text-center text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{name}</span>
      </div>
    </div>
  );
}
