'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import { Topbar } from '@/components/layout/Topbar';
import {
  Award,     CheckCircle2,
   TrendingUp, ShieldCheck, FileCheck
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import useSWR from 'swr';
import { LoadError } from '@/components/ui/LoadError';
import { fetcher } from '@/lib/fetcher';
import { useRouter } from 'next/navigation';

/** An impact level (see the levels table on the server). */
interface Level { level: number; title: string; minXP: number; color: string; emoji: string }
interface ImpactStats {
  userName?: string; totalPoints?: number; completedNGOs?: number;
  levelInfo?: { current?: Level; next?: Level; progress?: number; xp?: number };
  sdgBadges?: { num: number; name: string; color: string; partner?: string; hours?: number; status?: string }[];
  activities?: { title: string; ngo?: string; hours?: number; date: string }[];
}

export default function MySocialImpactPage() {
  const router = useRouter();
  const { data, isLoading: loading, error, mutate } = useSWR<ImpactStats>('/impact/dashboard/stats', fetcher);

  const level = data?.levelInfo;
  const stats = data ? [
    { label: 'Impact points', val: (data.totalPoints || 0).toLocaleString(), change: 'Earned from verified activities', color: 'text-indigo-400' },
    { label: 'NGO projects accepted', val: `${data.completedNGOs || 0}`, change: 'Applications approved by NGOs', color: 'text-emerald-400' },
    { label: 'Impact level', val: `${level?.current?.level ?? 1}`, change: level?.current?.title ?? 'Changemaker Seed', color: 'text-amber-400' },
    { label: 'UN SDG badges', val: `${data.sdgBadges?.length || 0}`, change: 'From completed NGO projects', color: 'text-pink-400' },
  ] : [];

  const sdgBadges = data?.sdgBadges || [];
  const impactActivities = data?.activities || [];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <ContentSkeleton variant="dashboard" />
      </div>
    );
  }
  if (error && !data) {
    return <div className="flex-1 p-4 md:p-8"><LoadError onRetry={() => mutate()} message="Couldn’t load your impact ledger." /></div>;
  }

  return (
    <>
      <Topbar
        title="My Social Impact Ledger"
        subtitle="Track your verified humanitarian contributions, NGO research hours, and UN SDG credentials."
        rightNode={
          <button
            onClick={() => router.push('/student/credentials')}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Award className="w-4 h-4" /> My Credentials
          </button>
        }
      />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Top Hero Card */}
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0e1628] via-[#111827] to-[#1c1427] border border-zinc-200 dark:border-white/10 p-8 overflow-hidden shadow-2xl">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-indigo-500/20 to-pink-500/20 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
              <div className="space-y-4 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  {level?.current?.emoji} Level {level?.current?.level ?? 1} · {level?.current?.title ?? 'Changemaker Seed'}
                </div>
                <h1 className="text-3xl font-black text-zinc-900 dark:text-white leading-tight">
                  {data?.userName}’s Impact Score:{' '}
                  <span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                    {(level?.xp ?? data?.totalPoints ?? 0).toLocaleString()} XP
                  </span>
                </h1>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  {(data?.totalPoints || 0) > 0
                    ? 'Every NGO project, summit and venture you contribute to adds verified impact to your record.'
                    : 'Apply to an NGO project to start building your verified impact record.'}
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <div className="w-48 bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-500 via-pink-500 to-amber-400 h-full rounded-full" style={{ width: `${level?.progress ?? 0}%` }} />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    {level && level.next.level !== level.current.level ? `${level.progress}% to ${level.next.title}` : 'Top level reached'}
                  </span>
                </div>
              </div>

              {/* Logo Emblem Badge */}
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/10 flex flex-col items-center text-center space-y-3 shadow-xl">
                <UniverseLogo size="lg" animated={true} withGlow={true} />
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">{level?.current?.title ?? 'Changemaker Seed'}</div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400">UniVerse impact level {level?.current?.level ?? 1}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, idx) => (
              <div key={idx} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl space-y-2">
                <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">{s.label}</div>
                <div className={`text-3xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-500 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  {s.change}
                </div>
              </div>
            ))}
          </div>

          {/* UN Sustainable Development Badges */}
          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  UN Sustainable Development Goals (SDG) Badges
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Earned for each accepted NGO project linked to a UN Sustainable Development Goal.
                </p>
              </div>
              <span className="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                {sdgBadges.length} Badges Unlocked
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {sdgBadges.length === 0 && <p className="col-span-full text-sm text-zinc-500">No SDG badges yet. They appear when an NGO accepts your project application.</p>}
              {sdgBadges.map((badge, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-4 text-center space-y-3 relative overflow-hidden group hover:border-indigo-500/40 transition-colors"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${badge.color} mx-auto flex items-center justify-center text-zinc-900 dark:text-white font-black text-lg shadow-md`}>
                    #{badge.num}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-1">{badge.name}</h4>
                    <span className="text-[10px] text-zinc-600 dark:text-zinc-400">{badge.partner}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 dark:text-zinc-500">{badge.hours} pts</span>
                    <span className={`font-semibold ${badge.status === 'Completed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {badge.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Impact Activities Ledger */}
          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Recent impact activity</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">Your latest awarded impact points.</p>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {impactActivities.length === 0 && <p className="p-6 text-sm text-zinc-500">No impact points yet.</p>}
              {impactActivities.map((act, i) => (
                <div key={i} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">{act.title}</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                        {String(act.ngo ?? '').replace(/_/g, ' ').toLowerCase()} • <span className="text-zinc-500 dark:text-zinc-500">{act.date ? new Date(act.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      {act.hours}
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>



        </div>
      </div>
    </>
  );
}
