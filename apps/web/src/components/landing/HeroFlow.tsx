'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { MousePointer2, Plus, Redo2 } from 'lucide-react';
import { reducedMotion } from '@/lib/page-transition';
import { EASE, glass } from './bits';

// The hero's floating card (after the Relay video): one of the jobs UniVerse runs between people,
// drawn as a little flow (a hand-in comes in, a check, two ways on), with its recent runs ticking
// in underneath. An illustration of how it works, not live data.

const RUNS: [string, string][] = [
  ['late hand-ins', '88 ms'],
  ['attendance from the class call', '129 ms'],
  ['weekly parent digest', '2.1 s'],
  ['fee reminder', '410 ms'],
  ['timetable change notice', '240 ms'],
];
const clock = (s: number) => [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');

function Node({ title, sub, className, live }: { title: string; sub: string; className: string; live?: boolean }) {
  return (
    <div className={`absolute rounded-xl border border-white/10 bg-[#141729]/90 px-3 py-2 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ${className}`}>
      <p className="text-[13px] font-semibold text-white leading-tight">{title}</p>
      <p className="font-mono text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5">{live && <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />}{sub}</p>
    </div>
  );
}

export function HeroFlow() {
  // The newest run first; one more ticks in every few seconds.
  const [runs, setRuns] = useState(() => RUNS.slice(0, 3).map(([name, took], i) => ({ id: i, name, took, at: 9 * 3600 + 41 * 60 + 2 - i * 170 })));
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    if (reducedMotion()) return;
    let n = 3;
    const t = setInterval(() => {
      const [name, took] = RUNS[n % RUNS.length];
      setRuns((r) => [{ id: n, name, took, at: r[0].at + 37 + (n % 5) * 11 }, ...r].slice(0, 3));
      setProgress(0);
      setTimeout(() => setProgress(100), 60);
      n++;
    }, 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`${glass} relative w-full max-w-[560px] p-4 sm:p-5 shadow-[0_40px_120px_-40px_rgba(99,102,241,0.55)]`}>
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-white truncate">late hand-ins</span>
          <span className="hidden sm:inline font-mono text-xs text-zinc-400">2 steps / 1 branch</span>
        </div>
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-fuchsia-500/15 text-fuchsia-200 font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" /> running
        </span>
      </div>
      <div className="h-0.5 mt-[-1px] rounded-full bg-white/[0.04] overflow-hidden" aria-hidden>
        <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${progress}%`, transition: progress ? 'width 2.6s cubic-bezier(.22,1,.36,1)' : 'none' }} />
      </div>

      <div className="flex gap-3 pt-4">
        {/* The editor's little tool column. */}
        <div className="hidden sm:flex flex-col gap-1.5 pt-1" aria-hidden>
          {[MousePointer2, Plus, Redo2].map((I, i) => <span key={i} className="w-7 h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center text-zinc-400"><I className="w-3.5 h-3.5" /></span>)}
        </div>
        {/* The flow. */}
        <div className="relative flex-1 h-[210px]" role="img" aria-label="A flow: when an assignment is handed in, if it is more than 2 days late the teacher is asked, otherwise it goes into the gradebook">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="flow-line" x1="0" x2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#e879f9" /></linearGradient>
            </defs>
            {['M31 50 C 35 50, 34 17, 39 17', 'M31 50 C 35 50, 34 80, 39 80', 'M66 17 C 70 17, 69 47, 72 47', 'M66 80 C 70 80, 69 53, 72 53'].map((d, i) => (
              <g key={i}>
                <path d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                <path d={d} fill="none" stroke="url(#flow-line)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" className="flow-dash" style={{ animationDelay: `${i * 0.35}s` }} />
              </g>
            ))}
          </svg>
          <Node title="Assignment handed in" sub="student" className="left-0 top-[38%] w-[31%]" />
          <span className="absolute left-[30%] top-[22%] font-mono text-[10px] text-zinc-300 bg-white/[0.06] rounded px-1.5 py-0.5">true</span>
          <span className="absolute left-[30%] top-[70%] font-mono text-[10px] text-zinc-300 bg-white/[0.06] rounded px-1.5 py-0.5">else</span>
          <Node title="Late by 2+ days" sub="condition" className="left-[39%] top-[4%] w-[27%]" />
          <Node title="Add to gradebook" sub="grades" className="left-[39%] top-[67%] w-[27%]" />
          <Node title="Ask the teacher" sub="waiting on a yes" live className="left-[72%] top-[36%] w-[28%]" />
          <span className="hidden sm:inline absolute left-[72%] top-[66%] font-mono text-[10px] text-zinc-300 border border-white/10 rounded-full px-2 py-0.5">● 26 min</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <p className="font-mono text-[11px] text-zinc-400 mb-1.5">last runs</p>
        <ul className="font-mono text-xs space-y-1 min-h-[66px]">
          <AnimatePresence initial={false}>
            {runs.map((r, i) => (
              <motion.li key={r.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}
                className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0 text-zinc-300">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 0 ? 'bg-fuchsia-400 shadow-[0_0_8px_#e879f9]' : 'bg-zinc-500'}`} />
                  <span className="text-zinc-400 shrink-0">{clock(r.at)}</span>
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="text-zinc-400 shrink-0">{r.took}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
