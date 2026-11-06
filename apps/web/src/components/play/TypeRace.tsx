'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Flag, Flame, Target } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { NITRO_MS, NITRO_STREAK, TYPE_CHAR, TYPE_DONE, TYPE_MISS, TYPE_PERFECT, pace, typingPassage, wpm } from '@/lib/play/typing';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useArena } from './arena';
import type { GameProps } from './game-props';
import { RaceView } from './RaceView';

// Type Race (src/lib/play/typing.ts): type each true fact exactly; only the right letter moves you
// on. Cars race laps of a 600-letter track: you, your friends in a room (their letters come with
// the live scores), or a pace car alone, on a 3D circuit (RaceView, M104). Twenty right letters in a row light the nitro: letters
// count double for four seconds, the car leaves flames. A speedometer shows your words a minute.

const LAP = 600;
const COLORS = ['#fe81d1', '#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f87171', '#e2e8f0', '#facc15'];

interface S { i: number; at: number; chars: number; misses: number; score: number; done: number; miss: number; missAt: number; streak: number; best: number; charge: number; nitroUntil: number; nitros: number; last: number; factMiss: number; perfects: number }
type A = { t: 'key'; ch: string; text: string; now: number } | { t: 'next' };

function reducer(s: S, a: A): S {
  if (a.t === 'next') { const perfect = s.factMiss === 0; return { ...s, i: s.i + 1, at: 0, missAt: -1, done: s.done + 1, score: s.score + TYPE_DONE + (perfect ? TYPE_PERFECT : 0), factMiss: 0, perfects: s.perfects + (perfect ? 1 : 0) }; }
  if (s.at >= a.text.length) return s;
  if (a.ch === a.text[s.at]) {
    const nitro = a.now < s.nitroUntil, charge = nitro ? 0 : s.charge + 1, lit = !nitro && charge >= NITRO_STREAK;
    return {
      ...s, at: s.at + 1, chars: s.chars + 1, score: s.score + TYPE_CHAR * (nitro ? 2 : 1), streak: s.streak + 1, best: Math.max(s.best, s.streak + 1),
      charge: lit ? 0 : charge, nitroUntil: lit ? a.now + NITRO_MS : s.nitroUntil, nitros: s.nitros + (lit ? 1 : 0), last: a.now,
    };
  }
  return { ...s, misses: s.misses + 1, score: Math.max(0, s.score - TYPE_MISS), miss: s.miss + 1, missAt: s.at, streak: 0, charge: 0, factMiss: s.factMiss + 1 };
}

