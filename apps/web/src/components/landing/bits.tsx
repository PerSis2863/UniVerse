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

/** The bright word in a two-tone headline (M93, the owner's photos: "Where Credit Meets Confidence"). */
export const Accent = ({ children }: { children: React.ReactNode }) => (
  <em className="accent-word pe-1">{children}</em>
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

/** A starting pose per kind and the pose it settles in, each one `transform` (M133: the compositor runs
 *  it, so a reveal never stutters while the page scrolls; framer's x / y run on the page's thread).
 *  `n` alternates sides for `fan` (from the delay, which grows with the index). */
function pose(kind: MotionKind, n: number, rtl: boolean): [Record<string, number | string>, Record<string, number | string>] {
  const side = (n % 2 ? 1 : -1) * (rtl ? -1 : 1);
  switch (kind) {
    case 'tilt': return [{ opacity: 0, transform: 'perspective(1100px) translateY(48px) rotateX(16deg)' }, { opacity: 1, transform: 'perspective(1100px) translateY(0px) rotateX(0deg)' }];
    case 'sweep': return [{ opacity: 0, transform: `translateX(${rtl ? 56 : -56}px)` }, { opacity: 1, transform: 'translateX(0px)' }];
    case 'fan': return [{ opacity: 0, transform: `translateX(${side * 44}px) translateY(18px) rotate(${side * 2.5}deg)` }, { opacity: 1, transform: 'translateX(0px) translateY(0px) rotate(0deg)' }];
    case 'depth': return [{ opacity: 0, transform: 'translateY(22px) scale(0.9)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }];
    case 'mask': return [{ transform: 'translateY(105%)' }, { transform: 'translateY(0%)' }];
    default: return [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'translateY(0px)' }];
  }
}
const useRtl = () => useSyncExternalStore(() => () => {}, () => document.documentElement.dir === 'rtl', () => false);

/** Arrives once, when scrolled into view, the way its section's `Motion` says. */
export function Reveal({ children, delay = 0, className, role }: { children: React.ReactNode; delay?: number; className?: string; role?: 'listitem' }) {
  const kind = useContext(Kind);
  const rtl = useRtl();
  if (kind === 'scrub') return <Scrub delay={delay} className={className} role={role}>{children}</Scrub>;
  const [from, to] = pose(kind, Math.round(delay * 100), rtl);
  // M133: settles like a real thing (a spring with a little give), not a slide on rails.
  const move = <motion.div role={kind === 'mask' ? undefined : role} initial={from} whileInView={to} viewport={{ once: true, margin: '-80px' }}
    transition={{ type: 'spring', visualDuration: kind === 'mask' ? 0.8 : 0.7, bounce: kind === 'mask' ? 0 : 0.16, delay }} className={kind === 'mask' ? undefined : className} style={kind === 'tilt' ? { transformOrigin: '50% 100%' } : undefined}>{children}</motion.div>;
  return kind === 'mask' ? <div role={role} className={cn('overflow-hidden pb-1', className)}>{move}</div> : move;
}

/** Tied to the scroll: rises from 70 px below and fades in as it crosses the lower part of the screen.
 *  M133: a CSS scroll-driven animation (`.scrub` in globals.css), run by the compositor in step with the
 *  scroll itself (it used framer's scroll and spring on the page's thread, which lagged whenever the page
 *  was busy). Where the browser has no scroll timelines it simply stands still. */
function Scrub({ children, delay, className, role }: { children: React.ReactNode; delay: number; className?: string; role?: 'listitem' }) {
  // Later parts (bigger delay) start a little lower, so a row lands one after another.
  return <div role={role} className={cn('scrub', className)} style={{ '--scrub-y': `${70 + delay * 120}px` } as React.CSSProperties}>{children}</div>;
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

/** The page's one bright action: lime on the dark page (the Relay recording), ink on the light one (M124). */
export const primary = 'mkt-cta group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-bold text-[var(--cta-ink)] bg-[var(--cta)] shadow-[0_8px_24px_-14px_rgba(0,0,0,0.7)] hover:bg-[var(--cta-hover)] active:scale-[0.98] transition-[transform,background-color] duration-150';
export const ghost = 'mkt-cta group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-[transform,background-color] duration-150';
/** A solid dark card with a hairline (§8: no glass, no see-through fills). */
export const tile = 'rounded-3xl border border-white/[0.08] bg-[var(--surface)]';
