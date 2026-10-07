'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { m as motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Star,  Users, ArrowUp, ArrowDown, Minus, Search,  Zap,   Copy } from 'lucide-react';

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { toast } from 'sonner';
import { TabPill, TabPanel } from '@/components/ui/Glide';

interface LevelInfo {
  current: { level: number; title: string; color: string; emoji: string; minXP: number };
  next: { level: number; title: string; color: string; emoji: string; minXP: number };
  progress: number;
  xp: number;
}

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  initials: string;
  totalPoints: number;
  trend: 'up' | 'down' | 'same';
  trendValue?: number;
  gradient: string;
  isCurrentUser?: boolean;
  levelInfo?: LevelInfo;
}

const LEVEL_GRADIENTS: Record<number, string> = {
  1: 'from-zinc-400 to-zinc-600',
  2: 'from-emerald-400 to-teal-600',
  3: 'from-blue-400 to-indigo-600',
  4: 'from-purple-500 to-violet-600',
  5: 'from-amber-400 to-orange-500',
  6: 'from-red-500 to-rose-600',
  7: 'from-amber-300 via-orange-400 to-pink-500',
};

const LEVELS = [
  { level: 1, title: 'Changemaker Seed',  minXP: 0,    emoji: '🌱' },
  { level: 2, title: 'Impact Explorer',   minXP: 100,  emoji: '🌿' },
  { level: 3, title: 'Social Innovator',  minXP: 300,  emoji: '⚡' },
  { level: 4, title: 'SDG Champion',      minXP: 600,  emoji: '🏅' },
  { level: 5, title: 'Global Catalyst',   minXP: 1000, emoji: '🌍' },
  { level: 6, title: 'Visionary Leader',  minXP: 1500, emoji: '🚀' },
  { level: 7, title: 'UniVerse Legend',   minXP: 2500, emoji: '🌟' },
];


