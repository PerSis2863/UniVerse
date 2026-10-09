'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { ArrowRight, Dna, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { Band } from '@/lib/mastery';

// A student's Learning DNA for one course (Stage 5 · D1; src/server/learning-dna.ts): each concept as
// a tile that fills and glows as it's mastered, grouped under broader concepts, and what to study
// next (straight into the course tutor's practice). Teachers open the same map for any student.

interface Concept { id: string; name: string; description: string | null; parentId: string | null; band: Band; level: number; confidence: number; n: number; trend: number }
interface Data { course: { id: string; code: string; name: string }; student: string | null; concepts: Concept[]; next: { id: string; name: string; band: Band }[]; counts: { mastered: number; total: number } }

export const BAND: Record<Band, { label: string; tone: string; fill: string }> = {
  new: { label: 'Not met yet', tone: 'text-zinc-600 dark:text-zinc-300', fill: 'bg-zinc-300 dark:bg-white/20' },
  learning: { label: 'Learning', tone: 'text-amber-800 dark:text-amber-300', fill: 'bg-amber-500' },
  nearly: { label: 'Nearly there', tone: 'text-indigo-700 dark:text-indigo-300', fill: 'bg-indigo-500' },
  mastered: { label: 'Mastered', tone: 'text-emerald-700 dark:text-emerald-300', fill: 'bg-emerald-500' },
};

export function MasteryMap({ courseId, studentId, practice = true }: { courseId: string; studentId?: string; practice?: boolean }) {
  const { data, error, mutate } = useSWR<Data>(`/api/courses/${courseId}/mastery${studentId ? `?student=${encodeURIComponent(studentId)}` : ''}`, authedJson);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="grid" />;
  if (!data.concepts.length) {
    return (
      <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-8 text-center">
        <Dna className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden />
        <p className="font-semibold text-zinc-900 dark:text-white">No concepts yet</p>
        <p className="text-sm text-zinc-500 mt-1">Your teacher hasn’t mapped this course’s concepts. When they do, your map fills in from your quizzes and assignments.</p>
      </section>
    );
  }
  const tops = data.concepts.filter((c) => !c.parentId || !data.concepts.some((p) => p.id === c.parentId));
  const children = (id: string) => data.concepts.filter((c) => c.parentId === id);
  const pct = data.counts.total ? Math.round((data.counts.mastered / data.counts.total) * 100) : 0;
  return (
    <div className="space-y-4">
      <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5" aria-label="Summary">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{data.student ? `${data.student} · ` : ''}{data.course.code}</p>
            <p className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{data.counts.mastered} of {data.counts.total} mastered</p>
          </div>
          <div className="w-16 h-16 rounded-full grid place-items-center text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300" style={{ background: `conic-gradient(rgb(16 185 129) ${pct * 3.6}deg, rgba(120,120,120,0.15) 0)` }} role="img" aria-label={`${pct}% mastered`}>
            <span className="w-12 h-12 rounded-full tone-panel grid place-items-center">{pct}%</span>
          </div>
        </div>
        {data.next.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-indigo-500" aria-hidden /> {data.student ? 'Would help most next' : 'Study next'}</p>
            <ul className="mt-1.5 space-y-1.5">
              {data.next.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 px-3 py-2">
                  <span className="min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{n.name}</span><span className={cn('text-[11px]', BAND[n.band].tone)}>{BAND[n.band].label}</span></span>
                  {practice && !data.student && <Link href={`/student/tutor?course=${data.course.id}&tab=practice&topic=${encodeURIComponent(n.name)}`} className="btn-secondary btn-sm shrink-0">Practise <ArrowRight className="w-3.5 h-3.5" aria-hidden /></Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <motion.div variants={list} initial="hidden" animate="show" className="space-y-4">
        {tops.map((t) => {
          const kids = children(t.id);
          return (
            <motion.section key={t.id} variants={fadeUp} aria-label={t.name}>
              {kids.length > 0 && <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">{t.name}</h2>}
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(kids.length ? [t, ...kids] : [t]).map((c) => <Tile key={c.id} c={c} />)}
              </ul>
            </motion.section>
          );
        })}
      </motion.div>
      <p className="text-[11px] text-zinc-500">Worked out from your quiz answers and your teacher’s rubric scores, newest counting most. Only you and your teacher see it.</p>
    </div>
  );
}

function Tile({ c }: { c: Concept }) {
  const b = BAND[c.band];
  return (
    <li className={cn('relative rounded-2xl border p-3 overflow-hidden', c.band === 'mastered' ? 'border-emerald-500/40 shadow-[0_0_18px_-6px_rgba(16,185,129,0.6)]' : 'border-zinc-200 dark:border-white/10', 'tone-panel')} title={c.description ?? undefined}>
      <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2">{c.name}</p>
      <p className={cn('mt-1 text-[11px] font-semibold flex items-center gap-1', b.tone)}>
        {b.label}{c.n > 0 && c.trend > 0.05 && <TrendingUp className="w-3 h-3" aria-label="improving" />}{c.n > 0 && c.trend < -0.05 && <TrendingDown className="w-3 h-3" aria-label="slipping" />}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="img" aria-label={c.n ? `${Math.round(c.level * 100)}% from ${c.n} answer${c.n === 1 ? '' : 's'}` : 'No answers yet'}>
        <motion.div className={cn('h-full rounded-full', b.fill)} initial={{ width: 0 }} animate={{ width: `${c.n ? Math.max(6, c.level * 100) : 0}%` }} transition={spring.gentle} />
      </div>
      <p className="mt-1 text-[10px] text-zinc-500 tabular-nums">{c.n ? `${c.n} answer${c.n === 1 ? '' : 's'}` : '—'}</p>
    </li>
  );
}
