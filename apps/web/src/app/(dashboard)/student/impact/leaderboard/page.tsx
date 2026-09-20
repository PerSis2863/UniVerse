'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Star, TrendingUp, Users, ArrowUp, ArrowDown, Minus, Search } from 'lucide-react';
import { useLanguageStore } from '@/store/language';

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  initials: string;
  points: number;
  trend: 'up' | 'down' | 'same';
  trendValue?: number;
  badges: string[];
  gradient: string;
  isCurrentUser?: boolean;
}

const LEADERBOARD_DATA: LeaderboardEntry[] = [
  { rank: 1, id: 'u1', name: 'Riya Sharma', initials: 'RS', points: 15420, trend: 'same', badges: ['Top 1%', 'Startup Founder'], gradient: 'from-amber-400 to-orange-500' },
  { rank: 2, id: 'u2', name: 'Marco Delgado', initials: 'MD', points: 14850, trend: 'up', trendValue: 2, badges: ['Top 1%', 'NGO Partner'], gradient: 'from-zinc-300 to-zinc-400' },
  { rank: 3, id: 'u3', name: 'Amara Osei', initials: 'AO', points: 14200, trend: 'down', trendValue: 1, badges: ['Top 1%'], gradient: 'from-amber-700 to-amber-900' },
  { rank: 4, id: 'u4', name: 'Lena Brandt', initials: 'LB', points: 12400, trend: 'up', trendValue: 4, badges: ['Top 5%'], gradient: 'from-blue-500 to-indigo-600' },
  { rank: 5, id: 'u5', name: 'Jean-Paul Mutombo', initials: 'JM', points: 11800, trend: 'same', badges: ['Top 5%'], gradient: 'from-emerald-500 to-teal-600' },
  { rank: 6, id: 'u6', name: 'Student User', initials: 'SU', points: 10500, trend: 'up', trendValue: 12, badges: ['Top 10%', 'Rising Star'], gradient: 'from-indigo-500 to-purple-600', isCurrentUser: true },
  { rank: 7, id: 'u7', name: 'Sofia Chen', initials: 'SC', points: 9800, trend: 'down', trendValue: 2, badges: ['Top 10%'], gradient: 'from-pink-500 to-rose-600' },
  { rank: 8, id: 'u8', name: 'Aarav Patel', initials: 'AP', points: 9200, trend: 'same', badges: ['Top 10%'], gradient: 'from-cyan-500 to-blue-600' },
  { rank: 9, id: 'u9', name: 'Sarah Johnson', initials: 'SJ', points: 8900, trend: 'up', trendValue: 1, badges: ['Top 25%'], gradient: 'from-violet-500 to-fuchsia-600' },
  { rank: 10, id: 'u10', name: 'David Kim', initials: 'DK', points: 8500, trend: 'down', trendValue: 3, badges: ['Top 25%'], gradient: 'from-emerald-400 to-cyan-500' },
];

