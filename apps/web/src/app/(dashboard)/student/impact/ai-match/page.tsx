'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles, Loader2, ArrowRight, CheckCircle2, Clock,
  Users, Globe2, Zap, Star, TrendingUp, RefreshCw,
  ChevronRight, BookOpen, Award, Target, Brain
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { cn } from '@/lib/utils';

interface MatchedProject {
  rank: number;
  score: number;
  matchPercentage: number;
  matchReasons: string[];
  skillMatches: string[];
  project: {
    id: string;
    name: string;
    description: string;
    ngo: { name: string; isVerified: boolean };
    skillsRequired: string[];
    impactPoints: number;
    location?: string;
    duration?: string;
    openings: number;
    sdgNumber?: number;
    _count: { applications: number };
  };
}

const SDG_COLORS: Record<number, string> = {
  1: 'from-red-600 to-red-700', 2: 'from-yellow-600 to-orange-600',
  3: 'from-green-600 to-emerald-600', 4: 'from-red-500 to-rose-600',
  5: 'from-orange-500 to-red-500', 6: 'from-sky-500 to-blue-600',
  7: 'from-yellow-400 to-amber-500', 8: 'from-rose-700 to-rose-800',
  9: 'from-orange-600 to-amber-600', 10: 'from-pink-600 to-rose-700',
  11: 'from-amber-600 to-yellow-600', 12: 'from-amber-500 to-yellow-500',
  13: 'from-green-700 to-teal-700', 14: 'from-blue-600 to-cyan-600',
  15: 'from-green-600 to-lime-600', 16: 'from-blue-700 to-indigo-700',
  17: 'from-blue-600 to-blue-800',
};


function MatchBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'from-emerald-500 to-teal-500' : pct >= 75 ? 'from-blue-500 to-indigo-500' : 'from-amber-500 to-orange-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className={`h-full bg-gradient-to-r ${color} rounded-full`} />
      </div>
      <span className="text-xs font-bold text-white">{pct}%</span>
    </div>
  );
}

function ProjectMatchCard({ match, onApply }: { match: MatchedProject; onApply: (id: string) => void }) {
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const rankColors = ['text-amber-400', 'text-zinc-400', 'text-orange-500', 'text-blue-400', 'text-purple-400'];
  const sdgGrad = SDG_COLORS[match.project.sdgNumber || 1] || 'from-indigo-500 to-purple-600';

  const handleApply = async () => {
    setApplying(true);
    try {
      await api.post(`/impact/ngo-projects/${match.project.id}/apply`, { motivation: 'AI-matched application' });
      setApplied(true);
      toast.success('Applied successfully!', { description: 'The NGO will review your profile.' });
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'Could not apply right now. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: match.rank * 0.1 }}
      className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all">
      <div className="flex items-start gap-4">
        {/* Rank badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className={`text-2xl font-black ${rankColors[match.rank - 1] || 'text-zinc-400'}`}>#{match.rank}</div>
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${sdgGrad} flex items-center justify-center text-xs font-bold text-white`}>
            {match.project.sdgNumber || '?'}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + org */}
          <h3 className="text-white font-bold text-sm leading-snug mb-0.5">{match.project.name}</h3>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-indigo-400 font-medium">{match.project.ngo.name}</span>
            {match.project.ngo.isVerified && <CheckCircle2 className="w-3 h-3 text-blue-400" />}
          </div>

          {/* AI Match score */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-purple-400">AI Match Score</span>
            </div>
            <MatchBar pct={match.matchPercentage} />
          </div>

          {/* Reasons */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {match.matchReasons.map(r => (
              <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 font-medium">
                ✓ {r}
              </span>
            ))}
          </div>

          {/* Description */}
          <p className="text-xs text-zinc-500 leading-relaxed mb-3 line-clamp-2">{match.project.description}</p>

          {/* Meta */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            {match.project.duration && (
              <span className="flex items-center gap-1 text-zinc-500"><Clock className="w-3 h-3" />{match.project.duration}</span>
            )}
            {match.project.location && (
              <span className="flex items-center gap-1 text-zinc-500"><Globe2 className="w-3 h-3" />{match.project.location}</span>
            )}
            <span className="flex items-center gap-1 text-amber-400 font-semibold"><Star className="w-3 h-3" />{match.project.impactPoints} XP</span>
            <span className="flex items-center gap-1 text-zinc-500"><Users className="w-3 h-3" />{match.project.openings} spots</span>
          </div>

          {/* Skills */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {match.project.skillsRequired.map(skill => (
              <span key={skill} className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium border',
                match.skillMatches.some(m => m.toLowerCase() === skill.toLowerCase())
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-500')}>
                {skill}
              </span>
            ))}
          </div>

          {/* Apply button */}
          <button onClick={handleApply} disabled={applied || applying}
            className={cn('flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all',
              applied
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-default'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20')}>
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            {applied ? 'Applied!' : applying ? 'Applying...' : 'Apply Now'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function AIMatchPage() {
  const [matches, setMatches] = useState<MatchedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchMatches = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get('/impact/ai-match');
      setMatches(res.data?.length ? res.data.map((m: any, i: number) => ({
        rank: i + 1,
        score: m.score || 80,
        matchPercentage: m.matchPercentage || 80,
        matchReasons: m.matchReasons || ['Recommended for you'],
        skillMatches: m.skillMatches || [],
        project: m.project,
      })) : []);
      setLoadError(false);
    } catch {
      setMatches([]);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchMatches(); }, []);

  return (
    <>
      <Topbar title="🤖 AI Project Matching" subtitle="Personalized project recommendations based on your skills and interests" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Hero */}
          <div className="bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent border border-purple-500/20 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/30">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-white font-bold text-base mb-1">Your Personalized Top 5 Projects</h2>
                <p className="text-zinc-400 text-xs leading-relaxed mb-3">
                  Our AI analyzed your skills profile, enrolled courses, and interests to surface the 5 projects where you'll have the highest impact and best chance of acceptance.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Skill matching', 'Course alignment', 'Acceptance rate', 'Impact potential'].map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 font-medium">
                      ✦ {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => fetchMatches(true)} disabled={refreshing}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex-shrink-0">
                <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Match cards */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-purple-400" />
                </div>
                <div className="absolute -inset-1 rounded-2xl border border-purple-500/30 animate-ping opacity-30" />
              </div>
              <p className="text-zinc-400 text-sm font-medium">AI is analyzing your profile...</p>
              <p className="text-zinc-600 text-xs">Matching skills, courses, and interests</p>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
                  <Brain className="w-8 h-8 text-purple-400 mx-auto mb-3" />
                  <p className="font-semibold text-white">{loadError ? 'Couldn’t reach the matching service' : 'No matches yet'}</p>
                  <p className="text-sm text-zinc-500 mt-1">
                    {loadError ? 'Please try again in a moment.' : 'Add skills to your profile and check back as NGOs post new projects.'}
                  </p>
                </div>
              )}
              {matches.map(match => (
                <ProjectMatchCard key={match.project.id} match={match} onApply={() => {}} />
              ))}
            </div>
          )}

          {/* Tips */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-amber-400" /> Improve Your Matches</h3>
            <div className="space-y-2">
              {[
                { tip: 'Add more skills to your profile', href: '/student/skills' },
                { tip: 'Enroll in relevant SDG courses', href: '/student/courses' },
                { tip: 'Complete your career profile', href: '/student/career' },
              ].map(({ tip, href }) => (
                <a key={tip} href={href} className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all group">
                  <span className="text-xs text-zinc-400 group-hover:text-white transition-colors">{tip}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
