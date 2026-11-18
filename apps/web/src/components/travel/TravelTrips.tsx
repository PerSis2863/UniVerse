'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BedDouble, CalendarDays, Loader2, MapPin, Plus, Sparkles, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { tripCover } from '@/lib/travel-ideas';
import { addDays } from '@/lib/travel-plan';
import { Cover, startTrip } from './travel-ui';
import { useNow } from '@/lib/use-now';
import { flag, travelStats, type RouteStop } from '@/lib/travel-stats';

const BookedPlan = dynamic(() => import('./trip-plan').then((m) => m.BookedPlan), { ssr: false });
const TRIP_SIZES = '(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw';

// My trips in UniVerse Travel (M206): the trips I'm planning, alone or with friends, and a new one. An
// invite link (/travel/saved?join=CODE) asks before joining a friend's trip.

interface TripRow { id: string; name: string; startDate: string | null; mine: boolean; cities: string[]; cover: string | null; days: number; people: number; places: number; route?: RouteStop[] }
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');

export function TravelTrips({ join }: { join: string | null }) {
  const router = useRouter();
  const { data, mutate } = useSWR<{ trips: TripRow[] }>('/travel/trips', fetcher);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(false);
  const accept = async () => {
    setBusy(true);
    try { const { data: { trip } } = await api.post<{ trip: { id: string } }>('/travel/trips/join', { code: join }); await mutate(); router.push(`/travel/trip?id=${trip.id}`); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t join that trip.')); setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {data && data.trips.length > 0 && <TravelStats trips={data.trips} />}
      {join && (
        <section className="panel flex flex-wrap items-center gap-4 p-5" aria-label="Invitation">
          <Users className="h-8 w-8 shrink-0 text-indigo-500" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-zinc-900 dark:text-white">You’re invited to plan a trip</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Join to see its cities and days and plan them together. You can leave at any time.</p>
          </div>
          <button type="button" onClick={() => void accept()} disabled={busy} className="btn-primary inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Join the trip</button>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Plan the cities, days, budget and getting around: alone or with friends.</p>
        <div className="flex gap-2">
          <Link href="/travel?view=find" className="btn-secondary inline-flex items-center gap-2">Find where to go</Link>
          <button type="button" onClick={() => void startTrip(router)} className="btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden />New trip</button>
        </div>
      </div>
      {/* M329: a hotel already booked (or just a city): every day planned around it. */}
      <section className="panel flex flex-wrap items-center gap-4 p-5" aria-labelledby="plan-h">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><BedDouble className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1 basis-60">
          <h3 id="plan-h" className="font-semibold text-zinc-900 dark:text-white">Booked a hotel? Get your days planned</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Type your hotel or paste the booking: a day-by-day plan around it, with times, walks, lunch and dinner. Or just choose a city.</p>
        </div>
        <button type="button" onClick={() => setPlan(true)} className="btn-primary inline-flex items-center gap-2"><Sparkles className="h-4 w-4" aria-hidden />Plan my days</button>
      </section>
      {plan && <BookedPlan onClose={() => setPlan(false)} />}
      {!data ? <div className="h-40 skeleton rounded-[var(--radius-card)]" aria-busy="true" /> : !data.trips.length ? (
        <div className="panel mx-auto max-w-xl p-8 text-center">
          <MapPin className="mx-auto h-8 w-8 text-indigo-500" aria-hidden />
          <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">No trips yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Start one here, or press “Plan this trip” on a place in Find where to go.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.trips.map((t, n) => (
            <li key={t.id}>
              <Link href={`/travel/trip?id=${t.id}`} className="group card block overflow-hidden p-0!">
                <span className="relative block h-40 overflow-hidden">
                  <Cover {...tripCover({ name: t.name, cover: t.cover, places: t.cities })} sizes={TRIP_SIZES} priority={n < 3} className="transition-transform duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.04]" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
                  <span className="absolute inset-x-4 bottom-3 block truncate text-lg font-semibold text-white" translate="no">{t.name}</span>
                </span>
                <span className="block space-y-1 p-4 text-sm">
                  <span className="block truncate text-zinc-700 dark:text-zinc-200" translate="no">{t.cities.map(nice).join(' → ') || 'No places yet'}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{t.startDate ? `${new Date(`${t.startDate}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}${t.days > 1 ? ` – ${new Date(`${addDays(t.startDate, t.days - 1)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}` : 'Dates not set'}</span>
                    <span>{t.days} {t.days === 1 ? 'day' : 'days'} · {t.places} {t.places === 1 ? 'place' : 'places'}</span>
                    {t.people > 1 && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{t.people} planning{t.mine ? '' : ' · a friend’s trip'}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** M257: my travel in numbers across my trips: done and to come. */
function TravelStats({ trips }: { trips: TripRow[] }) {
  const now = useNow();
  if (!now) return null;
  const st = travelStats(trips.map((t) => ({ startDate: t.startDate, route: t.route ?? [] })), new Date(now).toISOString().slice(0, 10));
  const show = st.done.trips ? st.done : st.coming;
  const tiles = [
    { label: show.countries.length === 1 ? 'Country' : 'Countries', value: show.countries.length },
    { label: show.cities === 1 ? 'City' : 'Cities', value: show.cities },
    { label: show.days === 1 ? 'Day' : 'Days', value: show.days },
    { label: 'Km between cities', value: show.km.toLocaleString() },
    { label: 'kg CO₂ getting there', value: show.kg.toLocaleString() },
  ];
  return (
    <section className="panel p-5" aria-labelledby="stats-h">
      <h2 id="stats-h" className="text-lg font-semibold text-zinc-900 dark:text-white">{st.done.trips ? 'Your travel so far' : 'Your trips to come'}</h2>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">{st.done.trips ? `${st.done.trips} ${st.done.trips === 1 ? 'trip' : 'trips'} done${st.coming.trips ? `, ${st.coming.trips} to come` : ''}.` : `${st.coming.trips} ${st.coming.trips === 1 ? 'trip' : 'trips'} being planned.`}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 [&>div:last-child]:col-span-2 sm:[&>div:last-child]:col-span-1">
        {tiles.map((x) => <div key={x.label} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]"><dt className="text-xs text-zinc-600 dark:text-zinc-300">{x.label}</dt><dd className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{x.value}</dd></div>)}
      </dl>
      {show.countries.length > 0 && <p className="mt-3 text-xl" role="img" aria-label={`Countries: ${show.countries.join(', ')}`}>{show.countries.map(flag).join(' ')}</p>}
    </section>
  );
}
