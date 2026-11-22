'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Gauge } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Fill } from '@/components/ui/Fill';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// M319: Green → Goals → My monthly carbon budget (API /green/budget, src/server/green-budget.ts): the budget,
// what the month has used so far, where it ends at this rate, and each part of it.

type Data = {
  budget: number | null;
  plan: { parts: { id: string; label: string; kg: number; fromBills: boolean }[]; elapsed: number; soFar: number; forecast: number; saved: number } | null;
  state: { over: number; state: 'under' | 'close' | 'over' } | null;
  suggestions: { fairShare: number; footprint: number | null };
};

export function CarbonBudget() {
  const { data, mutate } = useSWR<Data>('/green/budget', fetcher);
  const [custom, setCustom] = useState('');
  if (!data) return <div className="h-40 rounded-[var(--radius-card)] skeleton" />;
  const set = async (kg: number | null) => {
    try { void mutate((await api.put<Data>('/green/budget', { kg })).data, { revalidate: false }); toast.success(kg ? `Budget: ${kg} kg a month` : 'Budget removed'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the budget.')); }
  };
  const { plan, budget, state } = data;
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="budget-h">
      <h2 id="budget-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Gauge className="w-4 h-4 text-emerald-600" aria-hidden />My monthly carbon budget</h2>
      {!plan ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Work out your footprint first: the budget follows it month by month. <Link href="/student/life/green?view=footprint" className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">Footprint</Link></p>
      ) : (
        <>
          {budget ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-mono text-2xl tabular-nums text-zinc-900 dark:text-white">{plan.soFar}<span className="text-sm text-zinc-500"> of {budget} kg so far</span></p>
                {state && <p className={cn('text-sm font-medium', state.state === 'under' ? 'text-emerald-700 dark:text-emerald-300' : state.state === 'close' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300')}>{state.state === 'under' ? `On track: about ${plan.forecast} kg by the month’s end` : `At this rate ${plan.forecast} kg: ${state.over} kg over`}</p>}
              </div>
              <span className="block h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]"><Fill value={plan.soFar / budget} className={state?.state === 'over' ? 'bg-rose-500' : state?.state === 'close' ? 'bg-amber-500' : 'bg-emerald-500'} /></span>
              <p className="text-xs text-zinc-500 tabular-nums">{Math.round(plan.elapsed * 100)}% of the month gone · {plan.saved} kg saved by your actions this month</p>
            </>
          ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">Your month at your footprint: about {plan.forecast} kg. Choose a budget to stay under:</p>}
          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
            {plan.parts.map((p) => <li key={p.id} className="flex justify-between gap-2 text-zinc-700 dark:text-zinc-200"><span>{p.label}{p.fromBills ? ' (your bills)' : ''}</span><span className="tabular-nums text-zinc-500">{p.kg} kg</span></li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="btn-secondary btn-sm" onClick={() => void set(data.suggestions.fairShare)}>{data.suggestions.fairShare} kg: a 1.5 °C share</button>
            {data.suggestions.footprint && <button type="button" className="btn-secondary btn-sm" onClick={() => void set(data.suggestions.footprint)}>{data.suggestions.footprint} kg: my footprint −10%</button>}
            <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (Number(custom) > 0) void set(Number(custom)); }}>
              <input aria-label="My own budget, kg a month" type="number" min={10} max={20000} className="input w-24 py-1" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="kg" />
              <button type="submit" className="btn-ghost btn-sm">Set</button>
            </form>
            {budget && <button type="button" className="btn-ghost btn-sm" onClick={() => void set(null)}>Remove</button>}
          </div>
        </>
      )}
    </section>
  );
}
