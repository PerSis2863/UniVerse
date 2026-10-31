'use client';

import { m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// A level gauge (M50, after the "Waypoint" video's fleet cards): a half bowl whose liquid rises to
// the level on arrival (a transform), its wavy surface sliding slowly (CSS, `.tank-wave`; still with
// Reduce Motion). For how far a shipment has come, a budget left, a week's goal.

const FILL = { pink: '#ec4899', green: '#10b981', gold: '#e9c46a' } as const;

export function Tank({ pct, tone = 'pink', label, className }: { pct: number; tone?: keyof typeof FILL; label: string; className?: string }) {
  const level = Math.max(0, Math.min(100, pct));
  const fill = FILL[tone];
  return (
    <span role="img" aria-label={`${label}: ${Math.round(level)}%`}
      className={cn('relative inline-block h-8 w-16 shrink-0 overflow-hidden rounded-b-full bg-zinc-900/[0.06] ring-1 ring-inset ring-zinc-900/10 dark:bg-white/[0.06] dark:ring-white/10', className)}>
      <motion.span aria-hidden className="absolute inset-0" initial={{ y: '100%' }} animate={{ y: `${100 - level}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
        <span className="absolute inset-0 top-1" style={{ background: fill, opacity: 0.85 }} />
        <span className="tank-wave absolute -top-0.5 start-0 h-2 w-[200%]" style={{ background: `radial-gradient(circle at 8px 8px, ${fill} 6px, transparent 6.5px) 0 0 / 16px 8px repeat-x`, opacity: 0.85 }} />
      </motion.span>
      <span aria-hidden className="absolute inset-x-0 top-1 text-center text-[11px] font-bold tabular-nums text-zinc-900 dark:text-white">{Math.round(level)}%</span>
    </span>
  );
}
