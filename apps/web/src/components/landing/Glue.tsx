'use client';

import { useRef } from 'react';
import { m as motion, useInView } from 'framer-motion';
import { Accent, EASE, Reveal, glass } from './bits';

// "Most of a school day is glue": what UniVerse connects to, and one job laid out step by step
// with its timings (an example run, so people see what "the steps in between" means).

const APPS: [string, string][] = [
  ['GO', 'Google sign-in'], ['ST', 'Stripe'], ['RZ', 'Razorpay'], ['LT', 'LTI / your LMS'],
  ['CC', 'Common Cartridge'], ['QT', 'QTI and GIFT'], ['LI', 'LinkedIn'],
];
// [step, starts at (ms), takes (ms)]
const STEPS: [string, number, number][] = [
  ['class call ends', 0, 4],
  ['mark the register', 4, 34],
  ['check: absent 3 days running', 38, 6],
  ['branch: yes', 44, 2],
  ['tell the parent', 46, 74],
  ['note it for the form tutor', 120, 42],
];
const END = 162;

function Waterfall() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-80px' });
  return (
    <div ref={ref} className={`${glass} p-5 sm:p-6`}>
      <div className="flex items-center justify-between font-mono text-xs text-zinc-400 mb-4">
        <span>example run · absence follow-up</span><span>{END} ms</span>
      </div>
      <ul className="space-y-2.5 font-mono text-xs">
        {STEPS.map(([name, at, took], i) => (
          <li key={name} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] sm:grid-cols-[14rem_1fr_3.5rem] items-center gap-3">
            <span className="truncate text-zinc-300">{name}</span>
            <span className="relative h-2 rounded-full bg-white/[0.04]">
              <motion.span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400"
                style={{ left: `${(at / END) * 100}%` }}
                initial={{ width: 0 }} animate={{ width: seen ? `${Math.max(1.5, (took / END) * 100)}%` : 0 }} transition={{ duration: 0.6, delay: 0.2 + i * 0.18, ease: EASE }} />
            </span>
            <span className="text-end text-zinc-400">{took} ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Glue() {
  return (
    <section id="how" data-no-motion className="relative px-6 py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}>
          <ul className="mt-6 flex flex-wrap gap-2.5" aria-label="Works with">
            {APPS.map(([mono, name]) => (
              <li key={name} className="group inline-flex items-center gap-2.5 h-11 ps-1.5 pe-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-fuchsia-400/40 hover:bg-white/[0.06] transition-colors">
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center font-mono text-[11px] font-bold text-white group-hover:scale-105 transition-transform">{mono}</span>
                <span className="text-sm text-zinc-200">{name}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <div className="mt-16 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.08] text-white">Most of a school day is <Accent>glue.</Accent></h2>
            <p className="mt-5 text-zinc-400 leading-relaxed max-w-md">UniVerse does the steps in between. You step in when it matters.</p>
          </Reveal>
          <Reveal delay={0.1}><Waterfall /></Reveal>
        </div>
      </div>
    </section>
  );
}
