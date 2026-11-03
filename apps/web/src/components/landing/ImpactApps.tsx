'use client';

import { Brain, Gamepad2, Globe2, HandHeart, Keyboard, Leaf, LifeBuoy, MapPin, Recycle, ScanLine, Ship, TreePine, Trophy, Truck, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { AppIcon } from '@/components/apps/AppIcon';
import { APPS, type AppId } from '@/lib/apps';
import { Accent, CountUp, Reveal, ghost, primary } from './bits';

// The website's parts for UniVerse Impact's newer apps (src/lib/apps.ts): a section each for Relief,
// Green and Play, and the grid of every app. Illustrations only: no invented customers or numbers
// about real people.

function Feature({ icon: Icon, title, text, color }: { icon: typeof Leaf; title: string; text: string; color: string }) {
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
        <div className="mt-12 grid md:grid-cols-3 gap-4">
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

export function GreenSection() {
  return (
    <section id="green" className="px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Climate action you can <Accent>prove.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl">Small actions add up when you can see them.</p></Reveal>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {([
            [TreePine, 'Log it in seconds', 'Trees, bikes, recycling: each turned into CO₂ saved.'],
            [Trophy, 'Teams and a weekly challenge', 'Join with a code and beat the week together.'],
            [Leaf, 'A map of what changed', 'Watch your school or city’s effect grow.'],
          ] as const).map(([icon, t, d], i) => <Reveal key={t} delay={0.1 + i * 0.06}><Feature icon={icon} title={t} text={d} color="#6ee7b7" /></Reveal>)}
        </div>
        <Reveal delay={0.2}><div className="mt-10 flex flex-wrap gap-3"><Link href="/register?app=green" className={primary}>Join Green</Link><Link href="/login?app=green" className={ghost}>Sign in to Green</Link></div></Reveal>
      </div>
    </section>
  );
}

export function PlaySection() {
  return (
    <section id="play" className="px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Games that teach <Accent>something.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl">Twelve games and four 3D worlds. Solo or with friends.</p></Reveal>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            [Brain, 'Quiz Clash', 'Fast questions, faster streaks.', '#a5b4fc'],
            [ScanLine, 'Spot the Fake', 'Four labels. One is fake.', '#ffc0e6'],
            [Truck, 'Supply Run', 'Send the right supplies, fast.', '#fdba74'],
            [Recycle, 'Recycle Rush', 'Right bin, more CO₂ saved.', '#6ee7b7'],
            [Keyboard, 'Type Race', 'Type fast, race your friends.', '#c4b5fd'],
            [Globe2, 'World Pin', 'Pin the city on the map.', '#ffc0e6'],
            [LifeBuoy, 'Flood Rescue', 'Fly in, lift people to safety.', '#fdba74'],
            [Ship, 'Ocean Cleanup', 'Scoop the plastic, miss the turtles.', '#67e8f9'],
          ] as const).map(([icon, t, d, c], i) => <Reveal key={t} delay={0.1 + i * 0.06}><Feature icon={icon} title={t} text={d} color={c} /></Reveal>)}
        </div>
        <Reveal delay={0.2}><div className="mt-10 flex flex-wrap gap-3"><Link href="/register?app=play" className={primary}><Gamepad2 className="w-4 h-4" aria-hidden />Play free</Link><Link href="/login?app=play" className={ghost}>Sign in to Play</Link></div></Reveal>
      </div>
    </section>
  );
}

/** Every app, with what it's for: one account opens them all. */
export function AppsGrid({ onPick }: { onPick?: (id: AppId) => void }) {
  return (
    <section id="apps" className="px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Apps that change <Accent>something.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl"><CountUp to={APPS.length} /> apps, one sign-in.</p></Reveal>
        <div className="mt-12 grid md:grid-cols-2 gap-4">
          {APPS.map((a, i) => (
            <Reveal key={a.id} delay={0.08 + i * 0.06}>
              <button type="button" onClick={() => { onPick?.(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="group relative w-full h-full text-start overflow-hidden rounded-3xl p-7 bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-white/20 transition-shadow">
                <span aria-hidden className="absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" style={{ background: a.color }} />
                <div className="relative flex items-center gap-4"><AppIcon id={a.id} size={52} /><div><h3 className="text-2xl font-bold text-white">{a.name}</h3><p className="text-sm font-medium" style={{ color: a.color }}>{a.tagline}</p></div></div>
                <p className="relative mt-4 text-zinc-300 leading-relaxed">{a.impact}</p>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
