'use client';

import { HandHeart, MapPin, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { AppIcon } from '@/components/apps/AppIcon';
import type { AppId } from '@/lib/apps';
import { useShownApps } from '@/lib/shown-apps';
import { Accent, CountUp, Reveal, ghost, primary } from './bits';

// The website's parts for UniVerse Impact's newer apps (src/lib/apps.ts): a section for Relief (Green's
// left with Green, M395) and the grid of every app. Illustrations only: no invented customers or numbers
// about real people.

function Feature({ icon: Icon, title, text, color }: { icon: typeof HandHeart; title: string; text: string; color: string }) {
  return (
    <div className="h-full rounded-3xl p-6 bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-white/20 transition-shadow">
      <Icon className="w-6 h-6" style={{ color }} aria-hidden />
      <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-zinc-300 leading-relaxed">{text}</p>
    </div>
  );
}

export function ReliefSection() {
  return (
    <section id="relief" className="px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Help that reaches people <Accent>fast.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl">Every need and every offer on one live map.</p></Reveal>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            [HandHeart, 'Ask or offer in a minute', 'Say what you need. Only your area shows.'],
            [MapPin, 'A live map of needs', 'Volunteers see the closest, most urgent first.'],
            [Users, 'NGOs see the whole picture', 'Who was helped, and where help is still needed.'],
          ] as const).map(([icon, t, d], i) => <Reveal key={t} delay={0.1 + i * 0.06}><Feature icon={icon} title={t} text={d} color="#fdba74" /></Reveal>)}
        </div>
        <Reveal delay={0.2}><div className="mt-10 flex flex-wrap gap-3"><Link href="/register?app=relief" className={primary}>Join Relief</Link><Link href="/login?app=relief" className={ghost}>Sign in to Relief</Link></div></Reveal>
      </div>
    </section>
  );
}

export function AppsGrid({ onPick }: { onPick?: (id: AppId) => void }) {
  // M203: only the apps the owner shows; with one, the page is all about it already.
  const apps = useShownApps();
  if (apps.length < 2) return null;
  return (
    <section id="apps" data-uv-many className="px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Apps that change <Accent>something.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl"><CountUp to={apps.length} /> apps, one sign-in. The ones marked Lab are new.</p></Reveal>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
          {apps.map((a, i) => (
            <Reveal key={a.id} delay={0.08 + i * 0.06}>
              <button type="button" onClick={() => { onPick?.(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="group relative w-full h-full text-start overflow-hidden rounded-3xl p-7 bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-white/20 transition-shadow">
                <span aria-hidden className="pointer-events-none absolute -end-28 -top-28 w-80 h-80 opacity-20 group-hover:opacity-40 transition-opacity duration-500" style={{ background: `radial-gradient(closest-side, ${a.color}, transparent)` }} />
                <div className="relative flex items-center gap-4"><AppIcon id={a.id} size={52} /><div><h3 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-white">{a.name}</h3><p className="text-sm font-medium" style={{ color: a.color }}>{a.tagline}</p></div></div>
                <p className="relative mt-4 text-zinc-300 leading-relaxed">{a.impact}</p>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