function MyScoreCard({ entry, levelInfo }: { entry: LeaderboardEntry | null; levelInfo: LevelInfo | null }) {
  const info = levelInfo || entry?.levelInfo;
  if (!info) return null;
  const xpToNext = info.next.minXP - info.current.minXP;
  const xpDone = Math.max(0, (info.xp || 0) - info.current.minXP);

  const shareTwitter = () => {
    const text = `🏆 I'm a Level ${info.current.level} "${info.current.emoji} ${info.current.title}" on UniVerse Impact with ${info.xp?.toLocaleString()} XP!\n\nDriving real-world social change — SDGs, NGOs, and more 🌍\n#SocialImpact #UniVerse`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${LEVEL_GRADIENTS[info.current.level]} flex items-center justify-center text-2xl shadow-lg`}>
            {info.current.emoji}
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-0.5">Your Level</div>
            <div className="text-white font-black text-lg">Lv.{info.current.level} — {info.current.title}</div>
            <div className="text-xs text-zinc-400">{(info.xp || 0).toLocaleString()} XP total</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={shareTwitter} className="flex items-center gap-1.5 text-xs bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 px-3 py-2 rounded-xl transition-all font-semibold">
            <TwitterIcon className="w-3.5 h-3.5" /> Share
          </button>
          <button onClick={() => { navigator.clipboard.writeText(`I'm Level ${info.current.level} "${info.current.title}" on UniVerse Impact! 🌍`); toast.success('Copied!'); }}
            className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white px-3 py-2 rounded-xl transition-all">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* XP Progress bar */}
      <div className="mt-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-zinc-500">Progress to Level {info.next.level} {info.next.emoji} {info.next.title}</span>
          <span className="text-xs font-bold text-white">{xpDone} / {xpToNext} XP</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${info.progress}%` }} transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full bg-gradient-to-r ${LEVEL_GRADIENTS[info.current.level]} rounded-full relative`}>
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          </motion.div>
        </div>
      </div>

      {/* Rank info */}
      {entry && (
        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-400" /> Rank <span className="text-white font-bold">#{entry.rank}</span></span>
          {entry.trend === 'up' && <span className="flex items-center gap-1 text-emerald-400"><ArrowUp className="w-3 h-3" /> +{entry.trendValue} this week</span>}
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const [search, setSearch] = useState('');
  const [timeframe, setTimeframe] = useState('All Time');
  const [showLevels, setShowLevels] = useState(false);

  const timeframes = ['This Week', 'This Month', 'This Semester', 'All Time'];
  const PERIOD: Record<string, string> = { 'This Week': 'week', 'This Month': 'month', 'This Semester': 'semester', 'All Time': 'all' };

  // The time buttons choose whose points count: earned this week, month, semester, or ever.

  type ApiEntry = { id: string; name?: string | null; totalPoints?: number; levelInfo?: LevelInfo };
  const { data: board, isLoading: loadingBoard } = useSWR<ApiEntry[]>(`/impact/leaderboard?period=${PERIOD[timeframe] ?? 'all'}`, fetcher, { keepPreviousData: true });
  const { data: myLevelInfo = null } = useSWR<LevelInfo>('/impact/my-level', fetcher);
  const loading = loadingBoard && !board;
  const meId = useAuthStore((st) => st.user?.id);
  const leaderboard: LeaderboardEntry[] = (board ?? []).map((user, index) => ({
    rank: index + 1,
    id: user.id,
    name: user.name || 'Anonymous',
    initials: user.name?.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'U',
    totalPoints: user.totalPoints || 0,
    trend: 'same' as const,
    gradient: LEVEL_GRADIENTS[user.levelInfo?.current?.level || 1],
    isCurrentUser: user.id === meId,
    levelInfo: user.levelInfo,
  }));
  const myEntry = leaderboard.find((e) => e.isCurrentUser) || null;

  const filtered = leaderboard.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));
  const top3 = leaderboard.slice(0, 3);
  const rest = (search !== '' ? filtered : leaderboard).filter(u => u.rank > 3);

  const getTrendIcon = (trend: string, val?: number) => {
    if (trend === 'up') return <div className="flex items-center text-emerald-500"><ArrowUp className="w-3 h-3 mr-0.5" />{val}</div>;
    if (trend === 'down') return <div className="flex items-center text-red-500"><ArrowDown className="w-3 h-3 mr-0.5" />{val}</div>;
    return <div className="flex items-center text-zinc-400"><Minus className="w-3 h-3" /></div>;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30';
    if (rank === 2) return 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30';
    if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-500/30';
    return 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700/50';
  };

  return (
    <>
      <Topbar title="🏆 Impact Leaderboard" subtitle="Compete, climb levels, and drive real-world change." />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* My Score Card */}
          <MyScoreCard entry={myEntry} levelInfo={myLevelInfo} />

          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-6 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/20">
              <div className="flex items-center gap-3 mb-2 text-indigo-600 dark:text-indigo-400"><Trophy className="w-5 h-5" /><h3 className="font-bold text-sm">Your Global Rank</h3></div>
              <div className="text-4xl font-black text-zinc-900 dark:text-white">#{myEntry?.rank || '—'}</div>
              <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><ArrowUp className="w-3 h-3 text-emerald-500" /> Up {myEntry?.trendValue || 0} spots this week</div>
            </div>
            <div className="card p-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
              <div className="flex items-center gap-3 mb-2 text-emerald-600 dark:text-emerald-400"><Zap className="w-5 h-5" /><h3 className="font-bold text-sm">Your Impact XP</h3></div>
              <div className="text-4xl font-black text-zinc-900 dark:text-white">{(myLevelInfo?.xp || myEntry?.totalPoints || 0).toLocaleString()}</div>
              <div className="text-xs text-zinc-500 mt-2">Level {myLevelInfo?.current?.level || myEntry?.levelInfo?.current?.level || 1} — {myLevelInfo?.current?.title || myEntry?.levelInfo?.current?.title || 'Changemaker Seed'}</div>
            </div>
            <div className="card p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20">
              <div className="flex items-center gap-3 mb-2 text-amber-600 dark:text-amber-400"><Users className="w-5 h-5" /><h3 className="font-bold text-sm">Active Students</h3></div>
              <div className="text-4xl font-black text-zinc-900 dark:text-white">{leaderboard.length.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 mt-2">On the impact leaderboard</div>
            </div>
          </div>

          {/* Level Map */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <button onClick={() => setShowLevels(v => !v)}
              className="w-full flex items-center justify-between p-4 text-sm font-bold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
              <span className="flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" /> Impact Level Progression</span>
              <span className="text-zinc-400 text-xs">{showLevels ? '▲ Hide' : '▼ Show all levels'}</span>
            </button>
            <AnimatePresence>
              {showLevels && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-0 border-t border-zinc-200 dark:border-zinc-800">
                    {LEVELS.map((lv) => {
                      const isCurrentLevel = (myLevelInfo?.current?.level || 1) === lv.level;
                      return (
                        <div key={lv.level} className={cn('p-4 text-center border-r last:border-0 border-zinc-200 dark:border-zinc-800', isCurrentLevel ? 'bg-indigo-500/5' : '')}>
                          <div className="text-2xl mb-1">{lv.emoji}</div>
                          <div className={`text-xs font-bold mb-0.5 ${isCurrentLevel ? 'text-indigo-400' : 'text-zinc-300 dark:text-zinc-300'}`}>Lv.{lv.level}</div>
                          <div className={`text-[9px] leading-tight ${isCurrentLevel ? 'text-indigo-400' : 'text-zinc-500'}`}>{lv.title}</div>
                          <div className="text-[9px] text-zinc-600 mt-1">{lv.minXP.toLocaleString()} XP</div>
                          {isCurrentLevel && <div className="text-[9px] text-indigo-400 font-bold mt-1 bg-indigo-500/10 rounded-full px-1">YOU</div>}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!loading && leaderboard.length === 0 && (
            <FeatureGuide
              icon={Trophy}
              title="The leaderboard fills up as students make an impact"
              description="Every NGO project, summit and venture you contribute to earns impact XP. The students with the most XP on your campus appear here."
              steps={['Apply to an NGO project from the marketplace', 'Get accepted and complete the work', 'Earn XP, level up and climb the leaderboard']}
              example={<div><ExampleRow title="1. Aanya K." meta="🌍 Global Catalyst" right="1,240 XP" accent="from-amber-400 to-orange-500" /><ExampleRow title="2. You" meta="⚡ Social Innovator" right="340 XP" /></div>}
              action={{ label: 'Find a project', href: '/student/impact/ngo-marketplace' }}
            />
          )}

          {/* Podium */}
          {loading ? (
            <div className="flex justify-center py-20"><ContentSkeleton variant="list" /></div>
          ) : search === '' && top3.length >= 3 && (
            <div className="flex items-end justify-center gap-2 sm:gap-6 pt-10 pb-6 px-4">
              {/* 2nd Place */}
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                className="flex flex-col items-center flex-1 max-w-[140px]">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br ${top3[1].gradient} border-4 border-white dark:border-zinc-900 shadow-xl flex flex-col items-center justify-center text-white font-black mb-3 z-10`}>
                  <span className="text-sm sm:text-base">{top3[1].initials}</span>
                  <span className="text-[8px] opacity-70">{top3[1].levelInfo?.current?.emoji || '🌿'}</span>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800/80 rounded-t-2xl border-t border-x border-zinc-200 dark:border-zinc-700/50 pt-8 pb-4 px-2 text-center -mt-10 relative">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-zinc-200 dark:bg-zinc-700 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">2</div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white truncate w-full">{top3[1].name}</div>
                  <div className="text-xs text-zinc-500 font-medium">{top3[1].totalPoints.toLocaleString()} pts</div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">{top3[1].levelInfo?.current?.title || 'Impact Explorer'}</div>
                </div>
              </motion.div>

              {/* 1st Place */}
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                className="flex flex-col items-center flex-1 max-w-[160px] -mt-10">
                <div className="relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-amber-400"><Medal className="w-8 h-8 drop-shadow-lg" /></div>
                  <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br ${top3[0].gradient} border-4 border-amber-400 shadow-2xl shadow-amber-500/20 flex flex-col items-center justify-center text-white font-black mb-3 z-10 relative`}>
                    <span className="text-base sm:text-xl">{top3[0].initials}</span>
                    <span className="text-[10px] opacity-80">{top3[0].levelInfo?.current?.emoji || '🌟'}</span>
                  </div>
                </div>
                <div className="w-full bg-gradient-to-b from-amber-500/10 to-transparent dark:from-amber-500/5 dark:to-zinc-800/50 rounded-t-2xl border-t border-x border-amber-500/20 pt-10 pb-6 px-2 text-center -mt-12 relative shadow-[0_-10px_30px_-15px_rgba(245,158,11,0.3)]">
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-amber-400 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-sm font-black text-amber-900">1</div>
                  <div className="font-bold text-base text-zinc-900 dark:text-white truncate w-full">{top3[0].name}</div>
                  <div className="text-sm text-amber-600 dark:text-amber-400 font-bold">{top3[0].totalPoints.toLocaleString()} pts</div>
                  <div className="text-[9px] text-amber-500/70 mt-0.5">{top3[0].levelInfo?.current?.title || 'UniVerse Legend'}</div>
                </div>
              </motion.div>

              {/* 3rd Place */}
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                className="flex flex-col items-center flex-1 max-w-[140px]">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br ${top3[2].gradient} border-4 border-white dark:border-zinc-900 shadow-xl flex flex-col items-center justify-center text-white font-black mb-3 z-10`}>
                  <span className="text-sm sm:text-base">{top3[2].initials}</span>
                  <span className="text-[8px] opacity-70">{top3[2].levelInfo?.current?.emoji || '🌍'}</span>
                </div>
                <div className="w-full bg-orange-50 dark:bg-orange-950/20 rounded-t-2xl border-t border-x border-orange-200 dark:border-orange-900/30 pt-8 pb-4 px-2 text-center -mt-10 relative">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-orange-300 dark:bg-orange-800 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-xs font-bold text-orange-900 dark:text-orange-200">3</div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white truncate w-full">{top3[2].name}</div>
                  <div className="text-xs text-orange-600 dark:text-orange-500 font-medium">{top3[2].totalPoints.toLocaleString()} pts</div>
                  <div className="text-[9px] text-orange-400/70 mt-0.5">{top3[2].levelInfo?.current?.title || 'Global Catalyst'}</div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
              {timeframes.map(t => (
                <button key={t} onClick={() => setTimeframe(t)}
                  className={cn('relative isolate px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                    timeframe === t ? 'text-white' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50')}>{timeframe === t && <TabPill id="dent-impact-leaderboard-page-0" />}
                  {t}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-colors" />
            </div>
          </div>

          {/* List */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-4 p-4 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-950/30">
              <div className="col-span-1 text-center">Rank</div>
              <div className="col-span-5">Student</div>
              <div className="col-span-3">Level</div>
              <div className="col-span-2 text-right">XP</div>
              <div className="col-span-1 text-center">Trend</div>
            </div>

            <TabPanel k={timeframe} className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {rest.map((user, i) => (
                <motion.div key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 6) * 0.03 }}
                  className={cn('grid grid-cols-4 sm:grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02]',
                    user.isCurrentUser ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : '')}>

                  <div className="col-span-1 flex justify-center">
                    <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border', getRankColor(user.rank))}>
                      {user.rank}
                    </span>
                  </div>

                  <div className="col-span-3 sm:col-span-5 flex items-center gap-3 overflow-hidden">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.gradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md`}>
                      {user.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-2 text-sm">
                        {user.name}
                        {user.isCurrentUser && <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">You</span>}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:flex col-span-3 items-center gap-2">
                    <span className="text-base">{user.levelInfo?.current?.emoji || '🌱'}</span>
                    <div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-white">Lv.{user.levelInfo?.current?.level || 1}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{user.levelInfo?.current?.title || 'Changemaker Seed'}</div>
                    </div>
                  </div>

                  <div className="hidden sm:block col-span-2 text-right">
                    <div className="font-bold text-zinc-900 dark:text-white">{user.totalPoints.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-500">xp</div>
                  </div>

                  <div className="hidden sm:flex col-span-1 justify-center font-semibold text-xs">
                    {getTrendIcon(user.trend, user.trendValue)}
                  </div>
                </motion.div>
              ))}
            </TabPanel>
          </div>
        </div>
      </div>
    </>
  );
}
