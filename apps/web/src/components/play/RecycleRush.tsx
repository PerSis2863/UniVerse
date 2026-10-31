'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Bot, Leaf, Sparkles, Zap } from 'lucide-react';
import { BINS, BIN_COLOR, BIN_LABEL, ITEMS, SORT_MISSED, SORT_WAVES, SORT_WRONG, sortMultiplier, sortPoints, sortSequence, sortWave, type BeltItem, type Bin } from '@/lib/play/sort';
import { GAMES } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { Burst } from './fx';
import type { GameProps } from './game-props';
import { haptic } from '@/lib/haptics';

// Recycle Rush (src/lib/play/sort.ts): things ride the belt; sort the one at the front into its bin
// (tap a bin, or keys 1–4) before it drops off the end. A right sort flies in an arc into the bin
// and its lid pops; golden items count triple; e-waste in the wrong bin starts a little fire. The
// belt speeds up in waves. It moves on the GPU (one animation per item, nothing per frame).

const EXIT_MS = 520;
/** The sort bot (M39): every 10 right sorts earns one (up to 2 waiting); it sorts the next 3 for you. */
const BOT_EVERY = 10, BOT_MAX = 2, BOT_SORTS = 3, BOT_MS = 260;
type Done = 'ok' | 'wrong' | 'missed';
interface S {
  t: number; done: Record<number, Done>; bins: Record<number, Bin>; score: number; streak: number; best: number; co2: number; step: number; right: number; wrong: number;
  last: { bin: Bin; ok: boolean; n: number; gained: number; golden: boolean; hazard: boolean } | null;
}
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
    const gained = ok ? sortPoints(streak, front.golden) : 0;
    const next = ok ? streak + 1 : 0;
    return {
      ...s, t: a.at, done, bins: { ...s.bins, [front.id]: a.bin }, step: s.step + 1, streak: next, best: Math.max(s.best, next), co2: s.co2 + (ok ? kg : 0),
      right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1),
      score: ok ? score + gained : Math.max(0, score - SORT_WRONG),
      last: { bin: a.bin, ok, n: (s.last?.n ?? 0) + 1, gained, golden: front.golden, hazard: !ok && bin === 'ewaste' },
    };
  };
}

