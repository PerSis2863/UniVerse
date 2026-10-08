'use client';
import Link from '@/components/ui/Link';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import { useState } from 'react';
import useSWR from 'swr';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar, Users, Trophy, ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useNow } from '@/lib/use-now';
import { toast } from 'sonner';

interface Summit {
  id: string; title: string; description?: string | null; location?: string | null; isVirtual: boolean;
  impactPoints: number; capacity?: number | null; startDate: string; endDate: string;
  _count?: { registrations?: number };
}

export default function GlobalSummitsPage() {
  const { data: summitsData, isLoading: loadingSummits } = useSWR<Summit[]>('/impact/summits', fetcher, {
    onError: () => toast.error('Failed to load summits'),
  });
  const { data: regs, isLoading: loadingRegs, mutate: mutateRegs } = useSWR<{ summitId: string }[]>('/impact/summits/my-registrations', fetcher);
  const summits = summitsData ?? [];
  const registeredSummits = (regs ?? []).map((r) => r.summitId);
  const loading = loadingSummits || loadingRegs;
  const [applying, setApplying] = useState(false);
  const now = useNow();

  const handleRegister = async (id: string) => {
    if (registeredSummits.includes(id)) return;

    setApplying(true);
    try {
      await api.post(`/impact/summits/${id}/register`);
      await mutateRegs((cur) => [...(cur ?? []), { summitId: id }], { revalidate: false });
      toast.success('Successfully registered for summit!');
    } catch (error) {
      console.error('Failed to register:', error);
      toast.error('Failed to register for summit');
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Topbar
        title="Global Summits & Inter-College Hackathons"
        subtitle="Compete, collaborate, and pitch solutions alongside students from universities worldwide."
        rightNode={
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 font-semibold flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> {summits.length} upcoming event{summits.length === 1 ? '' : 's'}
            </span>
          </div>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Intro Banner */}
          <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-zinc-900 border border-zinc-200 dark:border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                <UniverseLogo size="sm" animated={false} withGlow={false} />
                Multi-Institution Collaboration Summits
              </div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white">Cross-University Team Matchmaking</h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">
                Need a teammate from another university? Team up with students from other campuses who share your cause and bring complementary skills.
              </p>
            </div>
            <Link href="/student/groups" className="btn-primary btn-sm">
              <Users className="w-4 h-4" /> Find teammates in Groups
            </Link>
          </div>

          {/* Summits List */}
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <ContentSkeleton variant="grid" />
              </div>
            ) : summits.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                No upcoming summits available.
              </div>
            ) : (
              summits.map((summit, index) => {
                const isRegistered = registeredSummits.includes(summit.id);
                const format = summit.isVirtual ? 'Online Worldwide' : (summit.location || 'Hybrid');
                const prizePool = `+${summit.impactPoints} XP`;
                const daysRemaining = Math.max(0, Math.ceil((new Date(summit.startDate).getTime() - now) / (1000 * 60 * 60 * 24)));
                const teamsRegistered = summit._count?.registrations || 0;
                
                const gradients = [
                  'from-emerald-950 via-teal-950/50 to-zinc-900',
                  'from-indigo-950 via-blue-950/50 to-zinc-900',
                  'from-rose-950 via-purple-950/50 to-zinc-900'
                ];
                const bannerGradient = gradients[index % gradients.length];
                const theme = summit.description?.split('.')[0] || 'Global Impact Initiative';

                return (
                  <div
                    key={summit.id}
                    className={`rounded-3xl border border-zinc-200 dark:border-zinc-800/80 bg-gradient-to-r ${bannerGradient} p-8 hover:border-indigo-500/40 transition-all shadow-xl space-y-6`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                            {format}
                          </span>
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> {prizePool}
                          </span>
                        </div>
                        <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{summit.title}</h3>
                        <p className="text-zinc-600 dark:text-zinc-300 text-xs">{theme}</p>
                      </div>

                      {/* Countdown Box */}
                      <div className="bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center gap-4 flex-shrink-0">
                        <div className="text-center">
                          <div className="text-2xl font-black text-indigo-400">{daysRemaining}</div>
                          <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">Days Left</div>
                        </div>
                        <div className="h-8 w-[1px] bg-zinc-100 dark:bg-zinc-800" />
                        <div className="text-center">
                          <div className="text-2xl font-black text-zinc-900 dark:text-white">{teamsRegistered}</div>
                          <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">Delegates</div>
                        </div>
                      </div>
                    </div>

                    <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed max-w-4xl">
                      {summit.description}
                    </p>

                    {/* Organizers & Tracks */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/60 text-xs">
                      <div>
                        <span className="text-zinc-500 dark:text-zinc-500 font-medium block mb-1">Impact Points:</span>
                        <div className="flex flex-wrap gap-2 text-zinc-600 dark:text-zinc-300 font-medium">
                          +{summit.impactPoints} Global Points
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 dark:text-zinc-500 font-medium block mb-1">Details:</span>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">
                            Capacity: {summit.capacity ? `${summit.capacity} delegates` : 'Unlimited'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <Calendar className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                        <span>Dates: <strong>{new Date(summit.startDate).toLocaleDateString()} - {new Date(summit.endDate).toLocaleDateString()}</strong></span>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                          onClick={() => handleRegister(summit.id)}
                          aria-busy={applying || undefined} disabled={isRegistered || applying}
                          className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            isRegistered
                              ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                          }`}
                        >
                          {applying ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isRegistered ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" /> Delegacy Confirmed
                            </>
                          ) : (
                            <>
                              Register Delegacy / Team <ArrowUpRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </>
  );
}
