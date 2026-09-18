'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Globe2, Building2, HeartHandshake, Users, ArrowUpRight, Search,
  Filter, Sparkles, CheckCircle2, Clock, Calendar, Award, ExternalLink,
  ChevronRight, Bookmark, X, Send
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

interface Project {
  id: string;
  title: string;
  tagline: string;
  ngo: {
    name: string;
    type: 'NGO' | 'University Consortium' | 'Global Initiative';
    logoBg: string;
    verified: boolean;
  };
  partnerUniversities: string[];
  sdg: {
    number: number;
    name: string;
    color: string;
  };
  category: 'Climate & Energy' | 'Public Health' | 'Education & AI' | 'Human Rights' | 'Poverty Alleviation';
  spotsLeft: number;
  totalSpots: number;
  deadline: string;
  duration: string;
  stipend: string;
  skills: string[];
  description: string;
  deliverables: string[];
  impactMetric: string;
  facultyLead: {
    name: string;
    title: string;
    uni: string;
  };
}

const IMPACT_PROJECTS: Project[] = [
  {
    id: 'prj-1',
    title: 'Clean Water Autonomous IoT Filtration',
    tagline: 'Deploying low-cost solar water telemetry & purification units across East Africa rural clinics.',
    ngo: {
      name: 'Water.org & UNICEF East Africa',
      type: 'NGO',
      logoBg: 'from-blue-600 to-cyan-500',
      verified: true,
    },
    partnerUniversities: ['UniVerse Campus', 'MIT D-Lab', 'Univ of Nairobi'],
    sdg: {
      number: 6,
      name: 'Clean Water & Sanitation',
      color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    },
    category: 'Climate & Energy',
    spotsLeft: 3,
    totalSpots: 8,
    deadline: 'Oct 15, 2026',
    duration: '4 Months (Fall/Spring)',
    stipend: '$2,400 Micro-Grant + Academic Credit',
    skills: ['IoT Sensors', 'Python/Data Analysis', 'Community Outreach', 'Embedded Systems'],
    description: 'A multi-campus collaboration pairing engineering and public health students with UNICEF field teams to test and deploy open-source water safety monitors. Students gain direct field data access and co-publish with international researchers.',
    deliverables: [
      '50 remote sensor telemetry dashboards',
      'Community training handbook translated into Swahili',
      'Peer-reviewed whitepaper presented at UN Water Summit',
    ],
    impactMetric: '12,000+ villagers equipped with clean water alerts',
    facultyLead: {
      name: 'Dr. Elena Rostova',
      title: 'Professor of Environmental Informatics',
      uni: 'UniVerse Engineering',
    },
  },
  {
    id: 'prj-2',
    title: 'Multilingual AI Healthcare Triage Assistant',
    tagline: 'Developing privacy-preserving conversational diagnostics for under-resourced refugee aid clinics.',
    ngo: {
      name: 'Doctors Without Borders (MSF)',
      type: 'NGO',
      logoBg: 'from-rose-600 to-amber-600',
      verified: true,
    },
    partnerUniversities: ['UniVerse Campus', 'Oxford Medical Sciences', 'Sorbonne Univ'],
    sdg: {
      number: 3,
      name: 'Good Health & Well-Being',
      color: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    },
    category: 'Public Health',
    spotsLeft: 2,
    totalSpots: 6,
    deadline: 'Oct 28, 2026',
    duration: '6 Months',
    stipend: '$3,000 Research Fellowship',
    skills: ['NLP / LLM Fine-tuning', 'Biomedical Ethics', 'Arabic/French Translation', 'React/Tailwind'],
    description: 'Working alongside MSF triage specialists in Mediterranean intake clinics to refine an offline-first diagnostic recommendation tool operating on edge tablets with local language voice synthesis.',
    deliverables: [
      'Offline Whisper speech model adapted for regional dialects',
      'Full clinical validation study across 5 pilot clinics',
      'Open-source repository licensed under humanitarian GNU',
    ],
    impactMetric: 'Estimated 35% reduction in intake waiting latency',
    facultyLead: {
      name: 'Prof. Tariq Al-Mansoor',
      title: 'Chair of Global Health Systems',
      uni: 'Oxford & UniVerse Affiliate',
    },
  },
  {
    id: 'prj-3',
    title: 'Deforestation Satellite Watch & Indigenous Land Rights',
    tagline: 'Real-time computer vision alerts mapping illegal logging encroachments in the Amazon basin.',
    ngo: {
      name: 'Greenpeace International & COIAB',
      type: 'NGO',
      logoBg: 'from-emerald-600 to-teal-500',
      verified: true,
    },
    partnerUniversities: ['UniVerse Campus', 'ETH Zurich', 'Univ of São Paulo'],
    sdg: {
      number: 15,
      name: 'Life on Land',
      color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
    category: 'Climate & Energy',
    spotsLeft: 4,
    totalSpots: 10,
    deadline: 'Nov 05, 2026',
    duration: '3 Months',
    stipend: 'Sponsored Travel to COP32 + $1,800',
    skills: ['PyTorch / Computer Vision', 'GIS & Satellite SAR', 'Environmental Law', 'Policy Writing'],
    description: 'Combining high-resolution Sentinel & PlanetScope radar datasets with on-the-ground indigenous community patrol routes. Students will train automated change-detection pipelines that submit urgent evidentiary dossiers to legal defenders.',
    deliverables: [
      'Automated nightly raster diffing pipeline',
      'Interactive mapping platform for legal defense teams',
      'Submission to Inter-American Court of Human Rights',
    ],
    impactMetric: 'Protects ~140,000 hectares of primary rainforest',
    facultyLead: {
      name: 'Dr. Lucas Silveira',
      title: 'Senior Geospatial Scientist',
      uni: 'ETH Zurich & UniVerse Research Fellow',
    },
  },
  {
    id: 'prj-4',
    title: 'Open Curriculum & Micro-Schools for Displaced Youth',
    tagline: 'Building decentralized, gamified STEM curricula for temporary learning spaces in post-conflict zones.',
    ngo: {
      name: 'UNESCO Global Education Coalition',
      type: 'Global Initiative',
      logoBg: 'from-purple-600 to-indigo-600',
      verified: true,
    },
    partnerUniversities: ['UniVerse Campus', 'Cambridge Faculty of Ed', 'Univ of Cape Town'],
    sdg: {
      number: 4,
      name: 'Quality Education',
      color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    },
    category: 'Education & AI',
    spotsLeft: 5,
    totalSpots: 12,
    deadline: 'Nov 12, 2026',
    duration: '4 Months',
    stipend: '$2,000 UNESCO Student Ambassador Award',
    skills: ['Pedagogy Design', 'UI/UX Interactive Learning', 'Micro-Learning Videos', 'Community Mentorship'],
    description: 'Inter-college student task force drafting dynamic interactive STEM modules run on solar Raspberry Pi micro-servers with zero internet connectivity requirements.',
    deliverables: [
      '24 interactive modules in math, physics, and coding',
      'Offline browser-based simulation sandbox',
      'Teacher onboarding toolkit tested with 100 educators',
    ],
    impactMetric: 'Over 4,500 children enrolled across 8 centers',
    facultyLead: {
      name: 'Dr. Amara Okafor',
      title: 'Director of Inclusive Learning Platforms',
      uni: 'UniVerse Education Dept',
    },
  },
];

export default function CollaborativeProjectsPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [appliedProjects, setAppliedProjects] = useState<string[]>([]);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [statementOfIntent, setStatementOfIntent] = useState('');

  const categories = ['ALL', 'Climate & Energy', 'Public Health', 'Education & AI', 'Human Rights'];

  const filteredProjects = IMPACT_PROJECTS.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.ngo.name.toLowerCase().includes(search.toLowerCase()) ||
      p.skills.some(s => s.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleApply = (project: Project) => {
    if (!appliedProjects.includes(project.id)) {
      setAppliedProjects([...appliedProjects, project.id]);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 4000);
      setSelectedProject(null);
      setStatementOfIntent('');
    }
  };

  return (
    <>
      <Topbar
        title="Global Collaborative Projects"
        subtitle="Work side-by-side with international universities and world-renowned NGOs on urgent social challenges."
        rightNode={
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>4 Active Consortia</span>
            </div>
          </div>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-950/30 to-amber-950/20 border border-white/10 p-8 shadow-2xl">
            <div className="absolute -right-16 -bottom-16 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
                  <UniverseLogo size="sm" animated={false} withGlow={false} />
                  Inter-University & NGO Collaborative Alliance
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
                  Solve Real Challenges with <span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">Global Peers</span>
                </h1>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Join cross-campus student squads mentored by university professors and leaders from UNICEF, Greenpeace, and MSF. Earn official academic credits, research fellowships, and make tangible humanitarian impact.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full md:w-auto flex-shrink-0">
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-white">48+</div>
                  <div className="text-[11px] text-zinc-400 font-medium">Global Projects</div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-emerald-400">$340K</div>
                  <div className="text-[11px] text-zinc-400 font-medium">Micro-Grants Pool</div>
                </div>
              </div>
            </div>
          </div>

          {/* Success Toast */}
          {showSuccessToast && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-sm">Application Successfully Submitted!</div>
                  <div className="text-xs text-emerald-400/80">
                    The NGO Project Director and supervising faculty have received your statement. You will receive an interview invitation within 3 business days.
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setShowSuccessToast(false)}
                className="text-emerald-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by project, NGO, university or skill..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/70 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredProjects.map(project => {
              const isApplied = appliedProjects.includes(project.id);

              return (
                <div
                  key={project.id}
                  className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 hover:border-indigo-500/40 transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  <div className="space-y-4">
                    {/* Header with NGO & SDG */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${project.ngo.logoBg} flex items-center justify-center text-white font-black text-sm shadow-md flex-shrink-0`}>
                          {project.ngo.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-sm">{project.ngo.name}</span>
                            {project.ngo.verified && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-400">{project.ngo.type}</span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${project.sdg.color}`}>
                        SDG #{project.sdg.number}: {project.sdg.name}
                      </span>
                    </div>

                    {/* Title & Tagline */}
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors leading-snug mb-1">
                        {project.title}
                      </h3>
                      <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">
                        {project.tagline}
                      </p>
                    </div>

                    {/* Partner Universities Badges */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                        Joint University Coalition:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {project.partnerUniversities.map((uni, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2.5 py-0.5 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 font-medium flex items-center gap-1"
                          >
                            <Building2 className="w-3 h-3 text-indigo-400" />
                            {uni}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Skills required */}
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {project.skills.map((skill, sIdx) => (
                        <span
                          key={sIdx}
                          className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Impact Metric callout */}
                    <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Target Outcome:</span>
                      <span className="font-semibold text-emerald-400">{project.impactMetric}</span>
                    </div>
                  </div>

                  {/* Footer & Actions */}
                  <div className="pt-6 mt-6 border-t border-zinc-800/60 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-zinc-500" />
                        <strong className="text-white">{project.spotsLeft}</strong>/{project.totalSpots} spots
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        Due {project.deadline}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedProject(project)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                      >
                        Details
                      </button>

                      <button
                        onClick={() => {
                          if (!isApplied) {
                            setSelectedProject(project);
                          }
                        }}
                        disabled={isApplied}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          isApplied
                            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                        }`}
                      >
                        {isApplied ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                          </>
                        ) : (
                          <>
                            Apply to Team <ArrowUpRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Modal */}
          {selectedProject && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
                
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${selectedProject.sdg.color} inline-block mb-2`}>
                      SDG #{selectedProject.sdg.number}: {selectedProject.sdg.name}
                    </span>
                    <h2 className="text-2xl font-black text-white">{selectedProject.title}</h2>
                    <p className="text-zinc-400 text-sm mt-1">{selectedProject.tagline}</p>
                  </div>
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs">
                  <div>
                    <span className="text-zinc-500 block mb-1">Lead NGO</span>
                    <span className="font-semibold text-white">{selectedProject.ngo.name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-1">Duration</span>
                    <span className="font-semibold text-white">{selectedProject.duration}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block mb-1">Stipend & Award</span>
                    <span className="font-semibold text-emerald-400">{selectedProject.stipend}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Project Overview</h4>
                  <p className="text-zinc-300 text-sm leading-relaxed">{selectedProject.description}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Key Milestones & Deliverables</h4>
                  <ul className="space-y-2">
                    {selectedProject.deliverables.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-indigo-300 font-medium">Faculty Mentor & Research Supervisor:</div>
                    <div className="text-sm font-bold text-white">{selectedProject.facultyLead.name}</div>
                    <div className="text-xs text-zinc-400">{selectedProject.facultyLead.title} ({selectedProject.facultyLead.uni})</div>
                  </div>
                  <UniverseLogo size="sm" animated={false} withGlow={false} />
                </div>

                {/* Application Section */}
                <div className="pt-4 border-t border-zinc-800 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Why do you want to join this inter-college team? (Optional statement)
                  </h4>
                  <textarea
                    rows={3}
                    value={statementOfIntent}
                    onChange={e => setStatementOfIntent(e.target.value)}
                    placeholder="Mention relevant skills, past volunteer experience, or research interests..."
                    className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => setSelectedProject(null)}
                      className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={() => handleApply(selectedProject)}
                      disabled={appliedProjects.includes(selectedProject.id)}
                      className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all"
                    >
                      <Send className="w-4 h-4" />
                      Submit Application to Consortium
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
