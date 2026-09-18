'use client';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  color?: 'indigo' | 'cyan' | 'green' | 'amber' | 'rose';
}

const colors = {
  indigo: 'text-indigo-400 bg-indigo-600/15',
  cyan: 'text-cyan-400 bg-cyan-600/15',
  green: 'text-green-400 bg-green-900/30',
  amber: 'text-amber-400 bg-amber-900/30',
  rose: 'text-rose-400 bg-rose-900/30',
};

export function KpiCard({ title, value, icon: Icon, change, color = 'indigo' }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <div className="kpi-card glass-hover">
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colors[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== undefined && (
          <div className={cn('flex items-center gap-1 text-xs font-medium', isPositive ? 'text-green-400' : 'text-rose-400')}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-black text-white mb-1">{value}</div>
      <div className="text-sm text-zinc-400">{title}</div>
    </div>
  );
}
