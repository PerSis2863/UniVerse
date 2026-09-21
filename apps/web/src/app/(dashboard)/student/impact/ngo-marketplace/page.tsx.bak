'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Globe, Users, Heart, ArrowUpRight, Search, CheckCircle2, Clock, MapPin, Sparkles, Building, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguageStore } from '@/store/language';

interface NGOProject {
  id: string;
  name: string;
  ngo: string;
  description: string;
  sdg: { num: number; name: string; color: string };
  location: string;
  duration: string;
  type: 'Volunteer' | 'Internship' | 'Field Work';
  skillsRequired: string[];
  impactPoints: number;
  openings: number;
  gradient: string;
}

const PROJECTS: NGOProject[] = [
  {
    id: 'ngo-1',
    name: 'Digital Literacy for Rural Women',
    ngo: 'Pratham Education Foundation',
    description: 'Teach basic digital literacy and online safety to women in rural communities. Training provided.',
    sdg: { num: 4, name: 'Quality Education', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    location: 'Remote & On-site',
    duration: '3 Months (Part-time)',
    type: 'Volunteer',
    skillsRequired: ['Teaching', 'Communication', 'Basic IT'],
    impactPoints: 500,
    openings: 15,
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'ngo-2',
    name: 'Coastal Cleanup Data Analyst',
    ngo: 'Ocean Conservancy',
    description: 'Analyze data collected from coastal cleanups to identify primary pollution sources and create visualizations.',
    sdg: { num: 14, name: 'Life Below Water', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
    location: 'Remote',
    duration: '1 Month',
    type: 'Internship',
    skillsRequired: ['Data Analysis', 'Python', 'Data Viz'],
    impactPoints: 800,
    openings: 2,
    gradient: 'from-sky-500 to-cyan-600',
  },
  {
    id: 'ngo-3',
    name: 'Solar Panel Setup Assistant',
    ngo: 'Barefoot College',
    description: 'Assist engineering teams in setting up solar micro-grids in off-grid villages.',
    sdg: { num: 7, name: 'Clean Energy', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    location: 'Field Work (Rajasthan)',
    duration: '2 Weeks (Full-time)',
    type: 'Field Work',
    skillsRequired: ['Engineering', 'Physical Work', 'Hindi'],
    impactPoints: 1200,
    openings: 5,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'ngo-4',
    name: 'Food Distribution Logistics',
    ngo: 'Akshaya Patra',
    description: 'Help optimize delivery routes for the mid-day meal scheme reaching thousands of schools.',
    sdg: { num: 2, name: 'Zero Hunger', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    location: 'Hybrid (Bangalore)',
    duration: '2 Months',
    type: 'Internship',
    skillsRequired: ['Logistics', 'Operations', 'Excel'],
    impactPoints: 750,
    openings: 3,
    gradient: 'from-amber-500 to-orange-600',
  }
];

export default function NGOMarketplacePage() {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selected, setSelected] = useState<NGOProject | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const { t } = useLanguageStore();

  const types = ['ALL', 'Volunteer', 'Internship', 'Field Work'];
  const filtered = PROJECTS.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.ngo.toLowerCase().includes(q);
    const matchType = selectedType === 'ALL' || p.type === selectedType;
    return matchSearch && matchType;
  });

  const handleApply = (p: NGOProject) => {
    setApplied(prev => [...prev, p.id]);
    toast.success(`Application sent to ${p.ngo}!`, {
      description: `You will earn ${p.impactPoints} impact points upon completion.`
    });
    setSelected(null);
  };

  return (
    <>
      <Topbar 
        title="🌍 NGO Marketplace" 
        subtitle="Volunteer, intern, and work with verified NGOs to earn impact points." 
      />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/60 via-teal-950/50 to-zinc-950 border border-white/10 p-8 shadow-2xl">
            <div className="absolute -left-20 -top-20 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
                  <Heart className="w-3.5 h-3.5" /> Direct Impact
                </div>
                <h1 className="text-3xl font-black text-white">Partner with <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Global NGOs</span></h1>
                <p className="text-zinc-400 text-sm max-w-xl">Apply your skills where they matter most. Gain real-world experience, help communities in need, and build your social impact portfolio.</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NGOs and projects..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {types.map(t => (
                <button key={t} onClick={() => setSelectedType(t)}
                  className={cn("px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all",
                    selectedType === t ? "bg-emerald-600 text-white border-emerald-600 shadow-lg" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-emerald-500/50")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
            {filtered.map((project, i) => {
              const isApplied = applied.includes(project.id);
              return (
                <motion.div key={project.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-emerald-500/40 transition-all group flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${project.gradient} flex items-center justify-center text-white`}>
                          <Building className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors">{project.name}</h3>
                          <div className="text-xs text-zinc-500 font-medium">{project.ngo}</div>
                        </div>
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", project.sdg.color)}>SDG {project.sdg.num}</span>
                    </div>
                    
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{project.description}</p>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-zinc-500"><MapPin className="w-3.5 h-3.5 text-zinc-400" /> {project.location}</div>
                      <div className="flex items-center gap-1.5 text-zinc-500"><Clock className="w-3.5 h-3.5 text-zinc-400" /> {project.duration}</div>
                      <div className="flex items-center gap-1.5 text-zinc-500"><Users className="w-3.5 h-3.5 text-zinc-400" /> {project.openings} Openings</div>
                      <div className="flex items-center gap-1.5 text-emerald-500 font-semibold"><Sparkles className="w-3.5 h-3.5" /> +{project.impactPoints} Impact Pts</div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {project.skillsRequired.map(skill => (
                        <span key={skill} className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <button 
                      onClick={() => !isApplied && setSelected(project)}
                      disabled={isApplied}
                      className={cn("w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                        isApplied ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                      )}>
                      {isApplied ? <><CheckCircle2 className="w-4 h-4" /> Application Submitted</> : <>View Details & Apply <ArrowUpRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
              
              <div className="mb-6">
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border mb-3 inline-block", selected.sdg.color)}>SDG {selected.sdg.num}: {selected.sdg.name}</span>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">{selected.name}</h2>
                <p className="text-sm font-medium text-zinc-500">{selected.ngo}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Project Overview</h4>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{selected.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 p-4 bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 text-sm">
                  <div>
                    <div className="text-zinc-500 text-xs mb-0.5">Location</div>
                    <div className="font-medium text-zinc-900 dark:text-white">{selected.location}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs mb-0.5">Duration</div>
                    <div className="font-medium text-zinc-900 dark:text-white">{selected.duration}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs mb-0.5">Type</div>
                    <div className="font-medium text-zinc-900 dark:text-white">{selected.type}</div>
                  </div>
                  <div>
                    <div className="text-emerald-500 text-xs mb-0.5 font-semibold">Impact</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">+{selected.impactPoints} Points</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Required Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.skillsRequired.map(skill => (
                      <span key={skill} className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => handleApply(selected)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Submit Application
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
