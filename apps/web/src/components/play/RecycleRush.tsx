'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Bot, Leaf, Sparkles, Zap } from 'lucide-react';
import { BINS, BIN_COLOR, BIN_LABEL, ITEMS, SORT_MISSED, SORT_WAVES, SORT_WRONG, sortMultiplier, sortPoints, sortSequence, sortWave, type BeltItem, type Bin } from '@/lib/play/sort';
import { GAMES } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { SortView, type SortFeed } from './SortView';
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
  // What the 3D line draws, read every frame (SortView.tsx).
  const feed = useRef<SortFeed>({ belt, startsAt, clock, done: {}, bins: {}, front: -1, last: null, exitMs: EXIT_MS });
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
  useEffect(() => { feed.current = { belt, startsAt, clock, done: s.done, bins: s.bins, front: frontId, last: s.last, exitMs: EXIT_MS }; }, [belt, startsAt, clock, s.done, s.bins, frontId, s.last]);
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


      {/* The line in 3D (M104): the belt and the four bins; the bin buttons sit over the bins. */}
      <div className="relative mt-2 h-[min(62vh,420px)] min-h-[300px] overflow-hidden rounded-[1.75rem] bg-[#17181c] ring-1 ring-white/10">
        <SortView feed={feed} label="Recycle Rush: a conveyor belt carrying things toward four bins: recycling, compost, general waste and e-waste." />
        <div className="absolute inset-x-0 bottom-0 grid h-[50%] grid-cols-4">
          {BINS.map((bin, i) => (
            <button key={bin} type="button" onClick={() => sort(bin)}
              className="group relative flex flex-col items-center justify-end pb-2.5 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-pink-400 active:bg-white/5">
              <span className="rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors duration-150 group-hover:bg-black/80">
                <span className="me-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: BIN_COLOR[bin] }} aria-hidden />{BIN_LABEL[bin]}<span className="ms-1 hidden text-zinc-300 sm:inline" aria-hidden>· {i + 1}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

