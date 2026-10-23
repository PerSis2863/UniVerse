'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { glass } from './bits';
import { FLOWS } from './flows';

// One job UniVerse runs between people (src/components/landing/flows.ts), as a card: something
// happens, one question, the two ways it can go, and the steps written out underneath. A light runs
// through it step by step, without stopping or starting over: the line to the question, the
// question, then each way in turn, with its step lit below (globals.css, "M13": .flow-comet,
// .flow-on; still for Reduce Motion). Always dark and nearly solid, so its greys stay readable on light pages too.
// Used on the landing page, sign-in and the owner console.

const PHASE = 2; // seconds per step; four steps a round

function Node({ title, className, phase, person }: { title: string; className: string; phase: number; person?: boolean }) {
  return (
    <div style={{ animationDelay: `${phase * PHASE}s` }}
      className={cn('flow-on absolute -translate-y-1/2 rounded-xl border border-white/10 bg-[#141729]/95 px-2.5 py-2 text-center shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)]', person && 'border-fuchsia-400/35 bg-[#1b1631]/95', className)}>
      <p className="text-[12px] sm:text-[13px] font-semibold text-white leading-tight">
        {person && <UserRound className="inline w-3 h-3 me-1 -mt-0.5 text-fuchsia-300" aria-hidden />}{title}
      </p>
    </div>
  );
}

/** `flow`: an id from FLOWS (a name, so pages rendered on the server can pass it). `compact`: just the
 *  drawing, without the steps written out. */
export function FlowCard({ flow: which = 'late', compact = false, className }: { flow?: string; compact?: boolean; className?: string }) {
  const flow = FLOWS.find((f) => f.id === which) ?? FLOWS[0];
  const id = useId().replace(/:/g, '');
  // The lines are drawn at the box's real size (not stretched), so each light runs their whole length.
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 480, h: 170 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const px = (d: string) => d.replace(/(\d+) (\d+)/g, (_, x, y) => `${((+x * size.w) / 100).toFixed(1)} ${((+y * size.h) / 100).toFixed(1)}`);
  const steps = [
    { step: flow.start, tag: 'when' },
    { step: flow.check, tag: 'check' },
    { step: flow.yes, tag: flow.person === 'yes' ? 'yes · asks a person' : 'yes · by itself' },
    { step: flow.no, tag: flow.person === 'no' ? 'no · asks a person' : 'no · by itself' },
  ];
  // The lines: each comet leaves in the step before the box it points to, and arrives as it lights.
  const lines: [string, number][] = [['M30 50 L 40 50', 0], ['M60 50 C 65 50, 64 24, 69 24', 1], ['M60 50 C 65 50, 64 76, 69 76', 2]];
  return (
    <div className={cn(glass, 'dark bg-[#0d0f1d]/95 relative w-full max-w-[520px] p-5 text-start shadow-[0_40px_120px_-40px_rgba(99,102,241,0.55)]', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 border border-white/10">
            <flow.icon className="w-4 h-4 text-fuchsia-200" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{flow.name}</p>
            <p className="font-mono text-[11px] text-zinc-400 truncate">{flow.feature.toLowerCase()}</p>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-fuchsia-500/15 text-fuchsia-200 font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_#e879f9]" /> running
        </span>
      </div>

      <div ref={box} className="relative h-[150px] sm:h-[170px] mt-4 border-t border-white/[0.06]" role="img"
        aria-label={`${flow.start[0]}, then: ${flow.check[0]} If yes: ${flow.yes[0]}. If no: ${flow.no[0]}.`}>
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden>
          <defs><linearGradient id={`fl-${id}`} x1="0" x2="1"><stop offset="0" stopColor="#a5b4fc" /><stop offset="1" stopColor="#f0abfc" /></linearGradient></defs>
          {lines.map(([d, phase]) => (
            <g key={d}>
              <path d={px(d)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
              <path d={px(d)} pathLength={100} fill="none" stroke={`url(#fl-${id})`} strokeWidth="2.5" strokeLinecap="round"
                className="flow-comet" style={{ animationDelay: `${phase * PHASE}s` }} />
            </g>
          ))}
        </svg>
        <Node title={flow.start[0]} phase={0} className="left-0 top-1/2 w-[30%]" />
        <Node title={flow.check[0]} phase={1} className="left-[40%] top-1/2 w-[20%] !rounded-full" />
        <Node title={flow.yes[0]} phase={2} person={flow.person === 'yes'} className="left-[69%] top-[24%] w-[31%]" />
        <Node title={flow.no[0]} phase={3} person={flow.person === 'no'} className="left-[69%] top-[76%] w-[31%]" />
        <span className="absolute left-[60%] top-[18%] font-mono text-[11px] text-zinc-300" aria-hidden>yes</span>
        <span className="absolute left-[60%] top-[74%] font-mono text-[11px] text-zinc-300" aria-hidden>no</span>
      </div>

      {!compact && <>
      <ol className="pt-3 border-t border-white/[0.06] space-y-0.5" aria-label="Steps">
        {steps.map(({ step: [title, detail], tag }, i) => (
          <li key={tag} style={{ animationDelay: `${i * PHASE}s` }} className="flow-row grid grid-cols-[1.5rem_1fr] gap-x-2 rounded-lg px-2 py-1.5">
            <span className="font-mono text-[11px] text-zinc-400 pt-0.5">0{i + 1}</span>
            <div className="min-w-0">
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold text-zinc-100 truncate">{title}</span>
                <span className="shrink-0 font-mono text-[11px] text-zinc-400">{tag}</span>
              </p>
              <p className="text-xs text-zinc-400">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-xs text-zinc-400">{flow.note}</p>
      </>}
    </div>
  );
}
