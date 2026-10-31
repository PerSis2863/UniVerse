'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Atom, Calculator, Check, Clock3, Cpu, Divide, Flame, Globe2, Leaf, Palette, Sparkles, X, Zap, type LucideIcon } from 'lucide-react';
import { QUIZ_BOSS_MULT, QUIZ_LIGHTNING_MS, QUIZ_SECONDS_PER_QUESTION, quizBoss, quizHalf, quizPoints, quizQuestion, type QuizPower } from '@/lib/play/quiz';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import { Burst } from './fx';
import type { GameProps } from './game-props';
import { haptic } from '@/lib/haptics';

// Quiz Clash (src/lib/play/quiz.ts): ten seconds a question, four answers (tap, or keys 1–4 / A–D).
// Three power-ups once a round (Q 50:50, W +5 seconds, E double points), the last 15 seconds are the
// lightning round (double points). The right answer lights up whatever you picked, with sparks and a
// sound when it's yours; streaks build a flame and get called out.

const PER_Q = QUIZ_SECONDS_PER_QUESTION * 1000;
const REVEAL_MS = 1050;
const TOPIC: Record<string, { icon: LucideIcon; tint: string }> = {
  Science: { icon: Atom, tint: '#38bdf8' }, Geography: { icon: Globe2, tint: '#34d399' }, Climate: { icon: Leaf, tint: '#a3e635' },
  Technology: { icon: Cpu, tint: '#a9b4ff' }, Culture: { icon: Palette, tint: '#fbbf24' }, Maths: { icon: Calculator, tint: '#ff9fdc' },
  'Quick maths': { icon: Divide, tint: '#ff9fdc' },
};
const POWERS: { id: QuizPower; key: string; label: string; icon: LucideIcon }[] = [
  { id: 'half', key: 'Q', label: '50:50', icon: Divide }, { id: 'time', key: 'W', label: '+5 s', icon: Clock3 }, { id: 'double', key: 'E', label: 'Double', icon: Sparkles },
];
const CALLS: Record<number, string> = { 3: 'On fire!', 5: 'Unstoppable!', 8: 'Genius!', 12: 'Legendary!' };

interface S {
  i: number; shownAt: number; picked: number | null; timedOut: boolean; score: number; streak: number; best: number; right: number; gained: number;
  extra: number; hidden: number[]; doubled: boolean; used: QuizPower[]; answerMs: number[];
  /** How far into the question the timer bar was last restarted (after +5 s). */
  barAt: number;
}
type A = { t: 'pick'; choice: number; answer: number; at: number; lightning: boolean } | { t: 'timeout' } | { t: 'next'; at: number } | { t: 'power'; id: QuizPower; hidden: number[]; at: number };

function reducer(s: S, a: A): S {
  if (a.t === 'next') return { ...s, i: s.i + 1, shownAt: a.at, picked: null, timedOut: false, gained: 0, extra: 0, hidden: [], doubled: false, barAt: 0 };
  if (s.picked !== null || s.timedOut) return s;
  if (a.t === 'power') {
    if (s.used.includes(a.id)) return s;
    return { ...s, used: [...s.used, a.id], extra: a.id === 'time' ? s.extra + 5000 : s.extra, hidden: a.id === 'half' ? a.hidden : s.hidden, doubled: s.doubled || a.id === 'double', barAt: a.id === 'time' ? a.at - s.shownAt : s.barAt };
  }
  if (a.t === 'timeout') return { ...s, timedOut: true, streak: 0, gained: 0 };
  if (s.hidden.includes(a.choice)) return s;
  const ok = a.choice === a.answer;
  const streak = ok ? s.streak + 1 : 0;
  const gained = quizPoints(ok, s.shownAt + PER_Q + s.extra - a.at, streak, (s.doubled ? 2 : 1) * (a.lightning ? 2 : 1) * (quizBoss(s.i) ? QUIZ_BOSS_MULT : 1));
  return { ...s, picked: a.choice, streak, best: Math.max(s.best, streak), score: s.score + gained, right: s.right + (ok ? 1 : 0), gained, answerMs: [...s.answerMs, a.at - s.shownAt] };
}

const KEYS = ['1', '2', '3', '4'];

