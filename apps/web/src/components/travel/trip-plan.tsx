'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BedDouble, ClipboardPaste, Loader2, MapPin, Search, Sparkles, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import type { Guide, Listing } from '@/lib/travel-guide';
import { withDistricts } from '@/lib/travel-stay';
import { INTERESTS, PACES, makeItinerary, type Have, type Pace } from '@/lib/travel-itinerary';
import { addDays, readStarts, type PlanStop } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { PlaceSearch } from './travel-ui';
import type { TripItem } from './trip-days';

// M329: the automatic itinerary's two ways in. On a trip, ✨ "Plan my days for me" (TripPlanSheet): where you're
// staying (kept on the trip as its stay), your pace and interests, every day or only the empty ones. On Trips,
// "Get a day-by-day plan" (BookedPlan): a city, or the hotel you've booked (typed, or its confirmation pasted and read),
// the dates: a new trip with the stay and every day planned. The plan itself is src/lib/travel-itinerary.ts.

type Spot = { name: string; lat: number; lon: number; address?: string | null };
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');

/** A city's guide with its districts' places (a big city keeps its sights in its districts' guides). */
async function cityListings(title: string): Promise<{ listings: Listing[]; centre: { lat: number; lon: number } | null }> {
  const { data } = await api.get<{ guide: Guide }>(`/travel/guide?d=${encodeURIComponent(title)}`);
  const g = data.guide;
  const parts = g.places.filter((p) => p.title.startsWith(`${g.title}/`)).slice(0, 8);
  const more: (Guide | undefined)[] = [];
  for (let i = 0; i < parts.length; i += 4) more.push(...await Promise.all(parts.slice(i, i + 4).map((p) => api.get<{ guide: Guide }>(`/travel/guide?d=${encodeURIComponent(p.title)}`).then((r) => r.data.guide).catch(() => undefined))));
  // Each district's places carry its name, so a day can say which part of town it keeps to.
  const tagged = more.map((m) => m && { ...m, sections: m.sections.map((s) => ({ ...s, listings: s.listings.map((l) => ({ ...l, guide: m.title })) })) });
  return { listings: withDistricts(g, tagged).sections.flatMap((s) => s.listings), centre: g.lat !== undefined && g.lon !== undefined ? { lat: g.lat, lon: g.lon } : null };
}

/** Plans one city of a trip and saves it; the days' parts of town for the message. */
async function planCity(o: { tripId: string; stop: PlanStop; items: TripItem[]; stay: Spot | null; pace: Pace; interests: string[]; only?: number[]; light?: number[] }) {
  const { listings, centre } = await cityListings(o.stop.guide);
  const have: Have[] = o.items.filter((x) => x.stopId === o.stop.id).map((x) => ({ id: x.id, name: x.name, kind: x.kind, lat: x.lat, lon: x.lon, day: x.day, position: x.position, minutes: x.minutes }));
  const plan = makeItinerary({ listings, days: o.stop.days, stay: o.stay, centre: centre ?? { lat: o.stop.lat, lon: o.stop.lon }, pace: o.pace, interests: o.interests, have, only: o.only, light: o.light });
  for (let i = 0; i * 60 < Math.max(1, plan.add.length); i++) {
    if (!plan.add.length && !plan.move.length) break;
    await api.post(`/travel/trips/${o.tripId}/plan`, { stopId: o.stop.id, items: plan.add.slice(i * 60, i * 60 + 60), moves: i === 0 ? plan.move : [] });
  }
  // When each planned day starts (an arrival day in the afternoon), kept with the city's other days'.
  const starts = { ...readStarts(o.stop.starts), ...plan.starts };
  await api.patch(`/travel/trips/${o.tripId}/stops/${o.stop.id}`, { starts });
  return { added: plan.add.length, areas: plan.areas };
}

const told = (added: number, areas: (string | null)[]) => {
  const named = areas.map((a, i) => (a ? `Day ${i + 1}: ${a}` : null)).filter(Boolean).slice(0, 4).join(' · ');
  return added ? `${added} places planned${named ? `. ${named}` : ''}.` : 'Your days were already full: nothing to add.';
};

