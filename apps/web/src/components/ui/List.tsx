'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from '@/components/ui/Link';

// iOS grouped lists (Settings style): a section with an optional header and footer, holding cells
// separated by hairlines. Cells can link somewhere, run an action, or just show a value.

export function ListSection({ header, footer, children, className }: { header?: string; footer?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      {header && <h3 className="ios-section-header">{header}</h3>}
      <div className="ios-list inset-separators">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{footer}</p>}
    </section>
  );
}

type CellProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A coloured tile on the left (pass a Tailwind background, e.g. "bg-indigo-500"). */
  icon?: LucideIcon;
  iconBg?: string;
  /** Shown on the right (a value, a badge, a switch). */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  className?: string;
};

export function Cell({ title, subtitle, icon: Icon, iconBg = 'bg-indigo-500', trailing, href, onClick, destructive, className }: CellProps) {
  const body = (
    <>
      {Icon && <span className={cn('ios-icon-tile', iconBg)}><Icon className="w-4 h-4" aria-hidden /></span>}
      <span className="flex-1 min-w-0 text-left">
        <span className={cn('block text-[0.9375rem] truncate', destructive ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{title}</span>
        {subtitle && <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">{trailing}</span>}
      {(href || onClick) && !trailing && <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />}
    </>
  );
  const cls = cn('ios-cell w-full', (href || onClick) && 'hover:bg-zinc-50 dark:hover:bg-white/[0.03] active:bg-zinc-100 dark:active:bg-white/[0.06]', className);
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
