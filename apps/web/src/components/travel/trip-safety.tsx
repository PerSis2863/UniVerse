'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { BedDouble, Car, Phone, Siren, X } from 'lucide-react';
import { spring } from '@/lib/motion';
import { TAKE_ME, languageFor } from '@/lib/travel-phrases';
import type { PlanItem, PlanStop } from '@/lib/travel-plan';

// M253: the trip's safety card (the trip page's Ready part): each country's emergency numbers, tappable, and where
// you're staying in each city (the stays planned on the trip) with a full-screen view for a taxi driver that asks, in
// the local language, to be taken there. Loaded only when the part is opened; saved for offline with the page.

type Row = [string, string[], string[], string, string, string[]];
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const country = (cc: string) => { try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(cc) ?? cc; } catch { return cc; } };

export default function TripSafety({ stops, items }: { stops: PlanStop[]; items: PlanItem[] }) {
  const [table, setTable] = useState<Record<string, Row> | null>(null);
  const [driver, setDriver] = useState<{ cc: string | null; name: string; address: string | null } | null>(null);
  useEffect(() => { void import('@/lib/travel-countries.json').then((m) => setTable(m.default as unknown as Record<string, Row>)); }, []);
  const ccs = [...new Set(stops.map((s) => s.cc).filter((c): c is string => !!c))];
  const stays = stops.map((s) => ({ s, stay: items.find((i) => i.stopId === s.id && i.kind === 'sleep') as (PlanItem & { address?: string | null }) | undefined }));

  return (
    <section className="panel p-5" aria-labelledby="safety-h">
      <h3 id="safety-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Siren className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />Safety card</h3>
      <ul className="mt-3 space-y-2">
        {ccs.map((cc) => {
          const row = table?.[cc], nums = row?.[5] ?? [];
          return (
            <li key={cc} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">{country(cc)}{row?.[4] ? <span className="font-normal text-zinc-500 dark:text-zinc-400"> · country code {row[4]}</span> : null}</p>
              {!table ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400" role="status">Loading…</p> : nums.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {nums.slice(0, 4).map((n) => <a key={n} href={`tel:${n}`} className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white"><Phone className="h-4 w-4" aria-hidden />{n}</a>)}
                </div>
              ) : <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Emergency numbers not known here: 112 works from most mobile phones.</p>}
            </li>
          );
        })}
      </ul>
      <h4 className="mt-4 flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><BedDouble className="h-4 w-4 text-indigo-500" aria-hidden />Where you’re staying</h4>
      <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/10">
        {stays.map(({ s, stay }) => (
          <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-zinc-500 dark:text-zinc-400" translate="no">{nice(s.name)}</p>
              {stay ? <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{stay.name}{stay.address ? <span className="block font-normal text-zinc-600 dark:text-zinc-300">{stay.address}</span> : null}</p> : <p className="text-zinc-600 dark:text-zinc-300">No stay on the plan yet (add one from the guide’s Sleep list).</p>}
            </div>
            {stay && <button type="button" onClick={() => setDriver({ cc: s.cc, name: stay.name, address: stay.address ?? null })} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Car className="h-4 w-4" aria-hidden />Show a driver</button>}
          </li>
        ))}
      </ul>
      <AnimatePresence>{driver && <Driver key={driver.name} d={driver} onClose={() => setDriver(null)} />}</AnimatePresence>
    </section>
  );
}

function Driver({ d, onClose }: { d: { cc: string | null; name: string; address: string | null }; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const l = languageFor(d.cc), ask = l && l !== 'english' ? TAKE_ME[l.id] : null;
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Address for a driver" className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-white p-6 text-center dark:bg-zinc-950"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.18 }}>
      <motion.div initial={{ transform: 'scale(0.94)' }} animate={{ transform: 'scale(1)' }} transition={spring.snappy} className="max-w-3xl" translate="no">
        {ask && <p className="text-2xl font-semibold text-zinc-700 sm:text-3xl dark:text-zinc-200" lang={l && l !== 'english' ? l.tag : undefined} dir={l && l !== 'english' && l.rtl ? 'rtl' : undefined}>{ask.text}</p>}
        <p className="mt-6 text-4xl font-semibold leading-tight text-zinc-900 sm:text-6xl dark:text-white">{d.name}</p>
        {d.address && <p className="mt-4 text-2xl text-zinc-800 sm:text-3xl dark:text-zinc-100">{d.address}</p>}
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">{ask?.say ?? 'Please take me to this address.'}</p>
      </motion.div>
      <button ref={close} type="button" onClick={onClose} className="btn-primary mt-10 inline-flex items-center gap-2"><X className="h-5 w-5" aria-hidden />Close</button>
    </motion.div>
  );
}
