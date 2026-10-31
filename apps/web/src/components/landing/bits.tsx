'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { animate, m as motion, useInView, useScroll, useSpring, useTransform } from 'framer-motion';
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
 *  holds it still regardless. */
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

/** The italic word in a headline (“themselves.”, “not”). */
export const Accent = ({ children }: { children: React.ReactNode }) => (
  <em className="font-serif italic font-normal tracking-normal text-pink-200 pe-1">{children}</em>
);

/** How a section's parts arrive (M63: each section below the hero has its own entrance, not the
 *  same fade-up everywhere). Set once around a section with `<Motion kind="…">`; every `Reveal`
 *  inside uses it. Transform and opacity only; Reduce Motion leaves the fades.
 *  up     rises a little (the default)
 *  tilt   tips up from lying back, like a card set on a table (3D)
 *  sweep  glides in from the reading side
 *  fan    comes in from alternate sides with a slight turn, settling into the grid
 *  depth  settles forward out of the distance
 *  mask   rises out of a clipped line, like type set in place
 *  scrub  follows the scroll itself, smoothed by a spring (the page feels glued to the finger) */
export type MotionKind = 'up' | 'tilt' | 'sweep' | 'fan' | 'depth' | 'mask' | 'scrub';
const Kind = createContext<MotionKind>('up');
export const Motion = ({ kind, children }: { kind: MotionKind; children: React.ReactNode }) => <Kind.Provider value={kind}>{children}</Kind.Provider>;

/** A starting pose per kind; `n` alternates sides for `fan` (from the delay, which grows with the index). */
function pose(kind: MotionKind, n: number, rtl: boolean): Record<string, number | string> {
  const side = (n % 2 ? 1 : -1) * (rtl ? -1 : 1);
  switch (kind) {
    case 'tilt': return { opacity: 0, y: 48, rotateX: 16, transformPerspective: 1100 };
    case 'sweep': return { opacity: 0, x: rtl ? 56 : -56 };
    case 'fan': return { opacity: 0, x: side * 44, y: 18, rotate: side * 2.5 };
    case 'depth': return { opacity: 0, scale: 0.9, y: 22 };
    case 'mask': return { y: '105%' };
    default: return { opacity: 0, y: 26 };
  }
}
const REST = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0 };
const useRtl = () => useSyncExternalStore(() => () => {}, () => document.documentElement.dir === 'rtl', () => false);

/** Arrives once, when scrolled into view, the way its section's `Motion` says. */
export function Reveal({ children, delay = 0, className, role }: { children: React.ReactNode; delay?: number; className?: string; role?: 'listitem' }) {
  const kind = useContext(Kind);
  const rtl = useRtl();
  if (kind === 'scrub') return <Scrub delay={delay} className={className} role={role}>{children}</Scrub>;
  const n = Math.round(delay * 100);
  const move = <motion.div role={kind === 'mask' ? undefined : role} initial={pose(kind, n, rtl)} whileInView={REST} viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: kind === 'mask' ? 0.9 : 0.8, delay, ease: EASE }} className={kind === 'mask' ? undefined : className} style={kind === 'tilt' ? { transformOrigin: '50% 100%' } : undefined}>{children}</motion.div>;
  return kind === 'mask' ? <div role={role} className={cn('overflow-hidden pb-1', className)}>{move}</div> : move;
}

/** Tied to the scroll: rises from 70 px below and fades in as it crosses the lower part of the
 *  screen, through a spring so a trackpad's or a wheel's steps come out as one smooth glide. */
function Scrub({ children, delay, className, role }: { children: React.ReactNode; delay: number; className?: string; role?: 'listitem' }) {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useReduce();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.55'] });
  const soft = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.6 });
  // Later parts (bigger delay) start a little lower, so a row lands one after another.
  const y = useTransform(soft, [0, 1], [calm ? 0 : 70 + delay * 120, 0]);
  const opacity = useTransform(soft, [0, 0.6], [calm ? 1 : 0, 1]);
  return <motion.div ref={ref} role={role} className={className} style={{ y, opacity }}>{children}</motion.div>;
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
export const primary = 'mkt-cta group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-bold text-[#171f44] bg-pink-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:bg-pink-400 active:scale-[0.98] transition';
export const ghost = 'mkt-cta group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-semibold text-white border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition';
/** A dark glass card. */
export const glass = 'rounded-3xl border border-white/[0.08] bg-[#131a3d]/70 backdrop-blur-md';
