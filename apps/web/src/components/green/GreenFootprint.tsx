'use client';

import { useMemo, useState } from 'react';
import { HomeEnergy } from './HomeEnergy';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Car, Home, Plane, Save, ShoppingBag, Utensils } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { CAR, DIET, FOOTPRINT_DEFAULT, HEAT, SIZE, STUFF, TARGET_KG, WORLD_KG, footprint, readFootprint, type FootprintAsk } from '@/lib/green-plus';
import { cn } from '@/lib/utils';

// Green → Footprint (M216): a person's yearly carbon footprint from a few answers (how they get around, fly,
// heat and power their home, eat and shop), against the world's average and what's in line with 1.5 °C, the
// biggest part first with the tips that shrink it; saved results show how it changes.

const t = (kg: number) => `${(kg / 1000).toFixed(1)} t`;
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';
const SHADES = ['#047857', '#0d9488', '#0284c7', '#a16207', '#7c3aed'];
const LABELS = {
  car: { none: 'No car', petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric' },
  diet: { vegan: 'Vegan', vegetarian: 'Vegetarian', pescatarian: 'Fish, no meat', low: 'A little meat', medium: 'Some meat', high: 'Meat most days' },
  heat: { gas: 'Gas', oil: 'Oil', electric: 'Electric heaters', heatpump: 'Heat pump', wood: 'Wood pellets', none: 'No heating' },
  size: { flat: 'Flat', house: 'House', large: 'Large house' },
  stuff: { little: 'Little', some: 'Some', lots: 'A lot' },
} as const;
const TIP_AREA = { travel: 'Travel', flights: 'Travel', home: 'Home', food: 'Food', stuff: 'Things' } as const;

export function GreenFootprint() {
  const { data, mutate } = useSWR<{ history: { id: string; kg: number; createdAt: string; answers: FootprintAsk }[] }>('/green/footprints', fetcher);
  const [ask, setAsk] = useState<FootprintAsk | null>(null);
  const a = ask ?? data?.history[0]?.answers ?? FOOTPRINT_DEFAULT;
  const f = useMemo(() => footprint(readFootprint(a)), [a]);
  const set = <K extends keyof FootprintAsk>(k: K, v: FootprintAsk[K]) => setAsk({ ...a, [k]: v });
  const n = (k: keyof FootprintAsk, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Math.min(max, Math.max(0, Number(e.target.value) || 0)) as never);
  const biggest = [...f.parts].sort((x, y) => y.kg - x.kg)[0];
  const max = Math.max(f.total, WORLD_KG) * 1.05;
  const save = async () => {
    try { await api.post('/green/footprints', { answers: a }); toast.success('Saved: come back in a few months and see it fall.'); await mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-6">
        <section className="panel p-5" aria-labelledby="fp-move">
          <h3 id="fp-move" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Car className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Getting around</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={label}>Car, km a week<input type="number" min={0} max={3000} inputMode="numeric" value={a.carKmWeek} onChange={n('carKmWeek', 3000)} className={field} /></label>
            <label className={label}>The car is<select value={a.car} onChange={(e) => set('car', e.target.value as FootprintAsk['car'])} className={field}>{(Object.keys(CAR) as FootprintAsk['car'][]).map((k) => <option key={k} value={k}>{LABELS.car[k]}</option>)}</select></label>
            <label className={label}>Bus and train, km a week<input type="number" min={0} max={3000} inputMode="numeric" value={a.transitKmWeek} onChange={n('transitKmWeek', 3000)} className={field} /></label>
          </div>
        </section>
        <section className="panel p-5" aria-labelledby="fp-fly">
          <h3 id="fp-fly" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Plane className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Flights a year (return trips)</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={label}>Short, up to about 3 hours<input type="number" min={0} max={50} inputMode="numeric" value={a.shortFlights} onChange={n('shortFlights', 50)} className={field} /></label>
            <label className={label}>Long, to another continent<input type="number" min={0} max={30} inputMode="numeric" value={a.longFlights} onChange={n('longFlights', 30)} className={field} /></label>
          </div>
        </section>
        <section className="panel p-5" aria-labelledby="fp-home">
          <h3 id="fp-home" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Home className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Home</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>Home<select value={a.size} onChange={(e) => set('size', e.target.value as FootprintAsk['size'])} className={field}>{(Object.keys(SIZE) as FootprintAsk['size'][]).map((k) => <option key={k} value={k}>{LABELS.size[k]}</option>)}</select></label>
            <label className={label}>Heated by<select value={a.heat} onChange={(e) => set('heat', e.target.value as FootprintAsk['heat'])} className={field}>{(Object.keys(HEAT) as FootprintAsk['heat'][]).map((k) => <option key={k} value={k}>{LABELS.heat[k]}</option>)}</select></label>
            <label className={label}>People living there<input type="number" min={1} max={12} inputMode="numeric" value={a.people} onChange={(e) => set('people', Math.min(12, Math.max(1, Number(e.target.value) || 1)))} className={field} /></label>
            <label className={label}>Electricity, kWh a month<input type="number" min={0} max={5000} inputMode="numeric" value={a.kwhMonth} onChange={n('kwhMonth', 5000)} className={field} /></label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={a.greenPower} onChange={(e) => set('greenPower', e.target.checked)} className="h-4 w-4 accent-emerald-600" />A renewable electricity tariff, or solar panels</label>
        </section>
        <section className="panel p-5" aria-labelledby="fp-food">
          <h3 id="fp-food" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Utensils className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Food</h3>
          <Segmented className="mt-3 max-w-full overflow-x-auto" label="What you eat" value={a.diet} onChange={(v) => set('diet', v)} segments={(Object.keys(DIET) as FootprintAsk['diet'][]).map((k) => ({ value: k, label: LABELS.diet[k] }))} />
          <h3 className="mt-5 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ShoppingBag className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />New things you buy</h3>
          <Segmented className="mt-3" label="New things you buy" value={a.stuff} onChange={(v) => set('stuff', v)} segments={(Object.keys(STUFF) as FootprintAsk['stuff'][]).map((k) => ({ value: k, label: LABELS.stuff[k] }))} />
        </section>
        <HomeEnergy />
      </div>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <section className="panel p-5" aria-labelledby="fp-result" data-no-motion>
          <h3 id="fp-result" className="text-lg font-semibold text-zinc-900 dark:text-white">Your footprint</h3>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-white">{t(f.total)}<span className="ms-1 text-base font-normal text-zinc-500 dark:text-zinc-400">CO₂ a year</span></div>
          <div className="mt-4 space-y-2.5 text-sm">
            {[{ l: 'You', kg: f.total, cls: 'bg-emerald-600' }, { l: 'The world’s average', kg: WORLD_KG, cls: 'bg-zinc-400 dark:bg-zinc-500' }, { l: 'In line with 1.5 °C', kg: TARGET_KG, cls: 'bg-sky-600' }].map((r) => (
              <div key={r.l}>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-300"><span>{r.l}</span><span className="tabular-nums font-semibold text-zinc-900 dark:text-white">{t(r.kg)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden><span className={cn('block h-full origin-left rounded-full transition-transform duration-500 ease-[var(--ease-glide)] rtl:origin-right', r.cls)} style={{ transform: `scaleX(${Math.min(1, r.kg / max)})` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full" aria-hidden>{f.parts.map((p, i) => <span key={p.id} className="h-full transition-[flex-grow] duration-500 ease-[var(--ease-glide)]" style={{ flexGrow: Math.max(0.001, p.kg), background: SHADES[i] }} />)}</div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {f.parts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SHADES[i] }} aria-hidden />
                <dt className="flex-1 text-zinc-600 dark:text-zinc-300">{p.label}</dt>
                <dd className="font-semibold tabular-nums text-zinc-900 dark:text-white">{t(p.kg)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-emerald-500/[0.08] p-3 text-sm text-zinc-700 dark:text-zinc-200">Your biggest part is <strong>{biggest.label.toLowerCase()}</strong>. <Link href="/green?view=tips" className="font-semibold text-emerald-700 underline dark:text-emerald-300">Tips for {TIP_AREA[biggest.id].toLowerCase()}</Link></p>
          <button type="button" onClick={() => void save()} className="btn-primary mt-4 inline-flex items-center gap-1.5"><Save className="h-4 w-4" aria-hidden />Save this result</button>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">An estimate from averages: travel from the UK government’s 2024 conversion factors (flights with their extra warming), food from Scarborough et al. 2014, things bought a rough share of a European’s footprint. The world’s average is about 4.7 t of CO₂ a person.</p>
        </section>
        {!!data?.history.length && (
          <section className="panel p-5" aria-labelledby="fp-hist">
            <h3 id="fp-hist" className="text-lg font-semibold text-zinc-900 dark:text-white">Your results</h3>
            <ol className="mt-3 space-y-2" data-no-motion>
              {data.history.map((h, i) => {
                const before = data.history[i + 1], d = before ? h.kg - before.kg : 0;
                return (
                  <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-zinc-600 dark:text-zinc-300">{new Date(h.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="flex items-center gap-2 tabular-nums"><span className="font-semibold text-zinc-900 dark:text-white">{t(h.kg)}</span>{before && d !== 0 && <span className={cn('text-xs font-semibold', d < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400')}>{d < 0 ? '−' : '+'}{t(Math.abs(d))}</span>}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
