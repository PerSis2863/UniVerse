'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Bookmark, Compass, Search, Sparkles } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { IDEAS, THEMES, type Theme } from '@/lib/travel-ideas';
import { cn } from '@/lib/utils';
import { Cover, PlaceSearch, startTrip, type Saved } from './travel-ui';

// UniVerse Travel's Explore (M202): find any place with a guide as you type (Wikivoyage's titles), or
// start from places picked by what you're after; your saved places a tap away. M205: "Find where to go"
// (?view=find) ranks every place for your days, budget, month, interests and passport.

const TravelFinder = dynamic(() => import('./TravelFinder').then((m) => m.TravelFinder), {
  loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />,
});
const FIRST = 24;

const guideHref = (title: string) => `/travel/guide?d=${encodeURIComponent(title)}`;

export function TravelExplore() {
  const router = useRouter();
  const view = useSearchParams().get('view') === 'find' ? 'find' : 'search';
  const [all, setAll] = useState(false);
  const [theme, setTheme] = useState<Theme | 'All'>('All');
  const { data: saved } = useSWR<{ saved: Saved[] }>('/travel/saved', fetcher);
  const ideas = useMemo(() => (theme === 'All' ? IDEAS : IDEAS.filter((i) => i.themes.includes(theme))), [theme]);
  const cards = all ? ideas : ideas.slice(0, FIRST);
  const open = (title: string) => router.push(guideHref(title));
  const recent = (saved?.saved ?? []).slice(0, 6);

  const switcher = (
    <Segmented label="How to start" large value={view} onChange={(v) => router.replace(v === 'find' ? '/travel?view=find' : '/travel', { scroll: false })}
      segments={[{ value: 'search', label: 'Search a place', icon: <Search className="h-4 w-4" aria-hidden /> }, { value: 'find', label: 'Find where to go', icon: <Sparkles className="h-4 w-4" aria-hidden /> }]} />
  );
  if (view === 'find') return <div className="space-y-5">{switcher}<TravelFinder onPlan={(m, days) => void startTrip(router, { guide: m.idea.title, cc: m.idea.cc, lat: m.idea.lat, lon: m.idea.lon, days })} /></div>;

  return (
    <div className="space-y-8">
      {switcher}
      {/* Not clipped (the search's results hang below it); its glow is, in its own box. */}
      <section className="panel relative z-10 p-6 sm:p-10">
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden><span className="absolute -end-24 -top-24 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" /></span>
        <h2 className="relative font-semibold tracking-tight text-zinc-900 dark:text-white" style={{ fontSize: 'clamp(1.9rem, 3.2vw, 2.75rem)', lineHeight: 1.1 }}>Where to <em className="font-serif italic text-sky-600 dark:text-sky-300">next?</em></h2>
        <p className="relative mt-2 max-w-2xl text-zinc-600 dark:text-zinc-300">Any city, island or national park: what to see and do, where to eat and sleep, how to get around, and the weather this week.</p>
        <PlaceSearch className="relative mt-6 max-w-2xl" big label="Search a place" placeholder="Search a place: Kyoto, Lisbon, Bali…" onPick={open} />
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="travel-saved">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="travel-saved" className="text-lg font-semibold text-zinc-900 dark:text-white">Your saved places</h2>
            <Link href="/travel/saved?tab=saved" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 dark:text-sky-300">All saved <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {recent.map((s) => (
              <li key={s.id} className="shrink-0">
                <Link href={guideHref(s.guide)} className="card flex w-60 items-center gap-3 p-3">
                  <Bookmark className="h-5 w-5 shrink-0 text-sky-500" aria-hidden />
                  <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{s.guide.replace(/\//g, ' · ')}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="travel-ideas">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="travel-ideas" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Compass className="h-5 w-5 text-sky-500" aria-hidden />Places to start from</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="What you're after">
            {(['All', ...THEMES] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors', theme === t ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/10')}>{t}</button>
            ))}
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {cards.map((i, n) => (
            <li key={i.title}>
              <Link href={guideHref(i.title)} className="group relative block h-64 overflow-hidden rounded-[var(--radius-card)] ring-1 ring-black/5 dark:ring-white/10">
                <Cover file={i.banner} width={720} priority={n < 4} className="transition-transform duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.04]" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden />
                <span className="absolute inset-x-0 bottom-0 p-4">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-sky-200">{i.country}</span>
                  <span className="block text-xl font-semibold text-white" translate="no">{i.title}</span>
                  <span className="mt-1 block text-sm text-zinc-200">{i.blurb}</span>
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