export default function LeaderboardPage() {
  const [search, setSearch] = useState('');
  const [timeframe, setTimeframe] = useState('All Time');
  const { t } = useLanguageStore();

  const timeframes = ['This Week', 'This Month', 'This Semester', 'All Time'];
  
  const filtered = LEADERBOARD_DATA.filter(user => 
    user.name.toLowerCase().includes(search.toLowerCase())
  );

  const top3 = LEADERBOARD_DATA.slice(0, 3);
  const rest = filtered.filter(u => u.rank > 3);

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30';
    if (rank === 2) return 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30';
    if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-500/30';
    return 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700/50';
  };

  const getTrendIcon = (trend: string, val?: number) => {
    if (trend === 'up') return <div className="flex items-center text-emerald-500"><ArrowUp className="w-3 h-3 mr-0.5" />{val}</div>;
    if (trend === 'down') return <div className="flex items-center text-red-500"><ArrowDown className="w-3 h-3 mr-0.5" />{val}</div>;
    return <div className="flex items-center text-zinc-400"><Minus className="w-3 h-3" /></div>;
  };

  return (
    <>
      <Topbar 
        title="🏆 Impact Leaderboard" 
        subtitle="See how you rank among your peers in driving social change." 
      />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-6 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border-indigo-500/20">
              <div className="flex items-center gap-3 mb-2 text-indigo-600 dark:text-indigo-400">
                <Trophy className="w-5 h-5" />
                <h3 className="font-bold text-sm">Your Global Rank</h3>
              </div>
              <div className="text-4xl font-black text-zinc-900 dark:text-white">#6</div>
              <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                <ArrowUp className="w-3 h-3 text-emerald-500" /> Up 12 spots this week
              </div>
            </div>
            
            <div className="card p-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
              <div className="flex items-center gap-3 mb-2 text-emerald-600 dark:text-emerald-400">
                <Star className="w-5 h-5" />
                <h3 className="font-bold text-sm">Total Impact Points</h3>
              </div>
              <div className="text-4xl font-black text-zinc-900 dark:text-white">10.5k</div>
              <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                Top 10% of all students
              </div>
            </div>

            <div className="card p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20">
              <div className="flex items-center gap-3 mb-2 text-amber-600 dark:text-amber-400">
                <Users className="w-5 h-5" />
                <h3 className="font-bold text-sm">Active Participants</h3>
              </div>
              <div className="text-4xl font-black text-zinc-900 dark:text-white">4,280</div>
              <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                Across 12 different programs
              </div>
            </div>
          </div>

          {/* Podium (Top 3) */}
          {search === '' && (
            <div className="flex items-end justify-center gap-2 sm:gap-6 pt-10 pb-6 px-4">
              {/* 2nd Place */}
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                className="flex flex-col items-center flex-1 max-w-[140px]">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br ${top3[1].gradient} border-4 border-white dark:border-zinc-900 shadow-xl flex items-center justify-center text-white text-xl sm:text-2xl font-black mb-3 z-10`}>
                  {top3[1].initials}
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800/80 rounded-t-2xl border-t border-x border-zinc-200 dark:border-zinc-700/50 pt-8 pb-4 px-2 text-center -mt-10 relative">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-zinc-200 dark:bg-zinc-700 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">2</div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white truncate w-full">{top3[1].name}</div>
                  <div className="text-xs text-zinc-500 font-medium">{top3[1].points.toLocaleString()} pts</div>
                </div>
              </motion.div>

              {/* 1st Place */}
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                className="flex flex-col items-center flex-1 max-w-[160px] -mt-10">
                <div className="relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-amber-400">
                    <Medal className="w-8 h-8 drop-shadow-lg" />
                  </div>
                  <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br ${top3[0].gradient} border-4 border-amber-400 shadow-2xl shadow-amber-500/20 flex items-center justify-center text-white text-2xl sm:text-3xl font-black mb-3 z-10 relative`}>
                    {top3[0].initials}
                  </div>
                </div>
                <div className="w-full bg-gradient-to-b from-amber-500/10 to-transparent dark:from-amber-500/5 dark:to-zinc-800/50 rounded-t-2xl border-t border-x border-amber-500/20 pt-10 pb-6 px-2 text-center -mt-12 relative shadow-[0_-10px_30px_-15px_rgba(245,158,11,0.3)]">
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-amber-400 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-sm font-black text-amber-900">1</div>
                  <div className="font-bold text-base text-zinc-900 dark:text-white truncate w-full">{top3[0].name}</div>
                  <div className="text-sm text-amber-600 dark:text-amber-400 font-bold">{top3[0].points.toLocaleString()} pts</div>
                </div>
              </motion.div>

              {/* 3rd Place */}
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                className="flex flex-col items-center flex-1 max-w-[140px]">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br ${top3[2].gradient} border-4 border-white dark:border-zinc-900 shadow-xl flex items-center justify-center text-white text-xl sm:text-2xl font-black mb-3 z-10`}>
                  {top3[2].initials}
                </div>
                <div className="w-full bg-orange-50 dark:bg-orange-950/20 rounded-t-2xl border-t border-x border-orange-200 dark:border-orange-900/30 pt-8 pb-4 px-2 text-center -mt-10 relative">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-orange-300 dark:bg-orange-800 rounded-full border-4 border-white dark:border-zinc-900 flex items-center justify-center text-xs font-bold text-orange-900 dark:text-orange-200">3</div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white truncate w-full">{top3[2].name}</div>
                  <div className="text-xs text-orange-600 dark:text-orange-500 font-medium">{top3[2].points.toLocaleString()} pts</div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 mt-8">
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
              {timeframes.map(t => (
                <button key={t} onClick={() => setTimeframe(t)}
                  className={cn("px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                    timeframe === t ? "bg-zinc-900 dark:bg-white text-white dark:text-black shadow-lg" : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50")}>
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
              <div className="col-span-2 text-center">Rank</div>
              <div className="col-span-6">Student</div>
              <div className="col-span-2 text-right">Points</div>
              <div className="col-span-2 text-center">Trend</div>
            </div>
            
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {(search !== '' ? filtered : rest).map((user, i) => (
                <motion.div key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className={cn("grid grid-cols-4 sm:grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.02]", 
                    user.isCurrentUser ? "bg-indigo-50/50 dark:bg-indigo-500/5" : "")}>
                  
                  {/* Rank */}
                  <div className="col-span-1 sm:col-span-2 flex justify-center">
                    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border", getRankColor(user.rank))}>
                      {user.rank}
                    </span>
                  </div>

                  {/* Student */}
                  <div className="col-span-3 sm:col-span-6 flex items-center gap-3 overflow-hidden">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.gradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {user.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-2">
                        {user.name}
                        {user.isCurrentUser && <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">You</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1 hidden sm:flex">
                        {user.badges.map(badge => (
                          <span key={badge} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700">
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Points */}
                  <div className="hidden sm:block col-span-2 text-right">
                    <div className="font-bold text-zinc-900 dark:text-white">{user.points.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-500">pts</div>
                  </div>

                  {/* Trend */}
                  <div className="hidden sm:flex col-span-2 justify-center font-semibold text-xs">
                    {getTrendIcon(user.trend, user.trendValue)}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          
        </div>
      </div>
    </>
  );
}
