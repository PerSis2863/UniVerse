'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, Eye, GraduationCap, Minus, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

interface Insights {
  totals: { students: number; teachers: number; courses: number; grade30: number | null; attendance30: number | null; flaggedStudents: number };
  atRisk: { id: string; name: string; email: string; level: string; worst: number; courses: { code: string; level: string; score: number; reasons: string[] }[] }[];
  departments: { name: string; grade: number | null; previous: number | null; graded: number; attendance: number | null }[];
  teachers: { id: string; name: string; email: string; lastSeenAt: string | null; courses: number; students: number; toGrade: number; graded30: number; flagged: number }[];
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const th = 'text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 pb-2';

/** One measure, one hue: a thin bar for a percentage, with the number as text beside it. */
function Meter({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-zinc-400">–</span>;
  return (
    <span className="flex items-center gap-2" title={`${label}: ${value}%`}>
      <span className="w-20 h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.08] overflow-hidden" aria-hidden>
        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </span>
      <span className="tabular-nums text-zinc-900 dark:text-white">{value}%</span>
    </span>
  );
}

function Change({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return <span className="text-zinc-400">–</span>;
  const d = now - before;
  const Icon = d > 1 ? ArrowUpRight : d < -1 ? ArrowDownRight : Minus;
  return <span className="inline-flex items-center gap-0.5 tabular-nums text-zinc-600 dark:text-zinc-300" title={`Previous 30 days: ${before}%`}><Icon className="w-3.5 h-3.5" aria-hidden />{d > 0 ? '+' : ''}{d} pts</span>;
}

function Level({ level }: { level: string }) {
  const atRisk = level === 'AT_RISK';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', atRisk ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
      {atRisk ? <AlertTriangle className="w-3 h-3" aria-hidden /> : <Eye className="w-3 h-3" aria-hidden />}{atRisk ? 'At risk' : 'Watch'}
    </span>
  );
}

function Tile({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Users }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs text-zinc-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" aria-hidden />{label}</p>
      <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminInsightsPage() {
  const { data, isLoading, error } = useSWR<Insights>('/api/admin/insights', authedJson);
  const [showAllTeachers, setShowAllTeachers] = useState(false);

  return (
    <>
      <Topbar title="School insights" subtitle="Students who need help, how departments are doing, and teacher workload (last 30 days)" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          {error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
                <Tile icon={Users} label="Active students" value={data.totals.students.toLocaleString()} sub={`${data.totals.teachers} teachers · ${data.totals.courses} courses`} />
                <Tile icon={GraduationCap} label="Average grade" value={data.totals.grade30 === null ? '–' : `${data.totals.grade30}%`} sub="graded in the last 30 days" />
                <Tile icon={Building2} label="Attendance" value={data.totals.attendance30 === null ? '–' : `${data.totals.attendance30}%`} sub="present or late, last 30 days" />
                <Tile icon={AlertTriangle} label="Students flagged" value={String(data.totals.flaggedStudents)} sub="open early-warning flags" />
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Students who may need help</h2>
                  <Link href="/admin/early-warning" className="text-sm font-medium text-indigo-500 hover:text-indigo-400">Early warning →</Link>
                </div>
                {data.atRisk.length === 0 ? (
                  <p className={`${card} p-5 text-sm text-zinc-500`}>No open flags. Early warning checks every course daily from grades and attendance.</p>
                ) : (
                  <div className={`${card} divide-y divide-zinc-200 dark:divide-white/[0.06]`}>
                    {data.atRisk.map((s) => (
                      <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                        <div className="sm:w-56 shrink-0">
                          <p className="font-medium text-zinc-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-zinc-500 truncate">{s.email}</p>
                        </div>
                        <div className="flex-1 flex flex-wrap gap-2">
                          {s.courses.map((c) => (
                            <span key={c.code} className="inline-flex flex-col gap-1 rounded-xl border border-zinc-200 dark:border-white/[0.08] px-3 py-2 text-xs">
                              <span className="flex items-center gap-2"><b className="text-zinc-900 dark:text-white">{c.code}</b><Level level={c.level} /></span>
                              {c.reasons[0] && <span className="text-zinc-500 max-w-64">{c.reasons[0]}</span>}
                            </span>
                          ))}
                        </div>
                        {s.courses.length > 1 && <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 shrink-0">{s.courses.length} courses</span>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Departments</h2>
                {data.departments.length === 0 ? (
                  <p className={`${card} p-5 text-sm text-zinc-500`}>No grades or attendance in the last 60 days yet.</p>
                ) : (
                  <div className={`${card} p-4 overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[32rem]">
                      <thead><tr><th className={th}>Department</th><th className={th}>Average grade</th><th className={th}>vs previous 30 days</th><th className={th}>Attendance</th><th className={`${th} text-right`}>Grades given</th></tr></thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                        {data.departments.map((d) => (
                          <tr key={d.name}>
                            <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">{d.name}</td>
                            <td className="py-2.5 pr-3"><Meter value={d.grade} label="Average grade" /></td>
                            <td className="py-2.5 pr-3"><Change now={d.grade} before={d.previous} /></td>
                            <td className="py-2.5 pr-3"><Meter value={d.attendance} label="Attendance" /></td>
                            <td className="py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{d.graded}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Teacher workload</h2>
                {data.teachers.length === 0 ? (
                  <p className={`${card} p-5 text-sm text-zinc-500`}>No active teachers yet.</p>
                ) : (
                  <div className={`${card} p-4 overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[36rem]">
                      <thead><tr><th className={th}>Teacher</th><th className={`${th} text-right`}>Courses</th><th className={`${th} text-right`}>Students</th><th className={`${th} text-right`}>Answers to grade</th><th className={`${th} text-right`}>Grades (30 days)</th><th className={`${th} text-right`}>At-risk students</th><th className={`${th} text-right`}>Last seen</th></tr></thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                        {(showAllTeachers ? data.teachers : data.teachers.slice(0, 15)).map((t) => (
                          <tr key={t.id}>
                            <td className="py-2.5 pr-3"><p className="font-medium text-zinc-900 dark:text-white">{t.name}</p><p className="text-xs text-zinc-500">{t.email}</p></td>
                            <td className="py-2.5 text-right tabular-nums">{t.courses}</td>
                            <td className="py-2.5 text-right tabular-nums">{t.students}</td>
                            <td className={cn('py-2.5 text-right tabular-nums', t.toGrade >= 20 && 'font-semibold text-amber-700 dark:text-amber-400')}>{t.toGrade}</td>
                            <td className="py-2.5 text-right tabular-nums">{t.graded30}</td>
                            <td className="py-2.5 text-right tabular-nums">{t.flagged}</td>
                            <td className="py-2.5 text-right text-xs text-zinc-500">{t.lastSeenAt ? new Date(t.lastSeenAt).toLocaleDateString() : 'Never'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.teachers.length > 15 && !showAllTeachers && <button type="button" className="mt-3 text-sm font-medium text-indigo-500" onClick={() => setShowAllTeachers(true)}>Show all {data.teachers.length} teachers</button>}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
