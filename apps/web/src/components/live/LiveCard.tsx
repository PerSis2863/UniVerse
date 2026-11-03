'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { reducedMotion } from '@/lib/page-transition';
import { useTick } from '@/lib/use-now';

// The deep "live" card (M48, after the "Crew" video's dark panels on a light page): near-black with
// the river's pink and purple glowing up from below, in both themes, so the moving pictures inside
// (Constellation, Funnel) read the same everywhere. A live dot, a title, a picture, then a strip of
// small numbers and a line that changes every few seconds.

export function LiveCard({ title, sub, aside, stats, ticker, children, className }: {
  title: string;
  sub?: string;
  /** Top right: a countdown, a link. */
  aside?: React.ReactNode;
  stats?: { label: string; value: string }[];
  ticker?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  const id = `live-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={cn('live-card', className)}>
      <header className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-pink-300">
            <span className="live-dot" aria-hidden /> Live
          </p>
          <h2 id={id} className="mt-1 text-lg font-bold leading-tight text-white">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-white/70">{sub}</p>}
        </div>
        {aside}
      </header>
      <div className="relative mt-3">{children}</div>
      {(stats?.length || ticker?.length) ? (
        <footer className="relative mt-3 flex flex-col gap-3 border-t border-white/[0.08] pt-3 sm:flex-row sm:items-center">
          {ticker && ticker.length > 0 && <Ticker items={ticker} />}
          {stats && stats.length > 0 && (
            <dl className="flex shrink-0 gap-5 sm:ms-auto">
              {stats.map((s) => (
                <div key={s.label} className="text-end">
                  <dt className="text-[11px] uppercase tracking-wider text-white/60">{s.label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-white">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </footer>
      ) : null}
    </section>
  );
}

/** One line at a time, rising in every few seconds (the full list is there for screen readers). */
export function Ticker({ items }: { items: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setI((x) => x + 1), 3800);
    return () => clearInterval(id);
  }, [items.length]);
  const line = items[i % items.length];
  const still = reducedMotion();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" aria-hidden />
      <div className="relative h-5 min-w-0 flex-1 overflow-hidden" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.p
            key={i}
            translate="no"
            className="absolute inset-0 truncate text-xs leading-5 text-white/80"
            initial={{ y: still ? 0 : 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: still ? 0 : -10, opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {line}
          </motion.p>
        </AnimatePresence>
      </div>
      <ul className="sr-only">{items.map((x, n) => <li key={n}>{x}</li>)}</ul>
    </div>
  );
}

const two = (n: number) => String(n).padStart(2, '0');

/** Time left until `to`, in boxes whose digits roll over (the "Crew" payroll countdown). */
export function Countdown({ to, label }: { to: number; label: string }) {
  const now = useTick(true);
  const left = Math.max(0, Math.floor((to - now) / 1000));
  const parts = left >= 86_400
    ? [[Math.floor(left / 86_400), 'days'], [Math.floor(left / 3600) % 24, 'hrs'], [Math.floor(left / 60) % 60, 'min']] as const
    : [[Math.floor(left / 3600), 'hrs'], [Math.floor(left / 60) % 60, 'min'], [left % 60, 'sec']] as const;
  const minutes = Math.ceil(left / 60);
  return (
    <div className="shrink-0 text-end">
      <p className="text-[11px] uppercase tracking-wider text-white/60">{label}</p>
      <p className="sr-only">{minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`}</p>
      <div className="mt-1 flex gap-1" aria-hidden>
        {parts.map(([v, unit]) => (
          <span key={unit} className="flex flex-col items-center gap-0.5">
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-white/[0.08] ring-1 ring-white/[0.08]">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span key={v} className="text-sm font-semibold tabular-nums text-white"
                  initial={{ y: '-70%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '70%', opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                  {two(v)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="text-[11px] leading-none text-white/60">{unit}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
