'use client';

import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Shared motion for hand-made tab bars, so every one glides like the menus:
// - <TabPill id="…" />: the selected tab's highlight. Put it inside the selected button (which needs
//   `relative isolate`); with the same `id` it glides from the old tab to the new one.
// - <TabPanel k={tab}>: the section under the tabs. A new tab's content rises in quickly (no exit
//   wait, so the information shows at once). Transform and opacity only.

/** Two-tone capsule (`pill`) or underline (`line`) that glides between tabs sharing an id. */
export function TabPill({ id, variant = 'pill', className }: { id: string; variant?: 'pill' | 'line' | 'soft'; className?: string }) {
  return (
    <motion.span
      layoutId={id}
      transition={spring.snappy}
      aria-hidden
      className={cn(
        'absolute -z-10 pointer-events-none',
        variant === 'line'
          ? 'inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500'
          : variant === 'soft'
            ? 'inset-0 rounded-[inherit] bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10 ring-1 ring-indigo-400/20 dark:from-indigo-500/30 dark:to-fuchsia-500/20'
            : 'inset-0 rounded-[inherit] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_6px_18px_-8px_rgba(139,92,246,0.8)]',
        className,
      )}
    />
  );
}

/** The content under a tab bar: re-mounts per tab and rises in. */
export function TabPanel({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }} className={className}>
      {children}
    </motion.div>
  );
}