export function RecycleRush({ seed, startsAt, clock, onProgress, onStats }: GameProps) {
  const belt = useMemo(() => sortSequence(seed, GAMES.sort.seconds), [seed]);
  const run = useMemo(() => reducer(startsAt, belt), [startsAt, belt]);
  const [s, dispatch] = useReducer(run, startsAt, (t): S => ({ t, done: {}, bins: {}, score: 0, streak: 0, best: 0, co2: 0, step: 0, right: 0, wrong: 0, last: null }));
  const { announce, shake, sfx } = useArena();
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const wave = sortWave(s.t - startsAt, GAMES.sort.seconds);

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
    const waveAt = (Math.floor(((now / (GAMES.sort.seconds * 1000)) * 4)) + 1) * GAMES.sort.seconds * 250;
    if (waveAt < GAMES.sort.seconds * 1000) next = Math.min(next, waveAt);
    if (next === Infinity) return;
    const id = setTimeout(() => dispatch({ t: 'tick', at: clock() }), Math.max(0, startsAt + next - clock()));
    return () => clearTimeout(id);
  }, [s.t, s.done, belt, startsAt, clock]);

  useEffect(() => { if (wave > 0) { announce(SORT_WAVES[wave], 'pink'); sfx('whoosh'); } }, [wave, announce, sfx]);
  useEffect(() => { onProgress(s.score, s.step); }, [s.score, s.step, onProgress]);
  useEffect(() => {
    onStats?.([
      { label: 'Sorted right', value: String(s.right) }, { label: 'Accuracy', value: `${s.step ? Math.round((100 * s.right) / s.step) : 0}%` },
      { label: 'Best streak', value: String(s.best) }, { label: 'CO₂ saved', value: `${s.co2.toFixed(2)} kg` },
    ]);
  }, [s.right, s.step, s.best, s.co2, onStats]);
  useEffect(() => {
    if (!s.last) return;
    if (s.last.ok) {
      sfx('pick', s.streak);
      if (s.last.golden) { announce('Golden! ×3', 'gold'); sfx('power'); }
      else if (s.streak > 0 && s.streak % 5 === 0) { announce(`Combo ×${sortMultiplier(s.streak)}!`, 'pink'); sfx('combo', s.streak / 5); }
    } else {
      sfx('wrong'); shake(s.last.hazard ? 1.4 : 0.6);
      if (s.last.hazard) announce('Fire hazard! E-waste goes to e-waste', 'bad');
      haptic('warning', false);
    }
  }, [s.last, s.streak, sfx, announce, shake]);

  const sort = (bin: Bin) => dispatch({ t: 'sort', bin, at: clock() });
  const [botsUsed, setBotsUsed] = useState(0);
  const [auto, setAuto] = useState(0);
  const bots = Math.max(0, Math.min(BOT_MAX, Math.floor(s.right / BOT_EVERY) - botsUsed));
  const startBot = () => { if (!bots || auto) return; setBotsUsed((u) => u + 1); setAuto(BOT_SORTS); announce('Sort bot on!', 'gold'); sfx('power'); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = ['1', '2', '3', '4'].indexOf(e.key);
      if (k >= 0 && !e.metaKey && !e.ctrlKey) dispatch({ t: 'sort', bin: BINS[k], at: clock() });
      if (e.key.toLowerCase() === 'b') document.getElementById('sort-bot')?.click();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [clock]);

  const now = s.t - startsAt;
  const onBelt = belt.filter((b) => b.at <= now && now < b.at + b.travel + (s.done[b.id] ? EXIT_MS : 0));
  const front = onBelt.find((b) => !s.done[b.id]);
  const mult = sortMultiplier(s.streak);
  // The bot: sorts the item at the front into the right bin, a beat after it arrives.
  const frontId = front?.id ?? -1, frontBin = front ? ITEMS[front.item][2] : null;
  useEffect(() => {
    if (!auto || !frontBin) return;
    const id = setTimeout(() => { dispatch({ t: 'sort', bin: frontBin, at: clock() }); setAuto((n) => n - 1); }, BOT_MS);
    return () => clearTimeout(id);
  }, [auto, frontId, frontBin, clock]);

  return (
    <div ref={box} className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <p className="font-medium text-zinc-300"><Leaf className="inline w-4 h-4 me-1 -mt-0.5 text-emerald-400" aria-hidden /><span className="tabular-nums text-white">{s.co2.toFixed(2)}</span> kg CO₂ saved</p>
        <span className="text-zinc-500">·</span>
        <p className="text-zinc-300">{SORT_WAVES[wave]}</p>
        <button id="sort-bot" type="button" onClick={startBot} disabled={!bots || !!auto}
          className={cn('ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-[background-color,opacity,transform] duration-150 active:scale-95 disabled:opacity-40',
            auto ? 'bg-cyan-300 text-cyan-950 ring-cyan-200' : 'bg-white/[0.06] text-zinc-100 ring-white/15 hover:bg-white/[0.12]')}>
          <Bot className="w-3.5 h-3.5" aria-hidden />{auto ? `Bot sorting… ${auto}` : `Sort bot ×${bots}`}<kbd className="hidden rounded bg-black/30 px-1 text-[11px] font-medium sm:inline">B</kbd>
        </button>
        <motion.span key={mult} initial={{ scale: calm ? 1 : 1.25 }} animate={{ scale: 1 }} transition={spring.bouncy}
          className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold tabular-nums', mult > 1 ? 'bg-pink-600 text-white shadow-[0_0_28px_rgba(254,129,209,0.55)]' : 'bg-white/10 text-zinc-200')}>
          <Zap className="w-4 h-4" aria-hidden />×{mult}<span className="font-medium opacity-80">· {s.streak} in a row</span>
        </motion.span>
      </div>

      {/* The belt: rails, a moving surface, rollers below; the drop-off glows red. */}
      <div className="relative mt-4 h-40 overflow-hidden rounded-[1.75rem] bg-[#10163a] ring-1 ring-white/10">
        <div className="absolute inset-x-0 bottom-9 h-5 overflow-hidden bg-[#262f5c] shadow-[inset_0_2px_0_rgba(255,255,255,0.08),inset_0_-2px_0_rgba(0,0,0,0.5)]" aria-hidden>
          <div className="play-stripes h-full w-[calc(100%+48px)] bg-[repeating-linear-gradient(90deg,transparent_0_20px,rgba(255,255,255,0.1)_20px_24px)]" />
        </div>
        <div className="absolute inset-x-3 bottom-2 flex justify-between" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => <span key={i} className="play-spin grid h-5 w-5 place-items-center rounded-full bg-[#2b3466] ring-1 ring-white/10"><span className="h-3 w-px bg-white/30" /></span>)}
        </div>
        <div className="absolute inset-y-0 end-0 w-20 bg-gradient-to-l from-red-500/25 to-transparent rtl:bg-gradient-to-r" aria-hidden />
        <div className="absolute inset-x-3 top-3 bottom-12 [container-type:inline-size]">
          {onBelt.map((b) => <OnBelt key={b.id} b={b} start={startsAt} clock={clock} front={b === front} done={s.done[b.id]} bin={s.bins[b.id]} box={box} calm={!!calm} />)}
        </div>
      </div>

      {/* What to sort now */}
      <div className="mt-3 flex min-h-12 items-center justify-center gap-3 text-center" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {front ? (
            <motion.p key={front.id} initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: calm ? 0 : -10 }} transition={spring.smooth} className="text-base text-zinc-300">
              Sort: <span className="text-xl font-semibold text-white">{ITEMS[front.item][0]}</span>{front.golden && <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950"><Sparkles className="w-3 h-3" aria-hidden />×3</span>}
            </motion.p>
          ) : <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-zinc-400">Next one coming…</motion.p>}
        </AnimatePresence>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 sm:gap-3">
        {BINS.map((bin, i) => {
          const hit = s.last?.bin === bin ? s.last : null;
          return (
            <button key={bin} type="button" data-bin={bin} onClick={() => sort(bin)}
              className="group relative flex flex-col items-center gap-1.5 rounded-[1.5rem] bg-white/[0.04] px-1 pb-3 pt-4 text-xs font-semibold text-zinc-100 ring-1 ring-white/10 transition-[background-color,transform] duration-150 hover:bg-white/[0.08] active:scale-[0.97]">
              <BinArt bin={bin} hit={hit?.n ?? 0} ok={!!hit?.ok} />
              {hit?.ok && <span key={`b${hit.n}`} className="pointer-events-none absolute left-1/2 top-6 h-0 w-0" aria-hidden><Burst color={hit.golden ? '#fbbf24' : BIN_COLOR[bin]} spread={56} /></span>}
              {hit?.ok && <span key={`f${hit.n}`} className="play-float pointer-events-none absolute left-1/2 top-0 whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold" aria-hidden>+{hit.gained}</span>}
              {hit?.hazard && <span key={`h${hit.n}`} className="play-smoke pointer-events-none absolute left-1/2 top-2 text-2xl" aria-hidden>🔥</span>}
              <span className="leading-tight">{BIN_LABEL[bin]}</span>
              <span className="hidden text-[11px] font-normal text-zinc-400 sm:block" aria-hidden>key {i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A drawn bin: a body in the bin's colour and a lid that pops open when something lands in it. */
function BinArt({ bin, hit, ok }: { bin: Bin; hit: number; ok: boolean }) {
  const c = BIN_COLOR[bin];
  return (
    <svg key={hit} viewBox="0 0 48 52" className={cn('h-14 w-14', hit && !ok && 'play-shake')} aria-hidden>
      <path d="M8 14h32l-3 34a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill={c} />
      <path d="M14 20v24M24 20v24M34 20v24" stroke="rgba(0,0,0,0.25)" strokeWidth="2" strokeLinecap="round" />
      {bin === 'recycle' && <path d="M19 33l5-6 5 6M24 27v12" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {bin === 'compost' && <path d="M18 38c0-7 5-11 12-11-1 7-5 12-12 11z" fill="#fff" opacity="0.9" />}
      {bin === 'ewaste' && <path d="M26 25l-6 9h6l-4 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {bin === 'landfill' && <path d="M18 30h12M18 36h12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />}
      <g className={hit && ok ? 'play-lid' : ''} style={{ transformOrigin: '6px 12px' }}>
        <rect x="5" y="8" width="38" height="6" rx="2" fill={c} />
        <rect x="20" y="4" width="8" height="5" rx="1.5" fill={c} />
      </g>
    </svg>
  );
}

function OnBelt({ b, start, clock, front, done, bin, box, calm }: { b: BeltItem; start: number; clock: () => number; front: boolean; done?: Done; bin?: Bin; box: React.RefObject<HTMLDivElement | null>; calm: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
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
  // Sorted: stop on the belt and fly in an arc into the chosen bin.
  useEffect(() => {
    if (!done || done === 'missed') return;
    anim.current?.pause();
    const el = inner.current, target = bin && box.current?.querySelector(`[data-bin="${bin}"]`);
    if (!el?.animate || !target || calm) return;
    const from = el.getBoundingClientRect(), to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + 28 - (from.top + from.height / 2);
    el.animate([
      { transform: 'translate3d(0,0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate3d(${dx * 0.5}px, ${Math.min(dy * 0.5, dy * 0.5 - 70)}px, 0) scale(0.9) rotate(${dx > 0 ? 160 : -160}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.35) rotate(${dx > 0 ? 320 : -320}deg)`, opacity: done === 'ok' ? 0.9 : 0 },
    ], { duration: 480, easing: 'cubic-bezier(0.33,0,0.25,1)', fill: 'forwards' });
  }, [done, bin, box, calm]);
  return (
    <div ref={ref} className="absolute start-0 top-0 flex w-20 flex-col items-center">
      <div ref={inner} className={cn('flex flex-col items-center', done === 'missed' ? 'play-dropped' : calm && done ? 'play-sorted' : '')}>
        <span className={cn('relative grid h-16 w-16 place-items-center rounded-2xl text-4xl shadow-lg transition-[box-shadow,transform] duration-200',
          b.golden ? 'bg-gradient-to-br from-amber-200 to-amber-500' : 'bg-[#1e2650]', front ? 'scale-110 shadow-[0_0_0_3px_#fe81d1,0_10px_28px_rgba(254,129,209,0.45)]' : 'ring-1 ring-white/10')} aria-hidden>
          {emoji}
          {b.golden && <Sparkles className="absolute -end-1.5 -top-1.5 w-4 h-4 text-amber-200" />}
        </span>
        <span className="mt-1 w-24 truncate text-center text-[11px] font-medium text-zinc-300">{name}</span>
      </div>
    </div>
  );
}
