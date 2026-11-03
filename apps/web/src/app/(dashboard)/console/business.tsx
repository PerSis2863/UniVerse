'use client';

import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { m as motion } from 'framer-motion';
import { AlertOctagon, Building2, Crown, Globe2, ScanLine } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useActivePoll } from '@/lib/realtime-client';
import { fmt } from '@/lib/instruments';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Facts, HeatStrip, Meter, Ring, Spark, Stack } from '@/components/instruments/parts';
import { cn } from '@/lib/utils';
import { card, fetcher, ConsoleSkeleton } from './shared';

// The owner console's Business section (UniVerse Trace across every brand): GET /trace/owner
// (src/server/trace-owner.ts). The network's size, what it earns, scans and copies per day, the
// busiest brands, countries and categories, and what needs the owner.

interface Business {
  brands: number; pro: number; free: number; units: number; scans: number; suspect: number; countryCount: number; points: number;
  revenue: { mrr: number; fees: number; campaigns: number; activeCampaigns: number };
  cashouts: { pending: number; pendingAmount: number; paid: number; paidAmount: number };
  perDay: { day: string; scans: number; suspect: number }[];
  topBrands: { id: string; name: string; plan: string; color: string | null; category: string | null; scans: number; suspect: number }[];
  countries: { country: string; scans: number }[];
  categories: { category: string; scans: number }[];
  recalls: { id: string; reason: string; severity: string; brand: string; createdAt: string }[];
  newest: { id: string; name: string; plan: string; category: string | null; color: string | null; createdAt: string }[];
}

const eur = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '🌐');

