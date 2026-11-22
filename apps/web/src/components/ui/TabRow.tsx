'use client';

import { m as motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';

// An app's row of page tabs (Trace's since M50, Travel's since M213): icon pills, the chosen one filled with
// the app's colour (its button pair, --cta and --cta-ink, so the text always reads), gliding between tabs on a spring. Scrolls sideways on phones.

export interface RowTab { href: string; label: string; icon: LucideIcon; on: boolean }

/** `keep`: a row inside a page of a menu without sections in the top bar (Student life → Green living, M395) stays shown. */
export function TabRow({ label, glide, tabs, keep }: { label: string; glide: string; tabs: RowTab[]; keep?: boolean }) {
  return (
    // M370: on a computer whose menu is the bar across the top, these sections are in that bar (TopNav), so not here.
    <nav aria-label={label} className={cn('-mx-1 overflow-x-auto scrollbar-none', !keep && 'topnav:hidden')}>
      <ul className="flex gap-1 px-1 min-w-max">
        {tabs.map((t) => (
          <li key={t.href} className="relative">
            <Link href={t.href} aria-current={t.on ? 'page' : undefined} className={cn('relative z-10 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors', t.on ? 'text-[var(--cta-ink)]' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white')}>
              <t.icon className="w-4 h-4" aria-hidden />{t.label}
            </Link>
            {t.on && <motion.span layoutId={glide} className="absolute inset-0 rounded-full bg-[var(--cta)] shadow-[0_0_0_1px_rgb(var(--tint-rgb)/0.35),0_8px_24px_-8px_rgb(var(--tint-rgb)/0.55)]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
          </li>
        ))}
      </ul>
    </nav>
  );
}
