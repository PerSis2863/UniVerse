'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { Wallet } from 'lucide-react';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { HeatStrip, Spark } from '@/components/instruments/parts';
import { AppIcon } from '@/components/apps/AppIcon';
import Link from '@/components/ui/Link';
import { appById, appHome } from '@/lib/apps';
import { fetcher } from '@/lib/fetcher';
import { WALLET_WEEKS, type WalletEvent } from '@/lib/impact-wallet';
import { useAuthStore } from '@/store/auth';
import { WalletCards, type WalletCard } from './WalletCards';

// The Impact Wallet on /hub: what I hold in every app, each in its own unit, and one history across
// them (GET /hub/wallet, src/server/impact-wallet.ts). It opens with a card per app (WalletCards, M52).

interface WalletData {
  campus: { points: number; courses: number; weeks: number[] };
  trace: { points: number; brands: number; worth: { currency: string; amount: number }[]; weeks: number[] };
  relief: { people: number; deliveries: number; received: number; weeks: number[] };
  green: { kg: number; actions: number; streak: number; badges: number; badgesOf: number; weeks: number[] };
  events: WalletEvent[];
}

const money = (amount: number, currency: string) => { try { return amount.toLocaleString(undefined, { style: 'currency', currency }); } catch { return `${amount} ${currency}`; } };
/** A number as four embossed digits (9999 at most). */
const four = (n: number) => String(Math.max(0, Math.min(9999, Math.round(n)))).padStart(4, '0');
const weekLabels = () => Array.from({ length: WALLET_WEEKS }, (_, i) => (i === WALLET_WEEKS - 1 ? 'This week' : `${WALLET_WEEKS - 1 - i} w ago`));

export function ImpactWallet({ role }: { role: string }) {
  const { data } = useSWR<WalletData>('/hub/wallet', fetcher);
  const holder = useAuthStore((s) => s.user?.name) ?? '';
  const [more, setMore] = useState(false);
  if (!data) return <section className="panel h-64 animate-pulse" aria-label="Impact Wallet, loading" />;
  const labels = weekLabels();
  const active = data.campus.weeks.map((_, i) => [data.campus, data.trace, data.relief, data.green].some((a) => a.weeks[i] > 0)).filter(Boolean).length;
  const cells: InstrumentCell[] = [
    { id: 'campus', label: 'Impact points · UniVersity', value: data.campus.points, unit: 'points', note: `${data.campus.courses} course${data.campus.courses === 1 ? '' : 's'}`,
      body: <Spark values={data.campus.weeks} />, detail: { title: 'Impact points, last 12 weeks', description: 'Points earned each week from volunteering and projects.', series: data.campus.weeks, labels } },
    { id: 'trace', label: 'Trace points', value: data.trace.points, unit: 'points',
      note: data.trace.worth.length ? `worth ${data.trace.worth.map((w) => money(w.amount, w.currency)).join(' + ')} · ${data.trace.brands} brand${data.trace.brands === 1 ? '' : 's'}` : 'Scan a product to earn',
      body: <Spark values={data.trace.weeks} />, detail: { title: 'Trace points, last 12 weeks', description: 'Points earned each week from scans and campaigns.', series: data.trace.weeks, labels } },
    { id: 'relief', label: 'People helped · Relief', value: data.relief.people, unit: 'people', note: `${data.relief.deliveries} deliver${data.relief.deliveries === 1 ? 'y' : 'ies'} · ${data.relief.received} of my needs met`,
      body: <Spark values={data.relief.weeks} />, detail: { title: 'People helped, last 12 weeks', description: 'People reached each week by the requests you delivered.', series: data.relief.weeks, labels } },
    { id: 'green', label: 'CO₂ saved · Green', value: data.green.kg, digits: 1, unit: 'kg', note: `${data.green.streak}-day streak · ${data.green.badges}/${data.green.badgesOf} badges`,
      body: <Spark values={data.green.weeks} />, detail: { title: 'CO₂ saved, last 12 weeks', description: 'Kilograms of CO₂ saved each week by the actions you logged.', series: data.green.weeks, labels } },
    { id: 'weeks', label: 'Active weeks, every app', value: active, unit: `of ${WALLET_WEEKS}`,
      body: <HeatStrip rows={[{ label: 'Uni', values: data.campus.weeks }, { label: 'Trace', values: data.trace.weeks }, { label: 'Relief', values: data.relief.weeks }, { label: 'Green', values: data.green.weeks }]} foot={[`${WALLET_WEEKS} weeks ago`, 'now']} /> },
  ];
  const cards: WalletCard[] = [
    { id: 'impact', name: 'Impact', finish: 'abyss', line: [data.campus.points, data.trace.points, data.relief.people, data.green.kg].map(four).join(' '), under: ['Uni', 'Trace', 'Relief', 'Green'],
      value: String(active), unit: `of ${WALLET_WEEKS} weeks`, note: 'Every app on one card: points, people helped and CO₂ saved.', bar: { pct: active / WALLET_WEEKS, label: 'Weeks you did something, in any app' } },
    { id: 'trace', name: 'Trace points', finish: 'pink', line: `${data.trace.points.toLocaleString()} PTS`, value: data.trace.points.toLocaleString(), unit: 'points',
      note: data.trace.worth.length ? `Worth ${data.trace.worth.map((w) => money(w.amount, w.currency)).join(' + ')} at ${data.trace.brands} brand${data.trace.brands === 1 ? '' : 's'}` : 'Scan a product to earn points.' },
    { id: 'green', name: 'CO₂ saved', finish: 'aqua', line: `${data.green.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })} KG`, value: data.green.kg.toLocaleString(undefined, { maximumFractionDigits: 1 }), unit: 'kg',
      note: `${data.green.streak}-day streak`, bar: data.green.badgesOf ? { pct: data.green.badges / data.green.badgesOf, label: `${data.green.badges} of ${data.green.badgesOf} badges` } : undefined },
    { id: 'relief', name: 'People helped', finish: 'blue', line: `${data.relief.people.toLocaleString()} HELPED`, value: data.relief.people.toLocaleString(), unit: 'people',
      note: `${data.relief.deliveries} deliver${data.relief.deliveries === 1 ? 'y' : 'ies'} · ${data.relief.received} of my needs met` },
  ];
  const events = more ? data.events : data.events.slice(0, 8);
  return (
    <section aria-labelledby="wallet-h" className="space-y-3">
      <h2 id="wallet-h" className="sr-only">Impact Wallet</h2>
      <WalletCards cards={cards} holder={holder} />
      <InstrumentBoard icon={Wallet} title="Impact Wallet" subtitle="Everything you hold, in every app. Each keeps its own unit." cells={cells} live={false} storageKey="impact-wallet" />
      <div className="panel p-5">
        <h3 className="font-semibold text-zinc-900 dark:text-white">History across apps</h3>
        {data.events.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Nothing yet. Scan a product, log a climate action or help someone nearby, and it shows here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {events.map((e, i) => (
              <li key={`${e.app}-${e.at}-${i}`}>
                <Link href={appHome(e.app, role)} className="flex items-center gap-3 py-2.5">
                  <AppIcon id={e.app} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-900 dark:text-white" translate="no">{e.text}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{appById(e.app).name} · {formatDistanceToNow(new Date(e.at), { addSuffix: true })}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">{e.amount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data.events.length > 8 && <button type="button" onClick={() => setMore((v) => !v)} className="btn-secondary btn-sm mt-3">{more ? 'Show less' : `Show all ${data.events.length}`}</button>}
      </div>
    </section>
  );
}
