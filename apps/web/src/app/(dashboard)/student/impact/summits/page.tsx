'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Calendar, MapPin, Users, Globe2, Sparkles, Trophy,
  ArrowUpRight, CheckCircle2, Clock, ExternalLink
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

interface Summit {
  id: string;
  title: string;
  theme: string;
  organizers: string[];
  date: string;
  format: 'Virtual & Geneva' | 'Hybrid (Boston + Online)' | 'Online Worldwide' | 'London & Stream';
  prizePool: string;
  teamsRegistered: number;
  maxTeams: number;
  daysRemaining: number;
  description: string;
  tracks: string[];
  bannerGradient: string;
}

const SUMMITS_DATA: Summit[] = [
  {
    id: 'summit-1',
    title: 'Global Inter-University Climate Hackathon 2026',
    theme: 'Decarbonization, AI Geospatial Analytics & Climate Resilience',
    organizers: ['UniVerse Impact Network', 'MIT Energy Initiative', 'Greenpeace International'],
    date: 'Nov 18 - 20, 2026',
    format: 'Hybrid (Boston + Online)',
    prizePool: '$75,000 Venture Seed Grant',
    teamsRegistered: 84,
    maxTeams: 120,
    daysRemaining: 18,
    description: '48-hour global sprint pairing engineering, computer science, and policy students across 30+ universities with environmental NGO field directors.',
    tracks: ['Satellite Land Change Detection', 'Decentralized Microgrids', 'Circular Economy Packaging'],
    bannerGradient: 'from-emerald-950 via-teal-950/50 to-zinc-900',
  },
  {
    id: 'summit-2',
    title: 'UN World Humanitarian Youth Assembly',
    theme: 'Accelerating the 2030 Sustainable Development Goals through Cross-Campus Tech',
    organizers: ['UNESCO', 'UNICEF Innovation', 'Oxford University'],
    date: 'Dec 05 - 07, 2026',
    format: 'Virtual & Geneva',
    prizePool: 'UN Youth Fellowship + $50,000',
    teamsRegistered: 142,
    maxTeams: 200,
    daysRemaining: 35,
    description: 'Annual flagship summit where student delegacies present working prototypes, mobile healthcare solutions, and micro-financing networks directly to UN agency chiefs.',
    tracks: ['Refugee Education Tools', 'Clean Water Infrastructure', 'Civic Rights & Transparency'],
    bannerGradient: 'from-indigo-950 via-blue-950/50 to-zinc-900',
  },
  {
    id: 'summit-3',
    title: 'Healthcare Equity Global Datathon',
    theme: 'Predictive Epidemiology and Low-Cost Diagnostics for Emerging Outbreaks',
    organizers: ['Doctors Without Borders (MSF)', 'Sorbonne Medical School', 'UniVerse BioInformatics'],
    date: 'Jan 15 - 17, 2027',
    format: 'Online Worldwide',
    prizePool: '$40,000 Clinical Pilot Fund',
    teamsRegistered: 56,
    maxTeams: 100,
    daysRemaining: 68,
    description: 'Collaborate with global biostatisticians and field doctors on anonymized frontline datasets to build early detection alerts for malaria and cholera surges.',
    tracks: ['Edge Speech Triage', 'Vector-Borne Disease Forecasts', 'Vaccine Supply Cold Chain'],
    bannerGradient: 'from-rose-950 via-purple-950/50 to-zinc-900',
  },
];

export default function GlobalSummitsPage() {
  const [registeredSummits, setRegisteredSummits] = useState<string[]>([]);

  const handleRegister = (id: string) => {
    if (!registeredSummits.includes(id)) {
      setRegisteredSummits([...registeredSummits, id]);
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

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Intro Banner */}
          <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-zinc-900 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
                <UniverseLogo size="sm" animated={false} withGlow={false} />
                Multi-Institution Collaboration Summits
              </div>
              <h2 className="text-2xl font-black text-white">Cross-University Team Matchmaking</h2>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Need a teammate from another university? Our matchmaking engine pairs UniVerse students with computer scientists at MIT, medical students at Oxford, and policy advocates at Sorbonne.
              </p>
            </div>
            <button className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 whitespace-nowrap">
              <Users className="w-4 h-4" /> Find Inter-College Teammates
            </button>
          </div>

          {/* Summits List */}
          <div className="space-y-6">
            {SUMMITS_DATA.map(summit => {
              const isRegistered = registeredSummits.includes(summit.id);

              return (
                <div
                  key={summit.id}
                  className={`rounded-3xl border border-zinc-800/80 bg-gradient-to-r ${summit.bannerGradient} p-8 hover:border-indigo-500/40 transition-all shadow-xl space-y-6`}
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {summit.format}
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> {summit.prizePool}
                        </span>
                      </div>
                      <h3 className="text-2xl font-black text-white">{summit.title}</h3>
                      <p className="text-zinc-300 text-xs">{summit.theme}</p>
                    </div>

                    {/* Countdown Box */}
                    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex items-center gap-4 flex-shrink-0">
                      <div className="text-center">
                        <div className="text-2xl font-black text-indigo-400">{summit.daysRemaining}</div>
                        <div className="text-[10px] text-zinc-400 font-medium">Days Left</div>
                      </div>
                      <div className="h-8 w-[1px] bg-zinc-800" />
                      <div className="text-center">
                        <div className="text-2xl font-black text-white">{summit.teamsRegistered}</div>
                        <div className="text-[10px] text-zinc-400 font-medium">Teams In</div>
                      </div>
                    </div>
                  </div>

                  <p className="text-zinc-400 text-sm leading-relaxed max-w-4xl">
                    {summit.description}
                  </p>

                  {/* Organizers & Tracks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-zinc-800/60 text-xs">
                    <div>
                      <span className="text-zinc-500 font-medium block mb-1">Co-Organized By:</span>
                      <div className="flex flex-wrap gap-2 text-zinc-300 font-medium">
                        {summit.organizers.join(' • ')}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-500 font-medium block mb-1">Competition Tracks:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {summit.tracks.map((t, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Calendar className="w-4 h-4 text-zinc-500" />
                      <span>Dates: <strong>{summit.date}</strong></span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => handleRegister(summit.id)}
                        disabled={isRegistered}
                        className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          isRegistered
                            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                        }`}
                      >
                        {isRegistered ? (
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
            })}
          </div>

        </div>
      </div>
    </>
  );
}
