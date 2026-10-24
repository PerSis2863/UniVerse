import { Factory, Gift, Radar, ScanLine, Store, UserCheck } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Accent, Reveal, Tag, ghost, primary } from './bits';

// The landing's UniVerse Trace section: one code on every unit, three people it serves, and the
// platform underneath (chat, training, rewards, live boards) that makes it more than a sticker.

const SIDES = [
  { icon: Factory, who: 'Brands', what: 'Give every unit a signed code. See where your products really end up, catch copied labels the day they appear, and reward the shops that sell you.' },
  { icon: Store, who: 'Shops & installers', what: 'Scan what you sell or fit and earn the brand’s points. Train, chat with the brand and climb the leaderboard, all in one app.' },
  { icon: UserCheck, who: 'Buyers', what: 'Point your camera at the label: genuine or not in a second, with the product’s story, where it has been and its warranty.' },
];
const UNDER = [
  [ScanLine, 'Signed codes nobody can guess or forge'],
  [Radar, 'Copies flagged by where and how often they’re scanned'],
  [Gift, 'Points in a ledger nobody can quietly change'],
] as const;

export function TraceSection() {
  return (
    <section id="trace" className="px-6 py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal><Tag>UniVerse Trace</Tag></Reveal>
        <Reveal delay={0.05}><h2 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl">One code. Supply chain <Accent>and</Accent> marketing.</h2></Reveal>
        <Reveal delay={0.1}><p className="mt-5 text-lg text-zinc-300 max-w-2xl">Every scan is two things at once: a record of where the product really is, and a moment with the person holding it. Most tools only see one of them.</p></Reveal>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {SIDES.map((s, i) => (
            <Reveal key={s.who} delay={0.1 + i * 0.06}>
              <div className="h-full rounded-3xl p-6 bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-pink-400/40 transition-shadow">
                <s.icon className="w-6 h-6 text-pink-300" aria-hidden />
                <h3 className="mt-4 text-xl font-bold text-white">{s.who}</h3>
                <p className="mt-2 text-zinc-300 leading-relaxed">{s.what}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3 font-mono text-sm text-zinc-300">
            {UNDER.map(([Icon, t]) => <li key={t} className="inline-flex items-center gap-2"><Icon className="w-4 h-4 text-pink-300" aria-hidden />{t}</li>)}
          </ul>
        </Reveal>
        <Reveal delay={0.25}>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/t/demo" className={primary}>Scan a sample passport</Link>
            <Link href="/register" className={ghost}>Give your products passports</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
