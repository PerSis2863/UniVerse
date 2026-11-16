'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Luggage } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { km, type PlanStop } from '@/lib/travel-plan';

// "Add to a trip" on Travel's map (M209): one place, or a whole walk, into a trip I'm planning: into its
// city nearest the place (the city is added to the trip when it has none near), or a new trip here.

export interface PickItem { name: string; kind: string; lat: number; lon: number; hours?: string | null; price?: string | null; note?: string | null; address?: string | null; url?: string | null }

export function TripPicker({ items, city, cc }: { items: PickItem[]; city: string | null; cc: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useSWR<{ trips: { id: string; name: string }[] }>(open ? '/travel/trips' : null, fetcher);
  const first = items[0];

  const add = async (tripId: string | 'new') => {
    if (!first) return;
    setBusy(true);
    try {
      const guide = city ?? 'My places';
      let id = tripId;
      if (id === 'new') id = (await api.post<{ trip: { id: string } }>('/travel/trips', { stop: { guide, cc: cc ?? undefined, lat: first.lat, lon: first.lon, days: 2 } })).data.trip.id;
      const { data: trip } = await api.get<{ trip: { name: string }; stops: PlanStop[] }>(`/travel/trips/${id}`);
      let stop = trip.stops.map((s) => ({ s, d: km(s, first) ?? Infinity })).sort((a, b) => a.d - b.d)[0];
      if (!stop || stop.d > 80) stop = { s: (await api.post<{ stop: PlanStop }>(`/travel/trips/${id}/stops`, { guide, cc: cc ?? undefined, lat: first.lat, lon: first.lon, days: 2 })).data.stop, d: 0 };
      for (const it of items) await api.post(`/travel/trips/${id}/items`, { stopId: stop.s.id, name: it.name, kind: it.kind, lat: it.lat, lon: it.lon, hours: it.hours ?? undefined, price: it.price ?? undefined, note: it.note?.slice(0, 600) ?? undefined, address: it.address ?? undefined, url: it.url ?? undefined });
      setOpen(false);
      toast.success(`${items.length === 1 ? first.name : `${items.length} places`} added to “${trip.trip.name}”`, { action: { label: 'Open', onClick: () => router.push(`/travel/trip?id=${id}`) } });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add to the trip.')); } finally { setBusy(false); }
  };

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Luggage className="h-4 w-4" aria-hidden />Add to a trip</button>;
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Add to which trip</span>
      {busy && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" aria-hidden />}
      <select autoFocus disabled={busy || !data} defaultValue="" onChange={(e) => { if (e.target.value) void add(e.target.value); }} className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
        <option value="" disabled>{data ? 'Add to which trip?' : 'Loading your trips…'}</option>
        {(data?.trips ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="new">A new trip here</option>
      </select>
    </label>
  );
}
