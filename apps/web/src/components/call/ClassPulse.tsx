'use client';

import { m as motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Classroom pulse (Stage 4 · 4.4). In a class call, students tap "I'm lost" or "Got it" (it clears
// itself after two minutes: it means "right now"); the teacher sees only how many, never who.

export type PulseValue = 'lost' | 'got' | null;
export interface PulseCounts { lost: number; got: number; total: number }
/** How long a tap counts for. */
export const PULSE_MS = 2 * 60_000;

/** For students: the two buttons (tap again to take it back). */
export function PulseButtons({ value, onPick }: { value: PulseValue; onPick: (v: 'lost' | 'got') => void }) {
  const pill = (v: 'lost' | 'got', emoji: string, label: string, on: string) => (
    <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => onPick(v)} aria-pressed={value === v}
      className={cn('pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold backdrop-blur-xl border transition-colors', value === v ? on : 'bg-black/40 border-white/10 text-zinc-100 hover:bg-white/10')}>
      <span aria-hidden>{emoji}</span>{label}
    </motion.button>
  );
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2" role="group" aria-label="How’s the class going for you? Only counts reach the teacher, not your name.">
        {pill('lost', '🤔', 'I’m lost', 'bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/30')}
        {pill('got', '👍', 'Got it', 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30')}
      </div>
      {value && <p className="text-[11px] text-zinc-400">Anonymous · clears in 2 minutes</p>}
    </div>
  );
}

/** For the teacher: the live understanding meter. */
export function PulseMeter({ counts }: { counts: PulseCounts }) {
  const { lost, got, total } = counts;
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.smooth}
      className="pointer-events-auto w-[min(92vw,20rem)] rounded-2xl bg-black/55 backdrop-blur-xl border border-white/10 px-3.5 py-2.5 shadow-xl" role="status"
      aria-label={`Class pulse: ${lost} lost, ${got} got it, of ${total} students`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-100"><Activity className="w-3.5 h-3.5 text-fuchsia-300" />Class pulse</span>
        <span className="text-zinc-400 tabular-nums">{total} {total === 1 ? 'student' : 'students'}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden flex gap-[2px]">
        <motion.span className="h-full bg-rose-500 rounded-l-full" animate={{ width: pct(lost) }} transition={spring.smooth} />
        <motion.span className="h-full bg-sky-600" animate={{ width: pct(got) }} transition={spring.smooth} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-300 tabular-nums">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />{lost} lost</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-600" />{got} got it</span>
        <span className="inline-flex items-center gap-1 text-zinc-500"><span className="w-2 h-2 rounded-full bg-white/20" />{Math.max(0, total - lost - got)} no answer</span>
      </div>
    </motion.div>
  );
}
