'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/ui/Link';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, HeartHandshake, FolderKanban, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_INSIGHT_TABS } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { SearchBox, RoleChip, StatusChip, fmtDate, fmtAgo, ROLE_LABEL } from '@/components/impact/AdminPeople';

interface ImpactData {
  kpis: { students: number; ngos: number; activeProjects: number; impactPoints: number };
  impactByMonth: { month: string; value: number }[];
  sectors: { sector: string; count: number }[];
}

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'INDUSTRY_MENTOR';
interface BasePerson { id: string; name: string; email: string; status: string; createdAt: string; lastSeenAt: string | null }
interface PeopleData {
  q: string;
  roles: { role: Role; total: number; matched: number; limit: number }[];
  students: (BasePerson & { impactXP: number; impactLevel: number; studentProfile: { department: string | null; year: number } | null; courses: number; projects: number; credentials: number })[];
  teachers: (BasePerson & { teacherProfile: { department: string | null; designation: string | null } | null; courses: number; projects: number })[];
  admins: BasePerson[];
  mentors: BasePerson[];
}
const TAB_KEY: Record<Role, 'students' | 'teachers' | 'admins' | 'mentors'> = { STUDENT: 'students', TEACHER: 'teachers', ADMIN: 'admins', INDUSTRY_MENTOR: 'mentors' };
const plural = (n: number, w: string) => `${nf.format(n)} ${w}${n === 1 ? '' : 's'}`;

