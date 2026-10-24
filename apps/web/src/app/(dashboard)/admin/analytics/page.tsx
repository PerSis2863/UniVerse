'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Activity, Trophy, GraduationCap, ShieldCheck, Presentation, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/csv-download';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_INSIGHT_TABS } from '@/components/layout/SectionTabs';
import { PremiumGate } from '@/components/billing/PremiumGate';
import { authedJson } from '@/lib/authed-fetch';
import { AdminSearch, PersonCell, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';
import { TabPill } from '@/components/ui/Glide';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Dial, Facts, Hourglass, Ring, Spark, Stack } from '@/components/instruments/parts';

interface Analytics {
  totals: { members: number; activeMembers: number; courses: number; enrollments: number; impactPoints: number };
  roles: { role: string; count: number }[];
  applications: { status: string; count: number }[];
  signupsByMonth: { month: string; value: number }[];
  impactByMonth: { month: string; value: number }[];
  topContributors: { id: string; name: string; email?: string; impactXP: number; impactLevel: number }[];
  // Newer fields (older servers and sample data may not send them).
  roleStatus?: { role: string; status: string; count: number }[];
  admins?: Person[];
  teachers?: (Person & { department: string | null; designation: string | null; courses: number; publishedCourses: number; courseCodes: string[]; students: number })[];
  topStudents?: (Person & { gpa: number; year: number; department: string | null; impactXP: number; impactLevel: number; enrollments: number })[];
}
type Person = PersonInfo & { id: string; createdAt?: string };

const ROLE_LABEL: Record<string, string> = { STUDENT: 'Students', TEACHER: 'Teachers', ADMIN: 'Admins', INDUSTRY_MENTOR: 'Industry mentors', GUARDIAN: 'Parents and guardians' };
const nf = new Intl.NumberFormat('en-US');

const card = 'rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-6';

const STATUS_COLS = ['ACTIVE', 'PENDING', 'SUSPENDED'] as const;

