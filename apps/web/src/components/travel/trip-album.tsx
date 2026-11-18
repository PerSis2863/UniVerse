'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, Images, Loader2, Plus, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { shrinkImage } from '@/lib/shrink-image';
import { cn } from '@/lib/utils';
import type { PlanStop } from '@/lib/travel-plan';
import { tripDayList, type JournalEntry } from './trip-journal';

// M321: a trip's shared album (the trip page's Album part): every photo the people planning it added, from
// the journal and straight here, by day or by person; many at once; a full view with the arrow keys; all of
// them saved as one zip made in the browser. Photos are journal entries (src/server/travel-trip-journal.ts).

export function TripAlbum({ tripId, name, stops, start, today }: { tripId: string; name: string; stops: PlanStop[]; start: string | null; today: number | null }) {
  const key = `/travel/trips/${tripId}/journal`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<{ entries: JournalEntry[] }>(key, fetcher, { refreshInterval });
  const days = useMemo(() => tripDayList(stops, start), [stops, start]);
  const photos = useMemo(() => (data?.entries ?? []).filter((e) => e.photoUrl), [data]);
  const [who, setWho] = useState('');
  const [day, setDay] = useState(String(today ?? 0));
  const [busy, setBusy] = useState<null | 'add' | 'zip'>(null);
  const [open, setOpen] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const people = useMemo(() => [...new Set(photos.map((p) => (p.mine ? 'You' : p.by)))], [photos]);
  const shown = photos.filter((p) => !who || (p.mine ? 'You' : p.by) === who);

  const add = async (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/')).slice(0, 20);
    if (!list.length) return;
    setBusy('add');
    try {
      const urls: string[] = [];
      for (const f0 of list) {
        const f = await shrinkImage(f0);
        urls.push((await authedJson<{ url: string }>(`/api/upload?filename=${encodeURIComponent(f.name || 'album.jpg')}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'image/jpeg' } })).url);
      }
      await api.post(`/travel/trips/${tripId}/journal/photos`, { day: Number(day), photoUrls: urls });
      toast.success(`${urls.length} ${urls.length === 1 ? 'photo' : 'photos'} in the album`, { description: 'Everyone planning the trip sees them.' });
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add the photos.')); }
    finally { setBusy(null); }
  };

  const zip = async () => {
    setBusy('zip');
    try {
      const { zipSync } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      for (const [i, p] of shown.entries()) {
        const r = await fetch(p.photoUrl!);
        if (!r.ok) continue;
        const ext = (r.headers.get('content-type') ?? '').includes('png') ? 'png' : 'jpg';
        files[`day-${p.day + 1}-${String(i + 1).padStart(3, '0')}.${ext}`] = new Uint8Array(await r.arrayBuffer());
      }
      const blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name.replace(/[^\p{L}\p{N} -]/gu, '').trim() || 'trip'} photos.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t make the zip.')); }
    finally { setBusy(null); }
  };

  const byDay = days.map((d) => ({ ...d, photos: shown.filter((p) => p.day === d.day) })).filter((d) => d.photos.length);
  const flat = byDay.flatMap((d) => d.photos);
  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm"><span className="label">Add to</span>
          <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>{days.map((d) => <option key={d.day} value={d.day}>{d.label}</option>)}</select>
        </label>
        <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn-primary btn-sm" disabled={!!busy || !days.length} onClick={() => file.current?.click()}>{busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />}Add photos</button>
        <span className="me-auto" />
        {people.length > 1 && (
          <select aria-label="Whose photos" className="input w-auto py-1 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone’s</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {shown.length > 0 && <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void zip()}>{busy === 'zip' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}Save all ({shown.length})</button>}
      </div>
      {!data ? <div className="h-48 rounded-[var(--radius-card)] skeleton" /> : !shown.length ? (
        <div className="panel p-8 text-center"><Images className="mx-auto h-8 w-8 text-sky-500" aria-hidden /><p className="mt-3 font-semibold text-zinc-900 dark:text-white">No photos yet</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Add yours: everyone planning the trip sees them here, day by day.</p></div>
      ) : byDay.map((d) => (
        <section key={d.day} aria-label={d.label}>
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">{d.label}</h3>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {d.photos.map((p) => (
              <li key={p.id}>
                <button type="button" className="block w-full overflow-hidden rounded-xl" onClick={() => setOpen(flat.indexOf(p))} aria-label={`Photo by ${p.mine ? 'you' : p.by}${p.text ? `: ${p.text}` : ''}`}>
                  <Image src={p.photoUrl!} alt="" width={240} height={240} unoptimized className="aspect-square w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {open !== null && flat[open] && <Viewer photos={flat} at={open} setAt={setOpen} label={(p) => days[p.day]?.label ?? `Day ${p.day + 1}`} />}
    </div>
  );
}

function Viewer({ photos, at, setAt, label }: { photos: JournalEntry[]; at: number; setAt: (n: number | null) => void; label: (p: JournalEntry) => string }) {
  const p = photos[at];
  const go = useCallback((d: number) => setAt((at + d + photos.length) % photos.length), [at, photos.length, setAt]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, setAt]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-[130] flex flex-col bg-black/90 p-4" onClick={() => setAt(null)}>
      <div className="flex items-center gap-2 text-sm text-white/80">
        <span className="me-auto">{label(p)} · {p.mine ? 'You' : p.by}{p.place ? ` · ${p.place}` : ''} · {at + 1} of {photos.length}</span>
        <button type="button" className="rounded-full p-2 hover:bg-white/10" aria-label="Close" onClick={() => setAt(null)}><X className="w-5 h-5" aria-hidden /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="absolute start-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Before" onClick={() => go(-1)}><ChevronLeft className="w-6 h-6 rtl:rotate-180" aria-hidden /></button>
        <Image key={p.id} src={p.photoUrl!} alt={p.text ?? ''} width={1600} height={1200} unoptimized className={cn('swap max-h-full w-auto max-w-full rounded-lg object-contain')} />
        <button type="button" className="absolute end-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="After" onClick={() => go(1)}><ChevronRight className="w-6 h-6 rtl:rotate-180" aria-hidden /></button>
      </div>
      {p.text && <p className="mt-2 text-center text-sm text-white/90" translate="no">{p.text}</p>}
    </div>
  );
}
