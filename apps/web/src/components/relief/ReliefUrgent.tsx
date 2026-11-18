'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, LocateFixed, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';
import { useNow } from '@/lib/use-now';
import { RELIEF_KIND_LABEL, URGENCY_COLOR, URGENCY_LABEL } from '@/lib/relief';
import { distanceKm, matches, triage, walkMinutes } from '@/lib/relief-plus';
import { cn } from '@/lib/utils';
import { KIND_ICON, PostActions, type ReliefPost } from './ReliefApp';

// Relief → Most urgent and Matches (M217), from the live map's own answer (no new server work): open needs
// ranked by urgency, how long they've waited and how many people; and, for each open need, the open offers of
// the same kind nearby, so a coordinator (or anyone) can bring them together.

const dist = (d: number) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(1)} km`);
function useMap() {
  return useSWR<{ posts: ReliefPost[] }>('/relief/map', fetcher, { refreshInterval: useActivePoll(30_000), keepPreviousData: true });
}
function useHere() {
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const find = () => navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error('Your browser didn’t share where you are.'), { timeout: 10_000 });
  return [here, find] as const;
}

export function ReliefUrgent() {
  const { data, mutate } = useMap(), now = useNow(), [here, find] = useHere();
  const [within, setWithin] = useState<number | null>(null);
  const list = useMemo(() => (now ? triage(data?.posts ?? [], now) : []).filter((x) => !here || !within || distanceKm(here, x.post) <= within), [data, now, here, within]);
  return (
    <section className="panel p-5" aria-labelledby="urgent-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="urgent-h" className="text-lg font-semibold text-zinc-900 dark:text-white">The most urgent needs</h3>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">Ranked by how urgent, how long people have waited and how many they are.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {here ? (
            <label className="text-sm text-zinc-700 dark:text-zinc-200"><span className="sr-only">Within</span>
              <select value={within ?? ''} onChange={(e) => setWithin(e.target.value ? Number(e.target.value) : null)} className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/[0.05]">
                <option value="">Anywhere</option>{[2, 5, 10, 25].map((k) => <option key={k} value={k}>Within {k} km</option>)}
              </select>
            </label>
          ) : <button type="button" onClick={find} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />Near me</button>}
        </div>
      </div>
      {!data ? <div className="mt-4 h-48 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />
        : !list.length ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">No open needs{within ? ` within ${within} km` : ''} right now.</p>
        : (
          <ol className="mt-4 space-y-3">
            {list.slice(0, 30).map(({ post: p, why }, i) => {
              const Icon = KIND_ICON[p.kind];
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold tabular-nums text-white dark:bg-white dark:text-zinc-900" aria-hidden>{i + 1}</span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: URGENCY_COLOR[p.urgency] }} aria-hidden><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{p.title}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">{[RELIEF_KIND_LABEL[p.kind], URGENCY_LABEL[p.urgency], now ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: true }) : null, here ? `${dist(distanceKm(here, p))} away` : p.place].filter(Boolean).join(' · ')}</p>
                    {why.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{why.map((w) => <span key={w} className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">{w}</span>)}</div>}
                  </div>
                  <div className="w-full sm:w-auto"><PostActions p={p} onChange={() => void mutate()} small /></div>
                </li>
              );
            })}
          </ol>
        )}
    </section>
  );
}

export function ReliefMatches() {
  const { data, mutate } = useMap();
  const list = useMemo(() => matches(data?.posts ?? []), [data]);
  return (
    <section className="panel p-5" aria-labelledby="matches-h">
      <h3 id="matches-h" className="text-lg font-semibold text-zinc-900 dark:text-white">Offers that fit open needs</h3>
      <div className="text-sm text-zinc-600 dark:text-zinc-300">The same kind of help, within 15 km, nearest first. Message either side to bring them together.</div>
      {!data ? <div className="mt-4 h-48 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />
        : !list.length ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">No offer fits an open need nearby right now.</p>
        : (
          <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {list.slice(0, 20).map(({ need, offers }) => {
              const Icon = KIND_ICON[need.kind];
              return (
                <li key={need.id} className="rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10">
                  <div className="flex items-start gap-3 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: URGENCY_COLOR[need.urgency] }} aria-hidden><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300">Needed · {URGENCY_LABEL[need.urgency]}</p>
                      <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{need.title}</p>
                      <p className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><Users className="h-3.5 w-3.5" aria-hidden />{need.people} {need.people === 1 ? 'person' : 'people'}{need.place ? <><MapPin className="ms-1 h-3.5 w-3.5" aria-hidden /><span translate="no">{need.place}</span></> : null}</p>
                    </div>
                  </div>
                  <ul className="divide-y divide-zinc-200/70 border-t border-zinc-200/70 dark:divide-white/10 dark:border-white/10">
                    {offers.map(({ offer, km }) => (
                      <li key={offer.id} className="flex flex-wrap items-center gap-3 p-3">
                        <ArrowRight className="h-4 w-4 shrink-0 text-emerald-600 rtl:rotate-180" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Offered · {dist(km)} away{km < 6 ? ` · ${walkMinutes(km)} min on foot` : ''}</p>
                          <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{offer.title}</p>
                        </div>
                        <div className={cn('w-full sm:w-auto')}><PostActions p={offer} onChange={() => void mutate()} small /></div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
