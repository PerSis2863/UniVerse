'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Bookmark, CloudSun, Compass, MapPinned, Plus, Route, Sparkles, Users, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { IDEAS, THEMES, type Theme } from '@/lib/travel-ideas';
import { cn } from '@/lib/utils';
import { CARD_SIZES, Cover, PlaceSearch, startTrip, type Saved } from './travel-ui';
import { TravelTabs } from './TravelTabs';

// UniVerse Travel's Explore (M202): find any place with a guide as you type (Wikivoyage's titles), or
// start from places picked by what you're after; your saved places a tap away. M205: "Find where to go"
// (?view=find) ranks every place for your days, budget, month, interests and passport.

const TravelFinder = dynamic(() => import('./TravelFinder').then((m) => m.TravelFinder), {
  loading: () => <div className="h-96 skeleton rounded-[var(--radius-card)]" aria-busy="true" />,
});
// M209: the map (MapLibre and its styles load only when it's opened).
// M395: Green's journeys compared and green places near you, as Aether's sections.
const GreenJourney = dynamic(() => import('@/components/green/GreenJourney').then((m) => m.GreenJourney), { loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" /> });
const GreenPlaces = dynamic(() => import('@/components/green/GreenPlaces'), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" /> });
const TravelMap = dynamic(() => import('./map/TravelMap'), {
  ssr: false,
  loading: () => <div className="h-[calc(100dvh-12rem+var(--bare-gain))] min-h-[32rem] skeleton rounded-[var(--radius-card)]" aria-busy="true" />,
});
const FIRST = 24;
const HERE: [LucideIcon, string][] = [[Compass, 'A guide to every city, island and park'], [CloudSun, 'This week’s weather and the best months'], [Users, 'Trips planned with friends, day by day'], [MapPinned, 'Real places, opening hours and reviews']];

/** Beside the search: my next trips, or a way to start one (M213). */
function MyTrips() {
  const router = useRouter();
  const { data } = useSWR<{ trips: { id: string; name: string; startDate: string | null; cities: string[]; days: number }[] }>('/travel/trips', fetcher);
  const trips = (data?.trips ?? []).slice(0, 3);
  return (
    <div className="border-zinc-200/80 dark:border-white/10 lg:border-s lg:ps-8">
      <h3 className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Route className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden />Your trips</h3>
      {!data ? <div className="mt-3 h-24 skeleton rounded-xl" aria-hidden />
        : !trips.length ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Plan the cities and days, the budget and how to get between them, alone or with friends.</p>
        : (
          <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/10">
            {trips.map((t) => (
              <li key={t.id}>
                <Link href={`/travel/trip?id=${t.id}`} className="group flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{t.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{[t.cities.join(' · ') || 'No places yet', t.days ? `${t.days} day${t.days === 1 ? '' : 's'}` : null, t.startDate ? new Date(`${t.startDate}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void startTrip(router)} className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden />New trip</button>
        <Link href="/travel?view=find" className="btn-secondary inline-flex items-center gap-2"><Sparkles className="h-4 w-4" aria-hidden />Find where to go</Link>
      </div>
    </div>
  );
}

const guideHref = (title: string) => `/travel/guide?d=${encodeURIComponent(title)}`;

export function TravelExplore() {
  const router = useRouter();
  const sp = useSearchParams(), asked = sp.get('view');
  const view = asked === 'find' || asked === 'map' ? asked : 'search';
  const [all, setAll] = useState(false);
  const [theme, setTheme] = useState<Theme | 'All'>('All');
  const { data: saved } = useSWR<{ saved: Saved[] }>('/travel/saved', fetcher);
  const ideas = useMemo(() => (theme === 'All' ? IDEAS : IDEAS.filter((i) => i.themes.includes(theme))), [theme]);
  const cards = all ? ideas : ideas.slice(0, FIRST);
  const open = (title: string) => router.push(guideHref(title));
  const recent = (saved?.saved ?? []).slice(0, 6);

  // M347: a place sent to the map by its Map button (mapLink).
  const n = sp.get('n'), addr = sp.get('addr'), near = sp.get('near');
  const find = useMemo(() => (n ? { name: n, addr, near } : null), [n, addr, near]);

  const switcher = <TravelTabs />;
  if (view === 'map') return <div className="space-y-4">{switcher}<TravelMap at={sp.get('at')} place={sp.get('d')} pin={sp.get('pin') === '1'} find={find} /></div>;
  if (asked === 'journeys') return <div className="space-y-5">{switcher}<GreenJourney /></div>;
  if (asked === 'green') return <div className="space-y-5">{switcher}<GreenPlaces /></div>;
  if (view === 'find') return <div className="space-y-5">{switcher}<TravelFinder onPlan={(m, days) => void startTrip(router, { guide: m.idea.title, cc: m.idea.cc, lat: m.idea.lat, lon: m.idea.lon, days })} /></div>;

  return (
    <div className="space-y-8">
      {switcher}
      {/* Not clipped (the search's results hang below it). M213: laid out like the other apps' first card (Trace's
          console): the headline, the search and what's here; my trips beside it. M287: no glow behind it. */}
      <section className="panel relative z-10 p-6 sm:p-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <h2 className="font-semibold tracking-tight text-zinc-900 dark:text-white" style={{ fontSize: 'clamp(2rem, 3.6vw, 3rem)', lineHeight: 1.05 }}>Where to <em className="accent-word pe-1">next?</em></h2>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-300" style={{ fontSize: '1.0625rem' }}>Any city, island or national park: what to see and do, where to eat and sleep, how to get around, and the weather this week.</p>
            <PlaceSearch className="mt-6 max-w-2xl" big label="Search a place" placeholder="Search a place: Kyoto, Lisbon, Bali…" onPick={open} />
            <ul className="mt-6 grid grid-cols-1 gap-2 text-sm text-zinc-700 dark:text-zinc-200 sm:grid-cols-2">
              {HERE.map(([Icon, t]) => <li key={t} className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />{t}</li>)}
            </ul>
          </div>
          <MyTrips />
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="travel-saved">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="travel-saved" className="text-lg font-semibold text-zinc-900 dark:text-white">Your saved places</h2>
            <Link href="/travel/saved?tab=saved" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">All saved <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {recent.map((s) => (
              <li key={s.id} className="shrink-0">
                <Link href={guideHref(s.guide)} className="card flex w-60 items-center gap-3 p-3">
                  <Bookmark className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
                  <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{s.guide.replace(/\//g, ' · ')}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="travel-ideas">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="travel-ideas" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Compass className="h-5 w-5 text-indigo-500" aria-hidden />Places to start from</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="What you're after">
            {(['All', ...THEMES] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors', theme === t ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/10')}>{t}</button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {cards.map((i, n) => (
            <li key={i.title}>
              <Link href={guideHref(i.title)} className="group relative block h-64 overflow-hidden rounded-[var(--radius-card)] ring-1 ring-black/5 dark:ring-white/10">
                <Cover photo={i.photo} banner={i.banner} sizes={CARD_SIZES} priority={n < 4} className="transition-transform duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.04]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden />
                <span className="absolute inset-x-0 bottom-0 p-4">
                  <span className="block text-xl font-semibold text-white" translate="no">{i.title}</span>
                  <span className="mt-0.5 block text-sm text-zinc-200"><span className="font-semibold text-white">{i.country}</span> · {i.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {cards.length < ideas.length && <button type="button" onClick={() => setAll(true)} className="btn-secondary mt-4 inline-flex items-center gap-2">Show all {ideas.length} places<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>}
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Photos: Wikimedia Commons. Guides: Wikivoyage (CC BY-SA 3.0).</p>
      </section>
    </div>
  );
}
