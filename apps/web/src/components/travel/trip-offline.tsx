'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, CloudDownload, Map as MapIcon, Trash2, WifiOff } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Fill } from '@/components/ui/Fill';
import { MAX_TILES, size } from '@/lib/trip-offline';
import { offlineSupported, readPack, removePack, savePack, type OfflinePack } from '@/lib/trip-offline-save';
import type { PlanItem, PlanStop } from '@/lib/travel-plan';

// M240: "Save for offline" on a trip (the trip page's Ready part): the plan, each city's guide and the map around the
// cities and planned places, kept on this device for when there's no signal; its size, when it was saved, Remove,
// and what isn't kept. The saving is in src/lib/trip-offline-save.ts.

const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');

export function TripOffline<T>({ tripId, trip, stops, items }: { tripId: string; trip: T; stops: PlanStop[]; items: PlanItem[] }) {
  const [pack, setPack] = useState<OfflinePack<T> | null | undefined>(undefined);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef<AbortController | null>(null);
  useEffect(() => { void readPack<T>(tripId).then(setPack); return () => stop.current?.abort(); }, [tripId]);

  const located = stops.filter((s): s is PlanStop & { lat: number; lon: number } => s.lat !== null && s.lon !== null);
  const save = async () => {
    const ctl = new AbortController();
    stop.current = ctl;
    setBusy({ done: 0, total: 1 });
    try {
      const p = await savePack(tripId, trip, located.map((s) => ({ lat: s.lat, lon: s.lon, guide: s.guide, name: nice(s.name) })),
        items.filter((i): i is PlanItem & { lat: number; lon: number } => i.lat !== null && i.lon !== null), (done, total) => setBusy({ done, total }), ctl.signal);
      setPack(p);
      toast.success(`Saved for offline: ${size(p.bytes)} on this device.`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error('Couldn’t save it all: check the signal and try again.');
    }
    setBusy(null);
  };
  const remove = async () => { await removePack(tripId); setPack(null); toast.success('Removed from this device.'); };

  if (!offlineSupported()) return null;
  return (
    <section className="panel p-5" aria-labelledby="offline-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="offline-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><WifiOff className="h-5 w-5 text-indigo-500" aria-hidden />Offline</h3>
        {pack && !busy && <button type="button" onClick={() => void remove()} className="btn-ghost btn-sm inline-flex items-center gap-1.5 text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" aria-hidden />Remove</button>}
      </div>
      {pack === undefined ? null : busy ? (
        <div className="mt-3" role="status">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">Saving… {Math.round((busy.done / Math.max(1, busy.total)) * 100)}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10"><Fill value={busy.done / Math.max(1, busy.total)} quick /></div>
          <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => stop.current?.abort()}>Stop</button>
        </div>
      ) : pack ? (
        <div className="mt-2 space-y-3 text-sm text-zinc-700 dark:text-zinc-200">
          <p>On this device: <span className="font-semibold text-zinc-900 dark:text-white">{size(pack.bytes)}</span>, saved {new Date(pack.savedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. The plan, {pack.guides.length} {pack.guides.length === 1 ? 'guide' : 'guides'} and {pack.tiles} pieces of map{pack.capped ? ` (the first ${MAX_TILES}: the closest views of the outskirts may be missing)` : ''}.</p>
          <div className="flex flex-wrap gap-2">
            {pack.maps.map((m) => <Link key={m.href} href={m.href} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><MapIcon className="h-4 w-4" aria-hidden />Map of {m.name}</Link>)}
            <button type="button" onClick={() => void save()} className="btn-ghost btn-sm inline-flex items-center gap-1.5"><CloudDownload className="h-4 w-4" aria-hidden />Save again</button>
          </div>
          {pack.guides.map((g) => (
            <details key={g.title} className="rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-zinc-900 dark:text-white"><BookOpen className="h-4 w-4 text-indigo-500" aria-hidden /><span translate="no">{nice(g.title)}</span>: the guide offline</summary>
              <div className="mt-2 space-y-2" translate="no">
                {g.summary.map((p, i) => <p key={i}>{p}</p>)}
                {g.sections.map((s) => <div key={s.title}><p className="mt-2 font-semibold text-zinc-900 dark:text-white">{s.title}</p>{s.text.map((p, i) => <p key={i} className="mt-1">{p}</p>)}</div>)}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-3 text-sm text-zinc-700 dark:text-zinc-200">
          <p>Keep this trip on your phone for when there’s no signal: the plan, each city’s guide and the map around your places (usually 5–30 MB).</p>
          <button type="button" onClick={() => void save()} disabled={!located.length} className="btn-primary btn-sm inline-flex items-center gap-1.5"><CloudDownload className="h-4 w-4" aria-hidden />Save for offline</button>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Not kept offline: photos, the weather, walking routes, opening hours and changes friends make after you save (save again before you go). Saved on this device only.</p>
    </section>
  );
}
