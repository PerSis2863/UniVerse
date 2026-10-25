'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Check, Flame, X } from 'lucide-react';
import { QUIZ_SECONDS_PER_QUESTION, quizPoints, quizQuestion } from '@/lib/play/quiz';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { GameProps } from './game-props';

// Quiz Clash (src/lib/play/quiz.ts): ten seconds a question, four answers (tap, or keys 1–4 / A–D).
// The right answer lights up whatever you picked, so every miss teaches the answer.

const PER_Q = QUIZ_SECONDS_PER_QUESTION * 1000;
const REVEAL_MS = 1100;

interface S { i: number; shownAt: number; picked: number | null; timedOut: boolean; score: number; streak: number; right: number; gained: number }
type A = { t: 'pick'; choice: number; answer: number; at: number } | { t: 'timeout' } | { t: 'next'; at: number };

function reducer(s: S, a: A): S {
  if (a.t === 'next') return { ...s, i: s.i + 1, shownAt: a.at, picked: null, timedOut: false, gained: 0 };
  if (s.picked !== null || s.timedOut) return s;
  if (a.t === 'timeout') return { ...s, timedOut: true, streak: 0, gained: 0 };
  const ok = a.choice === a.answer;
  const streak = ok ? s.streak + 1 : 0;
  const gained = quizPoints(ok, s.shownAt + PER_Q - a.at, streak);
  return { ...s, picked: a.choice, streak, score: s.score + gained, right: s.right + (ok ? 1 : 0), gained };
}

const KEYS = ['1', '2', '3', '4'];

export function QuizClash({ seed, startsAt, clock, onProgress }: GameProps) {
  const [s, dispatch] = useReducer(reducer, startsAt, (at): S => ({ i: 0, shownAt: at, picked: null, timedOut: false, score: 0, streak: 0, right: 0, gained: 0 }));
  const q = useMemo(() => quizQuestion(seed, s.i), [seed, s.i]);
  const calm = useReducedMotion();
  const answered = s.picked !== null || s.timedOut;

  // The clock for this question, then the pause to read the answer.
  useEffect(() => {
    const id = answered
      ? setTimeout(() => dispatch({ t: 'next', at: clock() }), REVEAL_MS)
      : setTimeout(() => dispatch({ t: 'timeout' }), Math.max(0, s.shownAt + PER_Q - clock()));
    return () => clearTimeout(id);
  }, [answered, s.shownAt, clock]);

  useEffect(() => { onProgress(s.score, s.i); }, [s.score, s.i, onProgress]);
  useEffect(() => {
    if (answered) navigator.vibrate?.(s.gained ? 12 : [30, 40, 30]);
  }, [answered, s.gained]);

  const pick = (choice: number) => dispatch({ t: 'pick', choice, answer: q.answer, at: clock() });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.isContentEditable) return;
      const k = KEYS.indexOf(e.key) >= 0 ? KEYS.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (k >= 0 && k < 4 && e.key.length === 1) dispatch({ t: 'pick', choice: k, answer: q.answer, at: clock() });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [q.answer, clock]);

  const said = !answered ? '' : s.picked === q.answer ? `Right! Plus ${s.gained} points.` : `${s.timedOut ? 'Time’s up' : 'Not quite'}: the answer is ${q.options[q.answer]}.`;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">Question <span className="text-zinc-900 dark:text-zinc-100 tabular-nums">{s.i + 1}</span> · {s.right} right</span>
        <AnimatePresence>
          {s.streak >= 2 && (
            <motion.span key="streak" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.snappy}
              className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2.5 py-1 font-semibold text-pink-600 dark:text-pink-300">
              <Flame className="w-4 h-4" aria-hidden /><span key={s.streak} className="play-tick tabular-nums">{s.streak}</span> in a row
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" aria-hidden>
        <div key={s.i} className="play-drain h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
          style={{ animationDuration: `${PER_Q}ms`, animationPlayState: answered ? 'paused' : 'running' }} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={s.i} initial={{ opacity: 0, x: calm ? 0 : 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: calm ? 0 : -24, transition: { duration: 0.14, ease: 'easeIn' } }} transition={spring.smooth} className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-pink-600 dark:text-pink-300">{q.topic}</p>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-white text-balance">{q.q}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {q.options.map((o, k) => {
              const isAnswer = answered && k === q.answer;
              const wrongPick = answered && s.picked === k && k !== q.answer;
              return (
                <motion.button key={o} type="button" disabled={answered} onClick={() => pick(k)}
                  initial={{ opacity: 0, y: calm ? 0 : 10 }} animate={{ opacity: answered && !isAnswer && !wrongPick ? 0.45 : 1, y: 0 }}
                  transition={{ ...spring.smooth, delay: answered ? 0 : 0.04 * k }}
                  className={cn('relative flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-start text-[15px] font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]',
                    isAnswer ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                      : wrongPick ? 'play-shake border-red-500 bg-red-500/10 text-red-700 dark:text-red-300'
                        : 'border-zinc-200 bg-white text-zinc-800 hover:border-violet-400 hover:bg-violet-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.08]')}>
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold',
                    isAnswer ? 'bg-emerald-500 text-white' : wrongPick ? 'bg-red-500 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300')} aria-hidden>
                    {isAnswer ? <Check className="w-4 h-4" /> : wrongPick ? <X className="w-4 h-4" /> : k + 1}
                  </span>
                  <span className="min-w-0">{o}</span>
                  {s.picked === k && s.gained > 0 && (
                    <span className="play-float pointer-events-none absolute left-1/2 top-0 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white shadow-lg" aria-hidden>+{s.gained}</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="sr-only" aria-live="polite">{said}</p>
      <p className="mt-4 hidden text-center text-xs text-zinc-500 dark:text-zinc-400 sm:block">Keys 1–4 answer.</p>
    </div>
  );
}
