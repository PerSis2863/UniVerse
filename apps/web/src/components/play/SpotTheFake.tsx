'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Flame, Heart, MapPin, ScanLine, ShieldAlert, ShieldCheck } from 'lucide-react';
import { FAKE_LIVES, FAKE_SECONDS_PER_ROUND, fakePoints, fakeRound } from '@/lib/play/fakes';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';

// Spot the Fake (src/lib/play/fakes.ts): four passports for one product, one is a copy. Read the
// journey, the scans, the seal and the brand, then tap the copy (or keys 1–4). Three lives; the
// reveal says what gave it away, and Enter moves on early.

const PER_ROUND = FAKE_SECONDS_PER_ROUND * 1000;
const REVEAL_MS = 2600;

interface S { i: number; shownAt: number; picked: number | null; timedOut: boolean; lives: number; score: number; streak: number; gained: number }
type A = { t: 'pick'; choice: number; fake: number; at: number } | { t: 'timeout' } | { t: 'next'; at: number };

function reducer(s: S, a: A): S {
  if (a.t === 'next') return s.lives <= 0 ? s : { ...s, i: s.i + 1, shownAt: a.at, picked: null, timedOut: false, gained: 0 };
  if (s.picked !== null || s.timedOut) return s;
  if (a.t === 'timeout') return { ...s, timedOut: true, lives: s.lives - 1, streak: 0, gained: 0 };
  const ok = a.choice === a.fake;
  const streak = ok ? s.streak + 1 : 0;
  const gained = fakePoints(ok, s.shownAt + PER_ROUND - a.at, streak);
  return { ...s, picked: a.choice, lives: ok ? s.lives : s.lives - 1, streak, score: s.score + gained, gained };
}

