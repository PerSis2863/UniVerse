'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import Link from '@/components/ui/Link';
import { Photo } from '@/components/ui/Photo';
import { appById, type AppId } from '@/lib/apps';
import { useShownApps } from '@/lib/shown-apps';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';
import { Accent, Reveal, ghost, primary } from './bits';
import { EarthGlobe } from './EarthGlobe';
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
// M328 (the owner, 18 Nov 2026: "remove the globe we have currently and make the same one the tripist has"): a
// real-looking Earth rising out of a bank of clouds on the page's own light (EarthGlobe), turning slowly; drag it,
// or choose an app below it and it turns to that app's part of the world.

const PLACES = [{ lat: 50, lon: 4 }, { lat: 30, lon: 118 }, { lat: -3, lon: 36 }, { lat: -12, lon: -56 }, { lat: -34, lon: 151 }];
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
  // M203: only the apps the owner shows; none of this with one.
  const shown = useShownApps();
  const ids = useMemo(() => IDS.filter((id) => shown.some((a) => a.id === id)), [shown]);
  const place = facing === null ? null : PLACES[IDS.indexOf(ids[facing])] ?? null;
  const show = (to: AppId) => { onShow?.(to); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  if (ids.length < 2) return null;
  return (
    <section aria-labelledby="world-h" data-uv-many className="world-earth relative overflow-hidden px-6 pt-20 pb-20 md:pt-28 md:pb-24">
      <div className="relative z-[1] max-w-6xl mx-auto text-center">
        <Reveal><h2 id="world-h" className="text-4xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.05]">One account. <Accent>One planet.</Accent></h2></Reveal>
        <Reveal delay={0.06}><p className="mt-5 mx-auto max-w-xl text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">School, products, help, climate and travel share one sign-in, one wallet and one inbox, on any phone, in 13 languages.</p></Reveal>
      </div>
      {/* The Earth rising out of the clouds: its lower part hidden by them, as tripist's. */}
      <div className="relative mx-auto mt-4 w-[min(92vw,760px)]">
        <div className="earth-window relative overflow-hidden">
          <EarthGlobe face={place} className="w-full"
            label={`The Earth, turning slowly${place ? `, facing ${short(ids[facing!])}` : ''}: drag to turn it, or choose an app below`} />
        </div>
        <Photo src="/geo/clouds.webp" shown="190vw" alt="" aria-hidden="true" loading="lazy" draggable={false} className="earth-clouds pointer-events-none absolute start-1/2 w-[190%] max-w-none select-none" />
      </div>
      <p className="relative z-[1] -mt-2 text-center text-sm text-zinc-600 dark:text-zinc-300">Drag to turn it. Choose an app to see its part of the world.</p>
      <ul aria-label="The apps" className="relative z-[1] mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-3 text-start md:grid-cols-2" onMouseLeave={() => setHover(null)}>
        {ids.map((a, i) => {
          const open = chosen === i, info = appById(a), total = TOTAL[a] && totals?.[TOTAL[a]![0]];
          return (
            <li key={a} className={cn('earth-card overflow-hidden transition-[box-shadow] duration-200', open && 'ring-2 ring-indigo-400/60')}>
              <button type="button" aria-expanded={open} onClick={() => setChosen(open ? null : i)} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className="w-full flex items-center gap-3 px-4 py-3 text-start">
                <span aria-hidden className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white">{short(a)}</span>
                  <span className="block text-sm text-zinc-600 dark:text-zinc-300 truncate">{info.tagline}</span>
                </span>
                {total ? <span className="shrink-0 text-end"><span className="block font-mono text-sm text-zinc-900 dark:text-white tabular-nums">{totalLabel(total)}</span><span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{TOTAL[a]![1]}</span></span> : null}
                <ChevronDown aria-hidden className={cn('w-4 h-4 shrink-0 text-zinc-500 transition-transform duration-300', open && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div key="more" initial={{ opacity: 0, transform: 'translateY(-4px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="px-4 pb-4" aria-live="polite">
                    <p className="text-sm text-zinc-800 dark:text-zinc-100">{info.impact}</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">
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
      <div className="relative z-[1] max-w-5xl mx-auto mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Reveal>
          <div className="earth-card p-5 text-start h-full">
            <p className="font-semibold text-zinc-900 dark:text-white">One wallet</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">Points, people helped and CO₂ saved collect in one place, whichever app they came from.</p>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="earth-card p-5 text-start h-full">
            <p className="font-semibold text-zinc-900 dark:text-white">Live everywhere</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">Installs on any phone or computer, keeps today readable offline and updates the moment something changes.</p>
          </div>
        </Reveal>
      </div>
      <Reveal delay={0.1}><div className="relative z-[1] mt-10 flex justify-center"><Link href={`/register?app=${app}`} data-magnetic className={primary}>Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link></div></Reveal>
      <p className="relative z-[1] mt-6 text-center text-[11px] text-zinc-500 dark:text-zinc-400">Earth from Natural Earth’s public-domain maps.</p>
    </section>
  );
}