/** Where a typed hotel or address is (OpenStreetMap), with the town it's in. */
async function findSpot(q: string): Promise<(Spot & { city: string | null }) | null> {
  try {
    const { data } = await api.get<{ lat: number; lon: number; city: string | null; name: string | null }>(`/travel/where?q=${encodeURIComponent(q)}`);
    return { name: data.name ?? q.split(',')[0].trim(), lat: data.lat, lon: data.lon, address: q, city: data.city };
  } catch { return null; }
}

function Choices({ pace, setPace, interests, setInterests }: { pace: Pace; setPace: (p: Pace) => void; interests: string[]; setInterests: (f: (i: string[]) => string[]) => void }) {
  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Your pace</p>
        <Segmented<Pace> label="Pace" value={pace} onChange={setPace} segments={(Object.keys(PACES) as Pace[]).map((p) => ({ value: p, label: `${PACES[p].label} · ${PACES[p].sights}` }))} />
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Places a day, besides lunch, coffee and dinner.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-white">What you like <span className="font-normal text-zinc-500 dark:text-zinc-400">(any, or none)</span></legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const on = interests.includes(i.id);
            return <button key={i.id} type="button" aria-pressed={on} onClick={() => setInterests((x) => (on ? x.filter((y) => y !== i.id) : [...x, i.id]))}
              className={cn('rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-[background-color,color] duration-150', on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50 dark:bg-white/[0.04] dark:text-zinc-200 dark:ring-white/10')}>{i.label}</button>;
          })}
        </div>
      </fieldset>
    </>
  );
}

/** Where you're staying: one you found, one saved on a trip, or typed and found. */
function StayField({ stay, setStay, near }: { stay: Spot | null; setStay: (s: (Spot & { city?: string | null }) | null) => void; near?: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const { data } = useSWR<{ stays: { id: string; name: string; address: string | null; lat: number | null; lon: number | null; city: string; guide: string }[] }>('/travel/trips/stays', fetcher, { revalidateOnFocus: false });
  const saved = (data?.stays ?? []).filter((s) => s.lat !== null && s.lon !== null && (!near || s.guide === near || s.guide.startsWith(`${near}/`))).slice(0, 3);
  const find = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    const s = await findSpot(near ? `${q.trim()}, ${nice(near)}` : q.trim()) ?? (near ? await findSpot(q.trim()) : null);
    setBusy(false);
    if (s) { setStay(s); setQ(''); } else toast.error('We couldn’t find that. Try the hotel’s name with its town, or its address.');
  };
  if (stay) return (
    <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-white/[0.04] dark:ring-white/10">
      <BedDouble className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
      <p className="min-w-0 flex-1 text-sm"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{stay.name}</span><span className="text-zinc-600 dark:text-zinc-300">Each day starts and ends here.</span></p>
      <button type="button" onClick={() => setStay(null)} className="btn-ghost btn-sm p-1.5" aria-label={`Not ${stay.name}`}><X className="h-4 w-4" aria-hidden /></button>
    </div>
  );
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(); }}>
        <label className="sr-only" htmlFor="plan-stay">Your hotel’s name or address</label>
        <input id="plan-stay" value={q} onChange={(e) => setQ(e.target.value.slice(0, 160))} placeholder="Your hotel’s name or address" className="input min-w-0 flex-1" />
        <button type="submit" disabled={busy || q.trim().length < 3} className="btn-secondary inline-flex items-center gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}Find</button>
      </form>
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saved.map((s) => <button key={s.id} type="button" onClick={() => setStay({ name: s.name, lat: s.lat!, lon: s.lon!, address: s.address, city: s.guide })} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><BedDouble className="h-3.5 w-3.5" aria-hidden /><span translate="no">{s.name}</span></button>)}
        </div>
      )}
    </div>
  );
}

