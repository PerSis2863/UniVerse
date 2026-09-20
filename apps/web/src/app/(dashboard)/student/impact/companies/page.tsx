'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Building2, ArrowUpRight, Search, Briefcase, HeartHandshake, ShieldCheck, Target, ChevronRight, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Company {
  id: string;
  name: string;
  logo: string;
  industry: string;
  csrFocus: string[];
  description: string;
  opportunities: {
    title: string;
    type: string;
    points: number;
    link: string;
  }[];
  fundingAvailable: string;
  gradient: string;
}

const COMPANIES: Company[] = [
  {
    id: 'comp-1',
    name: 'Google.org',
    logo: 'G',
    industry: 'Technology',
    csrFocus: ['Digital Inclusion', 'Education', 'Crisis Response'],
    description: 'Supporting tech-driven solutions for social impact. Explore fellowships and technical volunteering opportunities.',
    fundingAvailable: '$500k+ in student grants',
    opportunities: [
      { title: 'Tech Social Fellowship', type: 'Fellowship', points: 2000, link: '#' },
      { title: 'Open Source Contributor (Impact)', type: 'Volunteer', points: 800, link: '#' }
    ],
    gradient: 'from-blue-500 via-red-500 to-yellow-500',
  },
  {
    id: 'comp-2',
    name: 'Deloitte Impact',
    logo: 'D',
    industry: 'Consulting',
    csrFocus: ['Social Enterprise', 'Skill Development', 'Sustainability'],
    description: 'Pro-bono consulting opportunities for students to help NGOs scale their operations and strategy.',
    fundingAvailable: '$250k in advisory grants',
    opportunities: [
      { title: 'Pro-Bono Student Consultant', type: 'Project', points: 1500, link: '#' },
      { title: 'NGO Strategy Workshop Lead', type: 'Workshop', points: 500, link: '#' }
    ],
    gradient: 'from-zinc-900 to-zinc-700',
  },
  {
    id: 'comp-3',
    name: 'Unilever Sustainable',
    logo: 'U',
    industry: 'Consumer Goods',
    csrFocus: ['Climate Action', 'Health & Hygiene', 'Women Empowerment'],
    description: 'Join initiatives focused on circular economy, waste reduction, and sustainable supply chains.',
    fundingAvailable: '$100k startup seed fund',
    opportunities: [
      { title: 'Circular Economy Challenge', type: 'Hackathon', points: 1000, link: '#' },
      { title: 'Campus Sustainability Ambassador', type: 'Role', points: 600, link: '#' }
    ],
    gradient: 'from-blue-600 to-indigo-700',
  },
  {
    id: 'comp-4',
    name: 'Tata Trusts',
    logo: 'T',
    industry: 'Philanthropy / Conglomerate',
    csrFocus: ['Healthcare', 'Rural Development', 'Water Conservation'],
    description: 'Participate in large-scale field projects addressing critical developmental challenges in rural areas.',
    fundingAvailable: '$1M+ project funding',
    opportunities: [
      { title: 'Rural Health Data Intern', type: 'Internship', points: 1200, link: '#' },
      { title: 'Water Conservation Field Visit', type: 'Field Work', points: 800, link: '#' }
    ],
    gradient: 'from-blue-800 to-blue-950',
  }
];

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);

  const filtered = COMPANIES.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.industry.toLowerCase().includes(search.toLowerCase()) ||
    c.csrFocus.some(f => f.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <Topbar 
        title="🏢 Corporate Partners (CSR)" 
        subtitle="Connect with leading companies funding and supporting social impact initiatives." 
      />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 p-8 shadow-2xl">
            <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Verified CSR Partners
                </div>
                <h1 className="text-3xl font-black text-white">Bridge the Gap Between <span className="bg-gradient-to-r from-zinc-200 to-zinc-500 bg-clip-text text-transparent">Corporate & Impact</span></h1>
                <p className="text-zinc-400 text-sm leading-relaxed">Discover companies offering grants, fellowships, and pro-bono projects. Leverage corporate resources to scale your ideas or gain valuable experience.</p>
              </div>
              <div className="flex gap-4">
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center">
                  <HeartHandshake className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                  <div className="text-2xl font-black text-white">15+</div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Partners</div>
                </div>
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center">
                  <Target className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                  <div className="text-2xl font-black text-white">$2.5M</div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">CSR Funds</div>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies, industries, or focus areas..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-colors" />
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((company, i) => (
              <motion.div key={company.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 hover:border-indigo-500/40 transition-all group cursor-pointer"
                onClick={() => setSelected(company)}>
                
                <div className="flex items-start gap-4 mb-5">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${company.gradient} flex items-center justify-center text-white text-xl font-black shadow-lg flex-shrink-0`}>
                    {company.logo}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-indigo-500 transition-colors flex items-center gap-2">
                      {company.name}
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    </h3>
                    <div className="text-sm text-zinc-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <Briefcase className="w-3.5 h-3.5" /> {company.industry}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5 line-clamp-2">{company.description}</p>

                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2">CSR Focus Areas</div>
                    <div className="flex flex-wrap gap-1.5">
                      {company.csrFocus.map(focus => (
                        <span key={focus} className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/50">
                          {focus}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">
                      {company.fundingAvailable}
                    </div>
                    <div className="text-xs font-semibold text-indigo-500 flex items-center gap-1 group-hover:gap-2 transition-all">
                      View Opportunities <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
              
              <div className={`h-32 bg-gradient-to-br ${selected.gradient} relative`}>
                <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-md">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="px-6 pb-6 pt-0 relative flex-1 overflow-y-auto">
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${selected.gradient} border-4 border-white dark:border-zinc-900 flex items-center justify-center text-white text-3xl font-black shadow-xl -mt-10 mb-4 relative z-10`}>
                  {selected.logo}
                </div>
                
                <div className="mb-6 flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      {selected.name} <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </h2>
                    <div className="text-sm text-zinc-500 font-medium">{selected.industry}</div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    {selected.fundingAvailable}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">About their CSR</h4>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                      {selected.description}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Active Opportunities</h4>
                    <div className="space-y-3">
                      {selected.opportunities.map((opp, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-indigo-500/50 transition-colors gap-4">
                          <div>
                            <div className="font-bold text-sm text-zinc-900 dark:text-white mb-1">{opp.title}</div>
                            <div className="flex gap-2">
                              <span className="text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-md">{opp.type}</span>
                              <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-md">+{opp.points} pts</span>
                            </div>
                          </div>
                          <button onClick={() => {toast.success('Redirecting to partner portal...'); setSelected(null);}} 
                            className="btn-secondary py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap">
                            Apply Externally <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
