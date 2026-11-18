'use client';
import type { ReactNode } from 'react';
import { ArrowUpRight, LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  /** M282: a line under the figure ("389 of 412 present"). */
  sub?: ReactNode;
  /** M282: where the figure leads; the whole card is then a link. */
  href?: string;
  /** shortcut: kept so callers needn't change; since M134 (Ballast) every tile's icon is plain grey. */
  color?: 'indigo' | 'cyan' | 'green' | 'amber' | 'rose' | 'emerald' | 'fuchsia';
  /** Amber edge: something waits (safety flags, approvals). */
  warn?: boolean;
}

// One figure on a home or a page (M134, M282): the name with a small icon, the figure (numbers grouped: 1,240), a change
// badge, a line under it, and when it leads somewhere the whole card is the link (an arrow shows on hover). Its hover is
// CSS only (.kpi-card in globals.css), so it costs the page's thread nothing; the motion layer counts the figure up.
export function KpiCard({ title, value, icon: Icon, change, sub, href, warn }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const shown = typeof value === 'number' ? value.toLocaleString() : value;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">{title}</div>
        <Icon className="w-4 h-4 shrink-0 text-zinc-400 transition-opacity duration-200 group-hover:opacity-0" strokeWidth={1.8} aria-hidden />
        {href && <ArrowUpRight className="absolute end-5 top-5 w-4 h-4 text-zinc-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-coarse:hidden" aria-hidden />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-[28px] leading-none font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white tabular-nums">{shown}</div>
        {change !== undefined && change !== 0 && (
          <span className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold', isPositive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300')}>
            {isPositive ? <TrendingUp className="w-3 h-3" aria-hidden /> : <TrendingDown className="w-3 h-3" aria-hidden />}
            {isPositive ? '+' : '−'}{Math.abs(change)}%
          </span>
        )}
      </div>
      {sub && <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{sub}</div>}
    </>
  );
  const cls = cn('kpi-card group h-full', warn && 'ring-1 ring-amber-500/50');
  return href ? <Link href={href} className={cn(cls, 'block')}>{body}</Link> : <div className={cls}>{body}</div>;
}