const nf = new Intl.NumberFormat('en-US');

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ImpactMetricsPage() {
  const { data, error, isLoading } = useSWR<ImpactData>('/api/admin/impact', authedJson);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tab, setTab] = useState<Role>('STUDENT');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data: people, error: peopleError, isLoading: peopleLoading } = useSWR<PeopleData>(
    `/api/admin/impact/people${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`,
    authedJson,
    { keepPreviousData: true },
  );

  const handleExport = () => {
    if (!data) return void toast.error('The report is still loading.');
    const rows: (string | number)[][] = [
      ['Metric', 'Value'],
      ['Students', data.kpis.students],
      ['NGO partners', data.kpis.ngos],
      ['Active NGO projects', data.kpis.activeProjects],
      ['Impact points awarded', data.kpis.impactPoints],
      [],
      ['Month', 'Impact points'],
      ...data.impactByMonth.map((m) => [m.month, m.value]),
      [],
      ['NGO sector', 'NGOs'],
      ...data.sectors.map((s) => [s.sector, s.count]),
    ];
    if (people) {
      rows.push(
        [],
        ['Role', 'People on the platform'],
        ...people.roles.map((r) => [ROLE_LABEL[r.role] ?? r.role, r.total]),
        [],
        [`Students (top ${people.students.length} by impact XP${people.q ? `, matching "${people.q}"` : ''})`],
        ['Name', 'Email', 'Status', 'Department', 'Year', 'Impact level', 'Impact XP', 'Courses', 'Projects', 'Verified credentials', 'Joined'],
        ...people.students.map((p) => [p.name, p.email, p.status, p.studentProfile?.department ?? '', p.studentProfile?.year ?? '', p.impactLevel, p.impactXP, p.courses, p.projects, p.credentials, p.createdAt.slice(0, 10)]),
        [],
        ['Teachers'],
        ['Name', 'Email', 'Status', 'Department', 'Designation', 'Courses taught', 'Projects supervised', 'Joined'],
        ...people.teachers.map((p) => [p.name, p.email, p.status, p.teacherProfile?.department ?? '', p.teacherProfile?.designation ?? '', p.courses, p.projects, p.createdAt.slice(0, 10)]),
        [],
        ['Admins'],
        ['Name', 'Email', 'Status', 'Joined'],
        ...people.admins.map((p) => [p.name, p.email, p.status, p.createdAt.slice(0, 10)]),
      );
      if (people.mentors.length) rows.push([], ['Industry mentors'], ['Name', 'Email', 'Status', 'Joined'], ...people.mentors.map((p) => [p.name, p.email, p.status, p.createdAt.slice(0, 10)]));
    }
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const name = `impact-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
    toast.success(`${name} downloaded`);
  };

  const kpis = data
    ? [
        { title: 'Students', value: data.kpis.students, icon: Users },
        { title: 'NGO partners', value: data.kpis.ngos, icon: HeartHandshake },
        { title: 'Active NGO projects', value: data.kpis.activeProjects, icon: FolderKanban },
        { title: 'Impact points awarded', value: data.kpis.impactPoints, icon: Sparkles },
      ]
    : [];
  const maxMonth = Math.max(1, ...(data?.impactByMonth.map((m) => m.value) ?? []));
  const totalSectors = data?.sectors.reduce((n, s) => n + s.count, 0) || 1;

  return (
    <>
      <Topbar
        title="Global Impact Analytics"
        subtitle="Live social and educational impact across your platform"
        action={{ label: 'Export Report', onClick: handleExport }}
      />
      <SectionTabs tabs={ADMIN_INSIGHT_TABS} />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        {error && <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 text-rose-500 text-sm">{(error as Error).message}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading || !data
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-2xl skeleton" />)
            : kpis.map((kpi, i) => (
                <motion.div
                  key={kpi.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.03 }}
                  whileHover={{ y: -4 }}
                  className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.04] p-5 rounded-2xl"
                >
                  <div className="p-2 w-fit rounded-lg bg-indigo-500/10 text-indigo-500 mb-4">
                    <kpi.icon className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium mb-1">{kpi.title}</div>
                  <div className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">{nf.format(kpi.value)}</div>
                </motion.div>
              ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.04] rounded-2xl p-6">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Impact points by month</h2>
              <span className="text-xs text-zinc-500">Last 8 months</span>
            </div>
            <div className="h-64 flex items-end justify-between gap-2">
              {(data?.impactByMonth ?? []).map((m, i) => (
                <div key={m.month + i} className="flex-1 h-full flex flex-col items-center justify-end gap-2 group">
                  <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">{nf.format(m.value)}</span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.value / maxMonth) * 85}%` }}
                    transition={{ duration: 0.9, delay: Math.min(i, 6) * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full min-h-[2px] bg-indigo-500/70 group-hover:bg-indigo-500 rounded-t-[4px] transition-colors"
                  />
                  <span className="text-xs text-zinc-500">{m.month}</span>
                </div>
              ))}
            </div>
            {data && data.kpis.impactPoints === 0 && (
              <p className="mt-4 text-sm text-zinc-500">No impact points have been awarded yet — they appear here as students complete NGO projects.</p>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.04] rounded-2xl p-6 flex flex-col">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">NGO partners by sector</h2>
            {data && data.sectors.length === 0 && <p className="text-sm text-zinc-500">No NGO partners yet.</p>}
            <div className="space-y-4">
              {(data?.sectors ?? []).slice(0, 6).map((s, i) => {
                const pct = Math.round((s.count / totalSectors) * 100);
                return (
                  <div key={s.sector}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-600 dark:text-zinc-300">{s.sector}</span>
                      <span className="text-zinc-900 dark:text-white font-bold tabular-nums">{s.count} · {pct}%</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }}
                        className="h-full bg-indigo-500 rounded-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <Link href="/admin/analytics" className="mt-auto pt-6 inline-flex items-center gap-1 text-sm font-semibold text-indigo-500 hover:text-indigo-400">
              Deeper insights in Advanced Analytics <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <section className="mt-8 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.04] rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-white/[0.06] space-y-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">People behind the impact</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Every student, teacher and admin on the platform. Students are ranked by impact XP.</p>
            </div>
            <SearchBox value={q} onChange={setQ} placeholder="Search people by name or email…" summary={peopleLoading && debounced !== (people?.q ?? '') ? 'Searching…' : undefined} />
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="Role">
              {(people?.roles ?? (['STUDENT', 'TEACHER', 'ADMIN'] as Role[]).map((role) => ({ role, total: 0, matched: 0, limit: 0 })))
                .filter((r) => r.role !== 'INDUSTRY_MENTOR' || r.total > 0)
                .map((r) => (
                  <button key={r.role} role="tab" aria-selected={tab === r.role} onClick={() => setTab(r.role)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${tab === r.role ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                    {ROLE_LABEL[r.role] ?? r.role}s {people ? `(${people.q ? `${nf.format(r.matched)} of ${nf.format(r.total)}` : nf.format(r.total)})` : ''}
                  </button>
                ))}
            </div>
          </div>
          <PeopleList people={people} role={tab} error={peopleError as Error | undefined} />
        </section>
      </div>
    </>
  );
}

function PeopleList({ people, role, error }: { people?: PeopleData; role: Role; error?: Error }) {
  if (error && !people) return <p className="p-6 text-sm text-rose-500">{error.message || 'Could not load people.'}</p>;
  if (!people) return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;
  const info = people.roles.find((r) => r.role === role);
  const rows = people[TAB_KEY[role]] as (BasePerson & Partial<PeopleData['students'][number]> & Partial<PeopleData['teachers'][number]>)[];
  const noun = (ROLE_LABEL[role] ?? role).toLowerCase();
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-zinc-500">{people.q ? `No ${noun}s match “${people.q}”.` : `There are no ${noun}s on the platform yet.`}</p>;
  }
  return (
    <>
      <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
        {rows.map((p, i) => {
          const facts: string[] = [];
          if (role === 'STUDENT') {
            if (p.studentProfile?.department) facts.push(p.studentProfile.department);
            if (p.studentProfile?.year) facts.push(`Year ${p.studentProfile.year}`);
          }
          if (role === 'TEACHER') {
            const t = [p.teacherProfile?.designation, p.teacherProfile?.department].filter(Boolean).join(', ');
            if (t) facts.push(t);
          }
          facts.push(`Joined ${fmtDate(p.createdAt) ?? '—'}`);
          facts.push(p.lastSeenAt ? `Last seen ${fmtAgo(p.lastSeenAt)}` : 'Never seen online');
          const stats: [string, number | string][] =
            role === 'STUDENT' ? [['Impact XP', nf.format(p.impactXP ?? 0)], ['Level', p.impactLevel ?? 1], ['Courses', p.courses ?? 0], ['Projects', p.projects ?? 0], ['Credentials', p.credentials ?? 0]]
            : role === 'TEACHER' ? [['Courses taught', p.courses ?? 0], ['Projects supervised', p.projects ?? 0]]
            : [];
          return (
            <li key={p.id} className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                {role === 'STUDENT' && <span className="w-7 shrink-0 pt-0.5 text-xs font-bold text-zinc-400 tabular-nums">#{i + 1}</span>}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-white">{p.name}</span>
                    <RoleChip role={role} />
                    <StatusChip status={p.status} />
                  </div>
                  <a href={`mailto:${p.email}`} className="text-xs text-zinc-500 hover:text-indigo-500 break-all">{p.email}</a>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{facts.join(' · ')}</p>
                </div>
              </div>
              {stats.length > 0 && (
                <dl className={`grid gap-2 shrink-0 ${stats.length > 2 ? 'grid-cols-5 pl-10' : 'grid-cols-2'} lg:pl-0`}>
                  {stats.map(([label, value]) => (
                    <div key={label} className="text-center rounded-lg bg-zinc-50 dark:bg-zinc-950/40 px-2 py-1.5 min-w-[3.5rem]">
                      <dt className="text-[10px] text-zinc-500 leading-tight">{label}</dt>
                      <dd className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
      {info && info.matched > rows.length && (
        <p className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-200 dark:border-white/[0.06]">
          Showing {plural(rows.length, noun)} of {nf.format(info.matched)}{role === 'STUDENT' ? ' (highest impact XP first)' : ''}. Search by name or email to find anyone else, or open Users for the full directory.
        </p>
      )}
    </>
  );
}
