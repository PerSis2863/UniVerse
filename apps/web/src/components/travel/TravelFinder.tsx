'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, Check, CloudRain, Minus, Plus, Sun, Thermometer } from 'lucide-react';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { IDEAS, INTERESTS, type Interest } from '@/lib/travel-ideas';
import { CURRENCIES, MONEY_YEAR, MONTHS, currencyOf, money, rankPlaces, type Match } from '@/lib/travel-find';
import type { VisaRule } from '@/lib/travel-visa';
import VISA_TITLES from '@/lib/travel-visa-titles.json';
import { morph } from '@/lib/view-transition';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { Cover, useHome } from './travel-ui';

// "Find a destination" in Explore (M205, the owner's item 1): days, a budget, the month, what you love
// and your passport; every place ranked at once with why it fits (that month's weather, an estimated
// daily cost, its interests, the visa). Ranked in the browser (src/lib/travel-find.ts), so each change
// answers instantly and the cards slide to their new places.

/** A name from Intl, or the code itself if the browser doesn't know it. */
const named = (dn: Intl.DisplayNames, code: string) => { try { return dn.of(code) ?? code; } catch { return code; } };
const flag = (cc: string) => String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-400/60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const labelCls = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';

export function TravelFinder({ onPlan }: { onPlan?: (m: Match, days: number, month: number) => void }) {
  const [home] = useHome();
  const now = useNow();
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState(400);
  const [currency, setCurrency] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [interests, setInterests] = useState<Interest[]>(['street', 'history', 'walk']);
  const [passport, setPassport] = useState<string | null>(null);
  const [shown, setShown] = useState(12);
  const list = useRef<HTMLOListElement>(null);

  const pass = passport ?? (home && home in VISA_TITLES ? home : null);
  const cur = currency ?? (home && CURRENCIES.includes(currencyOf(home)) ? currencyOf(home) : 'EUR');
  // Next month, by default (the server render has no clock: January until the browser takes over).
  const mon = month ?? (now ? (new Date(now).getMonth() + 1) % 12 : 0);
  const { data: visas } = useSWR<{ rules: Record<string, VisaRule>; credit: { url: string } }>(pass ? `/travel/visa?p=${pass}` : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const ranked = useMemo(() => rankPlaces(IDEAS, { days, budget, currency: cur, month: mon, interests, passport: pass ?? undefined }, visas?.rules ?? null), [days, budget, cur, mon, interests, pass, visas]);
  const passports = useMemo(() => {
    const dn = new Intl.DisplayNames(undefined, { type: 'region' });
    return Object.keys(VISA_TITLES).map((c) => [c, named(dn, c)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, []);
  const moneyNames = useMemo(() => { const dn = new Intl.DisplayNames(undefined, { type: 'currency' }); return CURRENCIES.map((c) => [c, named(dn, c)] as const); }, []);
  // Every change re-ranks; the cards glide to their new places (FLIP, src/lib/view-transition.ts).
  const change = (f: () => void) => morph(list.current, f);
  const top = ranked[0]?.score ?? 1, bottom = ranked[Math.min(ranked.length - 1, 40)]?.score ?? 0;

  return (
    <div className="space-y-6">
      <section className="panel relative p-6 sm:p-8" aria-labelledby="find-title">
        <h2 id="find-title" className="relative font-semibold tracking-tight text-zinc-900 dark:text-white" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', lineHeight: 1.1 }}>Where should I <em className="accent-word pe-1">go?</em></h2>
        <p className="relative mt-2 max-w-2xl text-zinc-600 dark:text-zinc-300">Your days, budget and what you love: {IDEAS.length} places ranked for that month, with the reasons.</p>
        {/* M288: on a phone days and month share a row, then the budget and the passport. */}
        <div className="relative mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div>
            <span className={labelCls} id="find-days">Days</span>
            <div className="mt-1 flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.05]" role="group" aria-labelledby="find-days">
              <button type="button" className="btn-ghost btn-sm" aria-label="One day fewer" disabled={days <= 1} onClick={() => change(() => setDays((d) => Math.max(1, d - 1)))}><Minus className="h-4 w-4" aria-hidden /></button>
              <input type="number" inputMode="numeric" min={1} max={60} value={days} aria-labelledby="find-days" onChange={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 60) change(() => setDays(v)); }} className="w-full bg-transparent text-center text-base font-semibold tabular-nums text-zinc-900 outline-none dark:text-white" />
              <button type="button" className="btn-ghost btn-sm" aria-label="One day more" disabled={days >= 60} onClick={() => change(() => setDays((d) => Math.min(60, d + 1)))}><Plus className="h-4 w-4" aria-hidden /></button>
            </div>
          </div>
          <div className="col-span-2 max-sm:order-1 sm:col-span-1">
            <label className={labelCls} htmlFor="find-budget">Budget per person</label>
            <div className="mt-1 flex gap-2">
              <input id="find-budget" type="number" inputMode="numeric" min={0} step={50} value={budget || ''} placeholder="Any" onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); change(() => setBudget(v)); }} className={cn(field, 'mt-0 min-w-0 flex-1 tabular-nums')} />
              <select aria-label="Currency" value={cur} onChange={(e) => { const v = e.target.value; change(() => setCurrency(v)); }} className={cn(field, 'mt-0 w-24 shrink-0')}>
                {moneyNames.map(([c, n]) => <option key={c} value={c} title={n}>{c}</option>)}
              </select>
            </div>
          </div>
          <label className={labelCls}>Month
            <select value={mon} onChange={(e) => { const v = Number(e.target.value); change(() => setMonth(v)); }} className={field}>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </label>
          <label className={cn(labelCls, 'col-span-2 max-sm:order-2 sm:col-span-1')}>Your passport
            <select value={pass ?? ''} onChange={(e) => { const v = e.target.value; change(() => setPassport(v || null)); }} className={field}>
              <option value="">Don’t check visas</option>
              {passports.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="relative mt-5">
          <p className={labelCls} id="find-love">What you love</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-labelledby="find-love">
            {INTERESTS.map((i) => {
              const on = interests.includes(i.id);
              return (
                <button key={i.id} type="button" aria-pressed={on} onClick={() => change(() => setInterests((a) => (on ? a.filter((x) => x !== i.id) : [...a, i.id])))}
                  className={cn('inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors', on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/10')}>
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}{i.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="find-results">
        <h2 id="find-results" className="sr-only">Best places for you</h2>
        <ol ref={list} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-live="polite">
          {ranked.slice(0, shown).map((m, n) => <MatchCard key={m.idea.title} m={m} rank={n + 1} share={Math.max(0.06, (m.score - bottom) / Math.max(1, top - bottom))} days={days} currency={cur} onPlan={onPlan ? () => onPlan(m, days, mon) : undefined} />)}
        </ol>
        {shown < ranked.length && <button type="button" onClick={() => setShown((s) => s + 12)} className="btn-secondary mt-4 inline-flex items-center gap-2">Show more places<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>}
        <p className="mt-4 max-w-4xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Costs are estimates per person, not counting getting there: a day at US prices for each style, scaled by the country’s price level (World Bank, {MONEY_YEAR}, CC BY 4.0) and changed at that year’s average rates.
          Weather: each guide’s climate chart (Wikivoyage), otherwise NASA POWER’s 2001–2025 averages.{visas && <> Visas: <a href={visas.credit.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Wikipedia</a> (CC BY-SA 4.0); rules change, so check the official ones before you book.</>}
        </p>
      </section>
    </div>
  );
}

function MatchCard({ m, rank, share, days, currency, onPlan }: { m: Match; rank: number; share: number; days: number; currency: string; onPlan?: () => void }) {
  const { idea, weather } = m;
  const words = m.score >= 7 ? 'Great match' : m.score >= 4 ? 'Good match' : m.score >= 1 ? 'Worth a look' : 'Not a great fit';
  return (
    <li data-key={idea.title} className="card flex flex-col overflow-hidden p-0!">
      <Link href={`/travel/guide?d=${encodeURIComponent(idea.title)}`} className="group relative block h-36 shrink-0 overflow-hidden">
        <Cover photo={idea.photo} banner={idea.banner} sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" priority={rank <= 4} className="transition-transform duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.04]" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
        <span className="absolute start-3 top-3 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-black/55 px-2 text-sm font-semibold tabular-nums text-white ring-1 ring-white/25" aria-hidden>{rank}</span>
        <span className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-white" translate="no">{idea.title.replace(/\s*\([^)]*\)/, '')}</span>
            <span className="block text-xs font-semibold text-indigo-100"><span aria-hidden>{flag(idea.cc)} </span>{idea.country}</span>
          </span>
          {weather && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold tabular-nums text-white" title={`${weather.high} °C by day, ${weather.low} °C at night, ${weather.rain} mm of rain`}>
              {weather.rain >= 150 ? <CloudRain className="h-3.5 w-3.5" aria-hidden /> : weather.high >= 17 ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Thermometer className="h-3.5 w-3.5" aria-hidden />}{weather.high}°
            </span>
          )}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className={cn(m.score >= 4 ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-600 dark:text-zinc-300')}>{words}</span>
            {m.perDay !== null && <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{money(m.perDay * days, currency)} for {days} {days === 1 ? 'day' : 'days'}</span>}
          </div>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden>
            <span className="block h-full origin-left rounded-full bg-indigo-500 transition-transform duration-300 ease-[var(--ease-glide)] rtl:origin-right" style={{ transform: `scaleX(${share})` }} />
          </span>
        </div>
        <ul className="space-y-1 text-sm">
          {m.reasons.map((r) => (
            <li key={r.text} className="flex items-start gap-2">
              {r.good ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
              <span className="text-zinc-700 dark:text-zinc-200"><span className="sr-only">{r.good ? 'Good: ' : 'Watch out: '}</span>{r.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{idea.blurb}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Link href={`/travel/guide?d=${encodeURIComponent(idea.title)}`} className="btn-secondary btn-sm inline-flex items-center gap-1.5">Open the guide</Link>
          {onPlan && <button type="button" onClick={onPlan} className="btn-primary btn-sm inline-flex items-center gap-1.5">Plan this trip<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>}
        </div>
      </div>
    </li>
  );
}
