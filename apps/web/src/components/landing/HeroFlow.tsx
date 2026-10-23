'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { reducedMotion } from '@/lib/page-transition';
import { EASE, glass } from './bits';

// The hero's floating card (after the Relay video, kept simple at the owner's request): one job
// UniVerse runs between people, in three steps (a hand-in arrives, is it late?, ask the teacher or
// file the grade), light running along the lines, and its latest runs ticking in underneath.
// An illustration of how it works, not live data.

const RUNS: [string, string][] = [
  ['Late hand-ins', '88 ms'],
  ['Register from the class call', '129 ms'],
  ['Parent digest', '2.1 s'],
  ['Fee reminder', '410 ms'],
];

function Node({ title, className, live, small }: { title: string; className: string; live?: boolean; small?: boolean }) {
  return (
    <div className={`absolute -translate-y-1/2 rounded-xl border px-3 py-2.5 text-center shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ${live ? 'border-fuchsia-400/40 bg-[#1b1631]/95' : 'border-white/10 bg-[#141729]/95'} ${className}`}>
      <p className={`${small ? 'text-xs' : 'text-[13px]'} font-semibold text-white leading-tight`}>
        {live && <span className="inline-block w-1.5 h-1.5 me-1.5 mb-px rounded-full bg-fuchsia-400 animate-pulse align-middle" />}{title}
      </p>
    </div>
  );
}

export function HeroFlow() {
  const [runs, setRuns] = useState(() => RUNS.slice(0, 3).map(([name, took], i) => ({ id: i, name, took })));
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    if (reducedMotion()) return;
    let n = 3;
    const t = setInterval(() => {
      const [name, took] = RUNS[n % RUNS.length];
      setRuns((r) => [{ id: n, name, took }, ...r].slice(0, 3));
      setProgress(0);
      setTimeout(() => setProgress(100), 60);
      n++;
    }, 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`${glass} relative w-full max-w-[520px] p-5 shadow-[0_40px_120px_-40px_rgba(99,102,241,0.55)]`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">Late hand-ins</span>
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-fuchsia-500/15 text-fuchsia-200 font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" /> running
        </span>
      </div>
      <div className="mt-3 h-0.5 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden>
        <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${progress}%`, transition: progress ? 'width 2.6s cubic-bezier(.22,1,.36,1)' : 'none' }} />
      </div>

      {/* The flow: hand-in → late? → ask the teacher (yes) or the gradebook (no). */}
      <div className="relative h-[170px] mt-4" role="img" aria-label="When a hand-in arrives late, UniVerse asks the teacher; otherwise it goes into the gradebook">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs><linearGradient id="flow-line" x1="0" x2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#e879f9" /></linearGradient></defs>
          {['M30 50 L 40 50', 'M60 50 C 65 50, 64 24, 69 24', 'M60 50 C 65 50, 64 76, 69 76'].map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d={d} fill="none" stroke="url(#flow-line)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="flow-dash" style={{ animationDelay: `${i * 0.4}s` }} />
            </g>
          ))}
        </svg>
        <Node title="Hand-in arrives" className="left-0 top-1/2 w-[30%]" />
        <Node title="Late?" small className="left-[40%] top-1/2 w-[20%] !rounded-full" />
        <Node title="Ask the teacher" live className="left-[69%] top-[24%] w-[31%]" />
        <Node title="Into the gradebook" className="left-[69%] top-[76%] w-[31%]" />
        <span className="absolute left-[60%] top-[22%] font-mono text-[10px] text-zinc-300" aria-hidden>yes</span>
        <span className="absolute left-[60%] top-[70%] font-mono text-[10px] text-zinc-300" aria-hidden>no</span>
      </div>

      <ul className="mt-4 pt-3 border-t border-white/[0.06] font-mono text-xs space-y-1.5 min-h-[64px]" aria-label="Latest runs">
        <AnimatePresence initial={false}>
          {runs.map((r, i) => (
            <motion.li key={r.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0 text-zinc-300">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? 'bg-fuchsia-400 shadow-[0_0_8px_#e879f9]' : 'bg-zinc-500'}`} />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="text-zinc-400 shrink-0">{r.took}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
