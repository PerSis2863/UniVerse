'use client';

import { format } from 'date-fns';
import { Award, BookOpen, CalendarCheck, Clock, Eye, GraduationCap, Target, Trophy } from 'lucide-react';
import { DeadlineList, type DeadlineItem } from '@/components/progress/DeadlineList';
import { ReportCardList, type PublishedCard } from '@/components/dashboard/MyReportCards';
import { courseColor } from '@/lib/course-color';
import { cn } from '@/lib/utils';
import type { WeekRate } from '@/lib/attendance-trend';

// One student's schoolwork as a parent sees it (src/server/guardian-view.ts): on the guardian link
// page (/guardian/<token>) and in the parent app (/parent, Stage 5 · B16.1).

export interface ChildData {
  firstName: string;
  average: number | null;
  attendance: number | null;
  courses: { id: string; code: string; name: string; color: string | null; emoji: string | null; grade: number | null; attendance: number | null }[];
  deadlines: DeadlineItem[];
  achievements: { id: string; kind: 'certificate' | 'points'; title: string; detail: string; at: string }[];
  /** This week in numbers (Stage 4 · 4.10): never messages or who they talk to. */
  activity?: { daysActive: number; messages: number; calls: number; callMinutes: number; handedIn: number; quiet: { start: string; end: string; bySchool: boolean } | null };
  /** Report cards the school has published (Stage 5 · B15.3). */
  reportCards?: PublishedCard[];
  /** M297: attendance week by week (oldest first) and whether it is falling. */
  attendanceWeeks?: WeekRate[];
  attendanceFalling?: { from: number; to: number } | null;
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

/** The hero (eyebrow, "<name>'s progress", a note, three numbers) and every section below it. */
export function ChildView({ data, eyebrow, note }: { data: ChildData; eyebrow: string; note: string }) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">{eyebrow}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white leading-tight">
          <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 dark:from-indigo-300 dark:to-fuchsia-300 bg-clip-text text-transparent">{data.firstName}’s</span> progress
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{note}</p>
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <Stat icon={GraduationCap} label="Average grade" value={data.average === null ? '—' : `${data.average}%`} sub={gradeWord(data.average).text} />
          <Stat icon={CalendarCheck} label="Attendance" value={data.attendance === null ? '—' : `${data.attendance}%`} sub={data.attendance === null ? 'No records yet' : 'Present or late'} />
          <Stat icon={Target} label="Coming up" value={String(data.deadlines.length)} sub="Next 3 weeks" />
        </div>
      </section>

      {data.attendanceWeeks?.some((w) => w.rate !== null) && <AttendanceWeeks weeks={data.attendanceWeeks} fall={data.attendanceFalling ?? null} name={data.firstName} />}

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
                      <Bar value={c.attendance ?? 0} className="bg-gradient-to-r from-indigo-400 to-indigo-600" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ReportCardList cards={data.reportCards ?? []} hint={`From ${data.firstName}’s school, one per term. Print one or save it as a PDF.`} className={panel} />

      {data.activity && (
        <section className={panel} aria-label="This week">
          <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-indigo-500" /> This week on UniVerse</h2>
          <p className="text-xs text-zinc-500 mb-4">How active {data.firstName} was. Messages and who they talk to are never shown.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={CalendarCheck} label="Days active" value={String(data.activity.daysActive)} sub="of the last 7" />
            <Stat icon={BookOpen} label="Work handed in" value={String(data.activity.handedIn)} sub="Assignments and quizzes" />
            <Stat icon={Eye} label="Messages sent" value={String(data.activity.messages)} sub="Chats and groups" />
            <Stat icon={Clock} label="Calls" value={String(data.activity.calls)} sub={`${data.activity.callMinutes} min in calls`} />
          </div>
          {data.activity.quiet && <p className="text-xs text-zinc-500 mt-3">Quiet hours {data.activity.quiet.start}–{data.activity.quiet.end}{data.activity.quiet.bySchool ? ' (set by the school)' : ''}: no notifications to their devices then.</p>}
        </section>
      )}
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
  );
}

/** M297: the last eight weeks of attendance as bars, with a plain note when it is falling. */
function AttendanceWeeks({ weeks, fall, name }: { weeks: WeekRate[]; fall: { from: number; to: number } | null; name: string }) {
  return (
    <section className={panel} aria-labelledby="att-weeks-title">
      <h2 id="att-weeks-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-indigo-500" aria-hidden /> Attendance week by week</h2>
      {fall && <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{name}’s attendance fell from {fall.from}% to {fall.to}% over the last two weeks. The teachers can tell you more.</p>}
      <ol className="mt-4 grid grid-cols-8 items-end gap-1.5" aria-label="Attendance per week, oldest first">
        {weeks.map((w) => (
          <li key={w.week} className="flex flex-col items-center gap-1">
            <span className="flex h-20 w-full items-end overflow-hidden rounded-md bg-zinc-100 dark:bg-white/[0.06]">
              {w.rate !== null && <span className={cn('block w-full rounded-md', w.rate >= 90 ? 'bg-emerald-500' : w.rate >= 75 ? 'bg-amber-400' : 'bg-rose-500')} style={{ height: `${Math.max(w.rate, 4)}%` }} />}
            </span>
            <span className="text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">{w.rate === null ? '—' : `${w.rate}%`}</span>
            <span className="sr-only">Week of {format(new Date(`${w.week}T12:00:00`), 'd MMMM')}: {w.rate === null ? 'no classes' : `${w.rate}% of ${w.counted} classes`}</span>
            <span aria-hidden className="text-[11px] text-zinc-500">{format(new Date(`${w.week}T12:00:00`), 'd/M')}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
