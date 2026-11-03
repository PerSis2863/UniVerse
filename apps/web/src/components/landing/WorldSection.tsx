'use client';

import { ArrowRight } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Planet, type Place } from '@/components/live/Planet';
import type { AppId } from '@/lib/apps';
import { Accent, Reveal, primary } from './bits';

// The landing's planet (M52, after the owner's "Globynk" picture and "Orbit" video; M55 its exact
// colours): Midnight Abyss sinking into a bright Aqua Jade horizon, the five apps as places on one
// dotted planet joined by Baby Pink arcs, and two frosted notes beside it. Only what the product does:
// no invented places or numbers.

const PLACES: Place[] = [
  { label: 'UniVersity', lat: 50, lon: 4, tone: 'pink' },
  { label: 'Trace', lat: 30, lon: 118, tone: 'pink' },
  { label: 'Relief', lat: -3, lon: 36, tone: 'aqua' },
  { label: 'Green', lat: -12, lon: -56, tone: 'aqua' },
  { label: 'Play', lat: 38, lon: -98, tone: 'pink' },
];
const ARCS: [number, number][] = [[0, 1], [0, 2], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]];

export function WorldSection({ app }: { app: AppId }) {
  return (
    <section aria-labelledby="world-h" className="world relative overflow-hidden px-6 pt-24 pb-28 md:pt-28 md:pb-40">
      <div className="relative max-w-6xl mx-auto text-center">
        <Reveal><h2 id="world-h" className="text-4xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.05] text-white">One account. <Accent>One planet.</Accent></h2></Reveal>
        <Reveal delay={0.06}><p className="mt-5 mx-auto max-w-xl text-lg text-zinc-300 leading-relaxed">School, products, help, climate and games share one sign-in, one wallet and one inbox, on any phone, in 13 languages.</p></Reveal>
        <Reveal delay={0.1}><div className="mt-8 flex justify-center"><Link href={`/register?app=${app}`} data-magnetic className={primary}>Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link></div></Reveal>
      </div>
      <div className="relative max-w-6xl mx-auto mt-6">
        <Planet places={PLACES} arcs={ARCS} label="The five UniVerse apps on one turning planet" className="h-[380px] sm:h-[520px] md:h-[600px]" />
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
