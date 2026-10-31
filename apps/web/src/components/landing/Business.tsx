import { Banknote, Check, Crown, Globe2, Megaphone, Printer, Radio, Rocket, ScanLine, ShieldCheck, Truck, Wallet } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LiveMapShowcase } from './LiveMapShowcase';
import { Accent, Reveal, ghost, glass, primary } from './bits';

// The landing page's business sections (UniVerse Trace, business mode): the live maps, how it works,
// pay-per-verified-sale campaigns with the shops' wallet, and the two plans. Only what the product
// does: no invented customers, numbers or quotes.

export function MapsSection() {
  return (
    <section id="product" className="relative px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Watch your products <Accent>move.</Accent></h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl">Every scan and every shipment, live on the map.</p></Reveal>
        <Reveal delay={0.15}>
          <div className={`${glass} mt-10 overflow-hidden p-0`}>
            <LiveMapShowcase className="w-full h-[min(62vh,520px)]" />
          </div>
        </Reveal>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {[
            [Globe2, 'Market map', 'Where it sells, and where copies appear.'],
            [Truck, 'Tracking map', 'Where each batch is, and when it arrives.'],
            [Crown, 'Your whole category (PRO)', 'Your share in every city, anonymised.'],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof Globe2;
            return (
              <Reveal key={t as string} delay={0.1 + i * 0.06}>
                <div className="h-full rounded-3xl p-6 bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-pink-400/40 transition-shadow">
                  <I className="w-6 h-6 text-pink-300" aria-hidden />
                  <h3 className="mt-4 text-lg font-bold text-white">{t as string}</h3>
                  <p className="mt-2 text-zinc-300 leading-relaxed">{d as string}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Rocket, t: 'Start free', d: 'Name your brand, add a product.' },
  { icon: Printer, t: 'Print the codes', d: 'One code per unit. Impossible to guess.' },
  { icon: ScanLine, t: 'Everyone scans', d: 'Buyers check, shops earn, drivers share.' },
  { icon: Radio, t: 'You see and act', d: 'Live maps, copies caught, campaigns.' },
];

export function HowSection() {
  return (
    <section id="how" className="relative px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">Four steps. <Accent>No hardware.</Accent></h2></Reveal>
        <ol className="mt-12 grid md:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.t} role="listitem" delay={0.08 + i * 0.07}>
              <div className="relative h-full rounded-3xl p-6 bg-white/[0.04] ring-1 ring-white/[0.08]">
                <span className="font-mono text-xs text-pink-300">0{i + 1}</span>
                <s.icon className="mt-3 w-6 h-6 text-white" aria-hidden />
                <h3 className="mt-4 text-lg font-bold text-white">{s.t}</h3>
                <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{s.d}</p>
                {i < STEPS.length - 1 && <span aria-hidden className="hidden md:block absolute top-1/2 -end-3 w-6 h-px bg-gradient-to-r rtl:bg-gradient-to-l from-pink-400/60 to-transparent" />}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function CampaignsSection() {
  return (
    <section id="campaigns" className="relative px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight text-white">Pay only for <Accent>proven</Accent> sales.</h2></Reveal>
          <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300">Pay shops only for real sales, in the city you pick.</p></Reveal>
          <Reveal delay={0.15}>
            <ul className="mt-6 space-y-2.5 text-zinc-200">
              {[[Megaphone, 'A budget that stops paying by itself'], [Wallet, 'One wallet for every shop, with points from every brand'], [Banknote, 'Cash-outs the brand marks paid, or refuses and refunds'], [ShieldCheck, 'Every point in a hash-chained ledger nobody can quietly change']].map(([Icon, t]) => {
                const I = Icon as typeof Wallet;
                return <li key={t as string} className="flex items-center gap-3"><I className="w-5 h-5 text-pink-300 shrink-0" aria-hidden />{t as string}</li>;
              })}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div className={`${glass} p-6 sm:p-8`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">Paris launch</p>
              <span className="rounded-full bg-pink-500/15 px-2.5 py-1 text-[11px] font-semibold text-pink-200">Running</span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">+50 points per genuine bottle · within 30 km of Paris</p>
            <div className="mt-6 h-2 rounded-full bg-white/[0.08] overflow-hidden"><div className="h-full w-[38%] rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 bar-glint" /></div>
            <div className="mt-2 flex justify-between text-xs text-zinc-400"><span>budget used</span><span>38%</span></div>
            <ul className="mt-6 space-y-2">
              {['Épicerie Oberkampf', 'Marché Bastille', 'Cave du 11e'].map((s) => (
                <li key={s} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm">
                  <Check className="w-4 h-4 text-emerald-300" aria-hidden />
                  <span className="flex-1 text-zinc-200">{s} <span className="text-zinc-500">· example shop</span></span>
                  <span className="font-mono font-semibold text-pink-200">+50</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="relative px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white">Free to start. <Accent>Pay as it sells.</Accent></h2></Reveal>
        <div className="mt-12 grid md:grid-cols-2 gap-4">
          <Reveal delay={0.1}>
            <div className="h-full rounded-3xl p-8 bg-white/[0.04] ring-1 ring-white/[0.08]">
              <p className="text-xs text-zinc-400">FREE</p>
              <p className="mt-3 text-5xl font-bold text-white">0 €</p>
              <ul className="mt-6 space-y-2.5 text-zinc-300">
                {['10,000 product passports', 'Your live market map and tracking', 'Shop rewards and the wallet', 'Campaigns at 5 cents per verified sale'].map((t) => <li key={t} className="flex gap-3"><Check className="w-5 h-5 text-pink-300 shrink-0" aria-hidden />{t}</li>)}
              </ul>
              <Link href="/register" className={`${primary} mt-8`}>Start free</Link>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="h-full rounded-3xl p-8 ring-1 ring-fuchsia-400/30 bg-gradient-to-br from-[#222c5a] to-[#131a3d] relative overflow-hidden">
              <span aria-hidden className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
              <p className="relative text-xs text-fuchsia-200">PRO</p>
              <p className="relative mt-3 text-5xl font-bold text-white">Market intelligence</p>
              <ul className="relative mt-6 space-y-2.5 text-zinc-200">
                {['1,000,000 product passports', 'Your whole category on the map', 'Your share in every city, and where you’re missing', 'Everything in Free'].map((t) => <li key={t} className="flex gap-3"><Crown className="w-5 h-5 text-fuchsia-300 shrink-0" aria-hidden />{t}</li>)}
              </ul>
              <Link href="/contact" className={`${ghost} relative mt-8`}>Talk to us</Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
