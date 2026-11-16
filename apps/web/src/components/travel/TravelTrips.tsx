'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarDays, Loader2, MapPin, Plus, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { IDEAS } from '@/lib/travel-ideas';
import { addDays } from '@/lib/travel-plan';
import { Cover, startTrip } from './travel-ui';

// My trips in UniVerse Travel (M206): the trips I'm planning, alone or with friends, and a new one. An
// invite link (/travel/saved?join=CODE) asks before joining a friend's trip.

interface TripRow { id: string; name: string; startDate: string | null; mine: boolean; cities: string[]; cover: string | null; days: number; people: number; places: number }
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');

export function TravelTrips({ join }: { join: string | null }) {
  const router = useRouter();
  const { data, mutate } = useSWR<{ trips: TripRow[] }>('/travel/trips', fetcher);
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try { const { data: { trip } } = await api.post<{ trip: { id: string } }>('/travel/trips/join', { code: join }); await mutate(); router.push(`/travel/trip?id=${trip.id}`); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t join that trip.')); setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {join && (
        <section className="panel flex flex-wrap items-center gap-4 p-5" aria-label="Invitation">
          <Users className="h-8 w-8 shrink-0 text-sky-500" aria-hidden />
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
      {!data ? <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" /> : !data.trips.length ? (
        <div className="panel mx-auto max-w-xl p-8 text-center">
          <MapPin className="mx-auto h-8 w-8 text-sky-500" aria-hidden />
          <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">No trips yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Start one here, or press “Plan this trip” on a place in Find where to go.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.trips.map((t, n) => (
            <li key={t.id}>
              <Link href={`/travel/trip?id=${t.id}`} className="group card block overflow-hidden">
                <span className="relative block h-32 overflow-hidden">
                  <Cover file={IDEAS.find((i) => i.title === t.cover)?.banner} width={640} priority={n < 3} className="transition-transform duration-500 ease-[var(--ease-glide)] group-hover:scale-[1.04]" />
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
