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
        // M92 (the owner's photos): a solid pill, ink in light mode and white in dark mode (its label
        // turns ink there: `.tab-pill` in globals.css), a plain line, a soft grey fill. No gradients.
        variant === 'line'
          ? 'inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--ink)]'
          : variant === 'soft'
            ? 'inset-0 rounded-[inherit] bg-zinc-900/[0.06] ring-1 ring-zinc-900/10 dark:bg-white/[0.1] dark:ring-white/15'
            : 'tab-pill inset-0 rounded-[inherit] bg-[var(--pill-on-bg)] shadow-[0_6px_18px_-10px_rgba(0,0,0,0.6)]',
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
