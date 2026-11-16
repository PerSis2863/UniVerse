'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';
import { Bookmark, Compass, ExternalLink, MapPin, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { mapLink } from '@/lib/travel-book';
import type { Saved } from './travel-ui';

// My saved places in UniVerse Travel (M202), by the guide each came from: its map, its website, a way
// back to the guide, and remove. (Planning them into days is the trip planner, M206.)

const KIND: Record<string, string> = { see: 'See', do: 'Do', eat: 'Eat', drink: 'Drink', sleep: 'Sleep', buy: 'Buy', go: 'Go', other: 'Place' };
const nice = (title: string) => title.split('/').map((p) => p.replace(/\s*\([^)]*\)/, '')).join(' · ');

export function TravelSaved() {
  const { data } = useSWR<{ saved: Saved[] }>('/travel/saved', fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const groups = useMemo(() => {
    const by = new Map<string, Saved[]>();
    for (const s of data?.saved ?? []) by.set(s.guide, [...(by.get(s.guide) ?? []), s]);
    return [...by.entries()];
  }, [data]);
  const remove = async (s: Saved) => {
    setBusy(s.id);
    try { await api.delete(`/travel/saved/${s.id}`); await mutate('/travel/saved'); toast.success(`Removed ${s.name}`); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t remove it.')); } finally { setBusy(null); }
  };

  if (!data) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />;
  if (!groups.length) return (
    <div className="panel mx-auto max-w-xl p-8 text-center">
      <Bookmark className="mx-auto h-8 w-8 text-indigo-500" aria-hidden />
      <p className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">No saved places yet</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Open a place’s guide and press Save on what you’d like to see, eat or stay at.</p>
      <Link href="/travel" className="btn-primary mt-5 inline-flex items-center gap-2"><Compass className="h-4 w-4" aria-hidden />Explore places</Link>
    </div>
  );
  return (
    <div className="space-y-8">
      {groups.map(([guide, list]) => (
        <section key={guide} aria-labelledby={`saved-${guide}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`saved-${guide}`} className="text-lg font-semibold text-zinc-900 dark:text-white" translate="no">{nice(guide)} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">· {list.length}</span></h2>
            <Link href={`/travel/guide?d=${encodeURIComponent(guide)}`} className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Open the guide</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((s) => (
              <li key={s.id} className="card flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</p>
                  <span className="shrink-0 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{KIND[s.kind] ?? 'Place'}</span>
                </div>
                {s.note && <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">{s.note}</p>}
                {s.address && <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.address}</p>}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <a href={mapLink(s.name, { lat: s.lat ?? undefined, lon: s.lon ?? undefined, address: s.address ?? undefined, near: nice(guide) })} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />Map</a>
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost btn-sm inline-flex items-center gap-1.5"><ExternalLink className="h-4 w-4" aria-hidden />Website</a>}
                  <button type="button" onClick={() => void remove(s)} disabled={busy === s.id} className="btn-ghost btn-sm ms-auto inline-flex items-center gap-1.5 text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" aria-hidden />Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
