'use client';

import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import Link from '@/components/ui/Link';
import { Planet, type Place } from '@/components/live/Planet';
import { appById, type AppId } from '@/lib/apps';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';
import { Accent, Reveal, ghost, primary } from './bits';

// The landing's planet (M52, after the owner's "Globynk" picture and "Orbit" video; M55 its exact
// colours): Midnight Abyss sinking into a bright Aqua Jade horizon, the five apps as places on one
// dotted planet joined by Baby Pink arcs, and two frosted notes beside it. Only what the product does:
// no invented places or numbers.
// M131 (the owner: "ultra smooth and functional and more detailing and people can click on it and see
// details"): drag to turn it, pinch or the buttons to zoom; click an app on it (or its button below the
// heading, for keyboards and screen readers) and the planet turns to face it, it wears a bright ring and
// a card says what the app does, with a way to start or to see it on this page. Still drawn on a
// background thread (Planet `turnable`).

const PLACES: Place[] = [
  { label: 'UniVersity', lat: 50, lon: 4, tone: 'pink' },
  { label: 'Trace', lat: 30, lon: 118, tone: 'pink' },
  { label: 'Relief', lat: -3, lon: 36, tone: 'aqua' },
  { label: 'Green', lat: -12, lon: -56, tone: 'aqua' },
  { label: 'Play', lat: 38, lon: -98, tone: 'pink' },
];
const ARCS: [number, number][] = [[0, 1], [0, 2], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]];
/** The app at each place, in PLACES' order. */
const IDS: AppId[] = ['campus', 'trace', 'relief', 'green', 'play'];
/** Three more things each app does (beyond its tagline and line in apps.ts): only what it really does. */
const DETAILS: Record<AppId, string[]> = {
  campus: ['Assignments and quizzes, graded with rubrics', 'Attendance, the timetable and the calendar', 'Messages between students, teachers and parents'],
  trace: ['Signed codes, and a warning when a label looks copied', 'Live maps of scans, recalls and warranties', 'EU Digital Product Passports'],
  relief: ['Alerts for helpers nearby, never showing where they are', 'A notification when someone answers', 'Organisations with members, supplies and volunteer shifts'],
  green: ['Streaks, badges and a weekly challenge', 'Teams that act together', 'A map of what was done'],
  play: ['Up to eight friends in a room with a code', 'Leaderboards to climb', '3D worlds to explore'],
};
const short = (id: AppId) => appById(id).name.replace('UniVerse ', '');

export function WorldSection({ app, onShow }: { app: AppId; onShow?: (id: AppId) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const place = chosen === null ? null : PLACES[chosen];
  const id = chosen === null ? null : IDS[chosen];
  const show = (to: AppId) => { onShow?.(to); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  return (
    <section aria-labelledby="world-h" className="world dark relative overflow-hidden px-6 pt-24 pb-28 md:pt-28 md:pb-40">
      <div className="relative max-w-6xl mx-auto text-center">
        <Reveal><h2 id="world-h" className="text-4xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.05] text-white">One account. <Accent>One planet.</Accent></h2></Reveal>
        <Reveal delay={0.06}><p className="mt-5 mx-auto max-w-xl text-lg text-zinc-300 leading-relaxed">School, products, help, climate and games share one sign-in, one wallet and one inbox, on any phone, in 13 languages.</p></Reveal>
        <Reveal delay={0.1}><div className="mt-8 flex justify-center"><Link href={`/register?app=${app}`} data-magnetic className={primary}>Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link></div></Reveal>
      </div>
      <div className="relative max-w-6xl mx-auto mt-10">
        <div role="group" aria-label="The apps on the planet" className="flex flex-wrap justify-center gap-2">
          {IDS.map((a, i) => (
            <button key={a} type="button" aria-pressed={chosen === i} onClick={() => setChosen(chosen === i ? null : i)}
              className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-[background-color,color,box-shadow] duration-150', chosen === i ? 'bg-white text-[#111113] ring-white' : 'bg-white/[0.06] text-zinc-200 ring-white/15 hover:bg-white/[0.12]')}>
              <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: appById(a).color }} />{short(a)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-sm text-zinc-400">Drag to turn it. Pick an app to see what it does.</p>
        <Planet turnable places={PLACES} arcs={ARCS} focus={place ? { lat: place.lat, lon: place.lon } : null} selected={chosen === null ? [] : [chosen]} onPick={setChosen}
          label="The five UniVerse apps on one planet: drag to turn it, pick an app to see what it does" className="h-[380px] sm:h-[520px] md:h-[600px]" />
        <div aria-live="polite" className="relative md:absolute md:end-0 md:top-[16%] md:w-[320px] z-10">
          <AnimatePresence mode="wait" initial={false}>
            {id && (
              <motion.div key={id} role="region" aria-label={appById(id).name}
                initial={{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }} animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
                exit={{ opacity: 0, transform: 'translateY(4px) scale(0.99)', transition: { duration: 0.12 } }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="world-glass mt-4 md:mt-0 p-5 text-start">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-2 font-semibold text-white">
                    <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: appById(id).color }} />{appById(id).name}
                    {appById(id).lab && <span className="rounded-full px-1.5 text-xs font-medium text-zinc-300 ring-1 ring-white/20">Lab</span>}
                  </p>
                  <button type="button" onClick={() => setChosen(null)} className="-m-1 p-1 rounded-full text-zinc-400 hover:text-white" aria-label="Close"><X className="w-4 h-4" aria-hidden /></button>
                </div>
                <p className="mt-2 text-sm text-[#eef2fb]">{appById(id).tagline}. {appById(id).impact}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
                  {DETAILS[id].map((d) => <li key={d} className="flex gap-2"><span aria-hidden className="mt-2 w-1 h-1 shrink-0 rounded-full bg-zinc-400" />{d}</li>)}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/register?app=${id}`} className={cn(primary, 'h-10 px-4')}>Start with {short(id)} <ArrowRight className="w-4 h-4" aria-hidden /></Link>
                  {onShow && id !== app && <button type="button" onClick={() => show(id)} className={cn(ghost, 'h-10 px-4')}>Show me {short(id)}</button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="relative grid gap-4 sm:grid-cols-2 md:block">
          <Reveal className="md:absolute md:start-0 md:bottom-[30%] md:w-[300px]">
            <div className="world-glass p-5 text-start">
              <p className="font-semibold text-white">One wallet</p>
              <p className="mt-1 text-sm text-[#eef2fb] leading-relaxed">Points, people helped and CO₂ saved collect in one place, whichever app they came from.</p>
            </div>
          </Reveal>
          <Reveal delay={0.08} className="md:absolute md:end-0 md:bottom-[12%] md:w-[300px]">
            <div className="world-glass p-5 text-start">
              <p className="font-semibold text-white">Live everywhere</p>
              <p className="mt-1 text-sm text-[#eef2fb] leading-relaxed">Installs on any phone or computer, keeps today readable offline and updates the moment something changes.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
