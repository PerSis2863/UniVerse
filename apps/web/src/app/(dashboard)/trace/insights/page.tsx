'use client';

import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { m as motion } from 'framer-motion';
import { BadgeCheck, Clock, Crown, Gift, Leaf, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// Insights (UniVerse Trace): what a brand's scans say about the weeks ahead. The next 14 days of
// checks (a forecast with its likely range), the busiest hours of the week, each shipment's CO₂, what
// owners rate the products, the shops that sell the most (with their Bronze, Silver and Gold tiers),
// instant-win prizes, registered warranties and the public trust score. Server: GET /trace/insights.

interface Insights {
  forecast: { days: string[]; series: number[]; next: { values: number[]; band: number[] } };
  heat: number[][]; best: { wd: number; h: number; n: number }[];
  carbon: { batches: { id: string; label: string; product: string; stops: number; km: number; kg: number; perUnitG: number }[]; kg: number };
  reviews: { avg: number | null; count: number; stars: number[]; recent: { id: string; stars: number; text: string | null; place: string | null; createdAt: string; product: string }[] };
  shops: { rank: number; name: string; sales: number; tier: { label: string; multiplier: number; next: { label: string; need: number } | null } }[];
  wins: { list: { id: string; prize: string; claimCode: string; place: string | null; redeemedAt: string | null; createdAt: string }[]; total: number; redeemed: number };
  warranties: { total: number; active: number };
  trust: { score: number; genuinePct: number };
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIER: Record<string, string> = { Gold: 'bg-amber-400/20 text-amber-700 dark:text-amber-200', Silver: 'bg-zinc-400/20 text-zinc-700 dark:text-zinc-200', Bronze: 'bg-orange-700/15 text-orange-800 dark:text-orange-300' };
const rise = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.05, duration: 0.35, ease: [0.23, 1, 0.32, 1] as const } });

export default function InsightsPage() {
  return (
    <>
      <Topbar title="Insights" subtitle="The weeks ahead, the best hours, your footprint and what owners say" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <TraceTabs />
          <Body />
        </div>
      </div>
    </>
  );
}

