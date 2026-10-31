'use client';

import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import { BadgeCheck, Camera, Flame, HandHeart, Handshake, Lock, Truck } from 'lucide-react';
import { GameIcon } from '@/components/play/GameIcon';
import { BADGES, weeklyChallenge } from '@/lib/green';
import { GAMES, type GameId } from '@/lib/play';
import { useNow } from '@/lib/use-now';
import { Accent, EASE, Reveal, Tag, glass } from './bits';

// More of the Relief, Green and Play tabs on the landing (M43): a "try it here" demo each
// (./TryIt, loaded only when its tab is open) and two short picture sections. Illustrations only.

const box = (h: string) => function Box() { return <div className={`${glass} ${h}`} />; };
const QuizTry = dynamic(() => import('./TryIt').then((x) => x.QuizTry), { loading: box('h-[420px]') });
const GreenTry = dynamic(() => import('./TryIt').then((x) => x.GreenTry), { loading: box('h-[520px] lg:h-[420px]') });
const ReliefTry = dynamic(() => import('./TryIt').then((x) => x.ReliefTry), { loading: box('h-[640px] lg:h-[440px]') });

function Head({ tag, title, accent }: { tag: string; title: string; accent: string }) {
  return (
    <>
      <Reveal><Tag>{tag}</Tag></Reveal>
      <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight text-white max-w-3xl">{title} <Accent>{accent}</Accent></h2></Reveal>
    </>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return <section id={id} className="px-6 py-20 scroll-mt-24"><div className="max-w-6xl mx-auto">{children}</div></section>;
}

function TrySection({ id, title, accent, children }: { id: string; title: string; accent: string; children: React.ReactNode }) {
  return (
    <Section id={id}>
      <Head tag="try it here" title={title} accent={accent} />
      <Reveal delay={0.1} className="mt-10">{children}</Reveal>
    </Section>
  );
}

/** Three steps on a line that draws itself in. */
function Steps({ steps, color }: { steps: readonly (readonly [typeof HandHeart, string, string])[]; color: string }) {
  return (
    <ol className="relative mt-12 grid md:grid-cols-3 gap-4">
      <motion.span aria-hidden className="hidden md:block absolute top-10 start-[16%] end-[16%] h-px origin-left rtl:origin-right" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 1.2, ease: EASE }} />
      {steps.map(([Icon, t, d], i) => (
        <Reveal key={t} role="listitem" delay={0.1 + i * 0.08} className="relative text-center">
          <span className="mx-auto w-20 h-20 grid place-items-center rounded-full bg-[#111112] ring-1 ring-white/10" style={{ boxShadow: `0 0 40px -10px ${color}` }}><Icon className="w-8 h-8" style={{ color }} aria-hidden /></span>
          <h3 className="mt-5 text-xl font-bold text-white">{t}</h3>
          <p className="mt-1.5 text-zinc-300">{d}</p>
        </Reveal>
      ))}
    </ol>
  );
}

/** Big figures with a few words each. */
function Figures({ items, color }: { items: readonly (readonly [string, string])[]; color: string }) {
  return (
    <dl className="mt-12 grid sm:grid-cols-3 gap-4">
      {items.map(([n, t], i) => (
        <Reveal key={t} delay={0.1 + i * 0.08} className={`${glass} p-6`}>
          <dt className="sr-only">{t}</dt>
          <dd><span className="block font-mono text-5xl font-light tracking-tight" style={{ color }}>{n}</span><span className="mt-3 block text-zinc-300">{t}</span></dd>
        </Reveal>
      ))}
    </dl>
  );
}

// ── Relief ──

export function ReliefMore() {
  return (
    <>
      <TrySection id="relief-try" title="Tap a need." accent="Help.">
        <ReliefTry />
      </TrySection>
      <Section id="relief-how">
        <Head tag="how it works" title="Ask. Match." accent="Done." />
        <Steps color="#fdba74" steps={[
          [HandHeart, 'Ask', 'What, how urgent, roughly where.'],
          [Handshake, 'Matched', 'A helper nearby taps “I can help”.'],
          [Truck, 'Delivered', 'Marked done. The map updates.'],
        ] as const} />
      </Section>
      <Section id="relief-safe">
        <Head tag="safe by design" title="Your area," accent="never your door." />
        <Figures color="#fdba74" items={[
          ['500 m', 'Only the area shows, not an address'],
          ['30 days', 'Then a request leaves the map'],
          ['Never', 'Is a helper’s location shown'],
        ] as const} />
      </Section>
    </>
  );
}

