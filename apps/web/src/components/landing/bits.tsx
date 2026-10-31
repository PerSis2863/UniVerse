'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { animate, m as motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

// Small parts shared by the landing page's sections (src/app/page.tsx).

export const EASE = [0.22, 1, 0.36, 1] as const;

const calmQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');
const onCalm = (cb: () => void) => { const q = calmQuery(); q.addEventListener('change', cb); return () => q.removeEventListener('change', cb); };
/** Reduce Motion, false on the server and while the page wakes up (so a picture that draws differently
 *  without motion doesn't disagree with the server's HTML), then the real setting. */
const useReduce = () => useSyncExternalStore(onCalm, () => calmQuery().matches, () => false);

/** True while the part is off screen (M47): its looping demo holds still, like Reduce Motion. */
const Away = createContext(false);
export const useAway = () => useContext(Away);
/** Reduce Motion, or off screen (see `Live`): draw the still picture, run no loops. */
export const useCalm = () => { const r = useReduce(); return useAway() || r; };

/** Wraps a landing part whose demos loop: they run only while it is on screen (or about to be), so a
 *  slow phone isn't kept busy by pictures it can't see. CSS animations inside pause too. `away`
 *  holds it still regardless (a scroll story layer that isn't shown). */
export function Live({ children, away = false, className }: { children: React.ReactNode; away?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const outer = useAway();
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const off = outer || away || !seen;
  return <div ref={ref} className={className} data-away={off || undefined}><Away.Provider value={off}>{children}</Away.Provider></div>;
}

/** "● pricing": the small label above a section. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 h-7 px-3 rounded-full border border-white/[0.08] bg-white/[0.04] font-mono text-xs text-zinc-300', className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_#fe81d1]" /> {children}
    </span>
  );
}

/** The italic word in a headline (“themselves.”, “not”). */
export const Accent = ({ children }: { children: React.ReactNode }) => (
  <em className="font-serif italic font-normal tracking-normal bg-gradient-to-r from-aqua-200 via-pink-200 to-pink-300 bg-clip-text text-transparent pe-1">{children}</em>
);

/** Rises in once, when scrolled into view. */
export function Reveal({ children, delay = 0, className, role }: { children: React.ReactNode; delay?: number; className?: string; role?: 'listitem' }) {
  return (
    <motion.div role={role} initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, delay, ease: EASE }} className={className}>
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
export const primary = 'mkt-cta group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-bold text-[#171f44] bg-pink-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_30px_-8px_rgba(254,129,209,0.85)] hover:bg-pink-400 active:scale-[0.98] transition';
export const ghost = 'mkt-cta group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-semibold text-white border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition';
/** A dark glass card. */
export const glass = 'rounded-3xl border border-white/[0.08] bg-[#131a3d]/70 backdrop-blur-md';
