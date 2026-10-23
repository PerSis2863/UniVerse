'use client';

import { useRef } from 'react';
import { m as motion, useInView } from 'framer-motion';
import { Accent, CountUp, EASE, Reveal, Tag } from './bits';

// "Numbers we did not have to make up": facts about UniVerse itself (languages, question types, what
// students pay), each drawn as it scrolls in, and below them what each role gets. No invented
// usage figures or customer quotes: the page only says what the product does.

function Wave() {
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true, margin: '-60px' });
  // Drawn in its own proportions (no stretching), so the line draws in one even stroke.
  const d = 'M0 54 C 36 48, 65 50, 94 43 S 151 42, 180 34 S 238 30, 266 24 S 324 16, 360 10';
  return (
    <svg ref={ref} viewBox="0 0 360 64" className="w-full h-auto" aria-hidden>
      <defs>
        <linearGradient id="wave-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#a78bfa" stopOpacity="0.35" /><stop offset="1" stopColor="#a78bfa" stopOpacity="0" /></linearGradient>
        <linearGradient id="wave-line" x1="0" x2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#f0abfc" /></linearGradient>
      </defs>
      <motion.path d={`${d} L360 64 L0 64 Z`} fill="url(#wave-fill)" initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ duration: 1, delay: 0.8 }} />
      <motion.path d={d} fill="none" stroke="url(#wave-line)" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.6, ease: EASE }} />
    </svg>
  );
}

function Bars({ lit, total }: { lit: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-60px' });
  return (
    <div ref={ref} className="flex items-end gap-1.5 h-16" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <motion.span key={i} className={`flex-1 rounded-md ${i < lit ? 'bg-gradient-to-t from-violet-500 to-fuchsia-300' : 'bg-white/[0.06]'}`}
          initial={{ height: '8%' }} animate={{ height: seen ? `${i < lit ? 100 - i * 7 : 40}%` : '8%' }} transition={{ duration: 0.7, delay: i * 0.07, ease: EASE }} />
      ))}
    </div>
  );
}

function Gauge() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-60px' });
  return (
    <div ref={ref} className="h-3 rounded-full bg-white/[0.06] overflow-hidden mt-10" aria-hidden>
      <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-300 shadow-[0_0_20px_#c084fc]" initial={{ width: '0%' }} animate={{ width: seen ? '100%' : '0%' }} transition={{ duration: 1.8, ease: EASE }} />
    </div>
  );
}

const ROLES = [
  { line: 'Hand-ins, grades, the timetable and an AI tutor, in one place.', who: 'Students', what: 'always free' },
  { line: 'The register fills itself from the class call, and quizzes mark themselves.', who: 'Teachers', what: 'courses, quizzes, attendance' },
  { line: 'Fees, admissions and reports, without the spreadsheets.', who: 'School admins', what: 'one school or many' },
];

export function Proof() {
  return (
    <section id="roles" data-no-motion className="relative px-6 py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 items-end">
          <Reveal>
            <Tag>the facts</Tag>
            <h2 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight leading-[1.08] text-white">Numbers we did <Accent>not</Accent> have to make up.</h2>
          </Reveal>
          <Reveal delay={0.1}><p className="text-zinc-400 md:max-w-md md:ms-auto">Things UniVerse does today, counted from the product itself. No usage claims, no best case.</p></Reveal>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-10 border-t border-white/[0.06] pt-10">
          <Reveal>
            <p className="font-mono text-xs text-zinc-400">languages</p>
            <p className="mt-2 text-6xl font-bold tracking-tight text-white"><CountUp to={13} /></p>
            <p className="mt-2 font-mono text-xs text-zinc-400">including two that read right to left</p>
            <div className="mt-6"><Wave /></div>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="font-mono text-xs text-zinc-400">question types</p>
            <p className="mt-2 text-6xl font-bold tracking-tight text-white"><CountUp to={8} /></p>
            <p className="mt-2 font-mono text-xs text-zinc-400">marked for the teacher, automatically</p>
            <div className="mt-6"><Bars lit={8} total={11} /></div>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="font-mono text-xs text-zinc-400">what students pay</p>
            <p className="mt-2 text-6xl font-bold tracking-tight text-white"><CountUp to={0} prefix="$" /></p>
            <p className="mt-2 font-mono text-xs text-zinc-400">students never pay to use UniVerse</p>
            <Gauge />
          </Reveal>
        </div>
        <div className="mt-16 grid md:grid-cols-3 gap-10">
          {ROLES.map((r, i) => (
            <Reveal key={r.who} delay={i * 0.08}>
              <span className="block w-6 h-px bg-white/30 mb-6" />
              <p className="text-zinc-200 leading-relaxed">{r.line}</p>
              <p className="mt-6 text-sm font-semibold text-white">{r.who}</p>
              <p className="font-mono text-xs text-zinc-400">{r.what}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
