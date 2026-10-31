'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Bell, Check, KeyRound, Lock, School, ShieldCheck } from 'lucide-react';
import { reducedMotion } from '@/lib/page-transition';
import { Accent, EASE, Reveal, Tag, glass } from './bits';

// "Boring in the ways that matter": four cards on how UniVerse is built (one place for every role,
// every language both ways, approvals on the phone, safe by default), each with a small live part.

const HELLO: [string, string, 'ltr' | 'rtl'][] = [
  ['Hello', 'English', 'ltr'], ['Bonjour', 'Français', 'ltr'], ['Hola', 'Español', 'ltr'], ['नमस्ते', 'हिन्दी', 'ltr'],
  ['مرحبا', 'العربية', 'rtl'], ['ہیلو', 'اردو', 'rtl'], ['নমস্কার', 'বাংলা', 'ltr'], ['வணக்கம்', 'தமிழ்', 'ltr'],
  ['నమస్కారం', 'తెలుగు', 'ltr'], ['नमस्कार', 'मराठी', 'ltr'], ['Olá', 'Português', 'ltr'], ['Halo', 'Indonesia', 'ltr'], ['Habari', 'Kiswahili', 'ltr'],
];

function Roles() {
  const steps = ['Student', 'UniVerse', 'Teacher', 'Parent', 'Admin'];
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" aria-hidden>
      {steps.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border font-mono text-xs ${s === 'UniVerse' ? 'border-fuchsia-400/40 bg-fuchsia-500/15 text-white' : 'border-white/10 bg-white/[0.04] text-zinc-300'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 bento-step" style={{ animationDelay: `${i * 0.4}s` }} />{s}
          </span>
          {i < steps.length - 1 && <span className="w-4 h-px bg-gradient-to-r from-indigo-400 to-fuchsia-400" />}
        </span>
      ))}
    </div>
  );
}

function Languages() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setI((n) => (n + 1) % HELLO.length), 1600);
    return () => clearInterval(t);
  }, []);
  const [word, name, dir] = HELLO[i];
  return (
    <div className="mt-6">
      <div className="h-20 flex items-center" aria-live="off">
        <AnimatePresence mode="wait">
          <motion.p key={word} dir={dir} initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }} transition={{ duration: 0.45, ease: EASE }}
            className="text-5xl font-bold text-white" lang="und" translate="no">{word}</motion.p>
        </AnimatePresence>
      </div>
      <p className="font-mono text-xs text-zinc-400"><span lang="und" translate="no">{name}</span> · {dir === 'rtl' ? 'right to left' : 'left to right'}</p>
      <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Languages">
        {HELLO.map(([, n, d], k) => <span key={n} lang="und" translate="no" className={`h-6 px-2 rounded-md text-[11px] leading-6 border ${k === i ? 'border-fuchsia-400/50 text-white bg-fuchsia-500/15' : 'border-white/[0.07] text-zinc-400'}`} dir={d}>{n}</span>)}
      </div>
    </div>
  );
}

function Approval() {
  const [done, setDone] = useState<null | 'excused' | 'asked'>(null);
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-[#141416] p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center"><Bell className="w-3.5 h-3.5 text-white" /></span>
        <span className="font-semibold text-zinc-200">UniVerse</span><span>· attendance · now</span>
      </div>
      <p className="mt-3 text-sm text-white">Sam was marked absent on Friday. Excuse it?</p>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.p key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 inline-flex items-center gap-1.5 text-sm text-fuchsia-200">
            <Check className="w-4 h-4" /> {done === 'excused' ? 'Excused. The register is updated.' : 'Asked. The teacher will see your note.'}
          </motion.p>
        ) : (
          <motion.div key="ask" exit={{ opacity: 0, y: -6 }} className="mt-3 flex gap-2">
            <button type="button" onClick={() => setDone('excused')} className="h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:brightness-110 active:scale-[0.97] transition">Excuse</button>
            <button type="button" onClick={() => setDone('asked')} className="h-9 px-4 rounded-xl text-sm font-semibold text-zinc-200 border border-white/10 hover:bg-white/[0.06] active:scale-[0.97] transition">Ask why</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const SAFE = [
  { icon: KeyRound, t: 'Sign-in checked on every request' },
  { icon: School, t: 'Each school sees only its own data' },
  { icon: Lock, t: 'Payment keys stored encrypted' },
  { icon: ShieldCheck, t: 'A second step for admins: passkey or a code' },
];

export function Bento() {
  const card = `${glass} p-6 sm:p-7 hover:border-white/[0.14] transition-colors`;
  return (
    <section id="product" data-no-motion className="relative px-6 py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal><Tag>product</Tag></Reveal>
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight leading-[1.08] text-white max-w-2xl">Boring in the ways <Accent>that matter.</Accent></h2></Reveal>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          <Reveal className="md:col-span-2"><div className={`${card} h-full`}>
            <h3 className="text-xl font-semibold text-white">One place, every role</h3>
            <p className="mt-2 text-sm text-zinc-400 max-w-md">Everyone gets their own menu.</p>
            <Roles />
          </div></Reveal>
          <Reveal delay={0.06}><div className={`${card} h-full`}>
            <h3 className="text-xl font-semibold text-white">Every language, both ways</h3>
            <p className="mt-2 text-sm text-zinc-400">Thirteen languages, right to left too.</p>
            <Languages />
          </div></Reveal>
          <Reveal delay={0.04}><div className={`${card} h-full`}>
            <h3 className="text-xl font-semibold text-white">Answers where people already are</h3>
            <p className="mt-2 text-sm text-zinc-400">Answer from the notification. Try it:</p>
            <Approval />
          </div></Reveal>
          <Reveal delay={0.1} className="md:col-span-2"><div className={`${card} h-full`}>
            <h3 className="text-xl font-semibold text-white">Safe by default</h3>
            <p className="mt-2 text-sm text-zinc-400">Careful with children’s data.</p>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3">
              {SAFE.map(({ icon: I, t }) => (
                <li key={t} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-sm text-zinc-200">
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 flex items-center justify-center"><I className="w-4 h-4 text-fuchsia-200" /></span>{t}
                </li>
              ))}
            </ul>
          </div></Reveal>
        </div>
      </div>
    </section>
  );
}
