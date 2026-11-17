'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Map as MapIcon, Route, BedDouble, Bus, Camera, Car, ChefHat, ChevronRight, Compass, ExternalLink, Info, Languages, Lightbulb, MapPin, Phone, Plane, Search, ShieldAlert, ShoppingBag, Siren, Ticket, Train, Utensils, Wallet, Wine, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { bookingLinks, hostelLink, type BookKind } from '@/lib/travel-book';
import type { Guide, GuidePart, GuideSection, Listing } from '@/lib/travel-guide';
import { DIETS, priceBand, type Climate, type DietId, type TipTopic, type Tips } from '@/lib/travel-tips';
import { KnowTab } from './TravelKnow';
import { cn } from '@/lib/utils';
import { Cover, ListingCard, sky, startTrip, type Saved } from './travel-ui';

// A place's guide in UniVerse Travel (M202, /travel/guide?d=<Wikivoyage title>): its photo and opening,
// the country's facts (money, languages, driving side, emergency numbers), the week's weather, booking
// with partners, then a tab for each part (see, do, eat, drink, sleep, buy, getting around, staying safe
// and polite), every listed place with its details, a pin map, save and map buttons.

interface Facts { name: string; code: string; flag: string; capital?: string; currencies: { code: string; name: string }[]; languages: string[]; callingCode?: string; drives?: 'left' | 'right'; emergency: string[]; plugs: string[]; volts: number[] }
interface Answer {
  guide: Guide; country: Facts | null; credit: { source: string; licence: string; url: string };
  // M204: know before you go.
  tips?: Tips; climate?: Climate | null; fromCountry?: TipTopic[]; tipsCountry?: { name: string; credit: { url: string } } | null;
}
interface WeatherDay { date: string; min: number; max: number; symbol: string | null; rain: number }

type Tab = 'overview' | 'know' | 'see' | 'do' | 'eat' | 'drink' | 'sleep' | 'buy' | 'around' | 'safe';
const TABS: { id: Tab; label: string; icon: LucideIcon; parts: GuidePart[] }[] = [
  { id: 'overview', label: 'Overview', icon: Compass, parts: ['understand', 'go next'] },
  { id: 'know', label: 'Know before you go', icon: Lightbulb, parts: [] },
  { id: 'see', label: 'See', icon: Camera, parts: ['see'] },
  { id: 'do', label: 'Do', icon: Ticket, parts: ['do'] },
  { id: 'eat', label: 'Eat', icon: Utensils, parts: ['eat'] },
  { id: 'drink', label: 'Drink', icon: Wine, parts: ['drink'] },
  { id: 'sleep', label: 'Sleep', icon: BedDouble, parts: ['sleep'] },
  { id: 'buy', label: 'Buy', icon: ShoppingBag, parts: ['buy'] },
  { id: 'around', label: 'Getting around', icon: Bus, parts: ['get in', 'get around'] },
  { id: 'safe', label: 'Safe and polite', icon: ShieldAlert, parts: ['stay safe', 'respect', 'talk'] },
];
const BOOK_ICON: Record<BookKind, LucideIcon> = { stay: BedDouble, flight: Plane, tour: Ticket, train: Train };
const nice = (title: string) => title.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const guideHref = (title: string) => `/travel/guide?d=${encodeURIComponent(title)}`;