export function QuizClash({ seed, startsAt, endsAt, clock, onProgress, onStats }: GameProps) {
  const [s, dispatch] = useReducer(reducer, startsAt, (at): S => ({ i: 0, shownAt: at, picked: null, timedOut: false, score: 0, streak: 0, best: 0, right: 0, gained: 0, extra: 0, hidden: [], doubled: false, used: [], answerMs: [], barAt: 0 }));
  const q = useMemo(() => quizQuestion(seed, s.i), [seed, s.i]);
  const [lightning, setLightning] = useState(false);
  const { announce, shake, sfx } = useArena();
  const calm = useReducedMotion();
  const answered = s.picked !== null || s.timedOut;
  const topic = TOPIC[q.topic] ?? TOPIC.Science;
  const lightningRef = useRef(false);
  const boss = quizBoss(s.i);
  // A boss question: the card turns gold and it's worth triple.
  useEffect(() => { if (boss) { announce(`Boss question! ×${QUIZ_BOSS_MULT}`, 'gold'); sfx('power'); } }, [boss, s.i, announce, sfx]);

  // The question's clock, then the pause to read the answer.
  useEffect(() => {
    const id = answered
      ? setTimeout(() => dispatch({ t: 'next', at: clock() }), REVEAL_MS)
      : setTimeout(() => dispatch({ t: 'timeout' }), Math.max(0, s.shownAt + PER_Q + s.extra - clock()));
    return () => clearTimeout(id);
  }, [answered, s.shownAt, s.extra, clock]);
  // The lightning round.
  useEffect(() => {
    const id = setTimeout(() => { lightningRef.current = true; setLightning(true); announce('Lightning round! ×2', 'gold'); sfx('power'); }, Math.max(0, endsAt - QUIZ_LIGHTNING_MS - clock()));
    return () => clearTimeout(id);
  }, [endsAt, clock, announce, sfx]);

  useEffect(() => { onProgress(s.score, s.i); }, [s.score, s.i, onProgress]);
  useEffect(() => {
    const n = s.answerMs.length + (s.timedOut ? 1 : 0);
    const avg = s.answerMs.length ? s.answerMs.reduce((a, b) => a + b, 0) / s.answerMs.length / 1000 : 0;
    onStats?.([
      { label: 'Accuracy', value: `${s.i ? Math.round((100 * s.right) / Math.max(1, s.i + (answered ? 1 : 0))) : 0}%` },
      { label: 'Best streak', value: String(s.best) },
      { label: 'Average answer', value: `${avg.toFixed(1)} s` },
      { label: 'Questions', value: String(Math.max(n, s.i)) },
    ]);
  }, [s.right, s.best, s.answerMs, s.i, s.timedOut, answered, onStats]);
  // Feedback when an answer lands.
  useEffect(() => {
    if (!answered) return;
    if (s.gained) {
      sfx('right', s.streak);
      haptic('tap', false);
      if (CALLS[s.streak]) { announce(CALLS[s.streak], 'pink'); sfx('combo', s.streak); }
    } else {
      sfx('wrong'); shake(0.5);
      haptic('warning', false);
    }
  }, [answered, s.gained, s.streak, sfx, announce, shake]);

  const pick = (choice: number) => dispatch({ t: 'pick', choice, answer: q.answer, at: clock(), lightning: lightningRef.current });
  const power = (id: QuizPower) => {
    if (answered || s.used.includes(id)) return;
    dispatch({ t: 'power', id, hidden: id === 'half' ? quizHalf(seed, s.i, q) : [], at: clock() });
    sfx('power');
    announce(id === 'half' ? '50:50' : id === 'time' ? '+5 seconds' : 'Double points!', 'gold');
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.isContentEditable || e.key.length !== 1) return;
      const k = KEYS.indexOf(e.key) >= 0 ? KEYS.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (k >= 0) { dispatch({ t: 'pick', choice: k, answer: q.answer, at: clock(), lightning: lightningRef.current }); return; }
      const p = POWERS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (p) document.getElementById(`quiz-power-${p.id}`)?.click();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [q.answer, clock]);

  const said = !answered ? '' : s.picked === q.answer ? `Right! Plus ${s.gained} points.` : `${s.timedOut ? 'Time’s up' : 'Not quite'}: the answer is ${q.options[q.answer]}.`;
  const Icon = topic.icon;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-zinc-400">Question <span className="tabular-nums text-white">{s.i + 1}</span> · {s.right} right</span>
        <AnimatePresence>
          {s.streak >= 2 && (
            <motion.span key="streak" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.snappy}
              className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2.5 py-1 font-semibold text-pink-200 ring-1 ring-pink-400/30">
              <Flame className="w-4 h-4 text-orange-300" aria-hidden /><span key={s.streak} className="play-tick tabular-nums">{s.streak}</span> in a row
            </motion.span>
          )}
          {lightning && (
            <motion.span key="bolt" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring.bouncy}
              className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-200 ring-1 ring-amber-300/40">
              <Zap className="w-4 h-4" aria-hidden />×2
            </motion.span>
          )}
        </AnimatePresence>
        <div className="ms-auto flex gap-2" role="group" aria-label="Power-ups (each once)">
          {POWERS.map((p) => {
            const used = s.used.includes(p.id), on = p.id === 'double' ? s.doubled : p.id === 'half' ? s.hidden.length > 0 : s.extra > 0;
            return (
              <button key={p.id} id={`quiz-power-${p.id}`} type="button" onClick={() => power(p.id)} disabled={used || answered} aria-pressed={on}
                className={cn('relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-[background-color,opacity,transform] duration-150 active:scale-95',
                  on ? 'bg-amber-300 text-zinc-900 ring-amber-200' : used ? 'opacity-35 ring-white/10 text-zinc-400 line-through' : 'bg-white/[0.06] text-zinc-100 ring-white/15 hover:bg-white/[0.12]')}>
                <p.icon className="w-3.5 h-3.5" aria-hidden />{p.label}<kbd className="hidden rounded bg-black/30 px-1 text-[11px] font-medium sm:inline">{p.key}</kbd>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div key={`${s.i}-${s.extra}`} className={cn('play-drain h-full rounded-full', lightning ? 'bg-gradient-to-r from-amber-300 to-pink-500' : 'bg-gradient-to-r from-fuchsia-400 to-pink-500')}
          style={{ animationDuration: `${PER_Q + s.extra}ms`, animationDelay: `${-s.barAt}ms`, animationPlayState: answered ? 'paused' : 'running' }} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={s.i} initial={{ opacity: 0, x: calm ? 0 : 40, rotate: calm ? 0 : 1.5 }} animate={{ opacity: 1, x: 0, rotate: 0 }} exit={{ opacity: 0, x: calm ? 0 : -30, transition: { duration: 0.14, ease: 'easeIn' } }} transition={spring.smooth} className="mt-6">
          <div className={cn('relative overflow-hidden rounded-[2rem] p-6 ring-1 sm:p-8', boss ? 'play-boss ring-amber-300/70' : 'ring-white/10', lightning && 'play-lightning')}
            style={{ background: `radial-gradient(120% 120% at 0% 0%, ${topic.tint}26, transparent 55%), #121214` }}>
            <div className="flex items-center gap-3">
              <span className="karma-icon" style={{ color: topic.tint }}><Icon className="w-5 h-5" strokeWidth={1.6} aria-hidden /></span>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: topic.tint }}>{q.topic}</p>
              {boss && <span className="ms-auto rounded-full bg-amber-300 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-amber-950">Boss ×{QUIZ_BOSS_MULT}</span>}
            </div>
            <h2 className="mt-4 text-2xl font-semibold leading-snug text-white text-balance sm:text-4xl">{q.q}</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {q.options.map((o, k) => {
              const isAnswer = answered && k === q.answer;
              const wrongPick = answered && s.picked === k && k !== q.answer;
              const hidden = s.hidden.includes(k);
              return (
                <motion.button key={o} type="button" disabled={answered || hidden} onClick={() => pick(k)}
                  initial={{ opacity: 0, y: calm ? 0 : 14 }} animate={{ opacity: hidden ? 0.18 : answered && !isAnswer && !wrongPick ? 0.4 : 1, y: 0, scale: isAnswer && !calm ? 1.02 : 1 }}
                  transition={{ ...spring.smooth, delay: answered ? 0 : 0.05 * k }}
                  className={cn('relative flex min-h-[4.5rem] items-center gap-3 rounded-2xl px-4 py-3 text-start text-base font-medium ring-1 transition-[background-color,box-shadow] duration-150 sm:text-lg',
                    isAnswer ? 'bg-emerald-500/20 text-emerald-50 ring-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.25)]'
                      : wrongPick ? 'play-shake bg-red-500/15 text-red-100 ring-red-400'
                        : 'bg-white/[0.05] text-zinc-100 ring-white/10 hover:bg-white/[0.1] hover:ring-white/25')}>
                  <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold', isAnswer ? 'bg-emerald-400 text-emerald-950' : wrongPick ? 'bg-red-400 text-red-950' : 'bg-white/10 text-zinc-200')} aria-hidden>
                    {isAnswer ? <Check className="w-5 h-5" /> : wrongPick ? <X className="w-5 h-5" /> : k + 1}
                  </span>
                  <span className="min-w-0">{o}</span>
                  {s.picked === k && s.gained > 0 && (
                    <>
                      <Burst color="#34d399" />
                      <span className="play-float pointer-events-none absolute left-1/2 top-0 rounded-full bg-emerald-700 px-2.5 py-0.5 text-sm font-bold text-white shadow-lg" aria-hidden>+{s.gained}</span>
                    </>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="sr-only" aria-live="polite">{said}</p>
      <p className="mt-4 hidden text-center text-xs text-zinc-400 sm:block">Keys 1–4 answer · Q W E power-ups</p>
    </div>
  );
}
