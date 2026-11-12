'use client';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { m as motion } from 'framer-motion';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  /** shortcut: kept so callers needn't change; since M134 (Ballast) every tile's icon is plain grey. */
  color?: 'indigo' | 'cyan' | 'green' | 'amber' | 'rose' | 'emerald' | 'fuchsia';
}


export function KpiCard({ title, value, icon: Icon, change }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <motion.div 
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="kpi-card glass-hover"
    >
      {/* M134: as the Ballast reels' metric cards: the name on top with a small grey icon, the figure
          under it, a change as a small tinted badge beside it. */}
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-semibold text-zinc-900 dark:text-white">{title}</div>
        <Icon className="w-4 h-4 shrink-0 text-zinc-400" strokeWidth={1.8} aria-hidden />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-[26px] leading-none font-semibold tracking-tight text-zinc-900 dark:text-white tabular-nums">{value}</div>
        {change !== undefined && change !== 0 && (
          <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold', isPositive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300')}>
            {isPositive ? <TrendingUp className="w-3 h-3" aria-hidden /> : <TrendingDown className="w-3 h-3" aria-hidden />}
            {isPositive ? '+' : '−'}{Math.abs(change)}%
          </span>
        )}
      </div>
    </motion.div>
  );
}
