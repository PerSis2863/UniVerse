'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Loader2, Plus } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import type { Guide, Listing } from '@/lib/travel-guide';
import type { PlanStop } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import type { Saved } from './travel-ui';
import type { TripItem } from './trip-days';

// "Add places" on a trip's city (M206): the places you saved there, or any place its guide lists (to
// see, do, eat, drink, sleep, buy, day trips), each added to "Not planned yet" with its hours and price.

const KINDS = [['see', 'See'], ['do', 'Do'], ['eat', 'Eat'], ['drink', 'Drink'], ['sleep', 'Sleep'], ['buy', 'Buy'], ['go', 'Day trips']] as const;
type Kind = (typeof KINDS)[number][0];
interface Pickable { name: string; kind: string; lat?: number | null; lon?: number | null; hours?: string | null; price?: string | null; note?: string | null; address?: string | null; url?: string | null }

export function TripAdd({ tripId, stop, items, onAdded }: { tripId: string; stop: PlanStop; items: TripItem[]; onAdded: () => void }) {
  const [from, setFrom] = useState<'saved' | 'guide'>('saved');
  const [kind, setKind] = useState<Kind>('see');
  const [busy, setBusy] = useState<string | null>(null);
  const { data: saved } = useSWR<{ saved: Saved[] }>('/travel/saved', fetcher);
  const { data: guide, isLoading } = useSWR<{ guide: Guide }>(from === 'guide' ? `/travel/guide?d=${encodeURIComponent(stop.guide)}` : null, fetcher, { revalidateOnFocus: false });
  const mine = useMemo(() => (saved?.saved ?? []).filter((s) => s.guide === stop.guide || s.guide.startsWith(`${stop.guide}/`)), [saved, stop.guide]);
  const listed = useMemo(() => (guide?.guide.sections ?? []).flatMap((s) => s.listings).filter((l: Listing) => (kind === 'go' ? l.kind === 'go' || l.kind === 'other' : l.kind === kind)), [guide, kind]);
  const have = new Set(items.map((i) => i.name));
  const list: Pickable[] = from === 'saved' ? mine.map((s) => ({ name: s.name, kind: s.kind, lat: s.lat, lon: s.lon, note: s.note, address: s.address, url: s.url })) : listed.map((l) => ({ name: l.name, kind: l.kind === 'other' ? 'go' : l.kind, lat: l.lat, lon: l.lon, hours: l.hours, price: l.price, note: l.text, address: l.address, url: l.url }));

  const add = async (p: Pickable) => {
    setBusy(p.name);
    try {
      await api.post(`/travel/trips/${tripId}/items`, { stopId: stop.id, name: p.name, kind: p.kind, lat: p.lat ?? undefined, lon: p.lon ?? undefined, hours: p.hours ?? undefined, price: p.price ?? undefined, note: p.note?.slice(0, 600) ?? undefined, address: p.address ?? undefined, url: p.url ?? undefined });
      onAdded();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add that place.')); } finally { setBusy(null); }
  };

  return (
    <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'saved' | 'guide'> label="Add from" value={from} onChange={setFrom} segments={[{ value: 'saved', label: `Saved here (${mine.length})` }, { value: 'guide', label: 'From the guide' }]} />
        {from === 'guide' && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of place">
            {KINDS.map(([k, label]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn('rounded-full px-3 py-1 text-sm font-semibold transition-colors', kind === k ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10')}>{label}</button>)}
          </div>
        )}
      </div>
      {from === 'guide' && isLoading && <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Opening the guide…</p>}
      {!list.length && !(from === 'guide' && isLoading) && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{from === 'saved' ? 'Nothing saved here yet: open the guide and press Save, or add from the guide here.' : 'The guide lists none of these here.'}</p>
      )}
      <ul className="mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pe-1 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const added = have.has(p.name);
          return (
            <li key={`${p.kind}-${p.name}`} className="flex items-start gap-3 rounded-xl bg-[var(--card-bg)] p-3 ring-1 ring-zinc-200 dark:ring-white/10">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{p.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{[p.price, p.hours].filter(Boolean).join(' · ') || p.address || ' '}</p>
                {p.note && <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">{p.note}</p>}
              </div>
              <button type="button" disabled={added || busy === p.name} onClick={() => void add(p)} className={cn('btn-sm inline-flex shrink-0 items-center gap-1', added ? 'btn-ghost' : 'btn-secondary')}>
                {added ? <><Check className="h-4 w-4" aria-hidden />Added</> : busy === p.name ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /><span className="sr-only">Adding</span></> : <><Plus className="h-4 w-4" aria-hidden />Add</>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
