'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BookOpen, Car, Droplets, HandCoins, Landmark, Moon, Plane, Plug, Shirt, ShieldAlert, Sparkles, Stamp, Sun, TramFront, Users, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { goodMonths, vibes, type Climate, type TipTopic, type Tips } from '@/lib/travel-tips';
import { cn } from '@/lib/utils';

// "Know before you go" in a place's guide (M187, the owner: what Airbnb lacks: tipping culture, scams,
// tap water, plugs, etiquette and dress codes, bite-sized stories, a neighbourhood's feel): a few short
// sentences per topic from the place's guide (its country's where the city's says nothing, and labelled
// so), plugs and voltage against the visitor's own country, the months that are pleasant there, and its
// districts with a word or two on each. Everything here is read from the guide: nothing is made up.

export interface KnowFacts { name: string; code: string; flag: string; drives?: 'left' | 'right'; plugs: string[]; volts: number[] }
type Row = [string, string[], string[], string, string, string[], string?, number[]?];

const TOPICS: { id: TipTopic; title: string; icon: LucideIcon }[] = [
  { id: 'tipping', title: 'Tipping', icon: HandCoins },
  { id: 'water', title: 'Tap water', icon: Droplets },
  { id: 'scams', title: 'Scams and pickpockets', icon: ShieldAlert },
  { id: 'manners', title: 'Manners', icon: Users },
  { id: 'dress', title: 'What to wear', icon: Shirt },
  { id: 'visa', title: 'Visas and entry', icon: Stamp },
  { id: 'airport', title: 'From the airport', icon: Plane },
  { id: 'transit', title: 'Tickets and travel cards', icon: TramFront },
  { id: 'night', title: 'After dark', icon: Moon },
];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 15).toLocaleDateString(undefined, { month: 'short' }));
const HOME_KEY = 'uv-travel-home';

/** The visitor's own country: what they chose before, otherwise their browser's region. */
function useHome(): [string | null, (c: string) => void] {
  const [chosen, setChosen] = useState<string | null>(null);
  const guess = useSyncExternalStore(() => () => {}, () => {
    try { return localStorage.getItem(HOME_KEY) ?? new Intl.Locale(navigator.language).maximize().region ?? null; } catch { return null; }
  }, () => null);
  const set = (c: string) => { setChosen(c); try { localStorage.setItem(HOME_KEY, c); } catch { /* private mode */ } };
  return [chosen ?? guess, set];
}