export function TypeRace({ seed, startsAt, clock, onProgress, onStats, rivals }: GameProps) {
  const [s, dispatch] = useReducer(reducer, { i: 0, at: 0, chars: 0, misses: 0, score: 0, done: 0, miss: 0, missAt: -1, streak: 0, best: 0, charge: 0, nitroUntil: 0, nitros: 0, last: 0, factMiss: 0, perfects: 0 });
  const text = useMemo(() => typingPassage(seed, s.i), [seed, s.i]);
  const input = useRef<HTMLInputElement>(null);
  const calm = useReducedMotion();
  const { announce, shake, sfx } = useArena();
  const [now, setNow] = useState(startsAt);
  const paceWpm = useMemo(() => pace(seed), [seed]);
  const elapsed = Math.max(0, now - startsAt);
  const nitro = now < s.nitroUntil;

  useEffect(() => { input.current?.focus(); }, []);
  // A slow clock for the speedometer and the pace car (the letters themselves move on each key).
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 250);
    return () => clearInterval(id);
  }, [clock]);
  useEffect(() => { onProgress(s.score, s.chars); }, [s.score, s.chars, onProgress]);
  useEffect(() => {
    onStats?.([
      { label: 'Words a minute', value: String(wpm(s.chars, Math.max(1, s.last - startsAt))) },
      { label: 'Accuracy', value: `${s.chars + s.misses ? Math.round((100 * s.chars) / (s.chars + s.misses)) : 100}%` },
      { label: 'Best streak', value: String(s.best) }, { label: 'Facts done', value: String(s.done) }, { label: 'Perfect facts', value: String(s.perfects) },
    ]);
  }, [s.chars, s.misses, s.best, s.done, s.perfects, s.last, startsAt, onStats]);
  useEffect(() => { if (s.nitros) { announce('NITRO! ×2', 'gold'); sfx('boost'); } }, [s.nitros, announce, sfx]);
  useEffect(() => { if (s.perfects) { announce(`Perfect! +${TYPE_PERFECT}`, 'gold'); sfx('combo', Math.min(6, s.perfects)); } }, [s.perfects, announce, sfx]);
  useEffect(() => { if (s.miss) { sfx('wrong'); shake(0.25); } }, [s.miss, sfx, shake]);
  const lap = Math.floor(s.chars / LAP);
  useEffect(() => { if (lap > 0) { announce(`Lap ${lap + 1}!`, 'good'); sfx('check'); } }, [lap, announce, sfx]);
  // A finished fact: a short beat, then the next.
  useEffect(() => {
    if (s.at < text.length) return;
    sfx('right');
    const id = setTimeout(() => dispatch({ t: 'next' }), 320);
    return () => clearTimeout(id);
  }, [s.at, text.length, sfx]);

  const type = (value: string) => {
    for (const ch of value) { dispatch({ t: 'key', ch, text, now: clock() }); sfx('key'); }
  };
  const speed = wpm(s.chars, elapsed);
  const accuracy = s.chars + s.misses ? Math.round((100 * s.chars) / (s.chars + s.misses)) : 100;
  const racers = [
    { id: 'me', name: 'You', chars: s.chars, me: true },
    ...(rivals?.length ? rivals.map((r) => ({ id: r.id, name: r.name, chars: r.step, me: false })) : [{ id: 'pace', name: `Pace ${paceWpm}`, chars: Math.round((paceWpm * 5 * elapsed) / 60_000), me: false }]),
  ];

  return (
    <div className="mx-auto w-full" onClick={() => input.current?.focus()}>
      {/* The race (M104): a 3D circuit, every racer a car in their lane */}
      <RaceView racers={racers.map((r, k) => ({ ...r, color: r.me ? COLORS[0] : COLORS[(k % (COLORS.length - 1)) + 1] }))} nitro={nitro} lap={LAP} />

      {/* Speedometer, accuracy, nitro charge, facts */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Speedo wpm={speed} />
        <Stat icon={Target} label="Accuracy" value={`${accuracy}%`} />
        <div className="rounded-2xl bg-white/[0.05] px-3 py-2.5 ring-1 ring-white/10">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Flame className={cn('h-3.5 w-3.5', nitro ? 'text-amber-300' : 'text-zinc-400')} aria-hidden />{nitro ? 'Nitro on! ×2' : 'Nitro'}</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            {nitro
              ? <div key={s.nitroUntil} className="play-drain h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-300 to-pink-500 rtl:origin-right" style={{ animationDuration: `${NITRO_MS}ms` }} />
              : <div className="h-full w-full origin-left rounded-full bg-pink-500 transition-transform duration-150 rtl:origin-right" style={{ transform: `scaleX(${s.charge / NITRO_STREAK})` }} />}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">{nitro ? 'letters count double' : `${NITRO_STREAK - s.charge} right letters to go`}</p>
        </div>
        <Stat icon={Flag} label="Facts done" value={s.done} />
      </div>

      {/* The fact to type */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={s.i} initial={{ opacity: 0, y: calm ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: calm ? 0 : -8, transition: { duration: 0.14 } }} transition={spring.smooth}
          className={cn('mt-4 rounded-[1.75rem] bg-[#111113] p-5 ring-1 transition-shadow duration-300 sm:p-7', nitro ? 'ring-amber-300/60 shadow-[0_0_50px_-10px_rgba(251,191,36,0.6)]' : 'ring-white/10')}>
          <p key={s.miss} className={cn('font-mono text-xl leading-relaxed sm:text-2xl', s.missAt === s.at && 'play-shake')} aria-hidden>
            <span className="text-white">{text.slice(0, s.at)}</span>
            <span className={cn('rounded-[4px] px-[1px] transition-colors duration-150', s.missAt === s.at ? 'bg-red-500/30 text-red-200' : 'bg-pink-500/30 text-pink-100 underline decoration-2 underline-offset-4')}>{text[s.at] === ' ' ? ' ' : text[s.at]}</span>
            <span className="text-zinc-400">{text.slice(s.at + 1)}</span>
          </p>
          <p className={cn('mt-3 text-xs font-semibold transition-colors duration-200', s.factMiss ? 'text-zinc-400' : 'text-amber-300')} aria-hidden>{s.factMiss ? 'Missed a letter: no perfect bonus this time' : `Perfect so far: +${TYPE_PERFECT} if you finish with no mistakes`}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full origin-left rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-transform duration-200 ease-out rtl:origin-right" style={{ transform: `scaleX(${s.at / text.length})` }} />
          </div>
        </motion.div>
      </AnimatePresence>
      <label htmlFor="type-race-input" className="sr-only">Type this: {text}</label>
      <input id="type-race-input" ref={input} value="" onChange={(e) => type(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className="sr-only" />
      <p className="mt-3 text-center text-xs text-zinc-400">Just start typing. Only the right letter moves you on; capitals and punctuation count. {GAMES.type.seconds} seconds, laps of {LAP} letters.</p>
    </div>
  );
}

/** A half-dial speedometer (0–120 words a minute): only the needle turns. */
function Speedo({ wpm: v }: { wpm: number }) {
  const a = -90 + (Math.min(120, v) / 120) * 180;
  return (
    <div className="rounded-2xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/10">
      <svg viewBox="0 0 100 58" className="mx-auto h-14 w-24" aria-hidden>
        <path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" strokeLinecap="round" />
        <path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke="url(#spd)" strokeWidth="7" strokeLinecap="round" strokeDasharray="126" strokeDashoffset={126 - (Math.min(120, v) / 120) * 126} style={{ transition: 'stroke-dashoffset 300ms ease-out' }} />
        <defs><linearGradient id="spd"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#fe81d1" /></linearGradient></defs>
        <g style={{ transform: `rotate(${a}deg)`, transformOrigin: '50px 52px', transition: 'transform 300ms ease-out' }}><line x1="50" y1="52" x2="50" y2="18" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" /></g>
        <circle cx="50" cy="52" r="4" fill="#f8fafc" />
      </svg>
      <p className="text-center text-xl font-black tabular-nums leading-none text-white">{v}<span className="ms-1 text-[11px] font-semibold text-zinc-400">wpm</span></p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Flag; label: string; value: string | number }) {
  return (
    <div className="grid place-items-center rounded-2xl bg-white/[0.05] px-2 py-2.5 ring-1 ring-white/10">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</p>
      <p className="text-2xl font-black tabular-nums text-white">{value}</p>
    </div>
  );
}
