'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Globe2, Building2, HeartHandshake, MapPin, ExternalLink, CheckCircle2,
  Search, Users, BookOpen, Award, ArrowUpRight, Sparkles, HandHeart
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

interface Partner {
  id: string;
  name: string;
  type: 'University' | 'NGO' | 'Research Lab';
  location: string;
  mouStatus: 'Active Partnership' | 'Strategic Alliance' | 'Bilateral Exchange';
  focusAreas: string[];
  activeProjects: number;
  studentsExchanged: number;
  description: string;
  badgeColor: string;
  website: string;
  liaison: string;
}

const PARTNERS_DATA: Partner[] = [
  {
    id: 'p-1',
    name: 'UNICEF Global Innovation Office',
    type: 'NGO',
    location: 'Geneva, Switzerland & New York, USA',
    mouStatus: 'Strategic Alliance',
    focusAreas: ['Child Health', 'Clean Water IoT', 'Emergency Education', 'Disaster Relief'],
    activeProjects: 6,
    studentsExchanged: 42,
    description: 'Direct institutional framework enabling UniVerse students to intern, run pilot deployments, and contribute engineering & data analytics to UNICEF emergency response missions.',
    badgeColor: 'from-blue-600 to-cyan-500',
    website: 'https://unicef.org/innovation',
    liaison: 'Dr. Sarah Lindqvist (Global Partnerships Director)',
  },
  {
    id: 'p-2',
    name: 'Massachusetts Institute of Technology (MIT)',
    type: 'University',
    location: 'Cambridge, MA, USA',
    mouStatus: 'Active Partnership',
    focusAreas: ['AI for Social Good', 'Micro-Grid Renewable Tech', 'Urban Resilience'],
    activeProjects: 9,
    studentsExchanged: 28,
    description: 'Bilateral exchange and joint research alliance between MIT D-Lab and UniVerse Engineering, fostering co-supervised theses and dual-campus hackathons.',
    badgeColor: 'from-red-600 to-rose-700',
    website: 'https://mit.edu',
    liaison: 'Prof. Michael Sterling (MIT Global Engagement)',
  },
  {
    id: 'p-3',
    name: 'Doctors Without Borders (MSF)',
    type: 'NGO',
    location: 'Paris, France & Global',
    mouStatus: 'Strategic Alliance',
    focusAreas: ['Medical Informatics', 'Refugee Triage', 'Vaccine Cold-Chain Tracking'],
    activeProjects: 4,
    studentsExchanged: 19,
    description: 'Humanitarian healthcare partnership deploying open-source clinical diagnostic support tools to front-line mobile units in underserved territories.',
    badgeColor: 'from-rose-600 to-amber-600',
    website: 'https://msf.org',
    liaison: 'Claire Dubois (Field Operations Lead)',
  },
  {
    id: 'p-4',
    name: 'University of Oxford',
    type: 'University',
    location: 'Oxford, United Kingdom',
    mouStatus: 'Bilateral Exchange',
    focusAreas: ['Global Health Ethics', 'Computational Genomics', 'Sustainable Economics'],
    activeProjects: 7,
    studentsExchanged: 35,
    description: 'Cross-institution seminar series and fully credited exchange semesters for UniVerse scholars working in Oxford bioethics and climate policy groups.',
    badgeColor: 'from-indigo-700 to-blue-900',
    website: 'https://ox.ac.uk',
    liaison: 'Dr. Alistair Finch (Academic Exchange Dean)',
  },
  {
    id: 'p-5',
    name: 'Greenpeace International',
    type: 'NGO',
    location: 'Amsterdam, Netherlands',
    mouStatus: 'Active Partnership',
    focusAreas: ['Satellite Deforestation Auditing', 'Ocean Plastics Mapping', 'Climate Justice'],
    activeProjects: 5,
    studentsExchanged: 24,
    description: 'Technical alliance leveraging student-developed remote sensing and AI computer vision to deliver unalterable evidence of environmental degradation.',
    badgeColor: 'from-emerald-600 to-teal-500',
    website: 'https://greenpeace.org',
    liaison: 'Hans Van Der Meer (Climate Investigation Unit)',
  },
  {
    id: 'p-6',
    name: 'ETH Zürich (Swiss Federal Tech)',
    type: 'University',
    location: 'Zürich, Switzerland',
    mouStatus: 'Active Partnership',
    focusAreas: ['Robotics & Disaster Response', 'Climate Modeling', 'Autonomous Drones'],
    activeProjects: 8,
    studentsExchanged: 31,
    description: 'Joint research labs and shared compute clusters powering complex geo-climatic predictions and robotic humanitarian search-and-rescue systems.',
    badgeColor: 'from-cyan-700 to-slate-800',
    website: 'https://ethz.ch',
    liaison: 'Prof. Beatrix Meier (International Affairs)',
  },
  {
    id: 'p-7',
    name: 'UNESCO Global Education Coalition',
    type: 'NGO',
    location: 'Paris, France',
    mouStatus: 'Strategic Alliance',
    focusAreas: ['Open-Source STEM', 'Gender Parity in Tech', 'Digital Literacy for Displaced'],
    activeProjects: 4,
    studentsExchanged: 16,
    description: 'Educational coalition advancing decentralized offline learning portals for children in refugee settlements and low-bandwidth environments worldwide.',
    badgeColor: 'from-purple-600 to-indigo-600',
    website: 'https://unesco.org',
    liaison: 'Marie-Louise Toure (Global Ed Liaison)',
  },
  {
    id: 'p-8',
    name: 'National University of Singapore (NUS)',
    type: 'University',
    location: 'Singapore',
    mouStatus: 'Bilateral Exchange',
    focusAreas: ['Smart Cities', 'Southeast Asia Coastal Defense', 'Fintech Inclusion'],
    activeProjects: 6,
    studentsExchanged: 22,
    description: 'Asia-Pacific collaboration gateway connecting UniVerse students to urban sea-level rise prevention models and high-density circular agriculture.',
    badgeColor: 'from-orange-600 to-amber-700',
    website: 'https://nus.edu.sg',
    liaison: 'Dr. Kenneth Tan (Global Office)',
  },
];

