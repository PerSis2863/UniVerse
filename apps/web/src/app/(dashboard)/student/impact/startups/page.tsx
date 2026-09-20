'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Rocket, Users, DollarSign, Globe2, Sparkles, Heart, CheckCircle2, X, Send, TrendingUp, Lightbulb, Building2, Award, ArrowUpRight, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Startup {
  id: string;
  name: string;
  tagline: string;
  founder: string;
  stage: 'Idea' | 'MVP' | 'Pre-Seed' | 'Seed';
  sdg: { num: number; name: string; color: string };
  sector: string;
  seeking: string[];
  raised: number;
  target: number;
  currency: string;
  teamSize: number;
  openRoles: string[];
  sponsors: string[];
  impactGoal: string;
  gradient: string;
}

const STARTUPS: Startup[] = [
  {
    id: 'su-1',
    name: 'AgriSense AI',
    tagline: 'Affordable AI crop disease detection for smallholder farmers using smartphone cameras.',
    founder: 'Riya Sharma (UniVerse CS)',
    stage: 'MVP',
    sdg: { num: 2, name: 'Zero Hunger', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    sector: 'AgriTech',
    seeking: ['Backend Engineer', 'ML Researcher', 'Business Development'],
    raised: 12000,
    target: 50000,
    currency: '$',
    teamSize: 3,
    openRoles: ['Backend Engineer', 'ML Researcher'],
    sponsors: ['KPMG Foundation', 'Infosys CSR'],
    impactGoal: 'Support 50,000 farmers across rural India by 2027',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    id: 'su-2',
    name: 'CleanCred',
    tagline: 'Micro-loans platform for low-income communities using alternative credit scoring via utility payments.',
    founder: 'Marco Delgado (UniVerse Finance)',
    stage: 'Pre-Seed',
    sdg: { num: 1, name: 'No Poverty', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    sector: 'FinTech',
    seeking: ['Full-Stack Developer', 'Legal Advisor', 'Impact Investor'],
    raised: 35000,
    target: 150000,
    currency: '$',
    teamSize: 4,
    openRoles: ['Full-Stack Developer'],
    sponsors: ['Deloitte Impact', 'UN Capital Dev Fund'],
    impactGoal: 'Disburse $1M in micro-loans to 5,000 families by 2026',
    gradient: 'from-rose-500 to-pink-600',
  },
  {
    id: 'su-3',
    name: 'EduBridge',
    tagline: 'Offline-first adaptive learning platform deploying on low-cost Android tablets in post-conflict regions.',
    founder: 'Amara Osei (UniVerse Education)',
    stage: 'Seed',
    sdg: { num: 4, name: 'Quality Education', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    sector: 'EdTech',
    seeking: ['React Native Dev', 'UX Designer', 'Curriculum Expert'],
    raised: 78000,
    target: 200000,
    currency: '$',
    teamSize: 6,
    openRoles: ['React Native Dev', 'UX Designer'],
    sponsors: ['Google.org', 'UNESCO StartUp Fund', 'GSMA Foundation'],
    impactGoal: 'Reach 100,000 students in 12 countries without internet',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'su-4',
    name: 'GreenGrid',
    tagline: 'Peer-to-peer solar energy sharing marketplace for apartment buildings using smart metering.',
    founder: 'Lena Brandt (UniVerse Engineering)',
    stage: 'Idea',
    sdg: { num: 7, name: 'Clean Energy', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    sector: 'CleanTech',
    seeking: ['Electrical Engineer', 'Mobile Dev', 'Business Analyst'],
    raised: 3000,
    target: 25000,
    currency: '$',
    teamSize: 2,
    openRoles: ['Electrical Engineer', 'Mobile Dev', 'Business Analyst'],
    sponsors: ['Siemens Foundation'],
    impactGoal: 'Reduce energy bills by 40% for 10,000 households',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'su-5',
    name: 'MediRoute',
    tagline: 'AI-powered last-mile medical supply chain optimizer for rural health clinics in Sub-Saharan Africa.',
    founder: 'Jean-Paul Mutombo (UniVerse Health)',
    stage: 'MVP',
    sdg: { num: 3, name: 'Good Health', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    sector: 'HealthTech',
    seeking: ['Operations Research Expert', 'Data Scientist', 'NGO Partner'],
    raised: 22000,
    target: 80000,
    currency: '$',
    teamSize: 3,
    openRoles: ['Data Scientist'],
    sponsors: ['Bill & Melinda Gates Foundation Partner', 'Tata Trusts'],
    impactGoal: 'Reduce stockout rates by 60% across 200 rural clinics',
    gradient: 'from-red-500 to-rose-600',
  },
  {
    id: 'su-6',
    name: 'WasteChain',
    tagline: 'Blockchain-verified circular economy marketplace connecting waste generators to certified recyclers.',
    founder: 'Sofia Chen (UniVerse Business)',
    stage: 'Pre-Seed',
    sdg: { num: 12, name: 'Responsible Consumption', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
    sector: 'CircularTech',
    seeking: ['Blockchain Dev', 'Supply Chain Expert', 'Marketing Lead'],
    raised: 18000,
    target: 100000,
    currency: '$',
    teamSize: 4,
    openRoles: ['Blockchain Dev', 'Marketing Lead'],
    sponsors: ['Unilever Sustainable Living Fund', 'UNDP Accelerator'],
    impactGoal: 'Divert 10,000 tonnes of waste from landfills by 2027',
    gradient: 'from-teal-500 to-cyan-600',
  },
];

const STAGE_COLORS: Record<string, string> = {
  'Idea': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  'MVP': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Pre-Seed': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Seed': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export default function StartupIncubatorPage() {
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selected, setSelected] = useState<Startup | null>(null);
  const [joined, setJoined] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [pitching, setPitching] = useState(false);

  const stages = ['ALL', 'Idea', 'MVP', 'Pre-Seed', 'Seed'];
  const filtered = STARTUPS.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = s.name.toLowerCase().includes(q) || s.tagline.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q);
    const matchStage = selectedStage === 'ALL' || s.stage === selectedStage;
    return matchSearch && matchStage;
  });

  const handleJoin = (s: Startup) => {
    setJoined(prev => [...prev, s.id]);
    toast.success(`Application sent to ${s.name}!`, { description: `The founder ${s.founder} will review your interest.` });
    setSelected(null);
    setRole('');
  };

  return (
    <>
      <Topbar
        title="🚀 Social Startup Incubator"
        subtitle="Join, co-found, or fund student startups tackling real-world social challenges with verified CSR backing."
        rightNode={
          <button onClick={() => setPitching(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all">
            <Lightbulb className="w-4 h-4" /> Pitch My Startup
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
                <p className="text-zinc-400 text-sm max-w-xl">Launch social impact startups, find co-founders, pitch to KPMG, Deloitte & Google.org, and earn CSR-backed micro-grants — all from within UniVerse.</p>
              </div>
              <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                {[{ v: '6', l: 'Active Startups' }, { v: '$168K', l: 'Grants Available', c: 'text-emerald-400' }, { v: '24', l: 'Open Co-founder Roles' }].map(s => (
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((startup, i) => {
              const pct = Math.round((startup.raised / startup.target) * 100);
              const isJoined = joined.includes(startup.id);
              return (
                <motion.div key={startup.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${startup.gradient} flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
                        {startup.name.slice(0, 2)}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", STAGE_COLORS[startup.stage])}>{startup.stage}</span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", startup.sdg.color)}>SDG {startup.sdg.num}</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors">{startup.name}</h3>
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{startup.tagline}</p>
                    </div>
                    <div className="text-xs text-zinc-500 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> <span className="font-medium text-zinc-700 dark:text-zinc-300">{startup.sector}</span>
                      <span className="mx-1">•</span>
                      <Users className="w-3.5 h-3.5" /> {startup.teamSize} members
                    </div>
                    {/* Funding Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Raised: <strong className="text-emerald-400">{startup.currency}{startup.raised.toLocaleString()}</strong></span>
                        <span className="text-zinc-500">Goal: {startup.currency}{startup.target.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.05 + 0.3, duration: 0.8 }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" />
                      </div>
                      <div className="text-[10px] text-zinc-500 text-right">{pct}% funded</div>
                    </div>
                    {/* Open Roles */}
                    {startup.openRoles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {startup.openRoles.map(r => (
                          <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{r}</span>
                        ))}
                      </div>
                    )}
                    {/* Sponsors */}
                    <div className="text-[10px] text-zinc-500">
                      <span className="font-semibold text-zinc-400">CSR Sponsors: </span>
                      {startup.sponsors.join(' · ')}
                    </div>
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
        </div>
      </div>

      {/* Startup Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border-t sm:border border-zinc-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex gap-2 mb-2">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", STAGE_COLORS[selected.stage])}>{selected.stage}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", selected.sdg.color)}>SDG {selected.sdg.num}: {selected.sdg.name}</span>
                  </div>
                  <h2 className="text-2xl font-black text-zinc-900 dark:text-white">{selected.name}</h2>
                  <p className="text-sm text-zinc-500 mt-1">{selected.tagline}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-3 gap-3 p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
                <div><div className="text-zinc-500 mb-1">Founder</div><div className="font-semibold text-zinc-900 dark:text-white">{selected.founder}</div></div>
                <div><div className="text-zinc-500 mb-1">Sector</div><div className="font-semibold text-zinc-900 dark:text-white">{selected.sector}</div></div>
                <div><div className="text-zinc-500 mb-1">Team Size</div><div className="font-semibold text-zinc-900 dark:text-white">{selected.teamSize} people</div></div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Impact Goal</h4>
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-sm text-emerald-600 dark:text-emerald-400 font-medium">{selected.impactGoal}</div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Open Co-founder Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {selected.openRoles.map(r => (
                    <button key={r} onClick={() => setRole(r)} className={cn("text-xs px-3 py-1.5 rounded-lg border font-medium transition-all", role === r ? "bg-indigo-600 text-white border-indigo-600" : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-indigo-500")}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">CSR Sponsors</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selected.sponsors.map(s => <span key={s} className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">{s}</span>)}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setSelected(null)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={() => handleJoin(selected)} disabled={joined.includes(selected.id)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 text-sm rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all">
                  <Send className="w-4 h-4" /> Apply to Join
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
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
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
