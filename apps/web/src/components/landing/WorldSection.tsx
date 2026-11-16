'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import Link from '@/components/ui/Link';
import { Planet, type Place } from '@/components/live/Planet';
import { appById, type AppId } from '@/lib/apps';
import { useShownApps } from '@/lib/shown-apps';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';
import { Accent, Reveal, ghost, primary } from './bits';
import { useTotals } from './LiveTotals';
import { totalLabel, type TotalKey } from '@/lib/site-totals';

// The landing's planet (M52, after the owner's "Globynk" picture and "Orbit" video; M55 its exact
// colours): Midnight Abyss sinking into a bright Aqua Jade horizon, the five apps as places on one
// dotted planet joined by Baby Pink arcs, and two frosted notes beside it. Only what the product does:
// no invented places or numbers.
// M131 (the owner: "ultra smooth and functional and more detailing and people can click on it and see
// details"): drag to turn it, pinch or the buttons to zoom; click an app on it (or its button below the
// heading, for keyboards and screen readers) and the planet turns to face it, it wears a bright ring and
// a card says what the app does, with a way to start or to see it on this page. Still drawn on a
// background thread (Planet `turnable`). M164: smaller, beside the apps as a list that steers it.

const PLACES: Place[] = [
  { label: 'UniVersity', lat: 50, lon: 4, tone: 'pink' },
  { label: 'Trace', lat: 30, lon: 118, tone: 'pink' },
  { label: 'Relief', lat: -3, lon: 36, tone: 'aqua' },
  { label: 'Green', lat: -12, lon: -56, tone: 'aqua' },
  { label: 'Travel', lat: -34, lon: 151, tone: 'aqua' },
];
const ARCS: [number, number][] = [[0, 1], [0, 2], [0, 4], [1, 2], [2, 3], [1, 4], [3, 4]];
/** The app at each place, in PLACES' order. */
const IDS: AppId[] = ['campus', 'trace', 'relief', 'green', 'travel'];
/** Three more things each app does (beyond its tagline and line in apps.ts): only what it really does. */
const DETAILS: Record<AppId, string[]> = {
  campus: ['Assignments and quizzes, graded with rubrics', 'Attendance, the timetable and the calendar', 'Messages between students, teachers and parents'],
  trace: ['Signed codes, and a warning when a label looks copied', 'Live maps of scans, recalls and warranties', 'EU Digital Product Passports'],
  relief: ['Alerts for helpers nearby, never showing where they are', 'A notification when someone answers', 'Organisations with members, supplies and volunteer shifts'],
  green: ['Streaks, badges and a weekly challenge', 'Teams that act together', 'A map of what was done'],
  travel: ['Guides to see, eat and sleep anywhere', 'Day-by-day plans with friends', 'Stays, flights and tours to book'],
};
const short = (id: AppId) => appById(id).name.replace('UniVerse ', '');

/** M164: each app's real number from the site's daily totals (none for UniVersity; under 10 isn't sent). */
const TOTAL: Partial<Record<AppId, [TotalKey, string]>> = {
  trace: ['scans', 'products checked'], relief: ['helped', 'people helped'], green: ['co2Kg', 'kg of CO₂ saved'],
};

