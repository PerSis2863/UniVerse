'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bell, BookOpen, CalendarDays, CreditCard, GraduationCap, MessagesSquare } from 'lucide-react';
import { Reveal } from './bits';

// The closing card, in two halves: dark with the app's parts on the left, bright on the right with
// the one ask (an email, then sign-up with it filled in).

const PARTS = [GraduationCap, CalendarDays, MessagesSquare, BookOpen, CreditCard, Bell];

export function SplitCta() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  return (
    <section className="px-6 py-24">
      <Reveal className="max-w-6xl mx-auto grid md:grid-cols-2 rounded-[2rem] overflow-hidden border border-white/[0.08]">
        <div className="relative p-8 sm:p-12 bg-[#0b1a24]">
          <div className="flex flex-wrap gap-2.5" aria-hidden>
            {PARTS.map((I, i) => (
              <span key={i} className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-zinc-200 hover:-translate-y-1 hover:text-white transition-transform"><I className="w-5 h-5" /></span>
            ))}
          </div>
          <p className="mt-10 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">School software for the work that lives between classes.</p>
        </div>
        <div className="relative p-8 sm:p-12" style={{ background: 'linear-gradient(135deg, #b1a8a7 0%, #c7a9a3 60%, #e8d2c4 100%)' }}>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[#11212d] leading-tight">Pick the task you hate most.</p>
          <p className="mt-3 text-[#1e1d23]">Start free and hand it to UniVerse. No card needed.</p>
          <form className="mt-8 flex flex-col sm:flex-row gap-2.5" onSubmit={(e) => { e.preventDefault(); router.push(`/register${email ? `?email=${encodeURIComponent(email)}` : ''}`); }}>
            <label htmlFor="cta-email" className="sr-only">Your work email</label>
            <input id="cta-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu"
              className="flex-1 h-12 px-4 rounded-full bg-white/80 border border-[#24262e]/20 text-[#11212d] placeholder:text-[#24262e]/70 focus:outline-none focus:ring-2 focus:ring-[#24262e]" />
            <button type="submit" className="group h-12 px-6 rounded-full bg-[#0b1a24] text-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-black active:scale-[0.98] transition">
              Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        </div>
      </Reveal>
    </section>
  );
}