export function TravelGuide() {
  const d = useSearchParams().get('d') ?? '';
  const router = useRouter();
  const calm = useReducedMotion();
  const { data, error } = useSWR<Answer>(d ? `/travel/guide?d=${encodeURIComponent(d)}` : null, fetcher, { revalidateOnFocus: false });
  const g = data?.guide;
  const { data: wx } = useSWR<{ days: WeatherDay[]; credit: string }>(g?.lat !== undefined && g?.lon !== undefined ? `/travel/weather?lat=${g.lat.toFixed(2)}&lon=${g.lon.toFixed(2)}` : null, fetcher, { revalidateOnFocus: false });
  const { data: savedData } = useSWR<{ saved: Saved[] }>('/travel/saved', fetcher);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState('');
  // M204: the Eat, Drink and Sleep tabs narrow by price band and by what people can eat.
  const [band, setBand] = useState<'budget' | 'mid' | 'splurge' | null>(null);
  const [diet, setDiet] = useState<DietId | null>(null);

  const parts = useMemo(() => new Map((g?.sections ?? []).map((s) => [s.part, s])), [g]);
  const knows = !!(data?.country || data?.climate || Object.keys(data?.tips ?? {}).length);
  const tabs = TABS.filter((t) => t.id === 'overview' || (t.id === 'know' ? knows : t.parts.some((p) => { const s = parts.get(p); return s && (s.text.length || s.listings.length); })));
  const saved = useMemo(() => new Map((savedData?.saved ?? []).filter((s) => s.guide === g?.title).map((s) => [s.name, s])), [savedData, g]);

  if (error) return (
    <div className="panel mx-auto max-w-xl p-8 text-center">
      <MapPin className="mx-auto h-8 w-8 text-indigo-500" aria-hidden />
      <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">{(error as Error).message || 'That guide didn’t open.'}</p>
      <Link href="/travel" className="btn-primary mt-5 inline-flex items-center gap-2"><Search className="h-4 w-4" aria-hidden />Search another place</Link>
    </div>
  );
  if (!g) return <div className="space-y-4" aria-busy="true"><div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/70 dark:bg-white/[0.06]" /><div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" /></div>;

  const c = data.country, books = bookingLinks(g.title);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const sections = current.parts.map((p) => parts.get(p)).filter((s): s is GuideSection => !!s);
  const listings = sections.flatMap((s) => s.listings);
  const q = filter.trim().toLowerCase();
  const words = (l: Listing) => `${l.name} ${l.alt ?? ''} ${l.text ?? ''} ${l.group ?? ''}`;
  const bands = (['budget', 'mid', 'splurge'] as const).filter((b) => listings.some((l) => priceBand(l.group) === b));
  const diets = current.id === 'eat' || current.id === 'drink' ? DIETS.map((x) => ({ ...x, n: listings.filter((l) => x.says.test(words(l))).length })).filter((x) => x.n > 0) : [];
  const dietRe = DIETS.find((x) => x.id === diet)?.says;
  const shown = listings.filter((l) => (!q || `${words(l)} ${l.address ?? ''}`.toLowerCase().includes(q)) && (!band || priceBand(l.group) === band) && (!dietRe || dietRe.test(words(l))));

  return (
    <div className="space-y-6">
      {/* The photo and the opening. */}
      <section className="relative isolate flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-6 pt-16 sm:min-h-[22rem] sm:p-8 sm:pt-16">
        <Cover photo={g.photo} banner={g.banner} sizes="100vw" priority className="-z-10" />
        <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/10" aria-hidden />
        <Link href="/travel" className="absolute start-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20"><ArrowLeft className="h-4 w-4" aria-hidden />Explore</Link>
        {g.parent && <Link href={guideHref(g.parent)} className="mb-1 inline-flex w-fit items-center gap-1 text-sm font-semibold text-indigo-200 hover:text-white" translate="no">{nice(g.parent)}<ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>}
        <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl" translate="no">{nice(g.title)}</h2>
        {g.summary[0] && <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-100">{g.summary[0]}</p>}
      </section>

      {/* The country's facts and the week's weather. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {c && (
          <section className="panel p-5" aria-label={`About ${c.name}`}>
            <p className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><span className="text-2xl" aria-hidden>{c.flag}</span>{c.name}{c.capital && <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">· capital {c.capital}</span>}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact icon={Wallet} label="Money" value={c.currencies.map((m) => `${m.name} (${m.code})`).join(', ') || '—'} />
              <Fact icon={Languages} label="Languages" value={c.languages.join(', ') || '—'} />
              {c.drives && <Fact icon={Car} label="Cars drive on the" value={c.drives === 'left' ? 'left' : 'right'} />}
              {c.callingCode && <Fact icon={Phone} label="Calling code" value={c.callingCode} />}
            </div>
            {c.emergency.length > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300"><Siren className="h-4 w-4 shrink-0" aria-hidden />Emergency: {c.emergency.map((n, i) => <a key={n} href={`tel:${n}`} className={cn('underline-offset-2 hover:underline', i === 0 && 'text-base')}>{n}</a>)}</p>
            )}
          </section>
        )}
        {wx && wx.days.length > 0 && (
          <section className="panel p-5" aria-label="The weather this week">
            <p className="text-lg font-semibold text-zinc-900 dark:text-white">This week’s weather</p>
            <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {wx.days.map((w, i) => {
                const s = sky(w.symbol);
                return (
                  <li key={w.date} className="flex flex-col items-center gap-1 rounded-xl bg-zinc-50 px-1 py-2.5 text-center dark:bg-white/[0.04]" title={`${s.words}${w.rain ? `, ${w.rain} mm rain` : ''}`}>
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{i === 0 ? 'Today' : new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <s.icon className="h-6 w-6 text-indigo-500" aria-label={s.words} />
                    <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{w.max}°</span>
                    <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{w.min}°</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{wx.credit}</p>
          </section>
        )}
      </div>

      {/* Booking with partners. */}
      <section className="panel flex flex-wrap items-center gap-2 p-4" aria-label="Book">
        <p className="me-2 text-sm font-semibold text-zinc-900 dark:text-white">Book for {nice(g.title)}</p>
        {books.map((b) => { const Icon = BOOK_ICON[b.kind]; return (
          <a key={b.kind} href={b.url} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1.5" title={`Opens ${b.partner}`}><Icon className="h-4 w-4" aria-hidden />{b.label}<span className="text-xs text-zinc-500 dark:text-zinc-400">· {b.partner}</span></a>
        ); })}
        {/* M209: this place on the map. */}
        <Link href={g.lat !== undefined && g.lon !== undefined ? `/travel?view=map&at=${g.lat.toFixed(5)},${g.lon.toFixed(5)},14` : `/travel?view=map&d=${encodeURIComponent(g.title)}`} className="btn-secondary btn-sm ms-auto inline-flex items-center gap-1.5"><MapIcon className="h-4 w-4" aria-hidden />See on the map</Link>
        {/* M206: a trip with this place first. */}
        <button type="button" onClick={() => void startTrip(router, { guide: g.title, lat: g.lat, lon: g.lon, cc: c?.code, days: 3 })} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Route className="h-4 w-4" aria-hidden />Plan a trip here</button>
      </section>

      {/* The parts. */}
      <div className="sticky top-0 z-10 -mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        <div className="flex w-max gap-1.5 rounded-2xl bg-[var(--card-bg)] p-1 ring-1 ring-zinc-200 dark:ring-white/10" role="tablist" aria-label="Parts of the guide">
          {tabs.map((t) => {
            const n = t.parts.reduce((k, p) => k + (parts.get(p)?.listings.length ?? 0), 0);
            return (
              <button key={t.id} type="button" role="tab" aria-selected={current.id === t.id} onClick={() => { setTab(t.id); setFilter(''); setBand(null); setDiet(null); }}
                className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors', current.id === t.id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.07]')}>
                <t.icon className="h-4 w-4" aria-hidden />{t.label}{t.id !== 'overview' && n > 0 && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', current.id === t.id ? 'bg-white/20 text-white dark:bg-zinc-900/10 dark:text-zinc-900' : 'bg-zinc-200/80 text-zinc-700 dark:bg-white/15 dark:text-zinc-200')}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={current.id} role="tabpanel" aria-label={current.label} initial={calm ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="space-y-6">
          {current.id === 'overview' && (
            <>
              {(g.summary.length > 1 || parts.get('understand')?.text.length) && (
                <section className="panel p-6">
                  <p className="mb-2 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Info className="h-5 w-5 text-indigo-500" aria-hidden />Good to know</p>
                  <div className="space-y-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{[...g.summary.slice(1), ...(parts.get('understand')?.text ?? [])].map((p, i) => <p key={i}>{p}</p>)}</div>
                </section>
              )}
              {g.places.length > 0 && (
                <section aria-labelledby="guide-places">
                  <h3 id="guide-places" className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Places in {nice(g.title)}</h3>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {g.places.map((p) => (
                      <li key={p.title}><Link href={guideHref(p.title)} className="card flex h-full items-start gap-3 p-4 transition-[transform] duration-200 hover:-translate-y-0.5">
                        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
                        <span className="min-w-0"><span className="block font-semibold text-zinc-900 dark:text-white" translate="no">{p.name}</span>{p.text && <span className="mt-0.5 block line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">{p.text}</span>}</span>
                      </Link></li>
                    ))}
                  </ul>
                </section>
              )}
              {parts.get('go next')?.text.length ? (
                <section className="panel p-6"><p className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">Go next</p><ul className="space-y-1.5 text-[15px] text-zinc-700 dark:text-zinc-300">{parts.get('go next')!.text.map((p, i) => <li key={i}>{p}</li>)}</ul></section>
              ) : null}
            </>
          )}
          {current.id === 'know' && (
            <KnowTab title={nice(g.title)} tips={data.tips ?? {}} fromCountry={data.fromCountry ?? []} tipsCountry={data.tipsCountry ?? null} country={c} climate={data.climate ?? null} places={g.places} />
          )}
          {current.id === 'eat' && data.tips?.dishes?.length ? (
            <section aria-labelledby="guide-dishes" className="panel p-6">
              <h3 id="guide-dishes" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ChefHat className="h-5 w-5 text-indigo-500" aria-hidden />What to try</h3>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">{data.tips.dishes.map((s, i) => <li key={i} className="rounded-xl bg-orange-500/[0.07] px-4 py-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{s}</li>)}</ul>
            </section>
          ) : null}
          {current.id !== 'overview' && current.id !== 'know' && (
            <>
              {sections.some((s) => s.text.length) && (
                <section className="panel space-y-3 p-6 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {sections.map((s) => s.text.length > 0 && <div key={s.part} className="space-y-3">{sections.length > 1 && <p className="font-semibold text-zinc-900 dark:text-white">{s.title}</p>}{s.text.map((p, i) => <p key={i}>{p}</p>)}</div>)}
                </section>
              )}
              {/* M207: hostels beside hotels, for the same place. */}
              {current.id === 'sleep' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="me-1 text-sm text-zinc-600 dark:text-zinc-300">Compare prices:</span>
                  <a href={hostelLink(g.title)} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1" title="Opens Hostelworld">Hostels<span className="text-xs text-zinc-500 dark:text-zinc-400">· Hostelworld</span></a>
                  <a href={books.find((b) => b.kind === 'stay')!.url} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1" title="Opens Booking.com">Hotels and flats<span className="text-xs text-zinc-500 dark:text-zinc-400">· Booking.com</span></a>
                </div>
              )}
              {listings.length > 0 && (
                <>
                  {(bands.length > 1 || diets.length > 0) && (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Narrow these places">
                      {bands.length > 1 && bands.map((b) => <Chip key={b} on={band === b} onClick={() => setBand(band === b ? null : b)}>{b === 'budget' ? 'Budget' : b === 'mid' ? 'Mid-range' : 'Splurge'}</Chip>)}
                      {bands.length > 1 && diets.length > 0 && <span className="mx-1 w-px self-stretch bg-zinc-200 dark:bg-white/10" aria-hidden />}
                      {diets.map((x) => <Chip key={x.id} on={diet === x.id} onClick={() => setDiet(diet === x.id ? null : x.id)}>{x.label} <span className="tabular-nums opacity-70">{x.n}</span></Chip>)}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200" aria-live="polite">{shown.length} {shown.length === 1 ? 'place' : 'places'}</p>
                    {listings.length > 8 && (
                      <label className="relative w-full sm:w-72"><span className="sr-only">Filter these places</span>
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter: sushi, free, 24 hours…" className="w-full rounded-xl border border-zinc-200 bg-white py-2 ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400/60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
                      </label>
                    )}
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shown.map((l, i) => <ListingCard key={`${l.name}-${i}`} guide={g.title} l={l} saved={saved.get(l.name)} near={nice(g.title)} />)}
                  </ul>
                </>
              )}
              {!listings.length && !sections.some((s) => s.text.length) && <p className="panel p-6 text-zinc-600 dark:text-zinc-300">Nothing here yet for {nice(g.title)}.{g.places.length ? ' Try one of its districts in the Overview.' : ''}</p>}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Guide: <a href={data.credit.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">{data.credit.source}<ExternalLink className="h-3 w-3" aria-hidden /></a> ({data.credit.licence}), written by travellers; add what you know there.</span>
        {g.banner && <span>Photo: Wikimedia Commons.</span>}
        <span>Map data © OpenStreetMap contributors.</span>
      </p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors', on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/10')}>{children}</button>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
      <p className="min-w-0"><span className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</span><span className="block text-sm font-semibold text-zinc-900 dark:text-white">{value}</span></p>
    </div>
  );
}

