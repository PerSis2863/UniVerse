'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Flame, Lightbulb, Plus, Target, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useNow } from '@/lib/use-now';
import { TIPS, TIP_AREAS, tipById } from '@/lib/green-plus';
import { cn } from '@/lib/utils';

// Green → Goals (M216): a monthly goal of CO₂ to save, with this month's so far, and pledges: habits from the
// tips kept day by day (a week of days to tick, the streak). Green → Tips: what saves the most, by area, each
// to pledge in one tap.

interface Goals { monthlyKg: number | null; monthKg: number; monthStart: string; pledges: { id: string; tip: string; days: string[]; createdAt: string }[] }
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const kgText = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`);

/** Days in a row up to today (or yesterday) in a pledge's kept days. */
function run(days: string[], today: string) {
  const set = new Set(days);
  let t = Date.parse(`${today}T12:00:00Z`);
  if (!set.has(dayOf(t))) t -= 86_400_000;
  let n = 0;
  while (set.has(dayOf(t))) { n++; t -= 86_400_000; }
  return n;
}

export function GreenGoals() {
  const { data, mutate } = useSWR<Goals>('/green/goals', fetcher);
  const now = useNow();
  const [goal, setGoal] = useState('');
  const week = useMemo(() => (now ? Array.from({ length: 7 }, (_, i) => dayOf(now - (6 - i) * 86_400_000)) : []), [now]);
  const today = week[6] ?? '';
  const act = async (call: () => Promise<unknown>, ok?: string) => {
    try { await call(); if (ok) toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); }
    await mutate();
  };
  const tick = (id: string, day: string) => {
    if (!data) return;
    void mutate({ ...data, pledges: data.pledges.map((p) => (p.id !== id ? p : { ...p, days: p.days.includes(day) ? p.days.filter((d) => d !== day) : [...p.days, day] })) }, { revalidate: false });
    void act(() => api.post(`/green/pledges/${id}/check`, { day }));
  };
  const pct = data?.monthlyKg ? Math.min(1, data.monthKg / data.monthlyKg) : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="panel p-5" aria-labelledby="goal-h" data-no-motion>
        <h3 id="goal-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />This month’s goal</h3>
        {!data ? <div className="mt-4 h-40 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" /> : (
          <>
            <div className="relative mx-auto mt-4 h-40 w-40">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-zinc-200 dark:stroke-white/10" />
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-emerald-600 transition-[stroke-dashoffset] duration-700 ease-[var(--ease-glide)]" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - pct)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">{data.monthKg} kg</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{data.monthlyKg ? `of ${data.monthlyKg} kg` : 'saved this month'}</span>
              </div>
            </div>
            <p className="mt-3 text-center text-sm text-zinc-600 dark:text-zinc-300">{!data.monthlyKg ? 'Set a goal to aim for.' : pct >= 1 ? 'Goal reached this month. Well done.' : `${Math.round((data.monthlyKg - data.monthKg) * 10) / 10} kg to go.`}</p>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = Number(goal); if (v >= 1) void act(() => api.put('/green/goals', { monthlyKg: v }), 'Goal set.').then(() => setGoal('')); }}>
              <label className="min-w-0 flex-1"><span className="sr-only">Goal, kg of CO₂ a month</span><input type="number" min={1} max={10000} inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={data.monthlyKg ? `${data.monthlyKg} kg a month` : 'kg of CO₂ a month'} className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" /></label>
              <button type="submit" disabled={!(Number(goal) >= 1)} className="btn-primary">{data.monthlyKg ? 'Change' : 'Set'}</button>
            </form>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Counts every action you log this month, confirmed or not.</p>
          </>
        )}
      </section>

      <section className="panel p-5" aria-labelledby="pledges-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="pledges-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Flame className="h-5 w-5 text-amber-500" aria-hidden />My pledges</h3>
          <Link href="/green?view=tips" className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Pledge something</Link>
        </div>
        {!data ? <div className="mt-4 h-32 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />
          : !data.pledges.length ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">No pledges yet. Pick a habit from the tips (cycle to work, two meat-free days a week…) and tick the days you keep it.</p>
          : (
            <ul className="mt-4 space-y-3">
              {data.pledges.map((p) => {
                const tip = tipById(p.tip)!, streak = run(p.days, today);
                return (
                  <li key={p.id} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-zinc-900 dark:text-white">{tip.title}</span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">About {kgText(tip.kgYear)} of CO₂ a year · kept {p.days.length} {p.days.length === 1 ? 'day' : 'days'}{streak > 1 ? ` · ${streak} days in a row` : ''}</span>
                      </span>
                      <button type="button" onClick={() => { if (confirm(`Stop the pledge “${tip.title}”?`)) void act(() => api.delete(`/green/pledges/${p.id}`), 'Pledge ended.'); }} className="btn-ghost btn-sm p-1.5 text-zinc-500" aria-label={`Stop the pledge ${tip.title}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label={`Days you kept “${tip.title}”`}>
                      {week.map((d) => {
                        const on = p.days.includes(d), w = new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' });
                        return (
                          <button key={d} type="button" aria-pressed={on} onClick={() => tick(p.id, d)} aria-label={new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                            className={cn('flex h-10 flex-col items-center justify-center rounded-xl text-xs font-semibold ring-1 transition-[background-color,transform] duration-150 active:scale-95', on ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-zinc-600 ring-zinc-200 dark:bg-white/[0.05] dark:text-zinc-300 dark:ring-white/10', d === today && !on && 'ring-2 ring-emerald-600/60')}>
                            {on ? <Check className="h-4 w-4" aria-hidden /> : <span aria-hidden>{w}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}

export function GreenTips() {
  const { data, mutate } = useSWR<Goals>('/green/goals', fetcher);
  const [area, setArea] = useState<(typeof TIP_AREAS)[number] | 'All'>('All');
  const pledged = new Set(data?.pledges.map((p) => p.tip) ?? []);
  const list = TIPS.filter((t) => area === 'All' || t.area === area).sort((a, b) => b.kgYear - a.kgYear);
  const max = Math.max(...TIPS.map((t) => t.kgYear));
  const pledge = async (id: string) => {
    try { await api.post('/green/pledges', { tip: id }); toast.success('Pledged: tick the days you keep it on Goals.'); } catch (e) { toast.error(errorMessage(e, 'Couldn’t pledge that.')); }
    await mutate();
  };
  return (
    <section className="panel p-5" aria-labelledby="tips-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="tips-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Lightbulb className="h-5 w-5 text-amber-500" aria-hidden />What saves the most</h3>
        <Segmented<(typeof TIP_AREAS)[number] | 'All'> label="Area" value={area} onChange={setArea} segments={['All' as const, ...TIP_AREAS].map((a) => ({ value: a, label: a }))} />
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {list.map((t) => (
          <li key={t.id} className="flex flex-col rounded-2xl bg-zinc-50 p-4 dark:bg-white/[0.04]">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold text-zinc-900 dark:text-white">{t.title}</span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-300">{t.how}</span>
              </span>
              <span className="shrink-0 text-end"><span className="block font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{kgText(t.kgYear)}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">a year</span></span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10" aria-hidden><span className="block h-full origin-left rounded-full bg-emerald-600 rtl:origin-right" style={{ transform: `scaleX(${t.kgYear / max})` }} /></div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.area}</span>
              {pledged.has(t.id) ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" aria-hidden />Pledged</span>
                : <button type="button" disabled={!data} onClick={() => void pledge(t.id)} className="btn-secondary btn-sm">Pledge this</button>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">About, for a typical person who does it; homes and habits vary a lot. From published averages (the UK government’s conversion factors, diet studies, energy agencies).</p>
    </section>
  );
}
