'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Download, HeartHandshake, Loader2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, IMPACT_REPORT_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Switch } from '@/components/ui/Switch';
import { money } from '@/components/fees/shared';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';

// Stage 5 · Q16 (admins): which NGOs take donations, their 80G number and PAN for Indian tax
// receipts, what each has been given, and every donation (a CSV for passing the money on and for
// the NGO's Form 10BD). Money arrives in the school's Stripe account.

interface Ngo { id: string; name: string; donationsOn: boolean; reg80G: string | null; pan: string | null; isVerified: boolean; projects: number; raised: { currency: string; amount: number; count: number }[] }
interface Gift { id: string; receipt: string | null; paidAt: string; status: string; amount: number; currency: string; projectName: string; ngoName: string; donorName: string; donorEmail: string | null; pan: string | null; address: string | null; anonymous: boolean }
interface Data { ngos: Ngo[]; donations: Gift[] }
const KEY = '/api/admin/donations';

function NgoRow({ n, onSaved }: { n: Ngo; onSaved: (d: Data) => void }) {
  const [reg, setReg] = useState(n.reg80G ?? '');
  const [pan, setPan] = useState(n.pan ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { onSaved(await authedJson<Data>(KEY, { method: 'PATCH', body: JSON.stringify({ ngoId: n.id, ...body }) })); toast.success('Saved'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const dirty = reg !== (n.reg80G ?? '') || pan !== (n.pan ?? '');
  return (
    <motion.li variants={fadeUp} className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-white break-words">{n.name}{!n.isVerified && <span className="ms-2 text-xs font-medium text-amber-800 dark:text-amber-300">not verified</span>}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{n.projects} project{n.projects === 1 ? '' : 's'} · {n.raised.length ? n.raised.map((r) => `${money(r.amount, r.currency)} from ${r.count}`).join(' + ') : 'nothing given yet'}</p>
        </div>
        <span className="text-sm text-zinc-700 dark:text-zinc-200">Takes donations</span>
        <Switch checked={n.donationsOn} disabled={busy} onChange={(v) => save({ donationsOn: v })} label={`${n.name} takes donations`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">80G registration number
          <input className="input mt-1 font-mono" value={reg} maxLength={60} onChange={(e) => setReg(e.target.value.toUpperCase())} placeholder="e.g. AAATA1234AF20214" />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">NGO PAN
          <input className="input mt-1 font-mono" value={pan} maxLength={10} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="AAATA1234A" />
        </label>
        <button type="button" className="btn-secondary" disabled={!dirty || busy} onClick={() => save({ reg80G: reg || null, pan: pan || null })}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save tax details</button>
      </div>
    </motion.li>
  );
}

const csvCell = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"` : t; };

export default function AdminDonationsPage() {
  const { data, error, isLoading, mutate } = useSWR<Data>(KEY, authedJson);
  const exportCsv = () => {
    if (!data) return;
    const head = ['Receipt', 'Date', 'Status', 'Amount', 'Currency', 'Project', 'NGO', 'Donor', 'Email', 'PAN', 'Address'];
    const lines = data.donations.map((d) => [d.receipt, d.paidAt.slice(0, 10), d.status, (d.amount / 100).toFixed(2), d.currency, d.projectName, d.ngoName, d.donorName, d.donorEmail, d.pan, d.address].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `donations-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <Topbar title="Donations" subtitle="NGO projects people can give to, and what they've given" />
      <SectionTabs tabs={IMPACT_REPORT_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-5">
          {error ? <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load donations.'}</p><button type="button" className="btn-secondary btn-sm mt-3" onClick={() => mutate()}>Try again</button></div>
            : isLoading || !data ? <ContentSkeleton variant="list" /> : (
              <motion.div variants={list} initial="hidden" animate="show" className="space-y-5">
                <motion.p variants={fadeUp} className="text-sm text-zinc-600 dark:text-zinc-400">Donations are paid by card through your Stripe account (the same one as subscriptions). Pass each NGO its total from the list below. An 80G section appears on rupee receipts only when the NGO has both its 80G number and PAN here.</motion.p>
                <section className="panel" aria-labelledby="ngos-h">
                  <h2 id="ngos-h" className="font-bold text-zinc-900 dark:text-white p-4 pb-0">NGOs</h2>
                  {data.ngos.length ? <motion.ul variants={list} className="divide-y divide-zinc-200 dark:divide-white/10">{data.ngos.map((n) => <NgoRow key={n.id} n={n} onSaved={(d) => void mutate(d, { revalidate: false })} />)}</motion.ul>
                    : <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">No NGOs yet.</p>}
                </section>
                <section className="panel" aria-labelledby="gifts-h">
                  <div className="flex items-center justify-between gap-2 p-4 pb-2">
                    <h2 id="gifts-h" className="font-bold text-zinc-900 dark:text-white">Donations</h2>
                    {data.donations.length > 0 && <button type="button" className="btn-secondary btn-sm" onClick={exportCsv}><Download className="w-4 h-4" aria-hidden /> CSV</button>}
                  </div>
                  {data.donations.length ? (
                    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
                      {data.donations.map((d) => (
                        <li key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <HeartHandshake className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                          <span className="flex-1 min-w-0 break-words"><strong className="text-zinc-900 dark:text-white">{d.donorName}</strong> <span className="text-zinc-600 dark:text-zinc-400">to {d.projectName} ({d.ngoName}) · {new Date(d.paidAt).toLocaleDateString()}{d.status === 'REFUNDED' ? ' · refunded' : ''}{d.pan ? ' · 80G' : ''}</span></span>
                          <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{money(d.amount, d.currency)}</span>
                          {d.receipt && <a href={`/donation-receipt/${d.id}`} target="_blank" rel="noopener" className="text-indigo-700 dark:text-indigo-300 underline underline-offset-2">{d.receipt}</a>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-4 pb-4 text-sm text-zinc-600 dark:text-zinc-400">None yet. Turn donations on for an NGO and its projects get a Donate button.</p>}
                </section>
              </motion.div>
            )}
        </div>
      </div>
    </>
  );
}
