'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { BadgeCheck, Bell, BookOpen, Briefcase, CalendarClock, Check, HeartHandshake, MapPin, Target, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, INTERNSHIP_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';
import type { GapModule, GapTutor, SkillMatch, Verified } from '@/lib/skills-bridge';
import { cn } from '@/lib/utils';

// Stage 5 · D18, skills-to-jobs bridge: open internships and NGO projects, best match with my
// verified skills first, and where to learn each skill I'm missing (src/server/skills-bridge.ts).

interface Opportunity {
  kind: 'INTERNSHIP' | 'PROJECT';
  id: string; title: string; org: string; location: string | null; deadline: string | null; applied: boolean;
  match: SkillMatch; gaps: { skill: string; module: GapModule | null; tutors: GapTutor[] }[]; summary: string;
}

const KINDS = [
  { id: 'ALL', label: 'All' },
  { id: 'INTERNSHIP', label: 'Internships' },
  { id: 'PROJECT', label: 'NGO projects' },
] as const;

const panel = 'rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5';
const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium';

function tone(percent: number) {
  if (percent >= 100) return { text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' };
  if (percent >= 50) return { text: 'text-indigo-700 dark:text-indigo-300', bar: 'bg-indigo-500' };
  return { text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' };
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Where to learn a missing skill: the module in my class, a class I could join, or a peer tutor. */
function GapLinks({ gap }: { gap: Opportunity['gaps'][number] }) {
  const m = gap.module;
  if (!m && !gap.tutors.length) return <span className="text-xs text-zinc-500">Not taught here yet</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {m && (
        <Link href={m.enrolled ? `/student/blackboard?course=${encodeURIComponent(m.courseId)}&tab=modules` : '/student/choices'}
          className={cn(chip, 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20')}>
          <BookOpen className="w-3.5 h-3.5" aria-hidden />
          {m.enrolled ? (m.moduleTitle ? `‘${m.moduleTitle}’ in ${m.courseCode}` : `${m.courseCode} modules`) : `Join ${m.courseCode}`}
        </Link>
      )}
      {gap.tutors.map((t) => (
        <Link key={t.userId} href={`/student/tutoring?q=${encodeURIComponent(t.name)}`}
          className={cn(chip, 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-500/20')}>
          <Users className="w-3.5 h-3.5" aria-hidden /> {t.name.split(' ')[0]}, peer tutor
        </Link>
      ))}
    </span>
  );
}

function OpportunityCard({ o }: { o: Opportunity }) {
  const t = tone(o.match.percent);
  const Icon = o.kind === 'INTERNSHIP' ? Briefcase : HeartHandshake;
  const open = o.kind === 'INTERNSHIP' ? `/student/internships?q=${encodeURIComponent(o.title)}` : `/student/impact/ngo-marketplace?q=${encodeURIComponent(o.title)}`;
  return (
    <motion.li variants={fadeUp} className={cn(panel, 'flex flex-col gap-4 min-w-0')}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" aria-hidden /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-zinc-900 dark:text-white leading-snug break-words">{o.title}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">{o.org}{o.kind === 'PROJECT' ? ' · NGO project' : ''}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-xl font-black tabular-nums', t.text)}>{o.match.percent}%</p>
          <p className="text-[11px] text-zinc-500">match</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden" aria-hidden>
        <div className={cn('h-full rounded-full', t.bar)} style={{ width: `${Math.max(o.match.percent, 3)}%` }} />
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">{o.summary}</p>

      {o.match.matched.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-1.5">You have</p>
          <ul className="flex flex-wrap gap-1.5">
            {o.match.matched.map((s) => (
              <li key={s.skill} className={cn(chip, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
                <Check className="w-3.5 h-3.5" aria-hidden /> {s.skill}{s.level ? ` · ${s.level}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {o.gaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-1.5">To learn</p>
          <ul className="space-y-2">
            {o.gaps.map((g) => (
              <li key={g.skill} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 sm:w-40 shrink-0 break-words">{g.skill}</span>
                <GapLinks gap={g} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-zinc-200 dark:border-white/10 text-xs text-zinc-600 dark:text-zinc-400">
        {o.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden /> {o.location}</span>}
        {o.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" aria-hidden /> Apply by {day(o.deadline)}</span>}
        <span className="flex-1" />
        {o.applied ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><Check className="w-4 h-4" aria-hidden /> Applied</span>
        ) : (
          <Link href={open} className="font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">View and apply</Link>
        )}
      </div>
    </motion.li>
  );
}

/** Job alerts (Stage 5 · Q15): a notification when a new opening matches at least half my checked skills. */
function JobAlerts() {
  const { data, mutate } = useSWR<{ on: boolean }>('/api/careers/alerts', authedJson);
  const flip = async (on: boolean) => {
    await mutate({ on }, { revalidate: false });
    try { await mutate(await authedJson<{ on: boolean }>('/api/careers/alerts', { method: 'POST', body: JSON.stringify({ on }) }), { revalidate: false }); }
    catch (e) { toast.error((e as Error).message); void mutate(); }
  };
  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-white/10 flex items-center gap-3">
      <Bell className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden />
      <p id="job-alerts" className="flex-1 min-w-0 text-sm text-zinc-700 dark:text-zinc-200">Tell me when a new opening matches my skills</p>
      <Switch checked={data?.on ?? true} disabled={!data} onChange={flip} label="Tell me when a new opening matches my skills" />
    </div>
  );
}

export default function SkillsMatchPage() {
  const { data, error, isLoading } = useSWR<{ skills: Verified[]; opportunities: Opportunity[] }>('/api/internships/skills-match', authedJson);
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('ALL');
  const shown = (data?.opportunities ?? []).filter((o) => kind === 'ALL' || o.kind === kind);

  return (
    <>
      <Topbar title="Internships" subtitle="How your verified skills match open internships and NGO projects" />
      <SectionTabs tabs={INTERNSHIP_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-5">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load your matches. Please try again shortly.'}</p>
          ) : isLoading || !data ? (
            <ContentSkeleton variant="list" />
          ) : (
            <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
              <motion.section variants={fadeUp} className={panel}>
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0"><BadgeCheck className="w-5 h-5" aria-hidden /></span>
                  <div className="min-w-0">
                    <h2 className="font-bold text-zinc-900 dark:text-white">Your checked skills</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">From work a teacher or partner checked: graded assignments, passed quizzes and verified volunteering. Only you see this page.</p>
                  </div>
                </div>
                {data.skills.length ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {data.skills.slice(0, 16).map((s) => (
                      <li key={s.key} className={cn(chip, 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200')}>
                        {s.label}{s.level ? ` · ${s.level}` : ''}
                      </li>
                    ))}
                    {data.skills.length > 16 && <li className={cn(chip, 'text-zinc-500')}>+{data.skills.length - 16} more</li>}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    None yet. Skills appear once your work is graded (60% or more) or your volunteering is verified. See them in your{' '}
                    <Link href="/student/passport" className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2">skills passport</Link>.
                  </p>
                )}
                <JobAlerts />
              </motion.section>

              <motion.div variants={fadeUp} role="group" aria-label="Show" className="inline-flex rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-1">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
                    className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      kind === k.id ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white')}>
                    {k.label}
                  </button>
                ))}
              </motion.div>

              {shown.length ? (
                <motion.ul variants={list} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {shown.map((o) => <OpportunityCard key={`${o.kind}:${o.id}`} o={o} />)}
                </motion.ul>
              ) : (
                <motion.div variants={fadeUp} className={cn(panel, 'text-center py-10')}>
                  <Target className="w-8 h-8 mx-auto text-zinc-400" aria-hidden />
                  <p className="mt-2 font-semibold text-zinc-900 dark:text-white">Nothing to match yet</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Open internships and NGO projects that list the skills they need appear here.</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
