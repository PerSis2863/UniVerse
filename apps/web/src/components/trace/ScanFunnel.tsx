'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Filter } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Fill } from '@/components/ui/Fill';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import type { funnelSteps } from '@/lib/trace-funnel';

// M307: From scan to sale (Trace → Insights; GET /trace/funnel): of the units scanned in a period, how many
// were sold in a shop, got an owner, a warranty and a review, for the brand or one product, with the
// step where most people stop marked, and the top products side by side.

type Steps = ReturnType<typeof funnelSteps>;
type Data = { days: number; product: string | null; products: { id: string; name: string }[]; steps: Steps; drop: string | null; byProduct: { productId: string; name: string; steps: Steps }[] };
type Days = '30' | '90' | '365';
const HINT: Record<string, string> = {
  sold: 'Many scans don’t end in a sale: check the shops that stock it, or the price on the label.',
  owned: 'Few buyers register as owners: say on the label what owning it gives them (warranty, resale history).',
  warranted: 'Owners skip the warranty: a longer warranty, or one tap from the passport, helps.',
  reviewed: 'Few reviews: ask for one a week after the sale, with points.',
};

export function ScanFunnel() {
  const [days, setDays] = useState<Days>('90');
  const [product, setProduct] = useState('');
  const { data } = useSWR<Data>(`/trace/funnel?days=${days}${product ? `&product=${product}` : ''}`, fetcher, { keepPreviousData: true });
  return (
    <section className="panel p-5 space-y-4" aria-labelledby="funnel-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="funnel-h" className="me-auto font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Filter className="w-4 h-4 text-pink-500" aria-hidden />From scan to sale</h2>
        {data && data.products.length > 1 && (
          <select aria-label="Product" className="input w-auto py-1 text-sm" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Every product</option>
            {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <Segmented<Days> label="Period" value={days} onChange={setDays} segments={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'A year' }]} />
      </div>
      {!data ? <div className="h-40 rounded-2xl skeleton" /> : !data.steps[0].n ? <p className="text-sm text-zinc-600 dark:text-zinc-300">No scans in this period yet.</p> : (
        <>
          <ol className="space-y-2">
            {data.steps.map((s, i) => (
              <li key={s.key} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className={cn('text-zinc-700 dark:text-zinc-200', data.drop === s.key && 'font-semibold text-rose-700 dark:text-rose-300')}>{s.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]"><Fill value={s.ofAll / 100} className="bg-pink-500" /></span>
                <span className="w-28 text-end font-mono tabular-nums text-zinc-900 dark:text-white">{s.n.toLocaleString()}{i > 0 && <span className="text-xs text-zinc-500"> · {s.ofBefore}%</span>}</span>
              </li>
            ))}
          </ol>
          {data.drop && HINT[data.drop] && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-900 dark:text-rose-100">Most people stop before “{data.steps.find((s) => s.key === data.drop)?.label}”. {HINT[data.drop]}</p>}
          {!product && data.byProduct.length > 1 && (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="The funnel per product">
              <table className="w-full text-sm">
                <caption className="sr-only">The funnel per product</caption>
                <thead><tr className="text-start text-xs text-zinc-500">{['Product', ...data.steps.map((s) => s.label)].map((h) => <th key={h} scope="col" className="px-2 py-1 text-start font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.byProduct.map((p) => (
                    <tr key={p.productId} className="border-t border-zinc-100 dark:border-white/[0.06]">
                      <th scope="row" className="px-2 py-1.5 text-start font-medium text-zinc-900 dark:text-white" translate="no">{p.name}</th>
                      {p.steps.map((s, i) => <td key={s.key} className="px-2 py-1.5 font-mono tabular-nums text-zinc-700 dark:text-zinc-200">{s.n}{i > 0 && <span className="text-xs text-zinc-500"> ({s.ofAll}%)</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
