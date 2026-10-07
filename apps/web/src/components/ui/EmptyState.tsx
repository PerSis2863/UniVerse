'use client';

import type { LucideIcon } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';
import Link from '@/components/ui/Link';

// What a list or page shows when there's nothing in it yet: an icon, a title, a one-line hint and
// (when there's something to do about it) one main action. Keep the hint to one sentence.

type Action = { label: string; onClick?: () => void; href?: string; icon?: LucideIcon };

export function EmptyState({ icon: Icon, title, hint, action, className, compact }: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: Action;
  className?: string;
  /** Smaller, for inside a card or a side panel. */
  compact?: boolean;
}) {
  const A = action?.icon;
  const button = action && (action.href ? (
    <Link href={action.href} className="btn-primary btn-sm">{A && <A className="w-4 h-4" />}{action.label}</Link>
  ) : (
    <button type="button" onClick={action.onClick} className="btn-primary btn-sm">{A && <A className="w-4 h-4" />}{action.label}</button>
  ));
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className={cn('flex flex-col items-center text-center', compact ? 'py-6 px-4' : 'py-12 px-6', className)}>
      <div className={cn('rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500 dark:text-indigo-300 flex items-center justify-center', compact ? 'w-11 h-11 mb-3' : 'w-14 h-14 mb-4')}>
        <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6'} aria-hidden />
      </div>
      <p className={cn('font-semibold text-zinc-900 dark:text-white', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">{hint}</p>}
      {button && <div className="mt-4">{button}</div>}
    </motion.div>
  );
}
