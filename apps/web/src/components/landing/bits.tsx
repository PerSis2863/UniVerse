'use client';

import { useEffect, useRef } from 'react';
import { animate, m as motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

// Small parts shared by the landing page's sections (src/app/page.tsx).

export const EASE = [0.22, 1, 0.36, 1] as const;

/** "● pricing": the small label above a section. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 h-7 px-3 rounded-full border border-white/[0.08] bg-white/[0.04] font-mono text-xs text-zinc-300', className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_#9e8189]" /> {children}
    </span>
  );
}

/** The italic word in a headline (“themselves.”, “not”). */
export const Accent = ({ children }: { children: React.ReactNode }) => (
  <em className="font-serif italic font-normal tracking-normal bg-gradient-to-r from-indigo-200 via-fuchsia-200 to-pink-200 bg-clip-text text-transparent pe-1">{children}</em>
);

/** Rises in once, when scrolled into view. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, delay, ease: EASE }} className={className}>
      {children}
    </motion.div>
  );
}

/** A number that counts up from 0 when it comes into view (written straight into the text: no re-renders). */
export function CountUp({ to, prefix = '', suffix = '', className }: { to: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: '-60px' });
  useEffect(() => {
    const el = ref.current;
    if (!el || !seen) return;
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (v) => { el.textContent = `${prefix}${Math.round(v).toLocaleString('en-US')}${suffix}`; } });
    return () => c.stop();
  }, [seen, to, prefix, suffix]);
  return <span ref={ref} className={cn('tabular-nums', className)}>{prefix}0{suffix}</span>;
}

/** The two-tone button (indigo into fuchsia), the page's one bright action. */
export const primary = 'group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 shadow-[0_8px_30px_-8px_rgba(107,85,96,0.7)] hover:brightness-110 active:scale-[0.98] transition';
export const ghost = 'group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-semibold text-white border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition';
/** A dark glass card. */
export const glass = 'rounded-3xl border border-white/[0.08] bg-[#0b1a24]/70 backdrop-blur-md';
