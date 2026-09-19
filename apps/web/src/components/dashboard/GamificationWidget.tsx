import { motion } from 'framer-motion';
import { Flame, Award, Trophy, Zap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const BADGES = [
  { id: '1', name: 'Early Bird', description: 'Submitted 5 assignments early', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: '2', name: 'Perfect Attendance', description: '100% attendance in a month', icon: Target, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: '3', name: 'Top 10%', description: 'Ranked top 10% in quizzes', icon: Trophy, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
];

export function GamificationWidget() {
  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-indigo-500" /> My Achievements
        </h2>
        <span className="text-xs font-bold text-indigo-500 bg-indigo-500/10 px-2.5 py-1 rounded-full">Level 12</span>
      </div>

      {/* XP Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-zinc-500 font-medium">XP Progress to Level 13</span>
          <span className="text-zinc-900 dark:text-white font-bold">12,450 / 15,000</span>
        </div>
        <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '83%' }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500"
          />
        </div>
      </div>

      {/* Streak Info */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 mb-6">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
          <Flame className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-zinc-900 dark:text-white text-lg leading-tight">14 Day Streak!</h3>
          <p className="text-xs text-zinc-500">Log in tomorrow to keep the flame alive.</p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex-1">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Recent Badges</h3>
        <div className="space-y-3">
          {BADGES.map((badge, i) => (
            <motion.div 
              whileHover={{ scale: 1.02 }}
              key={badge.id} 
              className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:shadow-sm transition-all"
            >
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", badge.bg, badge.color)}>
                <badge.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{badge.name}</h4>
                <p className="text-xs text-zinc-500">{badge.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
