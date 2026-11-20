'use client';

import { useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import { Bike, Bus, Car, Clock, Leaf, Plane, Scale, TrainFront, Zap, type LucideIcon } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { duration } from '@/lib/map-tools';
import { api, errorMessage } from '@/lib/api';
import { GREEN_FACTORS } from '@/lib/green';
import { bestBalance, equivalents, journey, logFor, type ModeId } from '@/lib/green-plus';
import { IDEAS } from '@/lib/travel-ideas';
import { km as distance } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { morph } from '@/lib/view-transition';

// Green → Journeys (M216): a journey's CO₂ by each way of going, cleanest first, for the people travelling
// (a car's is shared); type the distance or pick two of Travel's places (as the crow flies, plus a fifth for
// roads and rails). M358: each with its door-to-door time, Quickest and Best balance marked, sorted either way. Made it a cleaner way than by car? Log it as a Green action in one tap.

const ICON: Record<ModeId, LucideIcon> = { car: Car, ev: Zap, train: TrainFront, coach: Bus, bus: Bus, plane: Plane, bike: Bike };
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';
const PLACES = IDEAS.filter((i) => i.lat !== undefined && i.lon !== undefined).map((i) => ({ title: i.title, lat: i.lat!, lon: i.lon! })).sort((a, b) => a.title.localeCompare(b.title));

export function GreenJourney() {
  const [kmText, setKm] = useState('300'), [people, setPeople] = useState(1);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const picked = useMemo(() => {
    const a = PLACES.find((p) => p.title === from), b = PLACES.find((p) => p.title === to);
    return a && b && a !== b ? Math.round((distance(a, b) ?? 0) * 1.2) : null;
  }, [from, to]);
  const km = picked ?? Math.min(20_000, Math.max(0, Number(kmText) || 0));
  const [order, setOrder] = useState<'clean' | 'quick'>('clean'), list = useRef<HTMLOListElement>(null);
  const cleanest = useMemo(() => journey(km, people), [km, people]);
  const ways = order === 'quick' ? [...cleanest].sort((a, b) => a.minutes - b.minutes || a.kg - b.kg) : cleanest;
  const car = cleanest.find((w) => w.id === 'car')!, worst = Math.max(...cleanest.map((w) => w.kg), 0.1);
  const quick = Math.min(...cleanest.map((w) => w.minutes)), balance = bestBalance(cleanest);
  const [busy, setBusy] = useState<ModeId | null>(null);
  const log = async (mode: ModeId) => {
    const l = logFor(mode, km);
    if (!l) return;
    setBusy(mode);
    try {
      await api.post('/green/actions', { kind: l.kind, amount: Math.min(l.amount, GREEN_FACTORS[l.kind].max), note: from && to ? `${from} to ${to}` : undefined });
      toast.success('Logged on My impact: add a photo there to have it confirmed.');
      void mutate('/green/me');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t log that.')); } finally { setBusy(null); }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="panel space-y-4 p-5" aria-labelledby="jr-h">
        <h3 id="jr-h" className="text-lg font-semibold text-zinc-900 dark:text-white">The journey</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>From<select value={from} onChange={(e) => setFrom(e.target.value)} className={field}><option value="">A place…</option>{PLACES.map((p) => <option key={p.title} value={p.title}>{p.title}</option>)}</select></label>
          <label className={label}>To<select value={to} onChange={(e) => setTo(e.target.value)} className={field}><option value="">A place…</option>{PLACES.map((p) => <option key={p.title} value={p.title}>{p.title}</option>)}</select></label>
        </div>
        <label className={label}>Or the distance, km<input type="number" min={0} max={20000} inputMode="numeric" value={picked ?? kmText} disabled={picked !== null} onChange={(e) => setKm(e.target.value)} className={cn(field, 'tabular-nums disabled:opacity-60')} /></label>
        {picked !== null && <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">About {picked.toLocaleString()} km by road or rail. <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="font-semibold text-emerald-700 underline dark:text-emerald-300">Type it instead</button></p>}
        <label className={label}>People travelling together<input type="number" min={1} max={9} inputMode="numeric" value={people} onChange={(e) => setPeople(Math.min(9, Math.max(1, Number(e.target.value) || 1)))} className={field} /></label>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">A car’s CO₂ is shared by the people in it; a train’s, a coach’s or a plane’s is each person’s. Factors per passenger-km from the UK government’s 2024 figures (flights with their extra warming).</p>
      </section>

      <section className="panel p-5" aria-labelledby="ways-h" data-no-motion>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="ways-h" className="text-lg font-semibold text-zinc-900 dark:text-white">{km ? `${km.toLocaleString()} km, ${people === 1 ? 'one person' : `${people} people`}` : 'Type a distance'}</h3>
          {km > 0 && <Segmented<'clean' | 'quick'> label="Order" value={order} onChange={(v) => morph(list.current, () => setOrder(v))} segments={[{ value: 'clean', label: 'Cleanest' }, { value: 'quick', label: 'Quickest' }]} />}
        </div>
        {km > 0 && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Each way of going with its door-to-door time and CO₂ per person.</p>}
        {km > 0 && (
          <ol ref={list} className="mt-4 space-y-3">
            {ways.map((w) => {
              const Icon = ICON[w.id], saves = Math.round((car.kg - w.kg) * 10) / 10, canLog = !!logFor(w.id, km), top = w.id === cleanest[0].id;
              return (
                <li key={w.id} data-key={w.id} className={cn('rounded-2xl p-3', top ? 'bg-emerald-500/[0.08] ring-1 ring-emerald-600/20' : 'bg-zinc-50 dark:bg-white/[0.04]')}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', top ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10')} aria-hidden><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">{w.label}
                        {top && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"><Leaf className="h-3 w-3" aria-hidden />Cleanest</span>}
                        {w.minutes === quick && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900"><Clock className="h-3 w-3" aria-hidden />Quickest</span>}
                        {w.id === balance && !top && w.minutes !== quick && <span className="inline-flex items-center gap-1 rounded-full bg-sky-700 px-2 py-0.5 text-xs font-semibold text-white"><Scale className="h-3 w-3" aria-hidden />Best balance</span>}
                      </span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400"><span className="tabular-nums text-zinc-700 dark:text-zinc-200">{duration(w.minutes)}</span> · {w.id === 'car' ? 'the baseline' : saves > 0 ? `${saves} kg less than by car` : saves < 0 ? `${-saves} kg more than by car` : 'the same as by car'}</span>
                    </span>
                    <span className="flex items-center gap-3 max-sm:ms-[3.25rem] max-sm:w-[calc(100%-3.25rem)] max-sm:justify-between">
                      <span className="text-end font-semibold tabular-nums text-zinc-900 dark:text-white">{w.kg} kg</span>
                      {canLog && <button type="button" disabled={busy !== null} onClick={() => void log(w.id)} className="btn-secondary btn-sm">I went this way</button>}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-white/10" aria-hidden><span className={cn('block h-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-glide)] rtl:origin-right', top ? 'bg-emerald-600' : w.id === 'plane' ? 'bg-red-500' : 'bg-zinc-400 dark:bg-zinc-500')} style={{ transform: `scaleX(${Math.max(0.01, w.kg / worst)})` }} /></div>
                </li>
              );
            })}
          </ol>
        )}
        {km > 0 && car.kg > cleanest[0].kg && (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-200">Going by {cleanest[0].label.toLowerCase()} instead of driving saves {Math.round((car.kg - cleanest[0].kg) * 10) / 10} kg: as much as {equivalents(car.kg - cleanest[0].kg)[0].value} {equivalents(car.kg - cleanest[0].kg)[0].label}.</p>
        )}
        {km > 0 && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Times are door to door, estimated from the distance: getting to the stop, station or airport and waiting included.</p>}
      </section>
    </div>
  );
}
