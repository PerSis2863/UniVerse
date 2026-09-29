'use client';

import Link from '@/components/ui/Link';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Users, HeartHandshake, FolderKanban, Sparkles, ArrowRight } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';

interface ImpactData {
  kpis: { students: number; ngos: number; activeProjects: number; impactPoints: number };
  impactByMonth: { month: string; value: number }[];
  sectors: { sector: string; count: number }[];
}

const nf = new Intl.NumberFormat('en-US');

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ImpactMetricsPage() {
  const { data, error, isLoading } = useSWR<ImpactData>('/api/admin/impact', authedJson);

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

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        {error && <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 text-rose-500 text-sm">{(error as Error).message}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading || !data
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] animate-pulse" />)
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
      </div>
    </>
  );
}
