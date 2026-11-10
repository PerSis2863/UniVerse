'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { BatteryCharging, BedDouble, Droplets, MapPin, Navigation, Utensils, type LucideIcon } from 'lucide-react';
import { CardHead } from '@/components/ui/CardMenu';
import { StatusBadge, type Tone } from '@/components/ui/StatusBadge';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';
import { RELIEF_ORG_KIND_LABEL, STOCK_LABEL, freshness, rankPlaces, type Place, type Stock } from '@/lib/relief';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// M148: Relief's shelter and supply board: the places (organisations) that said how they are this week,
// open ones that spoke today first, nearest first when you shared your position. Beds free, water,
// food and phone charging at a glance; old word greyed. Positions are the organisations' bases, rounded
// to about 500 m when saved.

const TONE: Record<Stock, Tone> = { YES: 'green', LOW: 'amber', NO: 'red' };
type Need = 'beds' | 'water' | 'food' | 'power';
const NEEDS: { id: Need; label: string; icon: LucideIcon }[] = [
  { id: 'beds', label: 'A bed', icon: BedDouble },
  { id: 'water', label: 'Water', icon: Droplets },
  { id: 'food', label: 'Food', icon: Utensils },
  { id: 'power', label: 'Charging', icon: BatteryCharging },
];
const has = (p: Place, n: Need) => (n === 'beds' ? (p.bedsFree ?? 0) > 0 : p[n] === 'YES' || p[n] === 'LOW');
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));

export function PlacesBoard({ here, onShow }: { here: { lat: number; lng: number } | null; onShow?: (p: Place) => void }) {
  const now = useNow();
  const { data } = useSWR<{ places: Place[] }>('/relief/places', fetcher, { refreshInterval: useActivePoll(60_000), keepPreviousData: true });
  const [need, setNeed] = useState<Set<Need>>(new Set());
  const places = useMemo(() => rankPlaces((data?.places ?? []).filter((p) => [...need].every((n) => has(p, n))), here, now || 0), [data, need, here, now]);
  const toggle = (n: Need) => setNeed((s) => { const t = new Set(s); if (t.has(n)) t.delete(n); else t.add(n); return t; });
  return (
    <section className="card" aria-label="Places to go">
      <CardHead title="Places to go" sub={here ? 'Shelters, food banks and groups near you, open ones first' : 'Shelters, food banks and groups that said how they are this week'} />
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Show places with">
        {NEEDS.map((n) => (
          <button key={n.id} type="button" aria-pressed={need.has(n.id)} onClick={() => toggle(n.id)}
            className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium border transition-colors', need.has(n.id) ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white' : 'border-zinc-200 dark:border-white/[0.12] text-zinc-700 dark:text-zinc-200 hover:bg-[var(--fill)]')}>
            <n.icon className="w-3.5 h-3.5" aria-hidden />{n.label}
          </button>
        ))}
      </div>
      {!data ? <div className="h-32 rounded-xl skeleton" /> : places.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{need.size ? 'No place has that right now.' : 'No place has said how it is this week. Organisations post it from their page: Overview → Live status.'}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {places.slice(0, 24).map((p) => {
            const fresh = now ? freshness(p.statusAt, now) : 'fresh';
            return (
              <li key={p.id} className={cn('rounded-xl border border-zinc-200 dark:border-white/[0.1] p-4 flex flex-col gap-3', fresh === 'old' && 'border-dashed bg-zinc-50 dark:bg-white/[0.02]')}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px] text-zinc-900 dark:text-white truncate" translate="no">{p.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{[RELIEF_ORG_KIND_LABEL[p.kind as keyof typeof RELIEF_ORG_KIND_LABEL] ?? p.kind, p.place, here ? `${km(here, p).toFixed(1)} km` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  {p.openNow !== null && <StatusBadge tone={p.openNow ? 'green' : 'red'}>{p.openNow ? 'Open' : 'Closed'}</StatusBadge>}
                </div>
                {p.bedsTotal ? (
                  <div>
                    <p className="text-[13px] text-zinc-700 dark:text-zinc-200"><b className="tabular-nums text-zinc-900 dark:text-white">{p.bedsFree ?? 0}</b> of {p.bedsTotal} beds free</p>
                    <span className="mt-1.5 block h-1.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.07]"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, ((p.bedsFree ?? 0) / p.bedsTotal) * 100)}%` }} /></span>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {(['water', 'food', 'power'] as const).map((k) => p[k] && (
                    <StatusBadge key={k} tone={TONE[p[k]!]}>{k === 'power' ? 'Charging' : k === 'water' ? 'Water' : 'Food'}: {STOCK_LABEL[p[k]!].toLowerCase()}</StatusBadge>
                  ))}
                </div>
                {p.statusNote && <p className="text-[13px] text-zinc-600 dark:text-zinc-300" translate="no">{p.statusNote}</p>}
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 me-auto">{fresh === 'old' ? 'Not updated today' : `Updated ${formatDistanceToNow(new Date(p.statusAt), { addSuffix: true })}`}</span>
                  {onShow && <button type="button" onClick={() => onShow(p)} className="btn-ghost btn-sm"><MapPin className="w-3.5 h-3.5" aria-hidden />On the map</button>}
                  {/* M155: directions in the phone's maps app, by name and town (the saved spot is rounded) */}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.place].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><Navigation className="w-3.5 h-3.5" aria-hidden />Directions<span className="sr-only"> to {p.name} (opens a map)</span></a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