/** On a trip: plan this city's days for me. */
export function TripPlanSheet({ tripId, stop, items, onClose, onDone }: { tripId: string; stop: PlanStop; items: TripItem[]; onClose: () => void; onDone: () => void }) {
  const mine = useMemo(() => items.filter((x) => x.stopId === stop.id), [items, stop.id]);
  const kept = mine.find((x) => x.kind === 'sleep' && x.lat !== null && x.lon !== null);
  const [stay, setStay] = useState<Spot | null>(kept ? { name: kept.name, lat: kept.lat!, lon: kept.lon!, address: kept.address } : null);
  const [pace, setPace] = useState<Pace>('balanced');
  const [interests, setInterests] = useState<string[]>([]);
  const busyDays = new Set(mine.filter((x) => x.kind !== 'sleep' && x.day !== null).map((x) => x.day));
  const [scope, setScope] = useState<'all' | 'empty'>(busyDays.size ? 'empty' : 'all');
  const [light, setLight] = useState(stop.days >= 3);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (stay && (!kept || kept.lat !== stay.lat || kept.lon !== stay.lon)) await api.post(`/travel/trips/${tripId}/items`, { stopId: stop.id, name: stay.name, kind: 'sleep', lat: stay.lat, lon: stay.lon, address: stay.address ?? undefined });
      const only = scope === 'empty' ? Array.from({ length: stop.days }, (_, d) => d).filter((d) => !busyDays.has(d)) : undefined;
      const r = await planCity({ tripId, stop, items: mine, stay, pace, interests, only, light: light ? [0, stop.days - 1] : undefined });
      toast.success(told(r.added, r.areas));
      onDone(); onClose();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t plan the days just now.')); setBusy(false); }
  };
  return (
    <Sheet title={`Plan my days in ${nice(stop.name)}`} onClose={onClose}
      footer={<button type="button" onClick={() => void go()} disabled={busy} className="btn-primary inline-flex w-full items-center justify-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}{busy ? 'Planning your days…' : `Plan ${stop.days} ${stop.days === 1 ? 'day' : 'days'}`}</button>}>
      <div className="space-y-5">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">The guide’s best places for what you like, each day in one part of town, in the shortest round from where you sleep, with lunch, a coffee and dinner nearby. Places you’ve added stay; you can move anything after.</p>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Where are you staying?</p>
          <StayField stay={stay} setStay={setStay} near={stop.guide} />
          {!stay && <p className="text-xs text-zinc-600 dark:text-zinc-300">No hotel yet? Leave it: the days start from the centre.</p>}
        </div>
        <Choices pace={pace} setPace={setPace} interests={interests} setInterests={setInterests} />
        {busyDays.size > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Which days</p>
            <Segmented<'all' | 'empty'> label="Which days" value={scope} onChange={setScope} segments={[{ value: 'empty', label: 'Only the empty days' }, { value: 'all', label: 'Every day' }]} />
          </div>
        )}
        {stop.days >= 2 && (
          <label className="flex items-start gap-3 text-sm text-zinc-800 dark:text-zinc-100">
            <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
            <span>Lighter first and last days<span className="block text-xs text-zinc-600 dark:text-zinc-300">For arriving and leaving: half as many places.</span></span>
          </label>
        )}
      </div>
    </Sheet>
  );
}