function RoleStatusTable({ rows }: { rows: { role: string; status: string; count: number }[] }) {
  const roles = [...new Set(rows.map((r) => r.role))].sort((a, b) => (ROLE_LABEL[a] ?? a).localeCompare(ROLE_LABEL[b] ?? b));
  const get = (role: string, status: string) => rows.find((r) => r.role === role && r.status === status)?.count ?? 0;
  return (
    <div className={card}>
      <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Accounts by role and status</h3>
      {roles.length === 0 ? <p className="text-sm text-zinc-500">No data yet.</p> : (
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="text-start font-medium pb-2">Role</th>
              {STATUS_COLS.map((s) => <th key={s} className="text-end font-medium pb-2">{s.charAt(0) + s.slice(1).toLowerCase()}</th>)}
              <th className="text-end font-medium pb-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {roles.map((role) => (
              <tr key={role}>
                <td className="py-2 text-zinc-700 dark:text-zinc-200">{ROLE_LABEL[role] ?? role}</td>
                {STATUS_COLS.map((s) => <td key={s} className="py-2 text-end tabular-nums text-zinc-600 dark:text-zinc-300">{nf.format(get(role, s))}</td>)}
                <td className="py-2 text-end tabular-nums font-bold text-zinc-900 dark:text-white">{nf.format(rows.filter((r) => r.role === role).reduce((n, r) => n + r.count, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PeoplePanel({ data }: { data: Analytics }) {
  const [tab, setTab] = useState<'teachers' | 'students' | 'admins'>('teachers');
  const [q, setQ] = useState('');
  const teachers = useMemo(() => data.teachers ?? [], [data.teachers]);
  const students = useMemo(() => data.topStudents ?? [], [data.topStudents]);
  const admins = useMemo(() => data.admins ?? [], [data.admins]);
  if (!data.teachers && !data.topStudents && !data.admins) return null;

  const tabs = [
    { id: 'teachers' as const, label: 'Teachers', icon: Presentation, count: teachers.length },
    { id: 'students' as const, label: 'Top students (GPA)', icon: GraduationCap, count: students.length },
    { id: 'admins' as const, label: 'Admins', icon: ShieldCheck, count: admins.length },
  ];
  const joined = (p: Person) => (p.createdAt ? `Joined ${new Date(p.createdAt).toLocaleDateString()}` : null);

  const rows = tab === 'teachers'
    ? teachers.filter((t) => matchesQuery(q, personText(t), t.department, t.designation, t.courseCodes)).map((t) => ({
      person: t,
      facts: [t.designation, t.department, joined(t)].filter(Boolean).join(' · '),
      right: [`${t.courses} course${t.courses === 1 ? '' : 's'} (${t.publishedCourses} published)`, `${nf.format(t.students)} enrollments`, t.courseCodes.slice(0, 6).join(', ')],
    }))
    : tab === 'students'
      ? students.filter((s) => matchesQuery(q, personText(s), s.department)).map((s) => ({
        person: s,
        facts: [s.department, s.year ? `Year ${s.year}` : null, joined(s)].filter(Boolean).join(' · '),
        right: [`GPA ${s.gpa.toFixed(2)}`, `${s.enrollments} course${s.enrollments === 1 ? '' : 's'}`, `Lvl ${s.impactLevel} · ${nf.format(s.impactXP)} XP`],
      }))
      : admins.filter((a) => matchesQuery(q, personText(a))).map((a) => ({ person: a, facts: joined(a) ?? '', right: [] as string[] }));
  const total = tab === 'teachers' ? teachers.length : tab === 'students' ? students.length : admins.length;
  // The people shown (after the search), with the numbers in their own columns.
  const exportCsv = () => {
    const shown = new Set(rows.map((r) => r.person.id));
    const date = new Date().toLocaleDateString('en-CA');
    const joinedOn = (p: Person) => (p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-CA') : '');
    if (tab === 'teachers') downloadCsv(`teachers-${date}`, ['Name', 'Email', 'Designation', 'Department', 'Courses', 'Published', 'Enrollments', 'Course codes', 'Joined'], teachers.filter((t) => shown.has(t.id)).map((t) => [t.name, t.email, t.designation ?? '', t.department ?? '', t.courses, t.publishedCourses, t.students, t.courseCodes.join(' '), joinedOn(t)]));
    else if (tab === 'students') downloadCsv(`top-students-${date}`, ['Rank', 'Name', 'Email', 'Department', 'Year', 'GPA', 'Courses', 'Impact level', 'Impact XP', 'Joined'], students.filter((x) => shown.has(x.id)).map((x) => [students.indexOf(x) + 1, x.name, x.email, x.department ?? '', x.year || '', x.gpa.toFixed(2), x.enrollments, x.impactLevel, x.impactXP, joinedOn(x)]));
    else downloadCsv(`admins-${date}`, ['Name', 'Email', 'Joined'], admins.filter((a) => shown.has(a.id)).map((a) => [a.name, a.email, joinedOn(a)]));
  };

  return (
    <div className={card}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <h3 className="font-bold text-zinc-900 dark:text-white">People</h3>
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
              className={`relative isolate shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${tab === t.id ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
              {tab === t.id && <TabPill id="analytics-tab" />}
              <t.icon className="w-3.5 h-3.5" />{t.label} <span className="opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <AdminSearch className="flex-1 min-w-48" value={q} onChange={setQ} placeholder={`Search ${tab === 'students' ? 'students' : tab} by name, email, department…`} shown={rows.length} total={total} />
        {rows.length > 0 && <button type="button" className="btn-secondary btn-sm" onClick={exportCsv}><Download className="w-3.5 h-3.5" aria-hidden />Export CSV<span className="sr-only"> of the {tab === 'students' ? 'top students' : tab} shown</span></button>}
      </div>
      {total === 0 ? (
        <p className="text-sm text-zinc-500">{tab === 'students' ? 'No students have a recorded GPA yet.' : tab === 'teachers' ? 'No teachers yet.' : 'No admins found.'}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No one matches your search.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {rows.map((r, i) => (
            <li key={r.person.id} className="py-3 grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
              <div className="flex items-start gap-2 min-w-0">
                {tab === 'students' && <span className="w-6 h-6 shrink-0 mt-1 rounded-full bg-indigo-500/10 text-indigo-500 text-[11px] font-black flex items-center justify-center">{i + 1}</span>}
                <PersonCell className="flex-1" person={r.person} showActivity extra={r.facts || null} />
              </div>
              {r.right.length > 0 && (
                <div className="text-xs text-zinc-600 dark:text-zinc-400 md:text-end space-y-0.5">
                  <p className="font-semibold text-zinc-900 dark:text-white">{r.right[0]}</p>
                  {r.right.slice(1).filter(Boolean).map((x) => <p key={x} className="break-words">{x}</p>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {tab === 'teachers' && teachers.length >= 200 && <p className="mt-3 text-xs text-zinc-500">Showing the first 200 teachers alphabetically.</p>}
    </div>
  );
}

function AnalyticsDashboard() {
  const { data, error, isLoading } = useSWR<Analytics>('/api/premium/analytics', authedJson);

  if (error) return <div className="flex-1 p-8 text-sm text-rose-500">{(error as Error).message}</div>;
  if (isLoading || !data) {
    return (
      <div className="flex-1 p-8 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-3xl skeleton" />)}
      </div>
    );
  }

  const months = data.signupsByMonth.map((m) => m.month);
  const signups = data.signupsByMonth.map((m) => m.value);
  const impact = data.impactByMonth.map((m) => m.value);
  const t = data.totals;
  const activePct = t.members ? (t.activeMembers / t.members) * 100 : 0;
  const pendingApps = data.applications.find((x) => x.status === 'PENDING')?.count ?? 0;
  const allApps = data.applications.reduce((n, x) => n + x.count, 0);
  const cells: InstrumentCell[] = [
    { id: 'members', label: 'Members', value: t.members, unit: 'people', note: `${nf.format(signups.at(-1) ?? 0)} joined this month`, body: <Spark values={signups} />,
      detail: { title: 'New members', description: 'People who joined each month, over the last 12 months.', series: signups, labels: months } },
    { id: 'active', label: 'Active members', value: t.activeMembers, unit: 'active', body: (
      <span className="flex items-center gap-4"><span className="flex-1"><Facts rows={[['Active', nf.format(t.activeMembers)], ['Not active', nf.format(Math.max(0, t.members - t.activeMembers))], ['Share', `${Math.round(activePct)} %`]]} /></span><Ring pct={Math.round(activePct * 10) / 10} label="active" size={104} /></span>
    ) },
    { id: 'enrollments', label: 'Course enrollments', value: t.enrollments, unit: 'enrollments', note: `${nf.format(t.courses)} courses · ${t.members ? (t.enrollments / t.members).toFixed(1) : 0} per member`,
      body: <Dial value={t.members ? t.enrollments / t.members : 0} max={8} /> },
    { id: 'impact', label: 'Impact points awarded', value: t.impactPoints, unit: 'points', note: `${nf.format(impact.at(-1) ?? 0)} this month`, body: <Stack a={impact} b={[]} />,
      detail: { title: 'Impact points', description: 'Impact points awarded each month, over the last 12 months.', series: impact, labels: data.impactByMonth.map((m) => m.month) } },
    { id: 'roles', label: 'Members by role', value: data.roles.length, unit: 'roles', body: <Facts rows={[...data.roles].sort((x, y) => y.count - x.count).slice(0, 5).map((r) => [ROLE_LABEL[r.role] ?? r.role, nf.format(r.count)] as [string, string])} /> },
    { id: 'ngo', label: 'NGO applications', value: pendingApps, unit: 'waiting', warn: pendingApps > 0, body: (
      <span className="flex items-center gap-4"><Hourglass fill={allApps ? pendingApps / allApps : 0} running={pendingApps > 0} /><Facts rows={data.applications.map((x) => [x.status.charAt(0) + x.status.slice(1).toLowerCase(), nf.format(x.count)] as [string, string])} /></span>
    ) },
  ];

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">
      <InstrumentBoard icon={Activity} title="Your school, live" subtitle={`${nf.format(t.members)} members · ${nf.format(t.courses)} courses · last 12 months`} cells={cells} storageKey="admin-analytics" />

      <div>
        <div className={card}>
          <h3 className="font-bold text-zinc-900 dark:text-white mb-5 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Top impact contributors</h3>
          {data.topContributors.length === 0 ? (
            <p className="text-sm text-zinc-500">No impact XP earned yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.topContributors.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-500 text-xs font-black flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-zinc-700 dark:text-zinc-200 truncate">{c.name}</span>
                    {c.email && <span className="block text-xs text-zinc-500 truncate">{c.email}</span>}
                  </span>
                  <span className="text-xs text-zinc-500">Lvl {c.impactLevel}</span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{nf.format(c.impactXP)} XP</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {data.roleStatus && <RoleStatusTable rows={data.roleStatus} />}
      <PeoplePanel data={data} />
    </div>
  );
}

export default function AdvancedAnalyticsPage() {
  return (
    <>
      <Topbar title="Advanced Analytics" subtitle="Live growth, engagement and impact across your organization" />
      <SectionTabs tabs={ADMIN_INSIGHT_TABS} />
      <PremiumGate feature="advanced_analytics">
        <AnalyticsDashboard />
      </PremiumGate>
    </>
  );
}
