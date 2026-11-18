'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Scale } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { FACTS, type CompareRow } from '@/lib/trace-compare';

// M311: Trace → Vault → Compare (GET /trace/compare): two to four of the products I own or checked, their
// passport facts side by side, the best on each marked.

type Data = { choices: { id: string; name: string; category: string | null }[]; rows: CompareRow[]; best: Partial<Record<keyof CompareRow, string[]>> };

const show = (r: CompareRow, k: keyof CompareRow, unit?: string) => {
  const v = r[k];
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'price') return `${r.currency ?? ''} ${Number(v).toLocaleString()}`.trim();
  if (k === 'stars') return `${v} / 5 (${r.reviews})`;
  return unit ? `${v} ${unit}` : String(v);
};

export function CompareProducts() {
  const [ids, setIds] = useState<string[]>([]);
  const { data } = useSWR<Data>(`/trace/compare${ids.length >= 2 ? `?ids=${ids.join(',')}` : ''}`, fetcher, { keepPreviousData: true });
  if (!data || data.choices.length < 2) return null;
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id].slice(-4)));
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="compare-h">
      <h2 id="compare-h" className="font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Scale className="w-4 h-4 text-pink-500" aria-hidden />Compare products</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Pick two to four you own or have checked: their passports side by side.</p>
      <div className="flex flex-wrap gap-2">
        {data.choices.map((c) => (
          <label key={c.id} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm', ids.includes(c.id) ? 'border-pink-500 bg-pink-500/10 text-pink-800 dark:text-pink-100' : 'border-zinc-200 text-zinc-700 dark:border-white/10 dark:text-zinc-200')}>
            <input type="checkbox" className="sr-only" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} /><span translate="no">{c.name}</span>
          </label>
        ))}
      </div>
      {data.rows.length >= 2 && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="The comparison">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr><th scope="col" className="w-36 px-2 py-1 text-start text-xs font-medium text-zinc-500"><span className="sr-only">Fact</span></th>{data.rows.map((r) => <th key={r.id} scope="col" className="px-2 py-1 text-start"><span className="block font-semibold text-zinc-900 dark:text-white" translate="no">{r.name}</span><span className="block text-xs font-normal text-zinc-500" translate="no">{r.brand}</span></th>)}</tr>
            </thead>
            <tbody>
              {FACTS.map((f) => (
                <tr key={f.key} className="border-t border-zinc-100 dark:border-white/[0.06]">
                  <th scope="row" className="px-2 py-1.5 text-start text-xs font-medium text-zinc-600 dark:text-zinc-300">{f.label}</th>
                  {data.rows.map((r) => {
                    const best = data.best[f.key]?.includes(r.id);
                    return <td key={r.id} className={cn('px-2 py-1.5 tabular-nums', best ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-zinc-800 dark:text-zinc-100')}>{show(r, f.key, f.unit)}{best && <span className="sr-only"> (best)</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