export function WorldSection({ app, onShow }: { app: AppId; onShow?: (id: AppId) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  // M164: pointing at an app in the list turns the planet to it too (a preview); choosing keeps it there.
  const [hover, setHover] = useState<number | null>(null);
  const totals = useTotals();
  const facing = hover ?? chosen;
  // M203: only the apps the owner shows (their places and the arcs between them); none of this with one.
  const shown = useShownApps();
  const ids = useMemo(() => IDS.filter((id) => shown.some((a) => a.id === id)), [shown]);
  const places = useMemo(() => ids.map((id) => PLACES[IDS.indexOf(id)]), [ids]);
  const arcs = useMemo(() => ARCS.flatMap(([a, b]): [number, number][] => { const x = ids.indexOf(IDS[a]), y = ids.indexOf(IDS[b]); return x >= 0 && y >= 0 ? [[x, y]] : []; }), [ids]);
  const place = facing === null ? null : places[facing] ?? null;
  const show = (to: AppId) => { onShow?.(to); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  if (ids.length < 2) return null;
  return (
    <section aria-labelledby="world-h" data-uv-many className="world dark relative overflow-hidden px-6 pt-20 pb-20 md:pt-24 md:pb-24">
      <div className="relative max-w-6xl mx-auto text-center">
        <Reveal><h2 id="world-h" className="text-4xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.05] text-white">One account. <Accent>One planet.</Accent></h2></Reveal>
        <Reveal delay={0.06}><p className="mt-5 mx-auto max-w-xl text-lg text-zinc-300 leading-relaxed">School, products, help, climate and games share one sign-in, one wallet and one inbox, on any phone, in 13 languages.</p></Reveal>
      </div>
      {/* M164 (the owner: "reduce the size of the globe… make it more functional"): a smaller planet beside the
          five apps as a list that steers it: point at an app and the planet turns to it, choose it and its row
          opens (what it does, its real number, a way in); a pick on the planet opens the same row. */}
      <div className="relative max-w-5xl mx-auto mt-10 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
        <div className="relative">
          <Planet turnable places={places} arcs={arcs} focus={place ? { lat: place.lat, lon: place.lon } : null} selected={chosen === null ? [] : [chosen]} onPick={(i) => setChosen(chosen === i ? null : i)}
            label={`The ${ids.length} UniVerse apps on one planet: drag to turn it, pick an app to see what it does`} className="world-planet mx-auto h-[320px] w-full max-w-[480px] sm:h-[420px] md:h-[460px]" />
          <p className="mt-2 text-center text-sm text-zinc-400">Drag to turn it. Pick an app here or in the list.</p>
        </div>
        <ul aria-label="The apps on the planet" className="space-y-2 text-start" onMouseLeave={() => setHover(null)}>
          {ids.map((a, i) => {
            const open = chosen === i, info = appById(a), total = TOTAL[a] && totals?.[TOTAL[a]![0]];
            return (
              // M225: a plain item (framer's `layout` measured the list on every frame the page drew).
              <li key={a}
                className={cn('world-glass overflow-hidden transition-[box-shadow] duration-200', open && 'ring-1 ring-white/30')}>
                <button type="button" aria-expanded={open} onClick={() => setChosen(open ? null : i)} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-start">
                  <span aria-hidden className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: info.color, boxShadow: `0 0 12px ${info.color}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-white">{short(a)}</span>
                    <span className="block text-sm text-zinc-300 truncate">{info.tagline}</span>
                  </span>
                  {total ? <span className="shrink-0 text-end"><span className="block font-mono text-sm text-white tabular-nums">{totalLabel(total)}</span><span className="block text-[11px] text-zinc-400">{TOTAL[a]![1]}</span></span> : null}
                  <ChevronDown aria-hidden className={cn('w-4 h-4 shrink-0 text-zinc-400 transition-transform duration-300', open && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div key="more" initial={{ opacity: 0, transform: 'translateY(-4px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="px-4 pb-4" aria-live="polite">
                      <p className="text-sm text-[#eef2fb]">{info.impact}</p>
                      <ul className="mt-2 space-y-1.5 text-sm text-zinc-300">
                        {DETAILS[a].map((d) => <li key={d} className="flex gap-2"><span aria-hidden className="mt-2 w-1 h-1 shrink-0 rounded-full bg-zinc-400" />{d}</li>)}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/register?app=${a}`} className={cn(primary, 'h-10 px-4')}>Start with {short(a)} <ArrowRight className="w-4 h-4" aria-hidden /></Link>
                        {onShow && a !== app && <button type="button" onClick={() => show(a)} className={cn(ghost, 'h-10 px-4')}>Show me {short(a)}</button>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="relative max-w-5xl mx-auto mt-8 grid gap-4 sm:grid-cols-2">
        <Reveal>
          <div className="world-glass p-5 text-start h-full">
            <p className="font-semibold text-white">One wallet</p>
            <p className="mt-1 text-sm text-[#eef2fb] leading-relaxed">Points, people helped and CO₂ saved collect in one place, whichever app they came from.</p>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="world-glass p-5 text-start h-full">
            <p className="font-semibold text-white">Live everywhere</p>
            <p className="mt-1 text-sm text-[#eef2fb] leading-relaxed">Installs on any phone or computer, keeps today readable offline and updates the moment something changes.</p>
          </div>
        </Reveal>
      </div>
      <Reveal delay={0.1}><div className="mt-10 flex justify-center"><Link href={`/register?app=${app}`} data-magnetic className={primary}>Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link></div></Reveal>
    </section>
  );
}
