'use client';

import { toast } from 'sonner';
import { Bus, Car, Leaf, Plane, Ship, TrainFront } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Fill } from '@/components/ui/Fill';
import { api, errorMessage } from '@/lib/api';
import { TRAVEL_FACTORS, type TravelMode } from '@/lib/green';
import { legKg, tripFootprint } from '@/lib/travel-footprint';
import type { PlanStop } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';

// M247: the trip's footprint, linked to Green (the trip page's Ready part): the CO₂ of getting between its cities by
// the way picked for each leg, against the greenest way there; picking the train records a Green action (once a leg).

const ICON: Record<TravelMode, typeof Plane> = { plane: Plane, train: TrainFront, bus: Bus, car: Car, ferry: Ship };
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');
const kg = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString()} kg`;

export function TripFootprint({ tripId, stops, travellers, onChange }: { tripId: string; stops: (PlanStop & { mode?: string | null })[]; travellers: number; onChange: () => void }) {
  const f = tripFootprint(stops, travellers);
  const pick = async (stopId: string, mode: TravelMode) => {
    try {
      const { data } = await api.patch<{ green: { kg: number } | null }>(`/travel/trips/${tripId}/stops/${stopId}`, { mode, green: mode === 'train' });
      if (data.green) toast.success(`Logged in Green: about ${kg(data.green.kg)} of CO₂ saved by taking the train.`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    onChange();
  };
  return (
    <section className="panel p-5" aria-labelledby="foot-h">
      <h3 id="foot-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Leaf className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Footprint</h3>
      {!f.legs.length ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Add a second city to see the CO₂ of getting between them.</p> : (
        <>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{kg(f.total)} <span className="text-base font-normal text-zinc-600 dark:text-zinc-300">CO₂</span></p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{travellers > 1 ? `${kg(f.perPerson)} each for ${travellers} travellers` : 'for one traveller'} · getting between the cities, not there and back.</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden><Fill value={f.total ? f.greenest / f.total : 1} className="bg-emerald-500" /></div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{f.total - f.greenest > 0.5 ? `The greenest ways would make it ${kg(f.greenest)}: ${kg(f.total - f.greenest)} less.` : 'This is already the greenest way round.'}</p>
          <ol className="mt-4 space-y-3">
            {f.legs.map((l) => (
              <li key={l.stopId} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white"><span translate="no">{nice(l.from)} → {nice(l.to)}</span> <span className="font-normal text-zinc-500 dark:text-zinc-400">· {l.km.toLocaleString()} km</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`How you’ll get from ${nice(l.from)} to ${nice(l.to)}`}>
                  {l.modes.map((m) => {
                    const I = ICON[m], on = m === l.mode;
                    return (
                      <button key={m} type="button" aria-pressed={on} onClick={() => { if (!on) void pick(l.stopId, m); }}
                        className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color] duration-150', on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-200 text-zinc-700 dark:border-white/10 dark:text-zinc-200')}>
                        <I className="h-3.5 w-3.5" aria-hidden />{TRAVEL_FACTORS[m].label} · {kg(legKg(l.km, m, travellers))}
                      </button>
                    );
                  })}
                </div>
                {l.best !== l.mode && <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">By {TRAVEL_FACTORS[l.best].label.toLowerCase()}: {kg(l.kg - l.bestKg)} less{l.best === 'bus' && l.modes.includes('train') ? ' (the train is close behind and faster)' : ''}.</p>}
                {!l.chosen && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Guessed: pick how you’ll go.</p>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Picking the train adds it to your <Link href="/green" className="underline">Green actions</Link>. Factors: UK government conversion factors (2024), rounded.</p>
        </>
      )}
    </section>
  );
}
