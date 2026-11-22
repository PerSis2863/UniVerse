'use client';

import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import { HandHeart, Handshake, Truck } from 'lucide-react';
import { Accent, EASE, Reveal, tile } from './bits';

// More of the Relief tab on the landing (M43; Green's left with Green, M395): a "try it here" demo
// (./TryIt, loaded only when its tab is open) and two short picture sections. Illustrations only.

const box = (h: string) => function Box() { return <div className={`${tile} ${h}`} />; };
const ReliefTry = dynamic(() => import('./TryIt').then((x) => x.ReliefTry), { loading: box('h-[640px] lg:h-[440px]') });

function Head({ title, accent }: { title: string; accent: string }) {
  return <Reveal delay={0.05}><h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white max-w-3xl">{title} <Accent>{accent}</Accent></h2></Reveal>;
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return <section id={id} className="px-6 py-20 scroll-mt-24"><div className="max-w-6xl mx-auto">{children}</div></section>;
}

function TrySection({ id, title, accent, children }: { id: string; title: string; accent: string; children: React.ReactNode }) {
  return (
    <Section id={id}>
      <Head title={title} accent={accent} />
      <Reveal delay={0.1} className="mt-10">{children}</Reveal>
    </Section>
  );
}

/** Three steps on a line that draws itself in. */
function Steps({ steps, color }: { steps: readonly (readonly [typeof HandHeart, string, string])[]; color: string }) {
  return (
    <ol className="relative mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
      <motion.span aria-hidden className="hidden md:block absolute top-10 start-[16%] end-[16%] h-px origin-left rtl:origin-right" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 1.2, ease: EASE }} />
      {steps.map(([Icon, t, d], i) => (
        <Reveal key={t} role="listitem" delay={0.1 + i * 0.08} className="relative text-center">
          <span className="mx-auto w-20 h-20 grid place-items-center rounded-full bg-[#0f0f11] ring-1 ring-white/10" style={{ boxShadow: `0 0 40px -10px ${color}` }}><Icon className="w-8 h-8" style={{ color }} aria-hidden /></span>
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
    <dl className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map(([n, t], i) => (
        <Reveal key={t} delay={0.1 + i * 0.08} className={`${tile} p-6`}>
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
        <Head title="Ask. Match." accent="Done." />
        <Steps color="#fdba74" steps={[
          [HandHeart, 'Ask', 'What, how urgent, roughly where.'],
          [Handshake, 'Matched', 'A helper nearby taps “I can help”.'],
          [Truck, 'Delivered', 'Marked done. The map updates.'],
        ] as const} />
      </Section>
      <Section id="relief-safe">
        <Head title="Your area," accent="never your door." />
        <Figures color="#fdba74" items={[
          ['500 m', 'Only the area shows, not an address'],
          ['30 days', 'Then a request leaves the map'],
          ['Never', 'Is a helper’s location shown'],
        ] as const} />
      </Section>
    </>
  );
}