export function SpotTheFake({ seed, startsAt, clock, onProgress, onDone }: GameProps) {
  const [s, dispatch] = useReducer(reducer, startsAt, (at): S => ({ i: 0, shownAt: at, picked: null, timedOut: false, lives: FAKE_LIVES, score: 0, streak: 0, gained: 0 }));
  const round = useMemo(() => fakeRound(seed, s.i), [seed, s.i]);
  const calm = useReducedMotion();
  const answered = s.picked !== null || s.timedOut;
  const over = answered && s.lives <= 0;

  useEffect(() => {
    if (over) {
      const id = setTimeout(() => onDone(s.score, s.i + 1), REVEAL_MS);
      return () => clearTimeout(id);
    }
    const id = answered
      ? setTimeout(() => dispatch({ t: 'next', at: clock() }), REVEAL_MS)
      : setTimeout(() => dispatch({ t: 'timeout' }), Math.max(0, s.shownAt + PER_ROUND - clock()));
    return () => clearTimeout(id);
  }, [answered, over, s.shownAt, s.score, s.i, clock, onDone]);

  useEffect(() => { onProgress(s.score, s.i); }, [s.score, s.i, onProgress]);
  useEffect(() => { if (answered) navigator.vibrate?.(s.gained ? 12 : [30, 40, 30]); }, [answered, s.gained]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = ['1', '2', '3', '4'].indexOf(e.key);
      if (k >= 0) dispatch({ t: 'pick', choice: k, fake: round.fake, at: clock() });
      if (e.key === 'Enter' && answered && !over) dispatch({ t: 'next', at: clock() });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [round.fake, answered, over, clock]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-zinc-500 dark:text-zinc-400">Round <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{s.i + 1}</span> · <span className="text-zinc-900 dark:text-zinc-100">{round.cards[0].product}</span></p>
        <div className="flex items-center gap-3">
          {s.streak >= 2 && <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2.5 py-1 font-semibold text-pink-600 dark:text-pink-300"><Flame className="w-4 h-4" aria-hidden /><span key={s.streak} className="play-tick">{s.streak}</span> in a row</span>}
          <span className="flex items-center gap-1" role="img" aria-label={`${s.lives} of ${FAKE_LIVES} lives left`}>
            {Array.from({ length: FAKE_LIVES }, (_, k) => (
              <motion.span key={k} animate={{ scale: k < s.lives ? 1 : 0.85, opacity: k < s.lives ? 1 : 0.3 }} transition={spring.bouncy}>
                <Heart className={cn('w-5 h-5', k < s.lives ? 'fill-pink-500 text-pink-500' : 'text-zinc-400')} aria-hidden />
              </motion.span>
            ))}
          </span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden>
        <div key={s.i} className="play-drain h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500" style={{ animationDuration: `${PER_ROUND}ms`, animationPlayState: answered ? 'paused' : 'running' }} />
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">One of these four is a copy. Which?</p>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {round.cards.map((c, k) => {
          const isFake = answered && k === round.fake;
          const wrongPick = answered && s.picked === k && k !== round.fake;
          const fast = c.km > 0 && c.km / c.hours > 500;
          return (
            <motion.button key={`${s.i}-${k}`} type="button" disabled={answered}
              onClick={() => dispatch({ t: 'pick', choice: k, fake: round.fake, at: clock() })}
              initial={{ opacity: 0, y: calm ? 0 : 14, scale: calm ? 1 : 0.97 }} animate={{ opacity: answered && !isFake && !wrongPick ? 0.7 : 1, y: 0, scale: 1 }}
              transition={{ ...spring.smooth, delay: answered ? 0 : 0.05 * k }}
              className={cn('relative overflow-hidden rounded-2xl border p-3.5 pb-8 text-start transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.98]',
                isFake ? 'border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]' : wrongPick ? 'play-shake border-amber-500' : answered ? 'border-emerald-500/50' : 'border-zinc-200 hover:border-pink-400 dark:border-white/10',
                'bg-white dark:bg-[#1B1B1E]')}>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="sr-only">Passport {k + 1}: </span>
                  <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{c.brand}</span>
                  <span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">#{c.serial}</span>
                </span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-zinc-100 text-[11px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300" aria-hidden>{k + 1}</span>
              </span>
              <span className="mt-3 block space-y-2 text-xs">
                <span className="flex items-center gap-1.5">
                  {c.sealOk ? <ShieldCheck className="w-4 h-4 text-emerald-500" aria-hidden /> : <ShieldAlert className="w-4 h-4 text-amber-500" aria-hidden />}
                  <span className="text-zinc-700 dark:text-zinc-200">{c.sealOk ? 'Seal checks out' : 'Seal doesn’t match'}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <ScanLine className="w-4 h-4 text-zinc-400" aria-hidden />
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{c.scans} scan{c.scans === 1 ? '' : 's'}</span>
                </span>
                <span className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 w-4 h-4 shrink-0 text-zinc-400" aria-hidden />
                  <span className="min-w-0 text-zinc-700 dark:text-zinc-200">
                    {c.firstCity === c.lastCity ? c.firstCity : `${c.firstCity} → ${c.lastCity}`}
                    <span className={cn('block tabular-nums', answered && fast ? 'font-semibold text-red-600 dark:text-red-300' : 'text-zinc-500 dark:text-zinc-400')}>{c.km.toLocaleString()} km in {c.hours} h</span>
                  </span>
                </span>
              </span>
              <AnimatePresence>
                {isFake && (
                  <motion.span initial={{ opacity: 0, scale: calm ? 1 : 1.3, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -14 }} transition={spring.bouncy}
                    className="pointer-events-none absolute left-1/2 top-1/2 -ml-11 -mt-5 w-22 rounded-lg border-[3px] border-red-500 bg-white/90 py-1 text-center text-lg font-black tracking-widest text-red-600 shadow-lg dark:bg-[#1B1B1E]/90 dark:text-red-400" aria-hidden>COPY</motion.span>
                )}
                {answered && !isFake && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute end-2 bottom-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400" aria-hidden>
                    <BadgeCheck className="w-3.5 h-3.5" />Genuine
                  </motion.span>
                )}
              </AnimatePresence>
              {s.picked === k && s.gained > 0 && <span className="play-float pointer-events-none absolute left-1/2 top-2 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white" aria-hidden>+{s.gained}</span>}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {answered && (
          <motion.div key={s.i} initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.smooth}
            className={cn('mt-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', s.picked === round.fake ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10')}>
            <p className="flex-1 text-sm text-zinc-800 dark:text-zinc-100" aria-live="polite">
              <span className="font-semibold">{s.picked === round.fake ? `Caught it! +${s.gained}. ` : s.timedOut ? 'Time’s up. ' : 'That one was genuine. '}</span>{round.why}
            </p>
            {!over && <button type="button" onClick={() => dispatch({ t: 'next', at: clock() })} className="btn-secondary btn-sm self-start sm:self-auto">Next<ArrowRight className="w-4 h-4 rtl:-scale-x-100" aria-hidden /></button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
