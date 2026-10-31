'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bell, BookOpen, Brain, Gamepad2, CalendarDays, Gift, Globe2, GraduationCap, HandHeart, Leaf, MapPin, Megaphone, MessagesSquare, Recycle, ScanLine, TreePine, Trophy, Truck, Users, Wallet } from 'lucide-react';
import type { AppId } from '@/lib/apps';
import { Reveal } from './bits';

// The closing card, in two halves: dark with the app's parts on the left, bright on the right with
// the one ask (an email, then sign-up with it filled in).

const COPY: Record<AppId, { parts: typeof ScanLine[]; left: string; right: string; sub: string; placeholder: string }> = {
  campus: { parts: [GraduationCap, CalendarDays, MessagesSquare, BookOpen, Wallet, Bell], left: 'The work between classes, done.', right: 'Pick the task you hate most.', sub: 'Free. No card.', placeholder: 'you@school.edu' },
  trace: { parts: [ScanLine, Globe2, Truck, Megaphone, Wallet, Gift], left: 'One code on every product.', right: 'Give your products passports.', sub: 'Free for 10,000. No card.', placeholder: 'you@yourbrand.com' },
  relief: { parts: [HandHeart, MapPin, Truck, Users, MessagesSquare, Bell], left: 'Every need and every offer on one live map.', right: 'Be the help that arrives.', sub: 'Volunteer, NGO or neighbour. Free.', placeholder: 'you@example.org' },
  play: { parts: [Gamepad2, Brain, ScanLine, Truck, Recycle, Trophy], left: 'Twelve games, any device.', right: 'Open a room, share the code.', sub: 'Free. Solo or up to 8 friends.', placeholder: 'you@example.com' },
  green: { parts: [Leaf, TreePine, Recycle, Trophy, Users, Globe2], left: 'Small actions, counted honestly, add up.', right: 'Start your team’s challenge.', sub: 'Free for every team.', placeholder: 'you@example.com' },
};

export function SplitCta({ app = 'campus' }: { app?: AppId }) {
  const c = COPY[app];
  const router = useRouter();
  const [email, setEmail] = useState('');
  return (
    <section className="px-6 py-24">
      <Reveal className="max-w-6xl mx-auto grid md:grid-cols-2 rounded-[2rem] overflow-hidden border border-white/[0.08]">
        <div className="relative p-8 sm:p-12 bg-[#131a3d]">
          <div className="flex flex-wrap gap-2.5" aria-hidden>
            {c.parts.map((I, i) => (
              <span key={i} className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-zinc-200 hover:-translate-y-1 hover:text-white transition-transform"><I className="w-5 h-5" /></span>
            ))}
          </div>
          <p className="mt-10 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">{c.left}</p>
        </div>
        <div className="relative p-8 sm:p-12" style={{ background: 'linear-gradient(135deg, #a0a9cc 0%, #ff9fdc 60%, #ffd6f0 100%)' }}>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1d2650] leading-tight">{c.right}</p>
          <p className="mt-3 text-[#1e2752]">{c.sub}</p>
          <form className="mt-8 flex flex-col sm:flex-row gap-2.5" onSubmit={(e) => { e.preventDefault(); router.push(`/register?app=${app}${email ? `&email=${encodeURIComponent(email)}` : ''}`); }}>
            <label htmlFor="cta-email" className="sr-only">Your work email</label>
            <input id="cta-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={c.placeholder}
              className="flex-1 h-12 px-4 rounded-full bg-white/80 border border-[#24262e]/20 text-[#1d2650] placeholder:text-[#24262e]/70 focus:outline-none focus:ring-2 focus:ring-[#24262e]" />
            <button type="submit" className="group h-12 px-6 rounded-full bg-[#131a3d] text-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-black active:scale-[0.98] transition">
              Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        </div>
      </Reveal>
    </section>
  );
}
