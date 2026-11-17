'use client';

import useSWR from 'swr';
import { BedDouble, Landmark, MapPinned } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import type { Guide, Listing } from '@/lib/travel-guide';
import { aroundStay, districtsNear, STAY_KINDS, walkMinutes, withDistricts } from '@/lib/travel-stay';

// M232 (the owner, 17 Nov: "give recommendation about the historic areas and facts about everything which is unique
// or people visit a lot"): the map's panel, for the place that was searched, lists its guide's must-see sights (each
// with the guide's short note about it) and the areas worth exploring (a big city's districts). The guide is the
// one Travel already keeps (Wikivoyage, cached 14 days on the server, the same answer as the guide page): no new
// source and no extra work for the Worker beyond that one cached read. With a stay (the hotel someone typed in), the
// guide's sights, things to do, food, drinks and shopping are grouped nearest the stay first, with the walk.

type Answer = { guide: Guide; credit: { source: string; licence: string; url: string } };

/** A guide's sights that can be shown on a map (named, with a position), in the guide's order. */
export function sightsOf(g: Guide | undefined, max = 12): (Listing & { lat: number; lon: number })[] {
  if (!g) return [];
  return g.sections.filter((s) => s.part === 'see').flatMap((s) => s.listings)
    .filter((l): l is Listing & { lat: number; lon: number } => !!l.name && Number.isFinite(l.lat) && Number.isFinite(l.lon))
    .slice(0, max);
}

/** The map's own kinds of place (the real cafés, restaurants and shops in its data), offered around a stay. */
const NEARBY = [['eat', 'Restaurants'], ['cafe', 'Cafés'], ['drink', 'Bars'], ['shop', 'Shopping'], ['museum', 'Museums'], ['park', 'Parks']] as const;
export type NearbyKind = (typeof NEARBY)[number][0];

export function Highlights({ title, stay, onSight, onArea, onNearby }: { title: string; stay?: { lat: number; lon: number; name: string } | null; onSight: (s: Listing & { lat: number; lon: number }) => void; onArea: (title: string) => void; onNearby?: (kind: NearbyKind) => void }) {
  const { data, isLoading } = useSWR<Answer>(`/travel/guide?d=${encodeURIComponent(title)}`, fetcher, { revalidateOnFocus: false });
  // A big city keeps its restaurants, cafés and shops in its district guides: those of the district(s) the stay is in.
  const [d1, d2] = data && stay ? districtsNear(data.guide, stay) : [];
  const { data: a1 } = useSWR<Answer>(d1 ? `/travel/guide?d=${encodeURIComponent(d1)}` : null, fetcher, { revalidateOnFocus: false });
  const { data: a2 } = useSWR<Answer>(d2 ? `/travel/guide?d=${encodeURIComponent(d2)}` : null, fetcher, { revalidateOnFocus: false });
  if (isLoading) return <div className="mb-2 h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.05]" aria-busy="true" />;
  const g = data?.guide;
  const sights = sightsOf(g);
  const areas = (g?.places ?? []).filter((p) => p.text).slice(0, 10);
  if (!g || (!sights.length && !areas.length && !stay)) return null;
  const name = g.title.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
  const around = stay ? aroundStay(withDistricts(g, [a1?.guide, a2?.guide]), stay) : null;
  const head = 'mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
  return (
    <section aria-label={`Highlights of ${name}`} className="mb-3 space-y-3 border-b border-zinc-200/70 pb-3 dark:border-white/10">
      {around && (
        <>
          <p className="flex items-center gap-1.5 px-2 text-sm font-semibold text-zinc-900 dark:text-white"><BedDouble className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />Around <span className="truncate" translate="no">{stay!.name}</span></p>
          {onNearby && (
            <div>
              <h4 className={head}>Nearest to your stay</h4>
              <div className="flex flex-wrap gap-1.5 px-2">
                {NEARBY.map(([kind, label]) => <button key={kind} type="button" onClick={() => onNearby(kind)} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-200 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.14]">{label}</button>)}
              </div>
            </div>
          )}
          {STAY_KINDS.filter((k) => around[k.kind].length).map((k) => (
            <div key={k.kind}>
              <h4 className={head}>{k.label}</h4>
              <ol className="space-y-0.5">
                {around[k.kind].map((s) => (
                  <li key={`${s.name}@${s.lat}`}>
                    <button type="button" onClick={() => onSight(s)} className="w-full rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="flex items-baseline justify-between gap-2"><span className="font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{s.km < 3 ? `${walkMinutes(s.km)} min walk` : `${s.km.toFixed(1)} km`}</span></span>
                      {s.text && <span className="line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{s.text}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </>
      )}
      {!around && sights.length > 0 && (
        <div>
          <h4 className={head}><Landmark className="h-3.5 w-3.5" aria-hidden />Must-see in <span translate="no">{name}</span></h4>
          <ol className="space-y-0.5">
            {sights.map((s) => (
              <li key={`${s.name}@${s.lat}`}>
                <button type="button" onClick={() => onSight(s)} className="w-full rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                  <span className="block font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span>
                  {s.text && <span className="line-clamp-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{s.text}</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {areas.length > 0 && (
        <div>
          <h4 className={head}><MapPinned className="h-3.5 w-3.5" aria-hidden />Areas to explore</h4>
          <ol className="space-y-0.5">
            {areas.map((a) => (
              <li key={a.title}>
                <button type="button" onClick={() => onArea(a.title)} className="w-full rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                  <span className="block font-semibold text-zinc-900 dark:text-white" translate="no">{a.name}</span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{a.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="px-2 text-[11px] text-zinc-500 dark:text-zinc-400">From <a href={data!.credit.url} target="_blank" rel="noopener noreferrer" className="underline">{data!.credit.source}</a> ({data!.credit.licence})</p>
    </section>
  );
}
