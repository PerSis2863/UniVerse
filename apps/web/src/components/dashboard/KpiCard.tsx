'use client';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { m as motion } from 'framer-motion';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  color?: 'indigo' | 'cyan' | 'green' | 'amber' | 'rose' | 'emerald' | 'fuchsia';
}

const colors = {
  indigo: 'text-zinc-900 dark:text-zinc-100',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
};

export function KpiCard({ title, value, icon: Icon, change, color = 'indigo' }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <motion.div 
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="kpi-card glass-hover"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('karma-icon', colors[color])}>
          <Icon className="w-5 h-5" strokeWidth={1.6} aria-hidden />
        </div>
        {change !== undefined && change !== 0 && (
          <div className={cn('flex items-center gap-1 text-xs font-medium', isPositive ? 'text-green-400' : 'text-rose-400')}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-1 tabular-nums">{value}</div>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{title}</div>
    </motion.div>
  );
}
