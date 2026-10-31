'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { m as motion } from 'framer-motion';
import { Building2, Crown, Search } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// The platform owner's view of UniVerse Trace: every brand, how big it is, and its plan (switching a
// brand to PRO turns on the category market and a million passports). Server: allBrands / setPlan in
// src/server/trace.ts, owner-only routes.

interface Row { id: string; name: string; category: string | null; color: string | null; plan: string; units: number; scans: number; createdAt: string }

export default function TraceBrandsPage() {
  const owner = useAuthStore((s) => s.user?.owner === true);
  return (
    <>
      <Topbar title="All brands" subtitle="Every brand on Trace, its size and its plan" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <TraceTabs />
          {owner ? <Brands /> : <p className="panel p-6 text-sm text-zinc-500">Only the UniVerse team sees this page.</p>}
        </div>
      </div>
    </>
  );
}

function Brands() {
  const { data, error, mutate } = useSWR<Row[]>('/trace/brands', fetcher);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const setPlan = async (b: Row) => {
    const plan = b.plan === 'PRO' ? 'FREE' : 'PRO';
    setBusy(b.id);
    try { await api.patch(`/trace/brands/${b.id}/plan`, { plan }); toast.success(`${b.name} is now on ${plan}`); void mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Could not change the plan.')); } finally { setBusy(null); }
  };
  if (error) return <p className="panel p-6 text-sm text-zinc-500">{errorMessage(error, 'Could not load the brands.')}</p>;
  const rows = (data ?? []).filter((b) => !q || `${b.name} ${b.category ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const pro = (data ?? []).filter((b) => b.plan === 'PRO').length;
  return (
    <>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Brands', fmt(data?.length ?? 0)], ['On PRO', fmt(pro)], ['Passports', fmt((data ?? []).reduce((a, b) => a + b.units, 0))], ['Scans', fmt((data ?? []).reduce((a, b) => a + b.scans, 0))]].map(([k, v]) => (
          <div key={k} className="panel px-4 py-3"><dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{k}</dt><dd className="mt-0.5 font-mono text-xl tabular-nums text-zinc-900 dark:text-white">{data ? v : '…'}</dd></div>
        ))}
      </dl>
      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 flex-1"><Building2 className="w-4 h-4 text-pink-500" aria-hidden />Brands</h2>
          <label className="relative"><span className="sr-only">Search brands</span><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-9 w-56" placeholder="Search" /></label>
        </div>
        {!data ? <div className="mt-4 h-40 skeleton rounded-xl" /> : rows.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No brands{q ? ' match' : ' yet'}.</p> : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {rows.map((b, i) => (
              <motion.li key={b.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }} className="py-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="w-9 h-9 rounded-xl grid place-items-center text-white font-black shrink-0" style={{ background: b.color ?? '#fe81d1' }} aria-hidden>{b.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-zinc-900 dark:text-white truncate">{b.name}</span><span className="block text-[11px] text-zinc-500">{[b.category, `started ${formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}`].filter(Boolean).join(' · ')}</span></span>
                <span className="font-mono text-xs text-zinc-500 w-28 text-right">{fmt(b.units)} passports</span>
                <span className="font-mono text-xs text-zinc-500 w-20 text-right">{fmt(b.scans)} scans</span>
                <button type="button" disabled={busy === b.id} onClick={() => void setPlan(b)} aria-label={`${b.name}: switch to ${b.plan === 'PRO' ? 'Free' : 'PRO'}`}
                  className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors w-24 justify-center', b.plan === 'PRO' ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200 hover:bg-fuchsia-500/25' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-500/20')}>
                  {b.plan === 'PRO' && <Crown className="w-3.5 h-3.5" aria-hidden />}{b.plan}
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
