'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BookHeart, Camera, Eye, EyeOff, NotebookPen, Trash2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { shrinkImage } from '@/lib/shrink-image';
import { addDays, type PlanStop } from '@/lib/travel-plan';

// M242: a trip's journal (the trip page's Journal part): notes and photos on each day by everyone planning it, live,
// and the same told as a story: the route on the map, then day by day. Entries marked "In the family link" also show
// on the trip's public link (M248).

export interface JournalEntry { id: string; day: number; text: string | null; photoUrl: string | null; place: string | null; shared: boolean; mine: boolean; by: string; createdAt: string }
const RouteMap = dynamic(() => import('@/components/relief/AidMap'), { ssr: false, loading: () => <div className="h-56 rounded-xl skeleton" /> });
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const SKY = '#0ea5e9';

/** Each day of the trip: its number, city and date. */
export function tripDayList(stops: PlanStop[], start: string | null) {
  let n = 0;
  return stops.flatMap((s) => Array.from({ length: s.days }, () => { const day = n++; return { day, city: nice(s.name), date: start ? addDays(start, day) : null, label: `Day ${day + 1} · ${nice(s.name)}${start ? ` · ${new Date(`${addDays(start, day)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}` }; }));
}

export function TripJournal({ tripId, stops, start, today }: { tripId: string; stops: PlanStop[]; start: string | null; today: number | null }) {
  const key = `/travel/trips/${tripId}/journal`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<{ entries: JournalEntry[] }>(key, fetcher, { refreshInterval });
  const [view, setView] = useState<'write' | 'story'>('write');
  const days = useMemo(() => tripDayList(stops, start), [stops, start]);
  const entries = useMemo(() => data?.entries ?? [], [data]);

  if (!days.length) return <div className="panel p-8 text-center"><NotebookPen className="mx-auto h-8 w-8 text-indigo-500" aria-hidden /><p className="mt-3 font-semibold text-zinc-900 dark:text-white">Add a place to the trip first: the journal keeps notes and photos for each of its days.</p></div>;
  return (
    <div className="space-y-6">
      <Segmented<'write' | 'story'> label="Journal view" value={view} onChange={setView} segments={[{ value: 'write', label: 'Write', icon: <NotebookPen className="h-4 w-4" aria-hidden /> }, { value: 'story', label: 'Story', icon: <BookHeart className="h-4 w-4" aria-hidden /> }]} />
      {view === 'write'
        ? <Write key={key} url={key} days={days} today={today} entries={entries} refresh={() => void mutate()} />
        : <Story stops={stops} days={days} entries={entries} />}
    </div>
  );
}

function Write({ url, days, today, entries, refresh }: { url: string; days: ReturnType<typeof tripDayList>; today: number | null; entries: JournalEntry[]; refresh: () => void }) {
  const [day, setDay] = useState(today ?? 0), [text, setText] = useState(''), [place, setPlace] = useState(''), [shared, setShared] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const add = async () => {
    setBusy(true);
    try {
      let photoUrl: string | undefined;
      if (photo) {
        const f = await shrinkImage(photo);
        photoUrl = (await authedJson<{ url: string }>(`/api/upload?filename=${encodeURIComponent(f.name || 'journal.jpg')}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'image/jpeg' } })).url;
      }
      await api.post(url, { day, text, place, photoUrl, shared });
      setText(''); setPlace(''); setPhoto(null); if (file.current) file.current.value = '';
      toast.success('Added to the journal.');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add that.')); }
    setBusy(false);
    refresh();
  };
  const act = async (call: () => Promise<unknown>) => { try { await call(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); } refresh(); };
  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="panel space-y-3 p-5" aria-labelledby="j-new">
        <h3 id="j-new" className="text-lg font-semibold text-zinc-900 dark:text-white">New entry</h3>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Day
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
            {days.map((d) => <option key={d.day} value={d.day}>{d.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">What happened
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" placeholder="The best thing today was…" />
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Where (optional)
          <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" placeholder="A café, a viewpoint…" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary btn-sm inline-flex cursor-pointer items-center gap-1.5"><Camera className="h-4 w-4" aria-hidden />{photo ? 'Change photo' : 'Add a photo'}
            <input ref={file} type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          {photo && <span className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-300">{photo.name}</span>}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 accent-indigo-500" />In the family link</label>
        <button type="button" onClick={() => void add()} disabled={busy || (!text.trim() && !photo)} className="btn-primary w-full">{busy ? 'Adding…' : 'Add to the journal'}</button>
      </section>
      <section className="panel p-5" aria-labelledby="j-list">
        <h3 id="j-list" className="text-lg font-semibold text-zinc-900 dark:text-white">Entries</h3>
        {!entries.length && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Nothing yet. Everyone planning the trip can add notes and photos; they turn into the trip’s story.</p>}
        <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/10">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3 py-3">
              {e.photoUrl && <Image src={e.photoUrl} alt="" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{days[e.day]?.label ?? `Day ${e.day + 1}`} · {e.mine ? 'you' : e.by}{e.place ? ` · ${e.place}` : ''}</p>
                {e.text && <p className="mt-0.5 whitespace-pre-line text-sm text-zinc-800 dark:text-zinc-100" translate="no">{e.text}</p>}
              </div>
              {e.mine && <button type="button" className="btn-ghost btn-sm p-2" aria-pressed={e.shared} aria-label={e.shared ? 'In the family link: take it out' : 'Not in the family link: put it in'} title={e.shared ? 'In the family link' : 'Only for the trip'} onClick={() => void act(() => api.patch(`${url}/${e.id}`, { shared: !e.shared }))}>{e.shared ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}</button>}
              <button type="button" className="btn-ghost btn-sm p-2 text-red-600 dark:text-red-400" aria-label="Remove this entry" onClick={() => { if (confirm('Remove this entry?')) void act(() => api.delete(`${url}/${e.id}`)); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The journal as a story: the route, then each day that has something. Also used by the family link (M248). */
export function Story({ stops, days, entries }: { stops: Pick<PlanStop, 'name' | 'lat' | 'lon'>[]; days: { day: number; label: string }[]; entries: Pick<JournalEntry, 'id' | 'day' | 'text' | 'photoUrl' | 'place' | 'by'>[] }) {
  const points = stops.filter((s) => s.lat !== null && s.lon !== null).map((s) => ({ lat: s.lat!, lng: s.lon!, place: nice(s.name) }));
  const used = days.filter((d) => entries.some((e) => e.day === d.day));
  return (
    <div className="space-y-6">
      {points.length > 0 && <section className="panel overflow-hidden p-0" aria-label="The route"><div className="h-56 sm:h-72"><RouteMap points={points} moving={false} color={SKY} /></div><p className="p-3 text-sm text-zinc-600 dark:text-zinc-300">{points.map((p) => p.place).join(' → ')}</p></section>}
      {!used.length && <p className="panel p-6 text-center text-sm text-zinc-600 dark:text-zinc-300">The story fills in as the journal does.</p>}
      {used.map((d) => (
        <section key={d.day} className="panel p-5" aria-label={d.label}>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{d.label}</h3>
          <div className="mt-3 space-y-4">
            {entries.filter((e) => e.day === d.day).map((e) => (
              <article key={e.id}>
                {e.photoUrl && <Image src={e.photoUrl} alt={e.place ? `Photo at ${e.place}` : 'Photo from the trip'} width={1200} height={800} unoptimized className="max-h-[28rem] w-full rounded-xl object-cover" />}
                {e.text && <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-zinc-800 dark:text-zinc-100" translate="no">{e.text}</p>}
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{e.by}{e.place ? ` · ${e.place}` : ''}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
