'use client';

import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Calendar, MapPin, Users, Globe2, Sparkles, Trophy,
  ArrowUpRight, CheckCircle2, Clock, ExternalLink, Loader2
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function GlobalSummitsPage() {
  const [summits, setSummits] = useState<any[]>([]);
  const [registeredSummits, setRegisteredSummits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchSummits();
  }, []);

  const fetchSummits = async () => {
    try {
      setLoading(true);
      const [summitsRes, regRes] = await Promise.all([
        api.get('/impact/summits'),
        api.get('/impact/summits/my-registrations')
      ]);
      setSummits(summitsRes.data);
      setRegisteredSummits(regRes.data.map((r: any) => r.summitId));
    } catch (error) {
      console.error('Failed to load summits:', error);
      toast.error('Failed to load summits');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (id: string) => {
    if (registeredSummits.includes(id)) return;
    
    setApplying(true);
    try {
      await api.post(`/impact/summits/${id}/register`);
      setRegisteredSummits(prev => [...prev, id]);
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
            <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> $165K Total Innovation Grants
            </span>
          </div>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Intro Banner */}
          <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-zinc-900 border border-zinc-200 dark:border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
                <UniverseLogo size="sm" animated={false} withGlow={false} />
                Multi-Institution Collaboration Summits
              </div>
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white">Cross-University Team Matchmaking</h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">
                Need a teammate from another university? Our matchmaking engine pairs UniVerse students with computer scientists at MIT, medical students at Oxford, and policy advocates at Sorbonne.
              </p>
            </div>
            <button className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 whitespace-nowrap">
              <Users className="w-4 h-4" /> Find Inter-College Teammates
            </button>
          </div>

          {/* Summits List */}
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : summits.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                No upcoming summits available.
              </div>
            ) : (
              summits.map((summit, index) => {
                const isRegistered = registeredSummits.includes(summit.id);
                const format = summit.isVirtual ? 'Online Worldwide' : (summit.location || 'Hybrid');
                const prizePool = '$' + (summit.impactPoints * 1000).toLocaleString() + ' Fund';
                const daysRemaining = Math.max(0, Math.ceil((new Date(summit.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
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
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {format}
                          </span>
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> {prizePool}
                          </span>
                        </div>
                        <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{summit.title}</h3>
                        <p className="text-zinc-300 text-xs">{theme}</p>
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
                        <div className="flex flex-wrap gap-2 text-zinc-300 font-medium">
                          +{summit.impactPoints} Global Points
                        </div>
                      </div>

                      <div>
                        <span className="text-zinc-500 dark:text-zinc-500 font-medium block mb-1">Details:</span>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-300">
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
                          disabled={isRegistered || applying}
                          className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            isRegistered
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white shadow-lg shadow-indigo-600/30'
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
