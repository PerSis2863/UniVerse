'use client';

import { useEffect, useState } from 'react';
import { CountUp, Reveal } from './bits';
import { TOTAL_KEYS, totalLabel, type TotalKey, type Totals } from '@/lib/site-totals';

// The landing's strip of live totals (M44): the whole site's numbers, counted once a day and rounded
// down (GET /api/impact/totals, src/server/site-totals.ts). Asked once per visit; a total under 10
// isn't sent, and with none the strip doesn't show.

const LABEL: Record<TotalKey, string> = { people: 'people', co2Kg: 'kg of CO₂ saved', helped: 'people helped', games: 'games played', scans: 'products checked' };

/** The site's totals, asked once per visit and shared (the strip and the globe's app list, M159). */
let asked: Promise<Totals | null> | null = null;
export function useTotals() {
  const [totals, setTotals] = useState<Totals | null>(null);
  useEffect(() => {
    asked ??= fetch('/api/impact/totals').then((r) => (r.ok ? r.json() : null)).then((d: { totals?: Totals } | null) => d?.totals ?? null).catch(() => null);
    let live = true;
    void asked.then((t) => { if (live) setTotals(t); });
    return () => { live = false; };
  }, []);
  return totals;
}

export function LiveTotals() {
  const totals = useTotals();
  const shown = TOTAL_KEYS.filter((k) => (totals?.[k] ?? 0) >= 10);
  if (!shown.length) return null;
  return (
    <section aria-label="UniVerse so far" className="px-6 py-10">
      <Reveal className="max-w-6xl mx-auto">
        <dl className="flex flex-wrap justify-center gap-x-10 gap-y-6 sm:gap-x-16 border-y border-white/[0.08] py-8">
          {shown.map((k) => {
            const n = totals![k]!;
            return (
              <div key={k} className="text-center">
                <dt className="sr-only">{LABEL[k]}</dt>
                <dd className="font-mono text-3xl sm:text-4xl font-light text-white">{n < 10_000 ? <CountUp to={n} suffix="+" /> : totalLabel(n)}</dd>
                <dd aria-hidden className="mt-1 text-sm text-zinc-400">{LABEL[k]}</dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-3 text-center text-xs text-zinc-400"><span className="inline-block w-1.5 h-1.5 me-1.5 rounded-full bg-emerald-400 align-middle" aria-hidden />counted every day</p>
      </Reveal>
    </section>
  );
}
