'use client';

import { useEffect, useRef } from 'react';
import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { reducedMotion } from '@/lib/page-transition';

// Shared motion for hand-made tab bars, so every one glides like the menus:
// - <TabPill id="…" />: the selected tab's highlight. Put it inside the selected button (which needs
//   `relative isolate`); with the same `id` it glides from the old tab to the new one.
// - <TabPanel k={tab}>: the section under the tabs. A new tab's cards cascade in quickly (no exit
//   wait, so the information shows at once). Transform and opacity only (`useCascade`).

/** Two-tone capsule (`pill`), soft two-tone fill (`soft`) or underline (`line`) that glides between tabs sharing an id. */
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
            : 'inset-0 rounded-[inherit] bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 shadow-[0_6px_18px_-8px_rgba(88,97,127,0.8)]',
        className,
      )}
    />
  );
}

/** The content under a tab bar: re-mounts per tab and its cards cascade in (M49). */
export function TabPanel({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useCascade(ref, k);
  return (
    <motion.div ref={ref} key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className={className}>
      {children}
    </motion.div>
  );
}

/** The cards of a newly shown section rise in one after another (the "Crew" video's screen
 *  changes): the first level with more than one child is the list of cards; ones that arrive in the
 *  next 1.5 s (data replacing a skeleton) join in. 280 ms each, 45 ms apart, transform and opacity
 *  only; nothing with Reduce Motion. */
export function useCascade(ref: React.RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion() || typeof root.animate !== 'function') return;
    const done = new WeakSet<Element>();
    let i = 0, frame = 0;
    const run = () => {
      frame = 0;
      let n: Element = root;
      while (n.children.length === 1) n = n.children[0];
      for (const c of Array.from(n.children).slice(0, 16)) {
        if (done.has(c) || !(c instanceof HTMLElement)) continue;
        done.add(c);
        c.animate(
          [{ opacity: 0, transform: 'translateY(14px) scale(0.985)' }, { opacity: 1, transform: 'none' }],
          { duration: 280, delay: Math.min(i++, 10) * 45, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        );
      }
    };
    run();
    const mo = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(run); });
    mo.observe(root, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 1500);
    return () => { mo.disconnect(); clearTimeout(stop); cancelAnimationFrame(frame); };
  }, [ref, key]);
}
