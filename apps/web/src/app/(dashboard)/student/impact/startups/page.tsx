'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, OPPORTUNITY_TABS } from '@/components/layout/SectionTabs';
import { m as motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Rocket, Users, DollarSign, Globe2, Sparkles, Heart, CheckCircle2, X, Send, TrendingUp, Lightbulb, Building2, Award, ArrowUpRight, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguageStore } from '@/store/language';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';

const STAGE_COLORS: Record<string, string> = {
  'Idea': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  'MVP': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Pre-Seed': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Seed': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export default function StartupIncubatorPage() {
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selected, setSelected] = useState<any | null>(null);
  const [joined, setJoined] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [pitching, setPitching] = useState(false);
  const { t } = useLanguageStore();

  const [startups, setStartups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchStartups();
  }, []);

  const fetchStartups = async () => {
    try {
      setLoading(true);
      const res = await api.get('/impact/startups');
      setStartups(res.data);
    } catch (error) {
      console.error('Failed to fetch startups:', error);
      toast.error('Failed to load startups');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (s: any) => {
    setApplying(true);
    try {
      await api.post(`/impact/startups/${s.id}/apply`, {
        role: role || 'Member',
        status: 'PENDING'
      });
      setJoined(prev => [...prev, s.id]);
      toast.success(`Application sent to ${s.name}!`, { description: `The founder will review your interest.` });
      setSelected(null);
      setRole('');
    } catch (error) {
      console.error('Failed to apply to startup:', error);
      toast.error('Failed to submit application');
    } finally {
      setApplying(false);
    }
  };

  const stages = ['ALL', 'Idea', 'MVP', 'Pre-Seed', 'Seed'];
  const filtered = startups.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = s.name?.toLowerCase().includes(q) || s.tagline?.toLowerCase().includes(q) || s.sector?.toLowerCase().includes(q);
    const matchStage = selectedStage === 'ALL' || s.stage === selectedStage;
    return matchSearch && matchStage;
  });

  return (
    <>
      <Topbar
        title={`🚀 ${t('impact.startups')}`}
        subtitle="Join, co-found, or fund student startups tackling real-world social challenges with verified CSR backing."
        rightNode={
          <button onClick={() => setPitching(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all">
            <Lightbulb className="w-4 h-4" />
      <SectionTabs tabs={OPPORTUNITY_TABS} /> Pitch My Startup
          </button>
        }
      />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Hero Banner */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950/60 via-indigo-950/50 to-zinc-950 border border-white/10 p-8 shadow-2xl">
            <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-300 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" /> UniVerse Social Startup Ecosystem
                </div>
                <h1 className="text-3xl font-black text-white">Build Ventures That <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Actually Matter</span></h1>
                <p className="text-zinc-400 text-sm max-w-xl">Launch social impact startups, find co-founders, pitch to CSR partners, and earn backing — all from within UniVerse.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                {[
                  { v: String(startups.length), l: 'Active startups' },
                  { v: String(startups.reduce((n: number, x: any) => n + (x._count?.applications ?? 0), 0)), l: 'Applications', c: 'text-emerald-400' },
                  { v: String(new Set(startups.map((x: any) => x.sector).filter(Boolean)).size), l: 'Sectors' },
                ].map(s => (
                  <div key={s.l} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-center">
                    <div className={cn("text-xl font-black text-white", s.c)}>{s.v}</div>
                    <div className="text-[10px] text-zinc-500">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search startups, sectors, skills..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {stages.map(s => (
                <button key={s} onClick={() => setSelectedStage(s)}
                  className={cn("px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all",
                    selectedStage === s ? "bg-indigo-600 text-white border-indigo-600 shadow-lg" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-indigo-500/50")}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <ContentSkeleton variant="grid" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <Rocket className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">No startups found</h3>
              <p className="text-zinc-500 mt-1">Try adjusting your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((startup, i) => {
                const isJoined = joined.includes(startup.id);
                return (
                  <motion.div key={startup.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.03 }}
                    className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
                          {startup.name?.slice(0, 2) || 'ST'}
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          {startup.stage && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", STAGE_COLORS[startup.stage] ?? STAGE_COLORS.Idea)}>{startup.stage}</span>}
                          {startup.impactPoints > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-500 border-emerald-500/30">+{startup.impactPoints} XP</span>}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors">{startup.name}</h3>
                        {(startup.tagline || startup.description) && <p className="text-xs text-zinc-500 mt-1 line-clamp-3">{startup.tagline || startup.description}</p>}
                      </div>
                      <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-1">
                        {startup.sector && <><Building2 className="w-3.5 h-3.5" /> <span className="font-medium text-zinc-700 dark:text-zinc-300">{startup.sector}</span><span className="mx-1">•</span></>}
                        <Users className="w-3.5 h-3.5" /> {startup._count?.applications ?? 0} applicant{startup._count?.applications === 1 ? '' : 's'}
                        {startup.foundedBy?.name && <><span className="mx-1">•</span>Founded by {startup.foundedBy.name}</>}
                      </div>
                      {/* Open Roles */}
                      {(startup.openRoles && startup.openRoles.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {startup.openRoles.map((r: string) => (
                            <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                      <button onClick={() => setSelected(startup)} className="flex-1 btn-secondary text-xs py-2">Details</button>
                      <button onClick={() => { if (!isJoined) setSelected(startup); }}
                        disabled={isJoined}
                        className={cn("flex-1 text-xs py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5",
                          isJoined ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20")}>
                        {isJoined ? <><CheckCircle2 className="w-3.5 h-3.5" /> Applied</> : <>Join Team <ArrowUpRight className="w-3.5 h-3.5" /></>}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Startup Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="tone-panel border-t sm:border border-zinc-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex gap-2 mb-2">
                    {selected.stage && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", STAGE_COLORS[selected.stage] ?? STAGE_COLORS.Idea)}>{selected.stage}</span>}
                    {selected.impactPoints > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-500 border-emerald-500/30">+{selected.impactPoints} XP</span>}
                  </div>
                  <h2 className="text-2xl font-black text-zinc-900 dark:text-white">{selected.name}</h2>
                  {selected.tagline && <p className="text-sm text-zinc-500 mt-1">{selected.tagline}</p>}
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-3 gap-3 p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
                <div><div className="text-zinc-500 mb-1">Founder</div><div className="font-semibold text-zinc-900 dark:text-white">{selected.foundedBy?.name || '—'}</div></div>
                <div><div className="text-zinc-500 mb-1">Sector</div><div className="font-semibold text-zinc-900 dark:text-white">{selected.sector || '—'}</div></div>
                <div><div className="text-zinc-500 mb-1">Applicants</div><div className="font-semibold text-zinc-900 dark:text-white">{selected._count?.applications ?? 0}</div></div>
              </div>
              {selected.description && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">About</h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{selected.description}</p>
                </div>
              )}
              {selected.websiteUrl && <a href={safeHref(selected.websiteUrl)} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold text-indigo-500 hover:underline">Visit website →</a>}
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">The role you'd like</h4>
                <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} placeholder="e.g. Developer, Designer, Marketing"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setSelected(null)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={() => handleJoin(selected)} disabled={joined.includes(selected.id) || applying}
                  className="btn-primary flex-1">
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Apply to Join</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pitch Modal */}
      <AnimatePresence>
        {pitching && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && setPitching(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="tone-panel border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between mb-4">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Pitch Your Startup 🚀</h3>
                <button onClick={() => setPitching(false)}><X className="w-5 h-5 text-zinc-500" /></button>
              </div>
              <div className="space-y-3">
                {[{ l: 'Startup Name', p: 'e.g. AgriSense AI' }, { l: 'One-Line Tagline', p: 'What does it do?' }, { l: 'Your Name & Program', p: 'e.g. Riya Sharma — CS Year 3' }, { l: 'Target SDG', p: 'e.g. SDG 2: Zero Hunger' }].map(f => (
                  <div key={f.l}>
                    <label className="text-xs font-medium text-zinc-500 block mb-1">{f.l}</label>
                    <input placeholder={f.p} className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">Problem & Impact Goal</label>
                  <textarea rows={2} placeholder="Describe the problem you solve and your measurable impact goal..."
                    className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setPitching(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={() => { setPitching(false); toast.success('Pitch submitted! 🎉', { description: 'Faculty reviewers and CSR partners will evaluate your startup within 5 business days.' }); }}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-2.5 text-sm rounded-xl font-bold shadow-lg flex items-center justify-center gap-2">
                  <Rocket className="w-4 h-4" /> Submit Pitch
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
