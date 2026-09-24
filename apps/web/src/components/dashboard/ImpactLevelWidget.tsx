'use client';

import { Star, ChevronRight, Zap, Trophy, Users, Clock, Target } from 'lucide-react';

const LEVELS = [
  { level: 1, name: 'Newcomer', emoji: '🌱', xpRequired: 0 },
  { level: 2, name: 'Contributor', emoji: '🌿', xpRequired: 100 },
  { level: 3, name: 'Advocate', emoji: '⭐', xpRequired: 300 },
  { level: 4, name: 'Leader', emoji: '🔥', xpRequired: 600 },
  { level: 5, name: 'Change Maker', emoji: '🌟', xpRequired: 1000 },
  { level: 6, name: 'Visionary', emoji: '💎', xpRequired: 1500 },
  { level: 7, name: 'Legend', emoji: '🏆', xpRequired: 2500 },
];

interface ImpactLevelWidgetProps {
  level?: number;
  xp?: number;
  projectsCompleted?: number;
  ngoVerifications?: number;
  mentorCount?: number;
  volunteerHours?: number;
}

export function ImpactLevelWidget({
  level = 5,
  xp = 1200,
  projectsCompleted = 3,
  ngoVerifications = 1,
  mentorCount = 2,
  volunteerHours = 280,
}: ImpactLevelWidgetProps) {
  const currentLevel = LEVELS.find(l => l.level === level) || LEVELS[0];
  const nextLevel = LEVELS.find(l => l.level === level + 1);

  const xpForNext = nextLevel ? nextLevel.xpRequired : currentLevel.xpRequired;
  const xpInLevel = xp - currentLevel.xpRequired;
  const xpNeeded = xpForNext - currentLevel.xpRequired;
  const progress = nextLevel ? Math.min((xpInLevel / xpNeeded) * 100, 100) : 100;

  // Requirements for next level
  const requirements = nextLevel ? [
    { label: 'Complete 2 more projects', current: projectsCompleted, target: 5, icon: Target },
    { label: 'Get verified by 2 NGOs', current: ngoVerifications, target: 2, icon: Trophy },
    { label: 'Mentor 5 students', current: mentorCount, target: 5, icon: Users },
    { label: '350 volunteer hours', current: volunteerHours, target: 350, icon: Clock },
  ] : [];

  const nextPerks = nextLevel ? [
    'Featured on "Top Changemakers"',
    'Direct messaging with NGOs',
    'Priority project matching',
  ] : [];

  return (
    <div className="card p-4">
      {/* Current Level */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm shadow-sm">
            {currentLevel.emoji}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-900 dark:text-white font-bold text-sm">Level {currentLevel.level}</span>
              <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">&quot;{currentLevel.name}&quot;</span>
            </div>
            <div className="text-[10px] text-zinc-500">{xp} XP total</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs text-amber-600 dark:text-amber-400 font-bold">{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
          <span>Progress to Level {nextLevel?.level || '∞'}</span>
          <span>{xpInLevel}/{xpNeeded} XP</span>
        </div>
        <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Requirements */}
      {requirements.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Next Level Requirements</p>
          <div className="space-y-1.5">
            {requirements.map((req) => {
              const pct = Math.min((req.current / req.target) * 100, 100);
              const done = pct >= 100;
              const Icon = req.icon;
              return (
                <div key={req.label} className="flex items-center gap-2">
                  <Icon className={`w-3 h-3 flex-shrink-0 ${done ? 'text-emerald-500 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-600'}`} />
                  <span className={`text-[11px] flex-1 ${done ? 'text-emerald-600 dark:text-emerald-400 line-through' : 'text-zinc-600 dark:text-zinc-400'}`}>
                    {req.label}
                  </span>
                  <span className={`text-[10px] font-bold ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>
                    {req.current}/{req.target}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Perks Preview */}
      {nextPerks.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-white/[0.05]">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">Next Level Unlocks</p>
          {nextPerks.map(perk => (
            <div key={perk} className="flex items-center gap-1.5 mb-1">
              <ChevronRight className="w-3 h-3 text-purple-500 flex-shrink-0" />
              <span className="text-[11px] text-purple-600 dark:text-purple-300">{perk}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
