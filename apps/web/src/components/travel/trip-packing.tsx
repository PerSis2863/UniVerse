'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Luggage, Plus, Sparkles, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { PACK_GROUPS, packingFor, type PackStop } from '@/lib/travel-pack';
import { cn } from '@/lib/utils';
import { useHome } from './travel-ui';

// A trip's packing list (M215), shared by everyone planning it: suggestions from the trip (its length, the
// weather there that month, what the places are for, the plugs against yours, the money), added in one go or
// one by one, plus your own; tick what's packed (everyone sees who packed it, live).

interface Member { id: string; name: string }
interface Row { id: string; item: string; grp: string; done: boolean; doneBy: string | null }
const GROUPS = [...PACK_GROUPS, 'Other'] as const;

export function TripPacking({ tripId, stops, start, members, me }: { tripId: string; stops: PackStop[]; start: string | null; members: Member[]; me: string }) {
  const key = `/travel/trips/${tripId}/packing`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<{ items: Row[] }>(key, fetcher, { refreshInterval });
  const [home] = useHome();
  const [plugs, setPlugs] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    void import('@/lib/travel-countries.json').then((m) => setPlugs(Object.fromEntries(Object.entries(m.default as unknown as Record<string, unknown[]>).map(([cc, row]) => [cc, String(row[6] ?? '')]))));
  }, []);
  const [own, setOwn] = useState(''), [grp, setGrp] = useState<string>('Other');
  const items = useMemo(() => data?.items ?? [], [data]);
  const ideas = useMemo(() => {
    if (!plugs) return [];
    const have = new Set(items.map((x) => x.item.toLowerCase()));
    return packingFor({ stops, start, home, plugs }).filter((x) => !have.has(x.item.toLowerCase()));
  }, [plugs, items, stops, start, home]);
  const done = items.filter((x) => x.done).length;
  const name = (id: string | null) => (!id ? '' : id === me ? 'you' : members.find((m) => m.id === id)?.name ?? 'someone');

  const add = async (list: { item: string; grp: string }[], ok: string) => {
    try { await api.post(key, { items: list }); toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t add that.')); }
    await mutate();
  };
  const tick = async (r: Row) => {
    await mutate({ items: items.map((x) => (x.id === r.id ? { ...x, done: !r.done, doneBy: r.done ? null : me } : x)) }, { revalidate: false });
    try { await api.patch(`${key}/${r.id}`, { done: !r.done }); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    await mutate();
  };
  const remove = async (r: Row) => {
    await mutate({ items: items.filter((x) => x.id !== r.id) }, { revalidate: false });
    try { await api.delete(`${key}/${r.id}`); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove that.')); }
    await mutate();
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="panel p-5" aria-labelledby="pack-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="pack-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Luggage className="h-5 w-5 text-indigo-500" aria-hidden />Packing list</h3>
          {items.length > 0 && <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300" data-no-motion>{done} of {items.length} packed</span>}
        </div>
        {items.length > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden><span className="block h-full origin-left rounded-full bg-emerald-500 transition-transform duration-500 ease-[var(--ease-glide)] rtl:origin-right" style={{ transform: `scaleX(${done / items.length})` }} /></div>}
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (own.trim()) { void add([{ item: own, grp }], `Added ${own.trim()}.`); setOwn(''); } }}>
          <label className="min-w-0 flex-1 basis-full sm:basis-0"><span className="sr-only">Something to pack</span><input value={own} onChange={(e) => setOwn(e.target.value.slice(0, 80))} placeholder="Add something to pack…" className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" /></label>
          <label><span className="sr-only">Group</span><select value={grp} onChange={(e) => setGrp(e.target.value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
          <button type="submit" disabled={!own.trim()} className="btn-primary inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Add</button>
        </form>
        {!data ? <div className="mt-4 h-32 skeleton rounded-xl" aria-busy="true" />
          : !items.length ? <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">Empty so far. Take the suggestions for this trip, or add your own. Everyone planning it shares the list.</p>
          : (
            <div className="mt-4 space-y-5">
              {GROUPS.map((g) => {
                const rows = items.filter((x) => (x.grp === g) || (g === 'Other' && !(PACK_GROUPS as readonly string[]).includes(x.grp)));
                if (!rows.length) return null;
                return (
                  <div key={g}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{g}</h4>
                    <ul className="mt-1.5 space-y-1">
                      {rows.map((r) => (
                        <li key={r.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                          <button type="button" role="checkbox" aria-checked={r.done} onClick={() => void tick(r)} aria-label={r.item} className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 transition-[background-color,transform] duration-150 active:scale-90', r.done ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white ring-zinc-300 dark:bg-white/[0.05] dark:ring-white/20')}>
                            {r.done && <Check className="h-4 w-4" aria-hidden />}
                          </button>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-sm transition-colors', r.done ? 'text-zinc-500 line-through dark:text-zinc-400' : 'text-zinc-900 dark:text-white')}>{r.item}</span>
                            {r.done && r.doneBy && <span className="block text-xs text-zinc-500 dark:text-zinc-400" translate="no">Packed by {name(r.doneBy)}</span>}
                          </span>
                          <button type="button" onClick={() => void remove(r)} className="btn-ghost btn-sm p-1 text-zinc-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label={`Remove ${r.item}`}><X className="h-4 w-4" aria-hidden /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
      </section>

      <section className="panel p-5" aria-labelledby="ideas-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ideas-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Sparkles className="h-5 w-5 text-indigo-500" aria-hidden />For this trip</h3>
          {ideas.length > 1 && <button type="button" onClick={() => void add(ideas.map(({ item, grp: g }) => ({ item, grp: g })), `Added ${ideas.length} things.`)} className="btn-secondary btn-sm">Add all {ideas.length}</button>}
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">From the trip’s length, the weather there that month, what the places are for and the plugs there{home ? '' : ' (set your home country on a guide’s Know tab to check yours)'}.</p>
        {!plugs ? <div className="mt-3 h-24 skeleton rounded-xl" aria-busy="true" />
          : !ideas.length ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Everything suggested is on the list.</p>
          : (
            <ul className="mt-3 space-y-1">
              {ideas.map((x) => (
                <li key={x.item}>
                  <button type="button" onClick={() => void add([{ item: x.item, grp: x.grp }], `Added ${x.item}.`)} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                    <Plus className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
                    <span className="min-w-0"><span className="block text-sm text-zinc-900 dark:text-white">{x.item}</span>{x.why && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{x.why}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
