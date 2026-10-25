'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Flag, Gauge, Target } from 'lucide-react';
import { TYPE_CHAR, TYPE_DONE, TYPE_MISS, pace, typingPassage, wpm } from '@/lib/play/typing';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';

// Type Race (src/lib/play/typing.ts): type each true fact exactly; only the right letter moves you
// on. Cars race along a track to the 600-letter flag: you, your friends in a room (their letters
// come with the live scores), or a pace car when you play alone.

const FINISH = 600;

interface S { i: number; at: number; chars: number; misses: number; score: number; done: number; miss: number; missAt: number }
type A = { t: 'key'; ch: string; text: string } | { t: 'next' };

function reducer(s: S, a: A): S {
  if (a.t === 'next') return { ...s, i: s.i + 1, at: 0, missAt: -1, done: s.done + 1, score: s.score + TYPE_DONE };
  if (s.at >= a.text.length) return s;
  if (a.ch === a.text[s.at]) return { ...s, at: s.at + 1, chars: s.chars + 1, score: s.score + TYPE_CHAR };
  return { ...s, misses: s.misses + 1, score: Math.max(0, s.score - TYPE_MISS), miss: s.miss + 1, missAt: s.at };
}

export function TypeRace({ seed, startsAt, clock, onProgress, rivals }: GameProps) {
  const [s, dispatch] = useReducer(reducer, { i: 0, at: 0, chars: 0, misses: 0, score: 0, done: 0, miss: 0, missAt: -1 });
  const text = useMemo(() => typingPassage(seed, s.i), [seed, s.i]);
  const input = useRef<HTMLInputElement>(null);
  const calm = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const paceWpm = useMemo(() => pace(seed), [seed]);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.max(0, clock() - startsAt)), 250);
    return () => clearInterval(id);
  }, [clock, startsAt]);
  useEffect(() => { onProgress(s.score, s.chars); }, [s.score, s.chars, onProgress]);
  // A finished fact: a short beat, then the next.
  useEffect(() => {
    if (s.at < text.length) return;
    const id = setTimeout(() => dispatch({ t: 'next' }), 350);
    return () => clearTimeout(id);
  }, [s.at, text.length]);

  const type = (value: string) => { for (const ch of value) dispatch({ t: 'key', ch, text }); };
  const speed = wpm(s.chars, elapsed);
  const accuracy = s.chars + s.misses ? Math.round((100 * s.chars) / (s.chars + s.misses)) : 100;
  const lanes = [
    { id: 'me', name: 'You', chars: s.chars, me: true },
    ...(rivals?.length ? rivals.map((r) => ({ id: r.id, name: r.name, chars: r.step, me: false })) : [{ id: 'pace', name: `Pace ${paceWpm} wpm`, chars: Math.round((paceWpm * 5 * elapsed) / 60_000), me: false }]),
  ];

  return (
    <div className="mx-auto w-full max-w-4xl" onClick={() => input.current?.focus()}>
      {/* The track */}
      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-[#0d1b24]" aria-label="Race track">
        {lanes.map((l, k) => {
          const pct = Math.min(1, l.chars / FINISH);
          return (
            <div key={l.id} className={cn('relative h-11', k && 'border-t border-dashed border-zinc-300 dark:border-white/10')}>
              <div className="absolute inset-y-0 end-0 w-1 bg-[repeating-linear-gradient(0deg,#11212D_0_6px,#f8fafc_6px_12px)] opacity-70" aria-hidden />
              <div className="absolute inset-y-0 start-0 end-24 transition-transform duration-500 ease-out" style={{ transform: `translateX(calc(${pct * 100}% * var(--play-dir, 1)))` }}>
                <span className={cn('absolute top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold shadow-md',
                  l.me ? 'bg-pink-600 text-white shadow-[0_4px_20px_rgba(236,72,153,0.45)]' : l.id === 'pace' ? 'bg-zinc-300 text-zinc-800 dark:bg-white/15 dark:text-zinc-100' : 'bg-[#253745] text-white')} translate="no">
                  🏎️ {l.name}{pct >= 1 && <Flag className="w-3.5 h-3.5" aria-hidden />}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Stat icon={Gauge} label="Words a minute" value={speed} />
        <Stat icon={Target} label="Accuracy" value={`${accuracy}%`} />
        <Stat icon={Flag} label="Facts done" value={s.done} />
      </div>

      {/* The fact to type */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={s.i} initial={{ opacity: 0, y: calm ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: calm ? 0 : -8, transition: { duration: 0.14 } }} transition={spring.smooth}
          className="mt-4 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#1B2C39] sm:p-6">
          <p key={s.miss} className={cn('font-mono text-lg leading-relaxed sm:text-xl', s.missAt === s.at && 'play-shake')} aria-hidden>
            <span className="text-zinc-900 dark:text-white">{text.slice(0, s.at)}</span>
            <span className={cn('rounded-[4px] px-[1px] transition-colors duration-150', s.missAt === s.at ? 'bg-red-500/30 text-red-700 dark:text-red-200' : 'bg-pink-500/25 text-pink-700 underline decoration-2 underline-offset-4 dark:text-pink-200')}>{text[s.at] === ' ' ? ' ' : text[s.at]}</span>
            <span className="text-zinc-600 dark:text-zinc-400">{text.slice(s.at + 1)}</span>
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden>
            <div className="h-full origin-left rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-transform duration-200 ease-out rtl:origin-right" style={{ transform: `scaleX(${s.at / text.length})` }} />
          </div>
        </motion.div>
      </AnimatePresence>
      <label htmlFor="type-race-input" className="sr-only">Type this: {text}</label>
      <input id="type-race-input" ref={input} value="" onChange={(e) => type(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        className="sr-only" />
      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Just start typing. Only the right letter moves you on; capitals and punctuation count. Finish line: {FINISH} letters.</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-2 py-2.5 dark:bg-white/[0.04]">
      <p className="flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400"><Icon className="w-3.5 h-3.5" aria-hidden />{label}</p>
      <p className="text-xl font-bold tabular-nums text-zinc-900 dark:text-white">{value}</p>
    </div>
  );
}
