'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { CalendarCheck, Check, ClipboardCheck, GraduationCap, ListChecks, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, useCalm } from './bits';

// The landing hero's pictures, one style per app (the owner: "different style animation" for each):
// UniVersity a live workflow diagram, Trace a holographic label over a dotted world, Relief a radar,
// Green a growing landscape, Play a neon arcade. Each plays a short story and starts again; with
// Reduce Motion each shows its finished picture and stays still. M117: only UniVersity's is here; the four
// Lab apps' pictures are in HeroScenesLab.tsx, loaded when their tab is first opened (not with the page).

/** The story's step, 0…steps-1, every `ms`; the last step with Reduce Motion. */
/** Off screen or with Reduce Motion a scene is drawn afresh, still (M47): framer-motion keeps a
 *  running loop going when its `animate` is taken away, so a new copy is what stops them all. */
export const still = (Scene: () => React.ReactNode) => function Still() { const calm = useCalm(); return <Scene key={calm ? 'still' : 'live'} />; };

export function useStep(steps: number, ms = 900) {
  const calm = useCalm();
  const [s, set] = useState(0);
  useEffect(() => {
    if (calm) return;
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [calm, ms]);
  return { s: calm ? steps - 1 : s % steps, loop: calm ? 0 : Math.floor(s / steps), calm: !!calm };
}

export const pop = { initial: { opacity: 0, y: 10, scale: 0.92 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } }, transition: { duration: 0.45, ease: EASE } };

/* ── UniVersity: the school day running itself ──
   Five jobs circle a glowing core on a slow orbit (each stays upright); every beat a beam of light
   reaches the next one, it lights up and lifts, and its result slides into the live feed below while
   the older ones glide down. The core breathes and counts what it handled. Transform and opacity only;
   Reduce Motion shows the finished picture, still. */
const DAY = [
  { icon: CalendarCheck, title: 'Register filled itself', sub: 'From the 9:00 class call: 28 present' },
  { icon: ListChecks, title: 'Quiz marked', sub: 'Physics, 31 answers, in two seconds' },
  { icon: ClipboardCheck, title: 'Late hand-in sent to the teacher', sub: 'Maths essay, 42 minutes late' },
  { icon: GraduationCap, title: 'Grades into the gradebook', sub: 'Feedback reaches every student' },
  { icon: Mail, title: 'Parent digest sent', sub: 'One short summary at 18:00' },
] as const;
const ORBIT = 118; // px, the jobs' circle

function Campus() {
  const { s, loop, calm } = useStep(DAY.length, 1800);
  const n = loop * DAY.length + s; // how many jobs done, for the counter and the feed
  const feed = [0, 1, 2].map((k) => n - k).filter((i) => i >= 0);
  // M117: the endless parts (the orbit's turn and the tiles' counter-turn, the core's breath, its
  // waves) are CSS animations (globals.css, `.campus-*`), which the browser runs off the main thread.
  // Driven by script they kept a phone's main thread about two-thirds busy while the page sat still.
  return (
    <div className="relative flex h-[500px] w-full max-w-[520px] flex-col items-center" role="img" aria-label="A school day: the register, quiz marking, late hand-ins, grades and the parent digest done by themselves">
      <div className="relative grid h-[310px] w-[310px] shrink-0 place-items-center">
        {/* the track, a faint dotted circle */}
        <span aria-hidden className="absolute rounded-full border border-dashed border-white/15" style={{ width: ORBIT * 2, height: ORBIT * 2 }} />
        <span aria-hidden className="absolute rounded-full border border-white/[0.06]" style={{ width: ORBIT * 2 + 70, height: ORBIT * 2 + 70 }} />
        {/* the core: breathing glow, waves going out, the day's count */}
        {!calm && [0, 1, 2].map((i) => (
          <span key={i} aria-hidden className="campus-wave absolute h-24 w-24 rounded-full border border-pink-400/40" style={{ animationDelay: `${i * 1.2}s` }} />
        ))}
        <div className={cn('relative grid h-24 w-24 place-items-center rounded-full bg-[var(--surface)] ring-1 ring-pink-400/40 shadow-[0_0_60px_rgba(79,142,247,0.45)]', !calm && 'campus-breathe')}>
          <span className="text-center">
            <span className="relative block h-7 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={n} className="block font-mono text-2xl font-bold tabular-nums text-white" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>{1204 + n}</motion.span>
              </AnimatePresence>
            </span>
            <span className="block text-[11px] text-zinc-400">done today</span>
          </span>
        </div>
        {/* the orbit: jobs ride round, each kept upright; the beam lives in the same turning frame */}
        <div className={cn('absolute inset-0', !calm && 'campus-turn')}>
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 310 310" aria-hidden>
            {DAY.map((_, i) => {
              const a = (i / DAY.length) * Math.PI * 2 - Math.PI / 2, x = 155 + Math.cos(a) * ORBIT, y = 155 + Math.sin(a) * ORBIT;
              return i === s ? (
                <motion.line key={`${n}`} x1="155" y1="155" x2={x} y2={y} stroke="#7aaefa" strokeWidth="2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px #4f8ef7)' }}
                  initial={{ pathLength: calm ? 1 : 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0.35] }} transition={{ duration: 1.2, ease: EASE }} />
              ) : null;
            })}
          </svg>
          {DAY.map((d, i) => {
            const a = (i / DAY.length) * Math.PI * 2 - Math.PI / 2, on = i === s, done = calm || i < s;
            return (
              <div key={d.title} className="absolute left-1/2 top-1/2" style={{ transform: `translate(${Math.cos(a) * ORBIT}px, ${Math.sin(a) * ORBIT}px)` }}>
                <div className={cn('-ms-6 -mt-6', !calm && 'campus-turn-back')}>
                  <motion.span animate={{ scale: on ? 1.18 : 1, y: on ? -3 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    className={cn('relative grid h-12 w-12 place-items-center rounded-2xl ring-1 transition-[background-color,box-shadow] duration-500',
                      on ? 'bg-pink-500 ring-pink-300 shadow-[0_0_34px_rgba(79,142,247,0.8)]' : done ? 'bg-pink-500/15 ring-aqua-300/40' : 'bg-[var(--surface)] ring-white/10')}>
                    {on && !calm && <motion.span key={n} aria-hidden className="absolute inset-0 rounded-2xl ring-2 ring-pink-300" initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1, ease: EASE }} />}
                    <d.icon className={cn('h-5 w-5', on ? 'text-white' : 'text-pink-200/80')} aria-hidden />
                  </motion.span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* the feed: the newest result slides in on top, older ones glide down */}
      <ol className="relative mt-1 w-full space-y-2" aria-label="Done today">
        <AnimatePresence initial={false} mode="popLayout">
          {feed.map((i, k) => {
            const d = DAY[i % DAY.length];
            return (
              <motion.li key={i} layout initial={{ opacity: 0, y: -18, scale: 0.96 }} animate={{ opacity: 1 - k * 0.28, y: 0, scale: 1 - k * 0.02 }} exit={{ opacity: 0, y: 14, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                className={cn('flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ring-1', k === 0 ? 'bg-[var(--surface-2)] ring-pink-400/30 shadow-[0_10px_40px_-18px_rgba(79,142,247,0.7)]' : 'bg-[var(--surface)] ring-white/10')}>
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl', k === 0 ? 'bg-pink-500/20' : 'bg-white/5')}><d.icon className="h-4 w-4 text-pink-200" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{d.title}</span><span className="block truncate text-xs text-zinc-300">{d.sub}</span></span>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}

export const CampusScene = still(Campus);
