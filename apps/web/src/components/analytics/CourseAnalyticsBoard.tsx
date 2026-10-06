'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, BookOpen, CalendarCheck, ClipboardCheck, GraduationCap,
  HandHelping, Info, Loader2, Mail, MessageSquare, Minus, TrendingDown, Trophy, UserX, Users,
} from 'lucide-react';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import type { BehindReason, CourseAnalytics } from '@/server/course-analytics';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

interface Response { courses: { id: string; code: string; name: string }[]; analytics: CourseAnalytics | null }

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

const REASON_UI: Record<BehindReason['code'], { icon: typeof Info; cls: string }> = {
  grades: { icon: GraduationCap, cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' },
  trend: { icon: TrendingDown, cls: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20' },
  absences: { icon: UserX, cls: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/20' },
  missed: { icon: ClipboardCheck, cls: 'bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/20' },
};

/** Per-course analytics: class health at a glance, then who needs a hand. `base`: /teacher or /admin. */
export function CourseAnalyticsBoard({ base }: { base: string }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState('');
  const { data, error, isLoading } = useSWR<Response>(`/api/course-analytics${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`, authedJson, { keepPreviousData: true });
  const [starting, setStarting] = useState<string | null>(null);
  const a = data?.analytics;
  const selected = courseId || a?.course.id || '';

  // Opens (or reuses) a 1:1 chat with the student, then jumps to it in Messages
  const message = async (studentId: string) => {
    setStarting(studentId);
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: studentId }) });
      router.push(`${base}/inbox?c=${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(null);
    }
  };

  if (error) return <p className="p-6 text-sm text-rose-500">{(error as Error).message}</p>;
  if (!data) return <div className="p-10"><ContentSkeleton variant="dashboard" /></div>;
  if (!data.courses.length) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="tone-panel rounded-3xl border border-zinc-200 dark:border-white/10 p-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-indigo-500" />
          <p className="mt-3 font-bold text-zinc-900 dark:text-white">No courses yet</p>
          <p className="mt-1 text-sm text-zinc-500">Analytics appear here once a course is assigned to you.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5 min-w-0 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex-1 min-w-0">
          <span className="sr-only">Course</span>
          <select value={selected} onChange={(e) => setCourseId(e.target.value)}
            className="w-full sm:max-w-md text-sm font-semibold rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40">
            {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" aria-label="Loading" />}
          <Link href={`${base}/early-warning`} className="btn-secondary"><AlertTriangle className="w-4 h-4" /> Early warning</Link>
        </div>
      </div>

      {a && (
        <>
          <Kpis a={a} />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
            <TrendCard a={a} />
            <DistributionCard a={a} />
          </div>
          <BehindList a={a} starting={starting} onMessage={message} />
        </>
      )}
    </div>
  );
}

function Kpis({ a }: { a: CourseAnalytics }) {
  const change = a.averageChange;
  const ChangeIcon = change === null || Math.abs(change) < 1 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const tiles = [
    {
      label: 'Class average', value: pct(a.average), icon: Trophy,
      note: change === null ? 'Not enough recent marks for a trend' : Math.abs(change) < 1 ? 'Steady over the last 4 weeks' : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(change))} pts vs the 4 weeks before`,
      noteIcon: ChangeIcon, noteCls: change === null || Math.abs(change) < 1 ? 'text-zinc-500' : change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Attendance', value: pct(a.attendance.rate), icon: CalendarCheck,
      note: a.attendance.sessions ? `${pct(a.attendance.recentRate)} in the last 30 days · ${a.attendance.sessions} class days` : 'No attendance taken yet',
    },
    {
      label: 'Work completed', value: pct(a.completion.rate), icon: ClipboardCheck,
      note: a.completion.expected ? `${a.completion.done} of ${a.completion.expected} quizzes and assignments` : 'Nothing due yet',
    },
    {
      label: 'Falling behind', value: String(a.behind.length), icon: AlertTriangle,
      note: `of ${a.students} student${a.students === 1 ? '' : 's'} enrolled`,
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t, i) => (
        <div key={t.label} className={cn('rounded-2xl border border-zinc-200 dark:border-white/10 p-4 min-w-0', i === 0 ? 'tone-panel' : 'bg-white dark:bg-white/[0.03]')}>
          <p className="text-xs text-zinc-500 flex items-center gap-1.5"><t.icon className="w-4 h-4 text-indigo-500" /> {t.label}</p>
          <p className="mt-1 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white">{t.value}</p>
          <p className={cn('mt-1 text-[11px] leading-snug flex items-start gap-1', t.noteCls ?? 'text-zinc-500')}>
            {t.noteIcon && <t.noteIcon className="w-3.5 h-3.5 shrink-0" />} <span>{t.note}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

/** Weekly class average, one line on a 0–100% scale, with a tooltip per week. */
function TrendCard({ a }: { a: CourseAnalytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = a.trend.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - v;
  const points = a.trend.map((w, i) => (w.average === null ? null : { i, v: w.average }));
  // Join the weeks that have marks; weeks without any are simply skipped
  const marked = points.filter((p): p is { i: number; v: number } => p !== null);
  const line = marked.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)} ${y(p.v)}`).join(' ');
  const hasData = marked.length > 0;
  const half = 50 / Math.max(1, n - 1); // half the gap between weeks: each week's hover column
  const fmtWeek = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5 min-w-0">
      <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-500" /> Class average by week</h2>
      <p className="text-xs text-zinc-500 mt-0.5">Average of every mark and scored quiz in each of the last {n} weeks.</p>
      {!hasData ? (
        <p className="mt-6 mb-4 text-sm text-zinc-500">No marks in the last {n} weeks yet.</p>
      ) : (
        <div className="mt-4 flex gap-2">
          <div className="flex flex-col justify-between text-[10px] text-zinc-400 h-40 py-0 -mt-1.5 -mb-1.5 shrink-0" aria-hidden>
            <span>100%</span><span>50%</span><span>0%</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative h-40" onMouseLeave={() => setHover(null)}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
                {[0, 50, 100].map((g) => <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="currentColor" className="text-zinc-200 dark:text-white/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
                <defs>
                  <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#d946ef" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="trend-line" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#d946ef" />
                  </linearGradient>
                </defs>
                {marked.length > 1 && <path d={`${line} L${x(marked[marked.length - 1].i)} 100 L${x(marked[0].i)} 100 Z`} fill="url(#trend-fill)" />}
                <path d={line} fill="none" stroke="url(#trend-line)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="currentColor" className="text-zinc-300 dark:text-white/20" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              </svg>
              {points.map((p) => p && (
                <span key={p.i} aria-hidden className={cn('absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full bg-indigo-500 ring-2 ring-white dark:ring-zinc-900 transition-transform', hover === p.i && 'scale-150')}
                  style={{ left: `${x(p.i)}%`, top: `${y(p.v)}%` }} />
              ))}
              {/* Hover / tap targets: one column per week, wider than the dot */}
              {a.trend.map((w, i) => (
                <button key={w.week} type="button" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} onBlur={() => setHover(null)}
                  aria-label={`Week of ${fmtWeek(w.week)}: ${w.average === null ? 'no marks' : `${Math.round(w.average)}% average from ${w.items} marks`}`}
                  className="absolute top-0 bottom-0 focus:outline-none" style={{ left: `${Math.max(0, x(i) - half)}%`, width: `${Math.min(100, x(i) + half) - Math.max(0, x(i) - half)}%` }} />
              ))}
              {hover !== null && (
                <div role="status" className="pointer-events-none absolute -top-2 z-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
                  style={{ left: `${Math.min(80, Math.max(20, x(hover)))}%`, transform: 'translate(-50%, -100%)' }}>
                  <p className="font-semibold text-zinc-900 dark:text-white">Week of {fmtWeek(a.trend[hover].week)}</p>
                  <p className="text-zinc-500">{a.trend[hover].average === null ? 'No marks' : `${Math.round(a.trend[hover].average!)}% · ${a.trend[hover].items} mark${a.trend[hover].items === 1 ? '' : 's'}`}</p>
                </div>
              )}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400" aria-hidden>
              <span>{fmtWeek(a.trend[0].week)}</span><span className="hidden sm:inline">{fmtWeek(a.trend[Math.floor(n / 2)].week)}</span><span>{fmtWeek(a.trend[n - 1].week)}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** How many students' averages fall in each band. */
function DistributionCard({ a }: { a: CourseAnalytics }) {
  const graded = a.distribution.reduce((s, b) => s + b.count, 0);
  const max = Math.max(1, ...a.distribution.map((b) => b.count));
  return (
    <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5 min-w-0">
      <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Users className="w-5 h-5 text-fuchsia-500" /> Grade distribution</h2>
      <p className="text-xs text-zinc-500 mt-0.5">{graded ? `Each student’s average, ${graded} student${graded === 1 ? '' : 's'} with marks.` : 'No marks recorded yet.'}</p>
      <ul className="mt-4 space-y-2.5">
        {a.distribution.map((b) => (
          <li key={b.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs" title={`${b.count} student${b.count === 1 ? '' : 's'} averaging ${b.label}`}>
            <span className="text-zinc-600 dark:text-zinc-300 font-medium">{b.label}</span>
            <span className="h-3 rounded bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
              <span className={cn('block h-full rounded bg-gradient-to-r', b.min >= 60 ? 'from-indigo-500 to-fuchsia-500' : 'from-rose-500 to-rose-400')} style={{ width: `${(b.count / max) * 100}%` }} />
            </span>
            <span className="text-right text-zinc-900 dark:text-white font-semibold tabular-nums">{b.count}{graded ? <span className="text-zinc-400 font-normal"> · {Math.round((b.count / graded) * 100)}%</span> : null}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BehindList({ a, starting, onMessage }: { a: CourseAnalytics; starting: string | null; onMessage: (studentId: string) => void }) {
  return (
    <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5 min-w-0">
      <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><TrendingDown className="w-5 h-5 text-rose-500" /> Who is falling behind</h2>
      <p className="text-xs text-zinc-500 mt-0.5">Ranked by how many signs there are and how strong. A prompt to check in, not a verdict: students don’t see this list.</p>
      {!a.behind.length ? (
        <div className="mt-5 rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/20 p-6 text-center">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">Everyone looks on track</p>
          <p className="mt-1 text-xs text-zinc-500">No low grades, drops, frequent absences or missed work right now.</p>
        </div>
      ) : (
        <ol className="mt-4 space-y-2.5">
          {a.behind.map((b, i) => {
            const initials = b.student.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
            const first = b.student.name.split(' ')[0];
            return (
              <li key={b.student.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="w-6 text-center text-xs font-black text-zinc-400 pt-2.5 shrink-0">{i + 1}</span>
                  {b.student.avatar
                    ? <img loading="lazy" decoding="async" src={b.student.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{initials}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-white break-words">{b.student.name}</p>
                    <p className="text-xs text-zinc-500">Average {pct(b.average)} · Attendance {pct(b.attendanceRate)}{b.missed ? ` · ${b.missed} missed` : ''}</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {b.reasons.map((r) => {
                        const ui = REASON_UI[r.code];
                        return <li key={r.code} className={cn('inline-flex items-start gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border max-w-full', ui.cls)}><ui.icon className="w-3.5 h-3.5 shrink-0 mt-px" /> <span className="break-words min-w-0">{r.text}</span></li>;
                      })}
                    </ul>
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300 flex items-start gap-1.5">
                      {b.action === 'help' ? <HandHelping className="w-3.5 h-3.5 text-fuchsia-500 shrink-0 mt-px" /> : <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-px" />}
                      <span><span className="font-semibold">Suggested:</span> {b.actionText}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => onMessage(b.student.id)} disabled={starting !== null} className="btn-primary !min-h-0 !py-2 !text-xs">
                        {starting === b.student.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : b.action === 'help' ? <HandHelping className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                        {b.action === 'help' ? `Offer ${first} help` : `Message ${first}`}
                      </button>
                      <a href={`mailto:${b.student.email}`} className="btn-ghost !min-h-0 !py-2 !text-xs"><Mail className="w-3.5 h-3.5" /> Email</a>
                    </div>
                  </div>
                  <span className="hidden sm:flex flex-col items-end shrink-0">
                    <span className="text-lg font-black text-zinc-900 dark:text-white tabular-nums">{b.score}</span>
                    <span className="text-[10px] text-zinc-500">concern</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
