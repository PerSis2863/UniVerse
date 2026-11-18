'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BadgeCheck, Leaf, ShieldAlert, Sprout, Trash2, Zap } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { Bar } from './Bar';
import { canEdit, field, h3, icon, label, muted, type SectionProps } from './shared';

// Green → Business → Certificates & offsets (M279): energy certificates (RECs, I-RECs, Guarantees of Origin) that back
// a renewable-tariff claim in market-based scope 2, offsets (emissions avoided elsewhere) and removals (carbon taken out
// of the air), with their registry, project, serial and vintage. Kept beside the footprint and never netted off it, as
// the GHG Protocol and SBTi ask; the report shows them apart.

type Credit = { id: string; kind: 'rec' | 'offset' | 'removal'; year: number; quantity: number; registry: string | null; project: string | null; serial: string | null; vintage: number | null; retired: boolean; note: string | null };
type Credits = { rows: Credit[]; recMwh: number; greenMwh: number; backed: boolean; offsetT: number; removalT: number; retiredT: number };
const KIND = { rec: { label: 'Energy certificates', unit: 'MWh', icon: Zap, hint: 'RECs, I-RECs or Guarantees of Origin for renewable electricity' }, offset: { label: 'Offsets', unit: 't CO₂e', icon: Leaf, hint: 'Emissions avoided elsewhere (cookstoves, forests kept standing, renewable projects)' }, removal: { label: 'Removals', unit: 't CO₂e', icon: Sprout, hint: 'Carbon taken out of the air and stored (trees planted, biochar, direct air capture)' } } as const;

export function BizCredits({ org, role, year, onChanged }: SectionProps) {
  const { data, mutate } = useSWR<Credits>(`/green/biz/${org.id}/credits?year=${year}`, fetcher, { keepPreviousData: true });
  const [f, setF] = useState({ kind: 'rec' as Credit['kind'], quantity: '', registry: '', project: '', serial: '', vintage: String(year), retired: true, note: '' });
  const edit = canEdit(role);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post(`/green/biz/${org.id}/credits`, { ...f, year, quantity: Number(f.quantity), vintage: Number(f.vintage) || null }); setF({ ...f, quantity: '', serial: '', note: '' }); await mutate(); onChanged(); toast.success('Added to the register.'); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t add that.')); }
  };
  const remove = async (c: Credit) => {
    if (!confirm('Remove this entry?')) return;
    try { await mutate(async (cur) => { await api.delete(`/green/biz/${org.id}/credits/${c.id}`); return cur; }, { optimisticData: (cur) => (cur ? { ...cur, rows: cur.rows.filter((x) => x.id !== c.id) } : cur), rollbackOnError: true, revalidate: true }); onChanged(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t remove it.')); }
  };
  if (!data) return <div className="h-72 rounded-[var(--radius-card)] skeleton" />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5" aria-labelledby="cr-rec">
          <h3 id="cr-rec" className={h3}><Zap className={icon} aria-hidden />Renewable claim ({year})</h3>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{data.recMwh.toLocaleString()}<span className="ms-1 text-base font-normal text-zinc-500 dark:text-zinc-400">MWh of certificates</span></p>
          <p className={muted}>against {data.greenMwh.toLocaleString()} MWh you counted as a renewable tariff.</p>
          <Bar value={data.greenMwh ? Math.min(1, data.recMwh / data.greenMwh) : data.recMwh ? 1 : 0} tone={data.backed ? 'bg-emerald-600' : 'bg-amber-500'} />
          <p className={`mt-2 flex items-start gap-1.5 text-sm font-medium ${data.backed ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>{data.backed ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}{!data.greenMwh ? 'No renewable tariff counted this year: certificates aren’t needed for scope 2.' : data.backed ? 'Backed: market-based scope 2 may count it as zero.' : 'Not fully backed: add the certificates, or count that electricity as grid power.'}</p>
        </section>
        <section className="panel p-5" aria-labelledby="cr-off">
          <h3 id="cr-off" className={h3}><Leaf className={icon} aria-hidden />Offsets and removals</h3>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-white">{(data.offsetT + data.removalT).toLocaleString()}<span className="ms-1 text-base font-normal text-zinc-500 dark:text-zinc-400">t</span></p>
          <p className={muted}>{data.removalT.toLocaleString()} t removals, {data.offsetT.toLocaleString()} t offsets; {data.retiredT.toLocaleString()} t retired in your name.</p>
        </section>
        <section className="panel p-5" aria-labelledby="cr-rule">
          <h3 id="cr-rule" className={h3}>Kept apart, on purpose</h3>
          <p className={`mt-2 ${muted}`}>Offsets and removals are never taken off your footprint: the GHG Protocol and the Science Based Targets initiative report them beside it. Prefer removals, and certificates retired in your name with a serial you can show.</p>
        </section>
      </div>
      {edit && (
        <form onSubmit={(e) => void add(e)} className="panel p-5 space-y-3" aria-labelledby="cr-add">
          <h3 id="cr-add" className={h3}>Add to the register</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>What it is<select value={f.kind} onChange={set('kind')} className={field}>{(Object.keys(KIND) as Credit['kind'][]).map((k) => <option key={k} value={k}>{KIND[k].label}</option>)}</select></label>
            <label className={label}>Amount, {KIND[f.kind].unit}<input required type="number" min={0} step="any" inputMode="decimal" value={f.quantity} onChange={set('quantity')} className={field} /></label>
            <label className={label}>Registry<input maxLength={60} value={f.registry} onChange={set('registry')} placeholder={f.kind === 'rec' ? 'e.g. I-REC Standard' : 'e.g. Verra, Gold Standard'} className={field} /></label>
            <label className={label}>Vintage (year made)<input type="number" min={1990} max={2100} value={f.vintage} onChange={set('vintage')} className={field} /></label>
            <label className={`${label} lg:col-span-2`}>Project<input maxLength={120} value={f.project} onChange={set('project')} className={field} /></label>
            <label className={`${label} lg:col-span-2`}>Serial numbers<input maxLength={120} value={f.serial} onChange={set('serial')} className={field} /></label>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{KIND[f.kind].hint}.</p>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={f.retired} onChange={(e) => setF({ ...f, retired: e.target.checked })} />Retired (cancelled) in our name</label>
          <button type="submit" className="btn-primary">Add</button>
        </form>
      )}
      {!!data.rows.length && (
        <section className="panel p-0 overflow-hidden" aria-label="The register">
          <ul className="divide-y divide-[var(--hairline)]">
            {data.rows.map((c) => {
              const K = KIND[c.kind];
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <K.icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{K.label}: {c.quantity.toLocaleString()} {K.unit}{c.retired && <span className="ms-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Retired</span>}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400" translate="no">{[c.registry, c.project, c.vintage ? `vintage ${c.vintage}` : null, c.serial].filter(Boolean).join(' · ') || 'No details'}</p>
                  </div>
                  {edit && <button type="button" className="btn-ghost btn-icon" aria-label={`Remove ${K.label.toLowerCase()} of ${c.quantity}`} onClick={() => void remove(c)}><Trash2 className="h-4 w-4" aria-hidden /></button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