export function BusinessPanel() {
  const { data: b } = useSWR<Business>('/trace/owner', fetcher, { refreshInterval: useActivePoll(60_000), keepPreviousData: true });
  if (!b) return <ConsoleSkeleton />;
  const labels = b.perDay.map((d) => new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  const scans = b.perDay.map((d) => d.scans), suspect = b.perDay.map((d) => d.suspect);
  const genuine = b.scans ? ((b.scans - b.suspect) / b.scans) * 100 : 100;
  const maxBrand = Math.max(1, ...b.topBrands.map((x) => x.scans)), maxCountry = Math.max(1, ...b.countries.map((x) => x.scans));
  const cells: InstrumentCell[] = [
    { id: 'scans', label: 'Scans · 30 days', value: b.scans, unit: 'scans', note: `${scans.at(-1) ?? 0} today`, body: <Spark values={scans} />, detail: { title: 'Scans per day, every brand', description: 'Every scan of a Trace passport in the last 30 days, across all brands.', series: scans, labels } },
    { id: 'genuine', label: 'Genuine', value: Math.round(genuine * 10) / 10, unit: '%', note: `${fmt(b.suspect)} likely copies`, body: <span className="flex justify-center"><Ring pct={Math.round(genuine * 10) / 10} label="genuine" size={100} /></span> },
    { id: 'mrr', label: 'PRO income a month', value: b.revenue.mrr, unit: '€', note: `${b.pro} PRO brands × 49 €`, body: <Meter pct={b.brands ? (b.pro / b.brands) * 100 : 0} /> },
    { id: 'fees', label: 'Campaign fees', value: Math.round(b.revenue.fees), unit: '€', note: `${b.revenue.activeCampaigns} running · ${b.revenue.campaigns} in all`, body: <Stack a={scans.map((n, i) => n - (suspect[i] ?? 0))} b={suspect} /> },
    { id: 'copies', label: 'Likely copies', value: b.suspect, unit: 'scans', warn: b.suspect > 0, body: <HeatStrip rows={[{ label: 'copies', values: suspect }, { label: 'scans', values: scans }]} foot={[labels[0] ?? '', 'today']} />, detail: { title: 'Likely copies per day', description: 'Scans of a code already scanned far away: a sign of a copied label.', series: suspect, labels, threshold: 1 } },
    { id: 'network', label: 'Network', value: b.brands, unit: 'brands', note: `${fmt(b.units)} passports · ${b.countryCount} countries`, body: <Facts rows={[['PRO', String(b.pro)], ['Free', String(b.free)], ['Points given', fmt(b.points)]]} /> },
    { id: 'cash', label: 'Cash-outs waiting', value: b.cashouts.pending, unit: 'requests', warn: b.cashouts.pending > 0, note: `${eur(b.cashouts.pendingAmount)} waiting · ${eur(b.cashouts.paidAmount)} paid`, body: <Facts rows={[['Waiting', String(b.cashouts.pending)], ['Paid', String(b.cashouts.paid)]]} /> },
  ];

  return (
    <div className="space-y-6">
      <InstrumentBoard icon={ScanLine} title="UniVerse Trace" subtitle={`${b.brands} brands · ${fmt(b.units)} passports · last 30 days`} cells={cells} storageKey="console-business" />

      <div className="grid lg:grid-cols-2 gap-4">
        <section className={cn(card, 'p-5')} aria-labelledby="biz-brands">
          <h3 id="biz-brands" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-pink-500" aria-hidden />Busiest brands</h3>
          <ol className="mt-3 space-y-2">
            {b.topBrands.map((x, i) => (
              <li key={x.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg grid place-items-center text-[11px] font-black text-white shrink-0" style={{ background: x.color ?? '#fe81d1' }} aria-hidden>{x.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{x.name} <span className="text-zinc-500 text-xs">{x.category}</span></span>
                  {x.plan === 'PRO' && <Crown className="w-3.5 h-3.5 text-fuchsia-500" aria-label="PRO" />}
                  {x.suspect > 0 && <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">{x.suspect} copies</span>}
                  <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300 w-14 text-right">{fmt(x.scans)}</span>
                </div>
                <div className="mt-1 ml-8 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500" initial={{ width: 0 }} animate={{ width: `${(x.scans / maxBrand) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.03 }} /></div>
              </li>
            ))}
            {!b.topBrands.length && <li className="text-sm text-zinc-500">No brands yet.</li>}
          </ol>
          <Link href="/trace/brands" className="btn-secondary btn-sm mt-4 inline-flex">All brands and plans</Link>
        </section>

        <section className={cn(card, 'p-5')} aria-labelledby="biz-countries">
          <h3 id="biz-countries" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Globe2 className="w-4 h-4 text-pink-500" aria-hidden />Where scans happen</h3>
          <ul className="mt-3 space-y-2">
            {b.countries.map((c, i) => (
              <li key={c.country} className="text-sm">
                <div className="flex items-center gap-2"><span aria-hidden>{flag(c.country)}</span><span className="flex-1 text-zinc-800 dark:text-zinc-100">{c.country}</span><span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{fmt(c.scans)}</span></div>
                <div className="mt-1 ml-6 h-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden"><motion.div className="h-full rounded-full bg-indigo-500" initial={{ width: 0 }} animate={{ width: `${(c.scans / maxCountry) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.03 }} /></div>
              </li>
            ))}
          </ul>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Categories</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">{b.categories.map((c) => <span key={c.category} className="rounded-full bg-zinc-100 dark:bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-200">{c.category} · <span className="font-mono">{fmt(c.scans)}</span></span>)}</div>
        </section>

        <section className={cn(card, 'p-5')} aria-labelledby="biz-recalls">
          <h3 id="biz-recalls" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-rose-500" aria-hidden />Active recalls</h3>
          {b.recalls.length === 0 ? <p className="mt-2 text-sm text-zinc-500">None right now.</p> : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {b.recalls.map((r) => <li key={r.id} className="py-2 text-sm"><span className="font-semibold text-zinc-900 dark:text-white">{r.brand}</span> <span className="text-zinc-500">· {r.reason}</span><span className="block font-mono text-[11px] text-zinc-500">{r.severity} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span></li>)}
            </ul>
          )}
        </section>

        <section className={cn(card, 'p-5')} aria-labelledby="biz-new">
          <h3 id="biz-new" className="font-bold text-zinc-900 dark:text-white">Newest brands</h3>
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {b.newest.map((x) => (
              <li key={x.id} className="py-2 flex items-center gap-2 text-sm">
                <span className="w-6 h-6 rounded-lg grid place-items-center text-[11px] font-black text-white shrink-0" style={{ background: x.color ?? '#fe81d1' }} aria-hidden>{x.name.slice(0, 1)}</span>
                <span className="flex-1 min-w-0 truncate text-zinc-800 dark:text-zinc-100">{x.name}</span>
                <span className="text-[11px] text-zinc-500">{x.plan} · {formatDistanceToNow(new Date(x.createdAt), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
