'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Bike, Brain, Check, Droplets, Gamepad2, Globe2, HandHeart, Home, Keyboard, Leaf, LifeBuoy, MapPin, Recycle, ScanLine, Ship, Stethoscope, Sun, TreePine, Trophy, Truck, Users, Utensils } from 'lucide-react';
import Link from '@/components/ui/Link';
import { AppIcon } from '@/components/apps/AppIcon';
import { APPS, type AppId } from '@/lib/apps';
import { Accent, CountUp, Reveal, Tag, ghost, glass, primary } from './bits';

// The website's parts for UniVerse Impact's newer apps (src/lib/apps.ts): a live-looking card for the
// hero and a section each for Relief, Green and Play, and the grid of every app. Illustrations only: no
// invented customers or numbers about real people.

const REQUESTS = [
  { icon: Utensils, what: 'Food for a family of 5', where: 'Ward 12', urgency: 'High' },
  { icon: Droplets, what: 'Drinking water, 40 L', where: 'Riverside camp', urgency: 'Critical' },
  { icon: Stethoscope, what: 'A lift to the clinic', where: 'North hill', urgency: 'Medium' },
  { icon: Home, what: 'Shelter for 2 nights', where: 'Old market', urgency: 'High' },
  { icon: Truck, what: 'Van to move supplies', where: 'Depot road', urgency: 'Medium' },
];
const URGENT: Record<string, string> = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308' };

/** The hero's Relief card: requests arrive and get matched with a helper, one after another. */
export function ReliefCard() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => x + 1), 2600); return () => clearInterval(t); }, []);
  const shown = [0, 1, 2].map((k) => ({ ...REQUESTS[(i + k) % REQUESTS.length], key: i + k }));
  return (
    <div className={`${glass} w-full max-w-md p-5`}>
      <div className="flex items-center gap-3"><AppIcon id="relief" size={36} /><div><p className="font-bold text-white">Needs near you</p><p className="text-xs text-zinc-400">matched with neighbours and NGOs, live</p></div></div>
      <ul className="mt-5 space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((r, k) => (
            <motion.li key={r.key} layout initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: -30, transition: { duration: 0.25 } }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.07] px-4 py-3">
              <r.icon className="w-5 h-5 text-orange-300 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white truncate">{r.what}</span><span className="flex items-center gap-1 text-[11px] text-zinc-400"><MapPin className="w-3 h-3" aria-hidden />{r.where}</span></span>
              {k === 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"><Check className="w-3 h-3" aria-hidden />helper on the way</span>
                : <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: URGENT[r.urgency], background: `${URGENT[r.urgency]}22` }}>{r.urgency}</span>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

const ACTIONS = [
  { icon: TreePine, what: '3 trees planted', kg: 66 },
  { icon: Bike, what: '18 km by bike', kg: 3.6 },
  { icon: Recycle, what: '6 kg recycled', kg: 9 },
  { icon: Sun, what: 'A week on solar', kg: 21 },
  { icon: Leaf, what: '4 meat-free days', kg: 8 },
];

/** The hero's Green card: actions land, the CO₂ saved climbs, the team goal fills. */
export function GreenCard() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => x + 1), 2400); return () => clearInterval(t); }, []);
  const total = 412 + ACTIONS.slice(0, (i % ACTIONS.length) + 1).reduce((a, x) => a + x.kg, 0) + Math.floor(i / ACTIONS.length) * 108;
  const a = ACTIONS[i % ACTIONS.length];
  return (
    <div className={`${glass} w-full max-w-md p-5`}>
      <div className="flex items-center gap-3"><AppIcon id="green" size={36} /><div><p className="font-bold text-white">Your team this month</p><p className="text-xs text-zinc-400">every action counted in CO₂ saved</p></div></div>
      <p className="mt-6 font-mono text-5xl font-light tabular-nums text-emerald-300">{total.toFixed(1)}<span className="ml-2 text-base text-zinc-400">kg CO₂</span></p>
      <div className="mt-4 h-2 rounded-full bg-white/[0.08] overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" animate={{ width: `${Math.min(100, (total / 1000) * 100)}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} /></div>
      <p className="mt-1.5 text-[11px] text-zinc-400">goal: 1 tonne</p>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.07] px-4 py-3">
          <a.icon className="w-5 h-5 text-emerald-300" aria-hidden /><span className="flex-1 text-sm text-white">{a.what}</span><span className="font-mono text-sm text-emerald-300">−{a.kg} kg</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const RACERS = [{ name: 'Maya', color: '#6366f1' }, { name: 'Omar', color: '#ec4899' }, { name: 'Yuki', color: '#f97316' }, { name: 'Leo', color: '#10b981' }];

/** The hero's Play card: a room's live scoreboard, the leader changing as the race goes on. */
export function PlayCard() {
  const [t, setT] = useState(12);
  const calm = useReducedMotion();
  useEffect(() => { if (calm) return; const id = setInterval(() => setT((x) => (x + 1) % 40), 900); return () => clearInterval(id); }, [calm]);
  // Made-up but steady: each racer gains at their own rhythm, so the order changes now and then.
  const rows = RACERS.map((r, i) => ({ ...r, score: Math.round(t * (180 + i * 23) + 400 * Math.sin((t + i * 3) / 2.2) + 600) })).sort((a, b) => b.score - a.score);
  const top = Math.max(...rows.map((r) => r.score), 1);
  return (
    <div className={`${glass} w-full max-w-md p-5`}>
      <div className="flex items-center gap-3"><AppIcon id="play" size={36} /><div><p className="font-bold text-white">Room K7Q2MX · Quiz Clash</p><p className="text-xs text-zinc-400">4 friends, the same questions, one scoreboard</p></div></div>
      <ol className="mt-5 space-y-2.5">
        {rows.map((r, i) => (
          <motion.li key={r.name} layout transition={{ type: 'spring', stiffness: 420, damping: 34 }} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.07] px-4 py-2.5">
            <span className="w-5 font-mono text-sm text-zinc-400">{i + 1}</span>
            <span className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold text-white" style={{ background: r.color }}>{r.name[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{r.name}</span>
              <span className="mt-1 block h-1.5 rounded-full bg-white/[0.08] overflow-hidden"><motion.span className="block h-full w-full origin-left rounded-full rtl:origin-right" style={{ background: r.color }} initial={false} animate={{ scaleX: r.score / top }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} /></span>
            </span>
            <span className="font-mono text-sm tabular-nums text-white">{r.score.toLocaleString()}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

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
        <Reveal><Tag>UniVerse Relief</Tag></Reveal>
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
        <Reveal><Tag>UniVerse Green</Tag></Reveal>
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
        <Reveal><Tag>UniVerse Play</Tag></Reveal>
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Games that teach <Accent>something.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl">Twelve games and four 3D worlds. Solo or with friends.</p></Reveal>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            [Brain, 'Quiz Clash', 'Fast questions, faster streaks.', '#a5b4fc'],
            [ScanLine, 'Spot the Fake', 'Four labels. One is fake.', '#f9a8d4'],
            [Truck, 'Supply Run', 'Send the right supplies, fast.', '#fdba74'],
            [Recycle, 'Recycle Rush', 'Right bin, more CO₂ saved.', '#6ee7b7'],
            [Keyboard, 'Type Race', 'Type fast, race your friends.', '#c4b5fd'],
            [Globe2, 'World Pin', 'Pin the city on the map.', '#f9a8d4'],
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
        <Reveal><Tag>one account, every app</Tag></Reveal>
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
