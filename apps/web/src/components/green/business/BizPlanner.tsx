'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Flag, SlidersHorizontal } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { LEVERS, PACE_15C, costPerTonne, leverCuts, targetPath, type Lever, type LeverId } from '@/lib/carbon-ledger';
import { canEdit, field, h3, icon, label, muted, tonnes, type SectionProps } from './shared';

// Green → Business → Planner (M273): a base year and a target (1.5 °C's pace is about 4.2% of the base year a year),
// the straight path to it against what happened, and "what if" levers: how much of each change, its one-off cost and
// yearly saving; the planner shows the tonnes it cuts from this year's footprint and the cost per tonne over ten years.

export function BizPlanner({ org, role, year, overview, onChanged }: SectionProps) {
  const edit = canEdit(role);
  const [levers, setLevers] = useState<Partial<Record<LeverId, Lever>>>(overview.plan.levers as Partial<Record<LeverId, Lever>>);
  const [t, setT] = useState({ baseYear: String(org.baseYear ?? year), targetYear: String(org.targetYear ?? Math.max(year + 5, 2030)), targetPct: String(org.targetPct ?? 42) });
  const cuts = leverCuts(overview.totals.byCategory, levers, org.country);
  const cutKg = Object.values(cuts).reduce((a, b) => a + b, 0), now = overview.totals.kg;
  const set = (id: LeverId, k: keyof Lever, v: number) => setLevers({ ...levers, [id]: { share: 0, cost: 0, saving: 0, ...levers[id], [k]: v } });
  const years = Number(t.targetYear) - Number(t.baseYear), pace = years > 0 ? Number(t.targetPct) / years : 0;

  const saveTarget = async () => {
    try { await api.put(`/green/biz/${org.id}`, { baseYear: Number(t.baseYear), targetYear: Number(t.targetYear), targetPct: Number(t.targetPct) }); toast.success('Target saved.'); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the target.')); }
  };
  const savePlan = async () => {
    try { await api.put(`/green/biz/${org.id}/plan`, { levers }); toast.success('Plan saved.'); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the plan.')); }
  };
  const path = org.baseYear && org.targetYear && org.targetPct !== null && year === org.baseYear ? targetPath(now, org.baseYear, org.targetYear, org.targetPct) : [];

  return (
    <div className="space-y-6">
      <section className="panel p-5" aria-labelledby="target-h">
        <h3 id="target-h" className={h3}><Flag className={icon} aria-hidden />Your target</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={label}>Base year<input type="number" min={2000} max={2100} disabled={!edit} value={t.baseYear} onChange={(e) => setT({ ...t, baseYear: e.target.value })} className={field} /></label>
          <label className={label}>Target year<input type="number" min={2001} max={2100} disabled={!edit} value={t.targetYear} onChange={(e) => setT({ ...t, targetYear: e.target.value })} className={field} /></label>
          <label className={label}>Cut by, %<input type="number" min={0} max={100} disabled={!edit} value={t.targetPct} onChange={(e) => setT({ ...t, targetPct: e.target.value })} className={field} /></label>
        </div>
        <p className={`mt-3 ${muted}`}>
          That’s {pace.toFixed(1)}% of the base year a year. {pace >= PACE_15C ? 'In line with 1.5 °C' : `1.5 °C needs about ${PACE_15C}% a year`} (the Science Based Targets initiative’s pace for scopes 1 and 2: 42% between 2020 and 2030).
        </p>
        {path.length > 0 && <p className={`mt-1 ${muted}`}>From {tonnes(path[0].kg)} in {path[0].year} to {tonnes(path.at(-1)!.kg)} in {path.at(-1)!.year}.</p>}
        {edit && <button type="button" className="btn-primary mt-3" onClick={() => void saveTarget()}>Save the target</button>}
      </section>

      <section className="panel p-5" aria-labelledby="levers-h" data-no-motion>
        <h3 id="levers-h" className={h3}><SlidersHorizontal className={icon} aria-hidden />What if… ({year}’s footprint: {tonnes(now)})</h3>
        <p className={`mt-2 max-w-3xl ${muted}`}>Slide each change to how far you’d take it. Add what it would cost once and save each year (in {org.currency}) to see its cost per tonne over ten years; below zero, it pays for itself.</p>
        <ul className="mt-4 space-y-4">
          {LEVERS.map((l) => {
            const v = levers[l.id] ?? { share: 0, cost: 0, saving: 0 }, cpt = costPerTonne(v, cuts[l.id]);
            return (
              <li key={l.id} className="grid gap-3 rounded-2xl border border-[var(--hairline)] p-4 lg:grid-cols-[1fr_9rem_9rem_8rem] lg:items-end">
                <div>
                  <div className="flex items-baseline justify-between gap-3"><span className="font-medium text-zinc-900 dark:text-white">{l.label}</span><span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">−{tonnes(cuts[l.id])}</span></div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{l.what}</p>
                  <label className="mt-2 flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200"><span className="sr-only">{l.label}: how far</span>
                    <input type="range" min={0} max={100} step={5} disabled={!edit} value={Math.round(v.share * 100)} onChange={(e) => set(l.id, 'share', Number(e.target.value) / 100)} className="w-full accent-emerald-600" />
                    <span className="w-12 text-end tabular-nums">{Math.round(v.share * 100)}%</span>
                  </label>
                </div>
                <label className={label}>One-off cost<input type="number" min={0} inputMode="decimal" disabled={!edit} value={v.cost || ''} onChange={(e) => set(l.id, 'cost', Number(e.target.value) || 0)} className={field} /></label>
                <label className={label}>Saved a year<input type="number" min={0} inputMode="decimal" disabled={!edit} value={v.saving || ''} onChange={(e) => set(l.id, 'saving', Number(e.target.value) || 0)} className={field} /></label>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{cpt === null ? '–' : <><span className={`font-semibold tabular-nums ${cpt < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-white'}`}>{cpt.toLocaleString()} {org.currency}</span> a tonne</>}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 rounded-2xl bg-emerald-500/[0.08] p-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">All together: <strong className="tabular-nums">−{tonnes(cutKg)}</strong> a year, {now ? Math.round((cutKg / now) * 100) : 0}% of {year}’s footprint, leaving <strong className="tabular-nums">{tonnes(Math.max(0, now - cutKg))}</strong>.{org.carbonPrice ? <> At your internal carbon price that’s <strong className="tabular-nums">{Math.round((cutKg / 1000) * org.carbonPrice).toLocaleString()} {org.currency}</strong> a year.</> : null}</p>
        </div>
        {edit && <button type="button" className="btn-primary mt-4" onClick={() => void savePlan()}>Save the plan</button>}
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">An estimate from this year’s lines: electric vehicles at about 0.18 kWh a km and heat pumps at three units of heat per unit of electricity, both on your country’s grid. The costs are yours to enter.</p>
      </section>
    </div>
  );
}