function Body() {
  const { data, error } = useSWR<Insights>('/trace/insights', fetcher, { revalidateOnFocus: false });
  if (error) return <p className="panel p-6 text-sm text-zinc-500">{errorMessage(error, 'Start your brand to see its insights.')}</p>;
  if (!data) return <div className="grid lg:grid-cols-3 gap-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="panel h-48 animate-pulse" />)}</div>;
  const next7 = Math.round(data.forecast.next.values.slice(0, 7).reduce((a, b) => a + b, 0));
  const last7 = data.forecast.series.slice(-7).reduce((a, b) => a + b, 0);
  const change = last7 ? Math.round(((next7 - last7) / last7) * 100) : 0;
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4">
        <motion.section {...rise(0)} className="panel p-5 lg:col-span-2" aria-labelledby="fc-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="fc-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><TrendingUp className="w-4 h-4 text-pink-500" aria-hidden />The next 14 days</h2>
            <p className="font-mono text-xs text-zinc-500">about <b className="text-zinc-900 dark:text-white">{next7.toLocaleString()}</b> checks next week · <span className={change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>{change >= 0 ? '+' : ''}{change}%</span></p>
          </div>
          <Forecast f={data.forecast} />
          <p className="mt-1 text-[11px] text-zinc-500">The last 60 days, then the forecast (the shaded band is the likely range). It follows the trend and each weekday’s usual rhythm.</p>
        </motion.section>
        <motion.section {...rise(1)} className="panel p-5 flex flex-col items-center text-center" aria-labelledby="trust-h">
          <h2 id="trust-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white self-start"><BadgeCheck className="w-4 h-4 text-pink-500" aria-hidden />Trust score</h2>
          <Ring value={data.trust.score} />
          <p className="text-xs text-zinc-500">{data.trust.genuinePct}% of checks genuine · ratings · how recalls were handled. Shown on your public brand page.</p>
        </motion.section>
      </div>

      <motion.section {...rise(2)} className="panel p-5" aria-labelledby="heat-h">
        <h2 id="heat-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Clock className="w-4 h-4 text-pink-500" aria-hidden />When people check your products</h2>
        <p className="text-xs text-zinc-500">{data.best.length && data.best[0].n ? `Busiest: ${data.best.map((b) => `${WD[b.wd]} ${String(b.h).padStart(2, '0')}:00`).join(', ')}. Good times for a campaign or a shop visit.` : 'Not enough checks yet.'} (UTC)</p>
        <Heat grid={data.heat} />
      </motion.section>

      <div className="grid lg:grid-cols-2 gap-4">
        <motion.section {...rise(3)} className="panel p-5" aria-labelledby="rev-h">
          <h2 id="rev-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Star className="w-4 h-4 text-amber-400" aria-hidden />What owners say</h2>
          {data.reviews.count === 0 ? <p className="mt-2 text-sm text-zinc-500">No reviews yet. Owners can rate a product from its passport, once per unit.</p> : (
            <>
              <div className="mt-2 flex items-center gap-4">
                <span className="font-mono text-4xl tabular-nums text-zinc-900 dark:text-white">{data.reviews.avg}</span>
                <div className="flex-1 space-y-1">
                  {[5, 4, 3, 2, 1].map((s) => {
                    const n = data.reviews.stars[s - 1], pct = (n / data.reviews.count) * 100;
                    return <div key={s} className="flex items-center gap-2 text-[11px] text-zinc-500"><span className="w-3">{s}</span><span className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><motion.span className="block h-full bg-amber-400" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }} /></span><span className="w-8 text-end font-mono">{n}</span></div>;
                  })}
                </div>
              </div>
              <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                {data.reviews.recent.filter((r) => r.text).map((r) => (
                  <li key={r.id} className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="text-amber-500" aria-label={`${r.stars} stars`}>{'★'.repeat(r.stars)}<span className="text-zinc-300 dark:text-zinc-600">{'★'.repeat(5 - r.stars)}</span></span>
                    <p className="text-zinc-700 dark:text-zinc-200">{r.text}</p>
                    <p className="font-mono text-[10px] text-zinc-500">{[r.product, r.place, formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </motion.section>

        <motion.section {...rise(4)} className="panel p-5" aria-labelledby="shops-h">
          <h2 id="shops-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Crown className="w-4 h-4 text-amber-500" aria-hidden />Best shops (90 days)</h2>
          <p className="text-xs text-zinc-500">Verified sales. Silver shops (20+) earn ×1.25 points per unit, Gold (100+) ×1.5.</p>
          {data.shops.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No shop has claimed a unit yet.</p> : (
            <ol className="mt-3 space-y-1.5">
              {data.shops.map((s) => (
                <li key={s.rank} className="flex items-center gap-3 text-sm">
                  <span className="w-5 font-mono text-xs text-zinc-500">{s.rank}</span>
                  <span className="flex-1 min-w-0 truncate text-zinc-900 dark:text-white">{s.name}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', TIER[s.tier.label])}>{s.tier.label}</span>
                  <span className="w-14 text-end font-mono text-xs tabular-nums">{s.sales}</span>
                </li>
              ))}
            </ol>
          )}
        </motion.section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <motion.section {...rise(5)} className="panel p-5 lg:col-span-2" aria-labelledby="co2-h">
          <h2 id="co2-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Leaf className="w-4 h-4 text-emerald-500" aria-hidden />Footprint of each shipment</h2>
          <p className="text-xs text-zinc-500">From the stops recorded on each batch and the product’s weight: about 0.12 kg CO₂ per tonne-km by road, 0.02 by sea. {data.carbon.kg ? `${data.carbon.kg.toLocaleString()} kg in all.` : ''}</p>
          {data.carbon.batches.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Record at least two stops on a batch (with places on the map) to see its footprint.</p> : (
            <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/5">
              {data.carbon.batches.slice(0, 10).map((b) => (
                <li key={b.id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0 truncate"><span className="text-zinc-900 dark:text-white">{b.product}</span><span className="text-zinc-500"> · {b.label}</span></span>
                  <span className="font-mono text-xs text-zinc-500">{b.km.toLocaleString()} km</span>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 w-28 text-end">{b.perUnitG} g per unit</span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
        <motion.section {...rise(6)} className="panel p-5 space-y-4" aria-label="Prizes and warranties">
          <div>
            <h2 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Gift className="w-4 h-4 text-amber-500" aria-hidden />Instant wins</h2>
            <p className="mt-1 font-mono text-2xl tabular-nums text-zinc-900 dark:text-white">{data.wins.total}<span className="text-xs text-zinc-500"> won · {data.wins.redeemed} handed over</span></p>
            <p className="text-xs text-zinc-500">Set the odds and the prize on a product in the console.</p>
          </div>
          <div>
            <h2 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><ShieldCheck className="w-4 h-4 text-pink-500" aria-hidden />Warranties</h2>
            <p className="mt-1 font-mono text-2xl tabular-nums text-zinc-900 dark:text-white">{data.warranties.active}<span className="text-xs text-zinc-500"> active · {data.warranties.total} registered</span></p>
            <p className="text-xs text-zinc-500">Buyers register from the passport; you get their name and email.</p>
          </div>
        </motion.section>
      </div>
    </>
  );
}

function Forecast({ f }: { f: Insights['forecast'] }) {
  const W = 640, H = 180, P = 6;
  const all = [...f.series, ...f.next.values.map((v, i) => v + f.next.band[i])];
  const max = Math.max(1, ...all), n = f.series.length + f.next.values.length;
  const x = (i: number) => P + (i / (n - 1)) * (W - 2 * P), y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const past = f.series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const s0 = f.series.length - 1;
  const fut = [`M${x(s0).toFixed(1)},${y(f.series[s0] ?? 0).toFixed(1)}`, ...f.next.values.map((v, i) => `L${x(s0 + 1 + i).toFixed(1)},${y(v).toFixed(1)}`)].join('');
  const band = [...f.next.values.map((v, i) => `${i ? 'L' : 'M'}${x(s0 + 1 + i).toFixed(1)},${y(v + f.next.band[i]).toFixed(1)}`), ...f.next.values.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `L${x(s0 + 1 + i).toFixed(1)},${y(Math.max(0, v - f.next.band[i])).toFixed(1)}`), 'Z'].join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-44" role="img" aria-label="Checks per day for the last 60 days and the 14-day forecast">
      <line x1={x(s0)} x2={x(s0)} y1={P} y2={H - P} className="stroke-zinc-300 dark:stroke-white/15" strokeDasharray="3 4" />
      <path d={band} className="fill-pink-500/15" />
      <motion.path d={past} fill="none" className="stroke-zinc-500 dark:stroke-zinc-300" strokeWidth={1.6} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }} />
      <motion.path d={fut} fill="none" stroke="#ec4899" strokeWidth={2.2} strokeDasharray="5 4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.4 }} />
      <text x={x(s0) + 6} y={P + 10} className="fill-pink-500 font-mono" fontSize={10}>forecast</text>
    </svg>
  );
}

function Heat({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="min-w-[560px]">
        {order.map((wd) => (
          <div key={wd} className="flex items-center gap-1 mb-1">
            <span className="w-9 text-[10px] font-mono text-zinc-500">{WD[wd]}</span>
            {grid[wd].map((n, h) => (
              <span key={h} title={`${WD[wd]} ${String(h).padStart(2, '0')}:00 · ${n} checks`} className="flex-1 h-5 rounded-[4px]" style={{ background: n ? `rgb(236 72 153 / ${0.12 + (n / max) * 0.88})` : 'rgb(127 127 127 / 0.08)' }} />
            ))}
          </div>
        ))}
        <div className="flex gap-1 ps-10 text-[9px] font-mono text-zinc-500">{Array.from({ length: 24 }, (_, h) => <span key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ''}</span>)}</div>
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const tone = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#f43f5e';
  return (
    <svg viewBox="0 0 128 128" className="w-36 h-36 my-2" role="img" aria-label={`Trust score ${value} of 100`}>
      <circle cx={64} cy={64} r={r} fill="none" className="stroke-zinc-200 dark:stroke-white/10" strokeWidth={10} />
      <motion.circle cx={64} cy={64} r={r} fill="none" stroke={tone} strokeWidth={10} strokeLinecap="round" transform="rotate(-90 64 64)" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }} />
      <text x={64} y={70} textAnchor="middle" className="fill-zinc-900 dark:fill-white font-mono" fontSize={30}>{value}</text>
    </svg>
  );
}