export default function GlobalPartnersPage() {
  const [filterType, setFilterType] = useState<'ALL' | 'University' | 'NGO'>('ALL');
  const [search, setSearch] = useState('');

  const filteredPartners = PARTNERS_DATA.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase()) ||
      p.focusAreas.some(f => f.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === 'ALL' || p.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <>
      <Topbar
        title="Global Partner Network"
        subtitle="Explore our alliance of world-renowned universities and international non-profit organizations."
        rightNode={
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> All MOUs Legally Verified
            </span>
          </div>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white">48+</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Partner Universities</div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
                <HandHeart className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white">35+</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Collaborating NGOs</div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Globe2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white">28</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Countries Represented</div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white">450+</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Exchanges & Fellows</div>
              </div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search university, NGO, country, or focus area..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {(['ALL', 'University', 'NGO'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    filterType === type
                      ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white'
                  }`}
                >
                  {type === 'ALL' ? 'All Institutions' : type === 'University' ? 'Universities' : 'NGOs & Non-Profits'}
                </button>
              ))}
            </div>
          </div>

          {/* Partner Directory Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredPartners.map(partner => (
              <div
                key={partner.id}
                className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 hover:border-indigo-500/30 transition-all flex flex-col justify-between group space-y-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${partner.badgeColor} flex items-center justify-center text-zinc-900 dark:text-white font-black text-base shadow-lg flex-shrink-0`}>
                        {partner.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white group-hover:text-indigo-300 transition-colors">
                          {partner.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-500" />
                          {partner.location}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                      {partner.mouStatus}
                    </span>
                  </div>

                  <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">
                    {partner.description}
                  </p>

                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-500">
                      Primary Collaboration Disciplines:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {partner.focusAreas.map((area, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-700/50 text-zinc-300"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/60 rounded-xl text-xs space-y-1 text-zinc-600 dark:text-zinc-400">
                    <div className="flex justify-between">
                      <span>Institutional Liaison:</span>
                      <span className="font-medium text-zinc-200">{partner.liaison}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4 text-zinc-600 dark:text-zinc-400">
                    <div>
                      <strong className="text-zinc-900 dark:text-white font-semibold">{partner.activeProjects}</strong> Active Projects
                    </div>
                    <div>
                      <strong className="text-zinc-900 dark:text-white font-semibold">{partner.studentsExchanged}</strong> Fellowships
                    </div>
                  </div>

                  <a
                    href={partner.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Official Portal <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
