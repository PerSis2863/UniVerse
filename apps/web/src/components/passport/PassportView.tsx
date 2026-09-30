'use client';

import { Award, BadgeCheck, BookOpen, Clock, ExternalLink, HeartHandshake, Sparkles, Users } from 'lucide-react';
import { safeHref } from '@/lib/safe-href';

export interface PassportData {
  name: string;
  avatar: string | null;
  department: string | null;
  headline?: string | null;
  memberSince: string;
  skills?: { name: string; category: string | null; level: string; endorsements: number }[];
  credentials?: { id: string; certificateCode: string; title: string; projectName: string; organization: string; hoursCompleted: number; peopleImpacted: number; issuedAt: string; verifiedByName: string | null; verifyUrl: string }[];
  courses?: { code: string; name: string; credits: number; department: string | null }[];
  impact?: { hours: number; people: number; credentials: number; points: number };
}

const LEVEL: Record<string, { label: string; width: string }> = {
  BEGINNER: { label: 'Beginner', width: '30%' },
  INTERMEDIATE: { label: 'Intermediate', width: '55%' },
  ADVANCED: { label: 'Advanced', width: '80%' },
  EXPERT: { label: 'Expert', width: '100%' },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** The passport as the public sees it (also used for the student's own preview). */
export function PassportView({ p, badgeActions }: { p: PassportData; badgeActions?: (credentialId: string) => React.ReactNode }) {
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-7">
        <div aria-hidden className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          {p.avatar
            ? <img src={p.avatar} alt="" className="w-20 h-20 rounded-2xl object-cover" />
            : <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-2xl font-black flex items-center justify-center">{initials}</div>}
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-500">Skills passport</p>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white break-words">{p.name}</h1>
            {p.headline && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{p.headline}</p>}
            <p className="mt-1 text-xs text-zinc-500">{[p.department, `UniVerse member since ${fmtDate(p.memberSince)}`].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        {p.impact && (
          <dl className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: Clock, label: 'Verified hours', value: p.impact.hours },
              { icon: Users, label: 'People reached', value: p.impact.people },
              { icon: BadgeCheck, label: 'Credentials', value: p.impact.credentials },
              { icon: Sparkles, label: 'Impact points', value: p.impact.points },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.06] p-3">
                <dt className="text-[11px] text-zinc-500 flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5" /> {s.label}</dt>
                <dd className="text-xl font-black text-zinc-900 dark:text-white">{s.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {p.credentials && (
        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6">
          <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Award className="w-5 h-5 text-amber-500" /> Verified credentials</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Checked by staff, then digitally signed. Anyone can verify each one.</p>
          {p.credentials.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No verified credentials yet.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {p.credentials.map((c) => (
                <li key={c.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-4">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-white flex-1 min-w-[12rem]">{c.title}</p>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" /> Verified</span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-0.5">{c.projectName} · {c.organization}</p>
                  <p className="text-xs text-zinc-500 mt-1">{c.hoursCompleted} h{c.peopleImpacted ? ` · ${c.peopleImpacted} people` : ''} · {fmtDate(c.issuedAt)}{c.verifiedByName ? ` · verified by ${c.verifiedByName}` : ''}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <a href={safeHref(c.verifyUrl)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1 hover:underline">Verify <ExternalLink className="w-3 h-3" /></a>
                    {badgeActions?.(c.id)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {p.skills && (
        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6">
          <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><HeartHandshake className="w-5 h-5 text-indigo-500" /> Skills</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Self-assessed level; endorsements come from classmates and teachers.</p>
          {p.skills.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No skills added yet.</p> : (
            <ul className="mt-4 grid sm:grid-cols-2 gap-2.5">
              {p.skills.map((s) => (
                <li key={s.name} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white flex-1 truncate">{s.name}</p>
                    <span className="text-[11px] text-zinc-500">{LEVEL[s.level]?.label ?? s.level}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: LEVEL[s.level]?.width ?? '30%' }} /></div>
                  <p className="mt-1.5 text-[11px] text-zinc-500">{[s.category, s.endorsements ? `${s.endorsements} endorsement${s.endorsements === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {p.courses && (
        <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6">
          <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-sky-500" /> Courses</h2>
          {p.courses.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No courses.</p> : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {p.courses.map((c) => (
                <li key={c.code} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-zinc-500 w-20 shrink-0">{c.code}</span>
                  <span className="flex-1 min-w-0 truncate text-zinc-800 dark:text-zinc-200">{c.name}</span>
                  <span className="text-xs text-zinc-500 shrink-0">{c.credits} credits</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
