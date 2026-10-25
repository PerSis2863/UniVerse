'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { Coffee, Pause, Play, RotateCcw, SkipForward, Timer } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useTick } from '@/lib/use-now';
import { PRESETS, chime, focusNow, pause, progress, ready, remaining, setFocus, skip, start, tick, useFocus } from '@/lib/focus-timer';
import { cn } from '@/lib/utils';

const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The timer's state and the time now (to the second while it runs); ends rounds as they finish. */
function useFocusClock() {
  const s = useFocus();
  const now = useTick(!!s.endsAt);
  useEffect(() => {
    // Read the latest state (another part of the page may have just moved it on), and catch up on
    // every round that ended while nobody was looking.
    let cur = focusNow(), last: 'focus' | 'break' | null = null;
    for (let i = 0; i < 4; i++) { const t = tick(cur, Date.now()); if (!t.ended) break; cur = t.state; last = t.ended; }
    if (!last) return;
    setFocus(cur);
    chime();
    toast.success(last === 'focus' ? `Focus round done. Take a ${PRESETS[cur.preset][1]}-minute break.` : 'Break over. Ready for the next round?');
  }, [now]);
  return { s, now: s.endsAt ? now : 0 };
}

/** The full timer (Collaborate → Home): a ring that fills as the round goes, and its controls. */
export function FocusTimer() {
  const { s, now } = useFocusClock();
  const left = remaining(s, now), done = Math.min(1, Math.max(0, progress(s, now)));
  const R = 54, C = 2 * Math.PI * R;
  const brk = s.phase === 'break';
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="focus-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={brk ? '#14b8a6' : '#2a2927'} /><stop offset="1" stopColor={brk ? '#22d3ee' : '#db2777'} /></linearGradient>
          </defs>
          <circle cx="64" cy="64" r={R} fill="none" strokeWidth="9" className="stroke-zinc-200 dark:stroke-white/[0.07]" />
          <circle cx="64" cy="64" r={R} fill="none" strokeWidth="9" strokeLinecap="round" stroke="url(#focus-ring)" strokeDasharray={C} strokeDashoffset={C * (1 - done)}
            className={cn('transition-[stroke-dashoffset] duration-700 ease-out', s.endsAt && 'drop-shadow-[0_0_6px_rgb(217_70_239/0.6)]')} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">{brk ? <><Coffee className="w-3.5 h-3.5" />Break</> : <><Timer className="w-3.5 h-3.5" />Focus</>}</span>
          <span className="text-4xl font-black tabular-nums text-zinc-900 dark:text-white" role="timer" aria-live="off">{mmss(left)}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{s.rounds} round{s.rounds === 1 ? '' : 's'} done</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => setFocus(s.endsAt ? pause(s, Date.now()) : start(s, Date.now()))} className="btn-primary rounded-full px-5 inline-flex items-center gap-1.5">
          {s.endsAt ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />{left < (PRESETS[s.preset][brk ? 1 : 0] * 60_000) ? 'Resume' : 'Start'}</>}
        </button>
        <button type="button" onClick={() => setFocus(skip(s, Date.now()))} aria-label={brk ? 'Skip the break' : 'Skip to the break'} title="Skip" className="p-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:text-indigo-500"><SkipForward className="w-4 h-4" /></button>
        <button type="button" onClick={() => setFocus(ready(s.preset))} aria-label="Start again" title="Start again" className="p-2.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:text-indigo-500"><RotateCcw className="w-4 h-4" /></button>
      </div>
      <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Round length">
        {PRESETS.map(([f, b], i) => (
          <button key={f} type="button" role="radio" aria-checked={s.preset === i} onClick={() => setFocus(ready(i, s.rounds))}
            className={cn('px-2.5 py-1 rounded-full text-xs font-semibold transition-colors', s.preset === i ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>{f} / {b} min</button>
        ))}
      </div>
    </div>
  );
}

/** The small timer beside Collaborate's tabs, while a round runs or is paused part-way. */
export function FocusPill() {
  const { s, now } = useFocusClock();
  const left = remaining(s, now);
  const full = PRESETS[s.preset][s.phase === 'focus' ? 0 : 1] * 60_000;
  if (!s.endsAt && left >= full) return null;
  return (
    <Link href="/collab" className={cn('menu-pop inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-bold tabular-nums text-white shadow-lg', s.phase === 'break' ? 'bg-gradient-to-r from-indigo-400 to-indigo-600 shadow-cyan-500/30' : 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-fuchsia-500/30')}
      aria-label={`${s.phase === 'break' ? 'Break' : 'Focus'}: ${mmss(left)} left${s.endsAt ? '' : ', paused'}`}>
      {s.phase === 'break' ? <Coffee className="w-3.5 h-3.5" /> : <Timer className={cn('w-3.5 h-3.5', s.endsAt && 'animate-pulse')} />}
      {mmss(left)}{!s.endsAt && <Pause className="w-3 h-3 opacity-80" />}
    </Link>
  );
}
