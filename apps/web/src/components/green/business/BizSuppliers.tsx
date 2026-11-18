'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Copy, PackageCheck, Trash2, Truck } from 'lucide-react';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { canEdit, field, h3, icon, kgText, label, muted, type SectionProps } from './shared';

// Green → Business → Suppliers (M271): each supplier gets a link to send in its own emissions (scopes 1–2, and 3 if it
// has them) with its revenue; our share by what we spent with it goes into scope 3. Then Trace: the year's footprint
// shared over the units made, written on the brand's product passports.

type Supplier = { id: string; name: string; contact: string | null; spend: number | null; code: string; status: string; kg: number | null; answer: { scope1: number; scope2: number; scope3: number | null; revenue: number; currency: string; method: string | null } | null; answeredAt: string | null };
export const linkOf = (code: string) => (typeof window === 'undefined' ? `/carbon/${code}` : `${window.location.origin}/carbon/${code}`);
export const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); } catch { toast.info(text); } };

export function BizSuppliers({ org, role, year, onChanged }: SectionProps) {
  const key = `/green/biz/${org.id}/suppliers?year=${year}`;
  const { data, mutate } = useSWR<{ suppliers: Supplier[]; currency: string }>(key, fetcher, { keepPreviousData: true });
  const [f, setF] = useState({ name: '', contact: '', spend: '' });
  const edit = canEdit(role);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ code: string }>(`/green/biz/${org.id}/suppliers`, { ...f, spend: f.spend || null, year });
      setF({ name: '', contact: '', spend: '' }); await mutate();
      void copy(linkOf(r.data.code), 'Their link');
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t add the supplier.')); }
  };
  const remove = async (s: Supplier) => {
    if (!confirm(`Remove ${s.name} and what they sent?`)) return;
    try { await api.delete(`/green/biz/${org.id}/suppliers/${s.id}`); await mutate(); onChanged(); } catch (err) { toast.error(errorMessage(err, 'Couldn’t remove them.')); }
  };
  const list = data?.suppliers ?? [];
  return (
    <div className="space-y-6">
      <section className="panel p-5" aria-labelledby="sup-h">
        <h3 id="sup-h" className={h3}><Truck className={icon} aria-hidden />Ask your suppliers ({year})</h3>
        <p className={`mt-2 max-w-3xl ${muted}`}>What you buy is usually most of a footprint. Send each supplier its link: they type in their own emissions and revenue (no account needed), and your share, by what you spent with them, replaces a rough spend-based guess. If you also counted them by spend in the ledger, lower that line.</p>
        {edit && (
          <form onSubmit={(e) => void add(e)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end">
            <label className={label}>Supplier<input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} /></label>
            <label className={label}>Contact, for you (not on their page)<input maxLength={120} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} className={field} /></label>
            <label className={label}>Spent with them in {year}, {org.currency}<input type="number" min={0} inputMode="decimal" value={f.spend} onChange={(e) => setF({ ...f, spend: e.target.value })} className={field} /></label>
            <button type="submit" className="btn-primary">Add and copy link</button>
          </form>
        )}
      </section>
      {!!list.length && (
        <section className="panel p-0 overflow-hidden" aria-label="Suppliers">
          <ul className="divide-y divide-[var(--hairline)]">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-white" translate="no">{s.name} <span className={`ms-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.status === 'answered' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{s.status === 'answered' ? 'Answered' : 'Waiting'}</span></p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {s.spend ? `${s.spend.toLocaleString()} ${data?.currency} spent` : 'No spend given'}
                    {s.answer && <> · they reported {(s.answer.scope1 + s.answer.scope2 + (s.answer.scope3 ?? 0)).toLocaleString()} t on {s.answer.revenue.toLocaleString()} {s.answer.currency} revenue</>}
                    {s.contact && <> · <span translate="no">{s.contact}</span></>}
                  </p>
                </div>
                {s.kg !== null && <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{kgText(s.kg)}</span>}
                <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => void copy(linkOf(s.code), `${s.name}’s link`)}><Copy className="h-3.5 w-3.5" aria-hidden />Copy link</button>
                {edit && <button type="button" className="btn-ghost btn-icon" aria-label={`Remove ${s.name}`} onClick={() => void remove(s)}><Trash2 className="h-4 w-4" aria-hidden /></button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <TracePassports org={org} role={role} year={year} />
    </div>
  );
}

type Product = { id: string; name: string; carbonKg: number | null; carbonMethod: string | null };
function TracePassports({ org, role, year }: Pick<SectionProps, 'org' | 'role' | 'year'>) {
  const { data, mutate } = useSWR<{ brand: string | null; products: Product[] }>(`/green/biz/${org.id}/trace`, fetcher);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<number[]>([1, 2]);
  const push = async () => {
    const products = Object.entries(units).filter(([, u]) => Number(u) > 0).map(([id, u]) => ({ id, units: Number(u) }));
    try {
      const r = await api.post<{ perUnit: number; products: number }>(`/green/biz/${org.id}/trace`, { year, scopes, products });
      toast.success(`${r.data.perUnit} kg CO₂e a unit is on ${r.data.products} passports.`); await mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t write the passports.')); }
  };
  if (!data) return null;
  return (
    <section className="panel p-5" aria-labelledby="trace-h">
      <h3 id="trace-h" className={h3}><PackageCheck className={icon} aria-hidden />Carbon on your product passports (Trace)</h3>
      {!data.brand ? (
        <p className={`mt-2 ${muted}`}>Start your brand in <Link href="/trace" className="font-semibold text-emerald-700 underline dark:text-emerald-300">Trace</Link> and each product’s passport (what shoppers see when they scan it) can carry this company’s carbon per unit.</p>
      ) : !data.products.length ? (
        <p className={`mt-2 ${muted}`}>{data.brand} has no products in Trace yet.</p>
      ) : (
        <>
          <p className={`mt-2 max-w-3xl ${muted}`}>The {year} footprint of the scopes you pick, shared over the units you made, goes on each passport as its carbon per unit. Enter how many of each you made in {year}.</p>
          <fieldset className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-200"><legend className="sr-only">Scopes to count</legend>
            {[1, 2, 3].map((s) => <label key={s} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />Scope {s}</label>)}
          </fieldset>
          <ul className="mt-3 divide-y divide-[var(--hairline)]">
            {data.products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-zinc-900 dark:text-white" translate="no">{p.name}<span className="block text-xs text-zinc-600 dark:text-zinc-400">{p.carbonKg !== null ? `${p.carbonKg} kg a unit · ${p.carbonMethod ?? ''}` : 'No carbon on its passport yet'}</span></span>
                <label className="text-xs text-zinc-600 dark:text-zinc-300">Units made<input type="number" min={0} inputMode="numeric" disabled={!canEdit(role)} value={units[p.id] ?? ''} onChange={(e) => setUnits({ ...units, [p.id]: e.target.value })} className={`${field} w-32`} /></label>
              </li>
            ))}
          </ul>
          {canEdit(role) && <button type="button" className="btn-primary mt-3" disabled={!scopes.length || !Object.values(units).some((u) => Number(u) > 0)} onClick={() => void push()}>Write on the passports</button>}
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">A company average, not a product’s own life-cycle assessment (ISO 14067): good for a first number, and replaced whenever you put in a product’s own.</p>
        </>
      )}
    </section>
  );
}
