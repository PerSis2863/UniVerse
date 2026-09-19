'use client';

import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Award, HeartHandshake, Globe2, Sparkles, Download, CheckCircle2,
  Clock, TrendingUp, ShieldCheck, FileCheck, ExternalLink, Share2
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

export default function MySocialImpactPage() {
  const [showCertModal, setShowCertModal] = useState(false);

  const stats = [
    { label: 'Verified Impact Hours', val: '142 hrs', change: '+18 hrs this term', color: 'text-indigo-400' },
    { label: 'NGO Projects Completed', val: '4 Projects', change: '2 in progress', color: 'text-emerald-400' },
    { label: 'Social Venture Grants', val: '$2,400', change: 'Water.org fellowship', color: 'text-amber-400' },
    { label: 'UN SDG Badges Earned', val: '5 Badges', change: 'Level 3 Fellow', color: 'text-pink-400' },
  ];

  const sdgBadges = [
    { num: 6, name: 'Clean Water & Sanitation', hours: 48, partner: 'UNICEF East Africa', status: 'Completed', color: 'from-cyan-500 to-blue-600' },
    { num: 3, name: 'Good Health & Well-Being', hours: 36, partner: 'Doctors Without Borders', status: 'In Progress', color: 'from-rose-500 to-red-600' },
    { num: 13, name: 'Climate Action', hours: 30, partner: 'Greenpeace International', status: 'Completed', color: 'from-emerald-500 to-teal-600' },
    { num: 4, name: 'Quality Education', hours: 18, partner: 'UNESCO Ed Coalition', status: 'Completed', color: 'from-amber-500 to-orange-600' },
    { num: 17, name: 'Partnerships for the Goals', hours: 10, partner: 'UniVerse Inter-College', status: 'Active', color: 'from-purple-500 to-indigo-600' },
  ];

  const impactActivities = [
    { date: 'Sep 14, 2026', title: 'Water Telemetry Edge IoT Testing', hours: '12 Hours Logged', ngo: 'Water.org & UNICEF', hash: '0x8f2a...91bc' },
    { date: 'Aug 28, 2026', title: 'Multilingual Clinical Translation Validator', hours: '8 Hours Logged', ngo: 'Doctors Without Borders', hash: '0x3c19...45de' },
    { date: 'Jul 15, 2026', title: 'Amazon Rainforest Radar Change Detection', hours: '25 Hours Logged', ngo: 'Greenpeace International', hash: '0x99a1...fa22' },
    { date: 'Jun 02, 2026', title: 'Open-Source Math Simulator for Micro-Schools', hours: '15 Hours Logged', ngo: 'UNESCO Coalition', hash: '0x44b2...87ee' },
  ];

  return (
    <>
      <Topbar
        title="My Social Impact Ledger"
        subtitle="Track your verified humanitarian contributions, NGO research hours, and UN SDG credentials."
        rightNode={
          <button
            onClick={() => setShowCertModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-zinc-900 dark:text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Download className="w-4 h-4" /> Download Certified Transcript
          </button>
        }
      />

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Top Hero Card */}
          <div className="relative rounded-3xl bg-gradient-to-br from-[#0e1628] via-[#111827] to-[#1c1427] border border-zinc-200 dark:border-white/10 p-8 overflow-hidden shadow-2xl">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-indigo-500/20 to-pink-500/20 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
              <div className="space-y-4 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Verified Humanitarian Credential • Level 3 Scholar
                </div>
                <h1 className="text-3xl font-black text-zinc-900 dark:text-white leading-tight">
                  Alex Rivera’s Global Impact Score:{' '}
                  <span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">
                    885 / 1000
                  </span>
                </h1>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Your work across 3 continents with UNICEF and Doctors Without Borders ranks in the top 5% of student researchers across the global university network.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <div className="w-48 bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-500 via-pink-500 to-amber-400 h-full rounded-full" style={{ width: '88.5%' }} />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">88.5% towards Master Fellow</span>
                </div>
              </div>

              {/* Logo Emblem Badge */}
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/10 flex flex-col items-center text-center space-y-3 shadow-xl">
                <UniverseLogo size="lg" animated={true} withGlow={true} />
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">UniVerse Impact Fellow</div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400">Institutional ID: #UV-2026-9042</div>
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
                  Accredited badges awarded upon verification by partner NGOs and supervising deans.
                </p>
              </div>
              <span className="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                5 Badges Unlocked
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                    <span className="text-zinc-500 dark:text-zinc-500">{badge.hours} hrs</span>
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
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Immutable Contribution Ledger</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">All hours digitally signed by partner organizations.</p>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">Consortium Block #491,821</span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {impactActivities.map((act, i) => (
                <div key={i} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-zinc-100 dark:bg-zinc-800/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">{act.title}</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                        {act.ngo} • <span className="text-zinc-500 dark:text-zinc-500">{act.date}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      {act.hours}
                    </span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-500 hidden md:inline">{act.hash}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Certificate Modal */}
          {showCertModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-xl rounded-2xl p-8 space-y-6 shadow-2xl relative">
                
                <div className="border-2 border-indigo-500/30 rounded-2xl p-6 bg-gradient-to-br from-indigo-950/20 via-zinc-950 to-zinc-950 space-y-6 text-center relative">
                  <div className="flex justify-center">
                    <UniverseLogo size="lg" animated={false} withGlow={true} />
                  </div>
                  
                  <div>
                    <span className="text-[10px] tracking-widest uppercase font-bold text-indigo-400">
                      Official Certificate of Global Social Impact
                    </span>
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-white mt-1">Alex Rivera</h2>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      Has achieved Level 3 Distinction with 142 hours of verified humanitarian research and technical contributions across Water.org, UNICEF, and MSF.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-zinc-200 dark:border-zinc-800 text-xs text-left">
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-500">Accreditation Body</div>
                      <div className="font-semibold text-zinc-900 dark:text-white">UniVerse Academic Consortium</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-500">UN SDG Alignments</div>
                      <div className="font-semibold text-zinc-900 dark:text-white">SDG #3, #4, #6, #13, #17</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-500 font-mono">
                    <span>Cert Hash: 0x99B4...F71E</span>
                    <span>Date: Sep 18, 2026</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowCertModal(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      alert('Certified PDF transcript downloaded.');
                      setShowCertModal(false);
                    }}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white flex items-center gap-2 shadow-lg shadow-indigo-600/30"
                  >
                    <Download className="w-4 h-4" /> Download PDF Transcript
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
