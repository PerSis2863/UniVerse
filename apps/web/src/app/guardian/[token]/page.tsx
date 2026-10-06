'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { Award, BookOpen, CalendarCheck, Clock, Eye, GraduationCap, Link2Off, Target, Trophy } from 'lucide-react';
import Link from '@/components/ui/Link';
import { DeadlineList, type DeadlineItem } from '@/components/progress/DeadlineList';
import { courseColor } from '@/lib/course-color';
import { cn } from '@/lib/utils';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

// What a parent or guardian sees from a student's shared link: read-only, no sign-in.

interface GuardianView {
  firstName: string;
  expiresAt: string;
  average: number | null;
  attendance: number | null;
  courses: { id: string; code: string; name: string; color: string | null; emoji: string | null; grade: number | null; attendance: number | null }[];
  deadlines: DeadlineItem[];
  achievements: { id: string; kind: 'certificate' | 'points'; title: string; detail: string; at: string }[];
}

const panel = 'rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-white/[0.03] p-4 sm:p-6';

// Plain words for a grade, for parents who don't know the grading scale.
function gradeWord(p: number | null) {
  if (p === null) return { text: 'No grades yet', tone: 'text-zinc-500 bg-zinc-500/10' };
  if (p >= 80) return { text: 'Doing well', tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10' };
  if (p >= 60) return { text: 'On track', tone: 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/10' };
  return { text: 'Could use support', tone: 'text-amber-700 dark:text-amber-300 bg-amber-500/10' };
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.07] p-3 sm:p-4 min-w-0">
      <Icon className="w-4 h-4 text-indigo-500 dark:text-indigo-300" />
      <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">{label}</p>
      <p className="text-[11px] text-zinc-500 truncate">{sub}</p>
    </div>
  );
}

export default function GuardianPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<GuardianView | null>(null);
  const [problem, setProblem] = useState<'expired' | 'invalid' | 'offline' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guardian/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 410) throw new Error('expired');
        if (r.status === 404) throw new Error('invalid');
        if (!r.ok) throw new Error('offline');
        return r.json() as Promise<GuardianView>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setProblem(e.message === 'expired' || e.message === 'invalid' ? e.message : 'offline'); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white min-h-11">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs flex items-center justify-center">U</span> UniVerse
          </Link>
          <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Read-only view</span>
        </div>

        {problem ? (
          <div className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-8 sm:p-10 text-center">
            <span className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center">
              {problem === 'expired' ? <Clock className="w-7 h-7 text-indigo-500" /> : <Link2Off className="w-7 h-7 text-indigo-500" />}
            </span>
            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-white">
              {problem === 'expired' ? 'This link has expired' : problem === 'invalid' ? 'This link doesn’t work' : 'Couldn’t load this page'}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">
              {problem === 'offline'
                ? 'Please check your internet connection and try again in a moment.'
                : 'Ask your student to make a new link: in UniVerse, they open Settings, then “Parent or guardian”, and share it with you again.'}
            </p>
            {problem === 'offline' && <button onClick={() => location.reload()} className="btn-primary min-h-11 mt-5">Try again</button>}
          </div>
        ) : !data ? (
          <div className="p-16"><ContentSkeleton variant="list" /></div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">Shared with you by {data.firstName}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white leading-tight">
                <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 dark:from-indigo-300 dark:to-fuchsia-300 bg-clip-text text-transparent">{data.firstName}’s</span> progress
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Up to date as of today. This link works until {format(new Date(data.expiresAt), 'd MMMM yyyy')}.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                <Stat icon={GraduationCap} label="Average grade" value={data.average === null ? '—' : `${data.average}%`} sub={gradeWord(data.average).text} />
                <Stat icon={CalendarCheck} label="Attendance" value={data.attendance === null ? '—' : `${data.attendance}%`} sub={data.attendance === null ? 'No records yet' : 'Present or late'} />
                <Stat icon={Target} label="Coming up" value={String(data.deadlines.length)} sub="Next 3 weeks" />
              </div>
            </section>

            <section className={panel}>
              <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><BookOpen className="w-4 h-4 text-indigo-500" /> Courses</h2>
              {data.courses.length === 0 ? (
                <p className="text-sm text-zinc-500">{data.firstName} isn’t in any courses yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.courses.map((c) => {
                    const w = gradeWord(c.grade);
                    const color = courseColor(c.color, c.code);
                    return (
                      <li key={c.id} className="p-3 sm:p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: `${color}22` }}>
                            {c.emoji || <BookOpen className="w-4 h-4" style={{ color }} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{c.name}</p>
                            <p className="text-xs text-zinc-500">{c.code}</p>
                          </div>
                          <span className={cn('text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap', w.tone)}>{w.text}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-[11px] mb-1"><span className="text-zinc-500">Grade</span><span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{c.grade === null ? '—' : `${c.grade}%`}</span></div>
                            <Bar value={c.grade ?? 0} className="bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] mb-1"><span className="text-zinc-500">Attendance</span><span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{c.attendance === null ? '—' : `${c.attendance}%`}</span></div>
                            <Bar value={c.attendance ?? 0} className="bg-gradient-to-r from-emerald-500 to-teal-400" />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={panel}>
              <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Target className="w-4 h-4 text-indigo-500" /> Coming up</h2>
              <DeadlineList items={data.deadlines} />
            </section>

            {data.achievements.length > 0 && (
              <section className={panel}>
                <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Trophy className="w-4 h-4 text-fuchsia-500" /> Recent achievements</h2>
                <ul className="space-y-2">
                  {data.achievements.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 flex items-center justify-center shrink-0">
                        {a.kind === 'certificate' ? <Award className="w-4 h-4 text-fuchsia-500" /> : <Trophy className="w-4 h-4 text-indigo-500" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{a.title}</p>
                        <p className="text-xs text-zinc-500 truncate">{a.detail} · {format(new Date(a.at), 'd MMM yyyy')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-center text-xs text-zinc-500 px-4">
              This page only shows schoolwork. It never shows messages, contact details or anything private.
            </p>
          </div>
        )}
        <p className="mt-8 text-center text-[11px] text-zinc-500">UniVerse Impact · <Link href="/privacy" className="hover:underline">Privacy</Link></p>
      </div>
    </main>
  );
}