// ── Green ──

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function GreenMore() {
  const now = useNow();
  const challenge = now ? weeklyChallenge(now) : null;
  return (
    <>
      <TrySection id="green-try" title="Log one." accent="See it count.">
        <GreenTry />
      </TrySection>
      <Section id="green-habit">
        <Head tag="keep going" title="Streaks, badges," accent="a weekly goal." />
        <div className="mt-12 grid lg:grid-cols-3 gap-4">
          <Reveal delay={0.1} className={`${glass} p-6`}>
            <p className="flex items-center gap-2 text-sm text-zinc-400"><Flame className="w-4 h-4 text-orange-300" aria-hidden />Streak</p>
            <ol className="mt-5 flex justify-between gap-1.5" aria-label="7 days in a row">
              {WEEK.map((d, i) => (
                <li key={i} className="flex flex-col items-center gap-2">
                  <motion.span className="w-8 h-8 rounded-full grid place-items-center bg-emerald-400 text-emerald-950" initial={{ opacity: 0.15, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.07, duration: 0.3, ease: EASE }}>
                    <BadgeCheck className="w-4 h-4" aria-hidden />
                  </motion.span>
                  <span className="text-xs text-zinc-400" aria-hidden>{d}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.16} className={`${glass} p-6`}>
            <p className="text-sm text-zinc-400">This week</p>
            <p className="mt-2 text-2xl font-bold text-white min-h-8">{challenge?.title ?? ' '}</p>
            <div className="mt-5 h-2 rounded-full bg-white/[0.08] overflow-hidden">
              <motion.div className="h-full w-full origin-left rtl:origin-right rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" initial={{ scaleX: 0 }} whileInView={{ scaleX: 0.64 }} viewport={{ once: true }} transition={{ duration: 1.1, delay: 0.2, ease: EASE }} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">Everyone gets the same one. New every Monday.</p>
          </Reveal>
          <Reveal delay={0.22} className={`${glass} p-6`}>
            <p className="text-sm text-zinc-400">Badges</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {BADGES.map((b, i) => (
                <motion.li key={b.id} className="rounded-full bg-emerald-400/10 ring-1 ring-emerald-300/20 px-3 py-1 text-sm font-semibold text-emerald-200" initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 + i * 0.05, duration: 0.3, ease: EASE }}>{b.label}</motion.li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>
      <Section id="green-proof">
        <Head tag="proof" title="A photo. A teammate." accent="It counts." />
        <Steps color="#6ee7b7" steps={[
          [Camera, 'Add a photo', 'With the action, or later.'],
          [BadgeCheck, 'A teammate confirms', 'Never yourself.'],
          [Flame, 'It counts', 'For the challenge and the leaderboards.'],
        ] as const} />
      </Section>
    </>
  );
}

// ── Play ──

const CODE = 'K7Q2MX';
const SEATS = ['#6366f1', '#ec4899', '#f97316', '#10b981', '#eab308', '#22d3ee', '#a855f7', '#f43f5e'];
const WORLDS: GameId[] = ['obby', 'orbit', 'ops', 'night'];

export function PlayMore() {
  return (
    <>
      <TrySection id="play-try" title="Five questions." accent="Go.">
        <QuizTry />
      </TrySection>
      <Section id="play-rooms">
        <Head tag="rooms" title="Up to 8 friends." accent="One code." />
        <Reveal delay={0.1} className={`${glass} mt-12 p-6 sm:p-10 text-center`}>
          <div role="img" className="flex justify-center gap-1.5 sm:gap-2.5" aria-label={`Room code ${CODE.split('').join(' ')}`}>
            {CODE.split('').map((c, i) => (
              <motion.span key={i} aria-hidden className="w-10 h-14 sm:w-14 sm:h-20 grid place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10 font-mono text-2xl sm:text-4xl font-bold text-white"
                initial={{ opacity: 0, y: 14, rotateX: -50 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: EASE }}>{c}</motion.span>
            ))}
          </div>
          <div role="img" className="mt-8 flex justify-center -space-x-2 rtl:space-x-reverse" aria-label="8 players joined">
            {SEATS.map((c, i) => (
              <motion.span key={c} aria-hidden className="w-10 h-10 sm:w-12 sm:h-12 rounded-full ring-4 ring-[#111112]" style={{ background: c }}
                initial={{ opacity: 0, scale: 0.85, y: 8 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 + i * 0.08, type: 'spring', stiffness: 380, damping: 22 }} />
            ))}
          </div>
          <p className="mt-6 text-zinc-300">Same questions, same map, one scoreboard.</p>
        </Reveal>
      </Section>
      <Section id="play-worlds">
        <Head tag="3D worlds" title="Four worlds" accent="to explore." />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORLDS.map((id, i) => {
            const g = GAMES[id];
            return (
              <Reveal key={id} delay={0.1 + i * 0.06} className="h-full">
                <div className="relative h-full overflow-hidden rounded-3xl p-6 bg-white/[0.04] ring-1 ring-white/[0.08]">
                  <span aria-hidden className="absolute -end-12 -top-12 w-40 h-40 rounded-full blur-3xl opacity-25" style={{ background: g.color }} />
                  <div className="relative flex items-start justify-between gap-3">
                    <GameIcon game={id} />
                    <span className="rounded-full bg-white/[0.08] px-2.5 py-1 font-mono text-xs text-white">{g.age ? `${g.age}+` : 'all ages'}</span>
                  </div>
                  <h3 className="relative mt-5 text-lg font-bold text-white">{g.name}</h3>
                  <p className="relative mt-1.5 text-zinc-300">{g.tagline}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={0.3}><p className="mt-6 flex items-center gap-2 text-sm text-zinc-400"><Lock className="w-4 h-4" aria-hidden />Rated worlds check your age.</p></Reveal>
      </Section>
    </>
  );
}
