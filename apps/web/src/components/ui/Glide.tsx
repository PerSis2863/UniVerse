'use client';

import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Shared motion for hand-made tab bars, so every one glides like the menus:
// - <TabPill id="…" />: the selected tab's highlight. Put it inside the selected button (which needs
//   `relative isolate`); with the same `id` it glides from the old tab to the new one.
// - <TabPanel k={tab}>: the section under the tabs. A new tab's content rises in quickly (no exit
//   wait, so the information shows at once). Transform and opacity only.

/** Ink capsule (`pill`), soft fill (`soft`) or underline (`line`) that glides between tabs sharing an id (M4: the Cadra look). */
export function TabPill({ id, variant = 'pill', className }: { id: string; variant?: 'pill' | 'line' | 'soft'; className?: string }) {
  return (
    <motion.span
      layoutId={id}
      transition={spring.snappy}
      aria-hidden
      className={cn(
        'absolute -z-10 pointer-events-none',
        variant === 'line'
          ? 'inset-x-2 -bottom-px h-0.5 rounded-full bg-zinc-900 dark:bg-white'
          : variant === 'soft'
            ? 'inset-0 rounded-[inherit] bg-zinc-900/[0.07] dark:bg-white/[0.1]'
            : 'inset-0 rounded-[inherit] bg-zinc-900 dark:bg-zinc-700 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.6)]',
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
