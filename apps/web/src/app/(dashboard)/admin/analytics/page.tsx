'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { Users, UserCheck, BookOpen, Sparkles, Trophy } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Topbar } from '@/components/layout/Topbar';
import { PremiumGate } from '@/components/billing/PremiumGate';
import { authedJson } from '@/lib/authed-fetch';

interface Analytics {
  totals: { members: number; activeMembers: number; courses: number; enrollments: number; impactPoints: number };
  roles: { role: string; count: number }[];
  applications: { status: string; count: number }[];
  signupsByMonth: { month: string; value: number }[];
  impactByMonth: { month: string; value: number }[];
  topContributors: { id: string; name: string; impactXP: number; impactLevel: number }[];
}

const ROLE_LABEL: Record<string, string> = { STUDENT: 'Students', TEACHER: 'Teachers', ADMIN: 'Admins', INDUSTRY_MENTOR: 'Industry mentors' };
const nf = new Intl.NumberFormat('en-US');

const card = 'rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 p-6';

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-500 mb-0.5">{label}</div>
      <div className="font-bold text-zinc-900 dark:text-white">{nf.format(payload[0].value)} {unit}</div>
    </div>
  );
}

function TrendChart({ title, data, unit, kind }: { title: string; data: { month: string; value: number }[]; unit: string; kind: 'area' | 'bar' }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const axis = { stroke: 'currentColor', tick: { fontSize: 11, fill: 'currentColor' }, tickLine: false, axisLine: false };
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between mb-6">
        <h3 className="font-bold text-zinc-900 dark:text-white">{title}</h3>
        <span className="text-xs text-zinc-500">{nf.format(total)} {unit} · last 12 months</span>
      </div>
      <div className="h-64 text-zinc-400 dark:text-zinc-500">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'area' ? (
            <AreaChart data={data} margin={{ left: -20, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
              <XAxis dataKey="month" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: '#6366f1', strokeOpacity: 0.4 }} />
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#areaFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background, #fff)' }} animationDuration={900} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
              <XAxis dataKey="month" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={900} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BarList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={card}>
      <h3 className="font-bold text-zinc-900 dark:text-white mb-5">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No data yet.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r, i) => (
            <li key={r.label}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-zinc-600 dark:text-zinc-300">{r.label}</span>
                <span className="font-bold text-zinc-900 dark:text-white tabular-nums">{nf.format(r.count)}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/[0.05] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.count / max) * 100}%` }}
                  transition={{ delay: 0.1 + i * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-indigo-500"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalyticsDashboard() {
  const { data, error, isLoading } = useSWR<Analytics>('/api/premium/analytics', authedJson);

  if (error) return <div className="flex-1 p-8 text-sm text-rose-500">{(error as Error).message}</div>;
  if (isLoading || !data) {
    return (
      <div className="flex-1 p-8 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-3xl bg-zinc-100 dark:bg-white/[0.04] animate-pulse" />)}
      </div>
    );
  }

  const kpis = [
    { label: 'Total members', value: data.totals.members, icon: Users },
    { label: 'Active members', value: data.totals.activeMembers, icon: UserCheck },
    { label: 'Course enrollments', value: data.totals.enrollments, icon: BookOpen, sub: `${nf.format(data.totals.courses)} courses` },
    { label: 'Impact points awarded', value: data.totals.impactPoints, icon: Sparkles },
  ];

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 6) * 0.03 }}
            className={card}
          >
            <k.icon className="w-5 h-5 text-indigo-500 mb-4" />
            <div className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white tabular-nums">{nf.format(k.value)}</div>
            <div className="text-xs text-zinc-500 mt-1">{k.label}{k.sub ? ` · ${k.sub}` : ''}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <TrendChart title="New members" data={data.signupsByMonth} unit="members" kind="area" />
        <TrendChart title="Impact points awarded" data={data.impactByMonth} unit="points" kind="bar" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <BarList title="Members by role" rows={data.roles.map((r) => ({ label: ROLE_LABEL[r.role] ?? r.role, count: r.count })).sort((a, b) => b.count - a.count)} />
        <BarList title="NGO applications by status" rows={data.applications.map((a) => ({ label: a.status.charAt(0) + a.status.slice(1).toLowerCase(), count: a.count })).sort((a, b) => b.count - a.count)} />
        <div className={card}>
          <h3 className="font-bold text-zinc-900 dark:text-white mb-5 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Top impact contributors</h3>
          {data.topContributors.length === 0 ? (
            <p className="text-sm text-zinc-500">No impact XP earned yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.topContributors.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-500 text-xs font-black flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-200 truncate">{c.name}</span>
                  <span className="text-xs text-zinc-500">Lvl {c.impactLevel}</span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{nf.format(c.impactXP)} XP</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdvancedAnalyticsPage() {
  return (
    <>
      <Topbar title="Advanced Analytics" subtitle="Live growth, engagement and impact across your organization" />
      <PremiumGate feature="advanced_analytics">
        <AnalyticsDashboard />
      </PremiumGate>
    </>
  );
}
