'use client';

import { ArrowRight, Briefcase, Eye, Lock, Rocket, RotateCcw } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { useAuthStore } from '@/store/auth';

// Explore modes: any student, teacher or admin can look around UniVerse as a startup or a
// freelancer, to see how those sides work, without changing their real account.

const MODES = [
  {
    href: '/explore/startup',
    icon: Rocket,
    title: 'Explore as a Startup',
    blurb: 'Set up a startup profile, post a role, see how applicants arrive and shortlist them, and browse student talent.',
    color: 'from-fuchsia-500/15 to-indigo-500/15 text-fuchsia-500',
  },
  {
    href: '/explore/freelancer',
    icon: Briefcase,
    title: 'Explore as a Freelancer',
    blurb: 'Build a freelancer profile, browse real projects and internships on UniVerse, send practice proposals and follow them.',
    color: 'from-emerald-500/15 to-cyan-500/15 text-emerald-500',
  },
];

export default function ExploreHub() {
  const role = useAuthStore((s) => s.user?.role);
  return (
    <>
      <Topbar title="Explore modes" subtitle="See how UniVerse works for startups and freelancers" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="grid sm:grid-cols-2 gap-5">
            {MODES.map((m) => (
              <Link key={m.href} href={m.href} className="group rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-6 hover:border-indigo-500/40 transition-colors">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${m.color} flex items-center justify-center`}>
                  <m.icon className="w-6 h-6" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">{m.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">{m.blurb}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-500">Open <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></span>
              </Link>
            ))}
          </div>

          <ul className="grid sm:grid-cols-3 gap-3 text-sm">
            {[
              { icon: Lock, text: `Your ${role === 'TEACHER' ? 'teacher' : role === 'ADMIN' ? 'admin' : 'student'} account stays exactly as it is.` },
              { icon: Eye, text: 'Only you can see your preview. Nothing is sent to anyone.' },
              { icon: RotateCcw, text: 'Real listings are shown read-only. Reset the preview any time.' },
            ].map((x) => (
              <li key={x.text} className="flex gap-3 p-4 rounded-2xl bg-zinc-100/70 dark:bg-white/[0.03]">
                <x.icon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
                <span className="text-zinc-600 dark:text-zinc-300">{x.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