/** On Trips: a city, or a hotel already booked, and the dates: a new trip with its days planned. */
export function BookedPlan({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [city, setCity] = useState<string | null>(null);
  const [stay, setStayState] = useState<Spot | null>(null);
  const [start, setStart] = useState('');
  const [nights, setNights] = useState(3);
  const [pace, setPace] = useState<Pace>('balanced');
  const [interests, setInterests] = useState<string[]>([]);
  const [paste, setPaste] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const setStay = (s: (Spot & { city?: string | null }) | null) => { setStayState(s); if (s?.city && !city) setCity(s.city); };
  const read = async () => {
    if (!paste || paste.trim().length < 30) return;
    setReading(true);
    try {
      const { data } = await api.post<{ hotel: string | null; address: string | null; city: string | null; checkIn: string | null; checkOut: string | null }>('/travel/booking/read', { text: paste });
      if (data.checkIn) setStart(data.checkIn);
      if (data.checkIn && data.checkOut) setNights(Math.max(1, Math.min(30, Math.round((Date.parse(data.checkOut) - Date.parse(data.checkIn)) / 86_400_000))));
      const q = [data.hotel, data.address, data.city].filter(Boolean).join(', ');
      const s = q ? await findSpot(q) ?? (data.address ? await findSpot(data.address) : null) : null;
      if (s) setStay({ ...s, name: data.hotel ?? s.name, city: s.city ?? data.city });
      else if (data.city) setCity(data.city);
      setPaste(null);
      toast.success(s ? `Found ${data.hotel ?? s.name}. Check the dates, then plan.` : 'Read it, but the hotel wasn’t found on the map: type its address.');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t read that.')); } finally { setReading(false); }
  };
  const go = async () => {
    if (!city) { toast.error('Choose the city, or find your hotel.'); return; }
    setBusy(true);
    try {
      const days = Math.min(30, nights + 1);
      const { data: { trip } } = await api.post<{ trip: { id: string } }>('/travel/trips', { stop: { guide: city, days }, startDate: start || undefined, name: `${nice(city)}${start ? `, ${new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}` : ''}` });
      const { data } = await api.get<{ stops: PlanStop[]; items: TripItem[] }>(`/travel/trips/${trip.id}`);
      const stop = data.stops[0];
      if (!stop) throw new Error('That city has no guide yet: try the nearest big city.');
      if (stay) await api.post(`/travel/trips/${trip.id}/items`, { stopId: stop.id, name: stay.name, kind: 'sleep', lat: stay.lat, lon: stay.lon, address: stay.address ?? undefined });
      const r = await planCity({ tripId: trip.id, stop, items: [], stay, pace, interests, light: days >= 3 ? [0, days - 1] : undefined });
      toast.success(told(r.added, r.areas));
      router.push(`/travel/trip?id=${trip.id}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t make the plan just now.')); setBusy(false); }
  };
  return (
    <Sheet title="Get a day-by-day plan" onClose={onClose}
      footer={<button type="button" onClick={() => void go()} disabled={busy || !city} className="btn-primary inline-flex w-full items-center justify-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}{busy ? 'Planning your days…' : 'Plan my days'}</button>}>
      <div className="space-y-5">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Already booked somewhere to stay? Find it (or paste the booking) and every day is planned around it. Not booked yet? Just choose the city.</p>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Where you’re staying</p>
          <StayField stay={stay} setStay={setStay} near={city ?? undefined} />
          {paste === null ? <button type="button" onClick={() => setPaste('')} className="btn-ghost btn-sm inline-flex items-center gap-1.5"><ClipboardPaste className="h-4 w-4" aria-hidden />Paste the booking confirmation instead</button> : (
            <div className="space-y-2">
              <label className="sr-only" htmlFor="plan-paste">The booking confirmation’s text</label>
              <textarea id="plan-paste" value={paste} onChange={(e) => setPaste(e.target.value.slice(0, 8000))} rows={5} placeholder="Paste the email or the booking page’s text: the hotel, its address and the dates are read from it (with AI). Nothing is kept." className="input w-full" />
              <div className="flex gap-2">
                <button type="button" onClick={() => void read()} disabled={reading || paste.trim().length < 30} className="btn-secondary btn-sm inline-flex items-center gap-1.5">{reading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Read it</button>
                <button type="button" onClick={() => setPaste(null)} className="btn-ghost btn-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">City</p>
          {city ? (
            <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-white/[0.04] dark:ring-white/10">
              <MapPin className="h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{nice(city)}</p>
              <button type="button" onClick={() => setCity(null)} className="btn-ghost btn-sm p-1.5" aria-label={`Not ${nice(city)}`}><X className="h-4 w-4" aria-hidden /></button>
            </div>
          ) : <PlaceSearch label="The city you’re visiting" placeholder="Search a city…" onPick={setCity} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm font-semibold text-zinc-900 dark:text-white">Arriving
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input w-full font-normal" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-zinc-900 dark:text-white">Nights
            <input type="number" min={1} max={29} value={nights} onChange={(e) => setNights(Math.max(1, Math.min(29, Math.round(Number(e.target.value) || 1))))} className="input w-full font-normal" />
          </label>
        </div>
        {start && <p className="-mt-2 text-xs text-zinc-600 dark:text-zinc-300">{nights + 1} days: {new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} to {new Date(`${addDays(start, nights)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}, the first and last lighter.</p>}
        <Choices pace={pace} setPace={setPace} interests={interests} setInterests={setInterests} />
      </div>
    </Sheet>
  );
}