export function KnowTab({ title, tips, fromCountry, tipsCountry, country, climate, places }: {
  title: string; tips: Tips; fromCountry: TipTopic[]; tipsCountry: { name: string; credit: { url: string } } | null;
  country: KnowFacts | null; climate: Climate | null; places: { title: string; name: string; text?: string }[];
}) {
  const topics = TOPICS.filter((t) => tips[t.id]?.length);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {country && <PowerCard country={country} />}
        {climate && <ClimateCard climate={climate} place={title} />}
      </div>
      {tips.stories?.length ? (
        <section aria-labelledby="know-stories" className="panel p-6">
          <h3 id="know-stories" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Landmark className="h-5 w-5 text-sky-500" aria-hidden />Why {title} is famous</h3>
          <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tips.stories.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-white/[0.04]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sm font-semibold text-sky-700 tabular-nums dark:text-sky-300" aria-hidden>{i + 1}</span>
                <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{s}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {topics.length > 0 ? (
        <section aria-labelledby="know-tips">
          <h3 id="know-tips" className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Sparkles className="h-5 w-5 text-sky-500" aria-hidden />Good to know before you go</h3>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topics.map((t) => (
              <li key={t.id} className="card flex flex-col gap-2 p-4">
                <p className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><t.icon className="h-4 w-4 text-sky-500" aria-hidden />{t.title}</span>
                  {fromCountry.includes(t.id) && tipsCountry && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300" translate="no">{tipsCountry.name}</span>}
                </p>
                {tips[t.id]!.map((s, i) => <p key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{s}</p>)}
              </li>
            ))}
          </ul>
          {tipsCountry && fromCountry.length > 0 && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Cards marked <span translate="no">{tipsCountry.name}</span> come from <a href={tipsCountry.credit.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">its country guide</a>, where this place’s guide says nothing on it.</p>}
        </section>
      ) : (
        <p className="panel p-6 text-zinc-600 dark:text-zinc-300">This guide doesn’t say much about customs yet. The country’s own guide may: open it from the place’s name above.</p>
      )}
      {places.length > 0 && <Neighbourhoods places={places} night={tips.night ?? []} />}
    </div>
  );
}

/** Plugs and voltage there against the visitor's own country, and which side cars drive on. */
function PowerCard({ country }: { country: KnowFacts }) {
  const [home, setHome] = useHome();
  const [table, setTable] = useState<Record<string, Row> | null>(null);
  useEffect(() => { void import('@/lib/travel-countries.json').then((m) => setTable(m.default as unknown as Record<string, Row>)); }, []);
  const names = useMemo(() => {
    if (!table) return [];
    const dn = new Intl.DisplayNames(undefined, { type: 'region' });
    return Object.keys(table).map((c) => [c, dn.of(c) ?? c] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [table]);
  const mine = home && table?.[home];
  const myPlugs = mine ? [...(mine[6] ?? '')] : [], myVolts = mine?.[7] ?? [];
  const fits = country.plugs.filter((p) => myPlugs.includes(p) || (p === 'C' && myPlugs.some((x) => 'EFJKLN'.includes(x))));
  const sameVolts = myVolts.length > 0 && country.volts.some((v) => myVolts.some((m) => Math.abs(m - v) <= 20));
  const drivesHome = mine?.[3] === 'L' ? 'left' : mine?.[3] === 'R' ? 'right' : undefined;
  return (
    <section aria-labelledby="know-power" className="panel p-5">
      <h3 id="know-power" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Plug className="h-5 w-5 text-sky-500" aria-hidden />Plugs and power</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {country.plugs.length ? country.plugs.map((p) => <span key={p} className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-zinc-100 px-2 text-sm font-semibold text-zinc-800 dark:bg-white/[0.08] dark:text-zinc-100">Type {p}</span>) : <span className="text-sm text-zinc-500">Not known</span>}
        {country.volts.length > 0 && <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">· {country.volts.join(' / ')} V</span>}
      </div>
      <label className="mt-4 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Where you live
        <select value={home ?? ''} onChange={(e) => setHome(e.target.value)} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
          <option value="">Choose your country</option>
          {names.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </label>
      {mine && home !== country.code && (
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className={cn('rounded-lg px-3 py-2 font-semibold', fits.length ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
            {fits.length ? `Your plugs fit (type ${fits.join(', ')}).` : `Bring an adapter: your plugs (type ${myPlugs.join(', ') || '?'}) don’t fit type ${country.plugs.join(', ')}.`}
          </li>
          {myVolts.length > 0 && country.volts.length > 0 && (
            <li className={cn('rounded-lg px-3 py-2', sameVolts ? 'bg-zinc-50 text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
              {sameVolts ? 'Same voltage as at home.' : `Home is ${myVolts.join(' / ')} V, here ${country.volts.join(' / ')} V: check your charger says 100–240 V before plugging in.`}
            </li>
          )}
          {country.drives && drivesHome && <li className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-300"><Car className="h-4 w-4 shrink-0" aria-hidden />{country.drives === drivesHome ? `Cars drive on the ${country.drives}, as at home.` : `Cars drive on the ${country.drives}: look ${country.drives === 'left' ? 'right' : 'left'} first when crossing.`}</li>}
        </ul>
      )}
    </section>
  );
}

/** Each month's highs and rain, with the pleasant months marked. */
function ClimateCard({ climate, place }: { climate: Climate; place: string }) {
  const good = goodMonths(climate);
  const hi = Math.max(...climate.high, 1), lo = Math.min(...climate.low, 0), span = Math.max(1, hi - lo), rainMax = Math.max(...climate.rain, 1);
  const runs = good.length ? good.map((m) => MONTHS[m]).join(', ') : null;
  return (
    <section aria-labelledby="know-climate" className="panel p-5">
      <h3 id="know-climate" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Sun className="h-5 w-5 text-sky-500" aria-hidden />When to go</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{runs ? <>Pleasant for walking: <strong className="text-zinc-900 dark:text-white">{runs}</strong> (17–29 °C by day, little rain).</> : 'No month is mild and dry here: pick by the bars below.'}</p>
      <div className="mt-4 grid grid-cols-12 items-end gap-1" style={{ height: 132 }} aria-hidden>
        {climate.high.map((h, i) => (
          <div key={i} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="text-[11px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{h}°</span>
            <span className={cn('w-full origin-bottom rounded-t-md transition-transform', good.includes(i) ? 'bg-sky-500' : 'bg-zinc-300 dark:bg-white/20')} style={{ height: `${Math.max(6, ((h - lo) / span) * 78)}px` }} />
            <span className="w-full rounded-b-sm bg-sky-300/60 dark:bg-sky-300/30" style={{ height: `${Math.max(1, (climate.rain[i] / rainMax) * 14)}px` }} />
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{MONTHS[i].slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only"><caption>Average high, low and rain in {place} each month</caption><thead><tr><th>Month</th><th>High °C</th><th>Low °C</th><th>Rain mm</th></tr></thead>
        <tbody>{MONTHS.map((m, i) => <tr key={m}><td>{m}</td><td>{climate.high[i]}</td><td>{climate.low[i]}</td><td>{climate.rain[i]}</td></tr>)}</tbody></table>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Bars: the average high each month (blue: pleasant). The thin line under each: rain.</p>
    </section>
  );
}

/** The districts with a word or two on their feel, and what the guide says about them after dark. */
function Neighbourhoods({ places, night }: { places: { title: string; name: string; text?: string }[]; night: string[] }) {
  return (
    <section aria-labelledby="know-areas">
      <h3 id="know-areas" className="mb-3 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><BookOpen className="h-5 w-5 text-sky-500" aria-hidden />Neighbourhoods at a glance</h3>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {places.map((p) => {
          const words = vibes(p.text), dark = night.find((s) => s.toLowerCase().includes(p.name.toLowerCase()));
          return (
            <li key={p.title}>
              <Link href={`/travel/guide?d=${encodeURIComponent(p.title)}`} className="card flex h-full flex-col gap-2 p-4 transition-transform duration-200 hover:-translate-y-0.5">
                <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{p.name}</span>
                {words.length > 0 && <span className="flex flex-wrap gap-1">{words.map((w) => <span key={w} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">{w}</span>)}</span>}
                {p.text && <span className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">{p.text}</span>}
                {dark && <span className="flex gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300"><Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{dark}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
