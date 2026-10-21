'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, FileText, Loader2, Paperclip, Plus, Trash2, Wallet } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { money } from '@/components/fees/shared';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FileDrop } from '@/components/ui/FileDrop';

// Stage 5 · Q17: a club's money. Admins set the year's budget; the founder records what came in and
// went out (with a receipt); members see it all (src/server/club-governance.ts).

interface Entry { id: string; kind: 'INCOME' | 'EXPENSE'; amount: number; description: string; occurredAt: string; receiptUrl: string | null; by: string | null }
interface Data { club: { id: string; name: string }; runs: boolean; canSetBudget: boolean; summary: { budget: number; income: number; spent: number; left: number }; entries: Entry[] }
const today = () => new Date().toISOString().slice(0, 10);

export function ClubBudget({ clubId }: { clubId: string }) {
  const key = `/api/campus/clubs/${encodeURIComponent(clubId)}/budget`;
  const { data, error, mutate } = useSWR<Data>(key, authedJson);
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (error) return <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p>;
  if (!data) return <div className="skeleton h-40 rounded-3xl" />;
  const s = data.summary;

  const write = async (init: RequestInit, url = key, ok?: string) => {
    setBusy(true);
    try { await mutate(await authedJson<Data>(url, init), { revalidate: false }); if (ok) toast.success(ok); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (await write({ method: 'POST', body: JSON.stringify({ kind, amount, description, occurredAt: new Date(`${date}T12:00`).toISOString(), receiptUrl: receiptUrl || null }) }, key, 'Recorded')) { setAmount(''); setDescription(''); setReceiptUrl(''); }
  };
  const upload = async (f: File) => {
    try {
      const { url } = await authedJson<{ url: string }>(`/api/upload?filename=${encodeURIComponent(f.name)}`, { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      setReceiptUrl(url);
    } catch (e) { toast.error((e as Error).message); }
    finally { if (file.current) file.current.value = ''; }
  };

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Budget', s.budget], ['Received', s.income], ['Spent', s.spent], ['Left', s.left]].map(([label, v]) => (
          <div key={label as string} className="panel p-4"><p className={cn('text-xl font-black tabular-nums', label === 'Left' && (v as number) < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-900 dark:text-white')}>{money(v as number, 'INR')}</p><p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p></div>
        ))}
      </motion.div>
      {data.canSetBudget && (
        <motion.div variants={fadeUp} className="panel p-4 flex flex-wrap items-end gap-2">
          <Field label="This year’s budget (₹)" className="flex-1 min-w-[10rem]">{(p) => <input {...p} className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={String(s.budget / 100)} />}</Field>
          <button type="button" className="btn-secondary" disabled={busy || !budget} onClick={async () => { if (await write({ method: 'PATCH', body: JSON.stringify({ budget }) }, key, 'Budget set')) setBudget(''); }}>Set budget</button>
        </motion.div>
      )}
      {data.runs && (
        <motion.section variants={fadeUp} className="panel p-4 sm:p-5 space-y-3" aria-labelledby="money-h">
          <h3 id="money-h" className="font-bold text-zinc-900 dark:text-white">Record money</h3>
          <Segmented<'EXPENSE' | 'INCOME'> label="Money in or out" value={kind} onChange={setKind} segments={[{ value: 'EXPENSE' as const, label: 'Spent' }, { value: 'INCOME' as const, label: 'Received' }]} />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-3">
            <Field label="Amount (₹)">{(p) => <input {...p} className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
            <Field label="What for">{(p) => <input {...p} className="input" maxLength={140} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'EXPENSE' ? 'Posters for the fresher fair' : 'Sponsorship from Café Nova'} />}</Field>
            <Field label="Date">{(p) => <input {...p} className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={file} type="file" className="sr-only" id={`receipt-${clubId}`} accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <FileDrop hint={false} onFiles={(f) => void upload(f[0])} accept=".pdf,.png,.jpg,.jpeg">
              <label htmlFor={`receipt-${clubId}`} title="Or drop the receipt here" className="btn-ghost btn-sm cursor-pointer"><Paperclip className="w-4 h-4" aria-hidden /> {receiptUrl ? 'Receipt attached' : 'Attach a receipt'}</label>
            </FileDrop>
            <span className="flex-1" />
            <button type="button" className="btn-primary" disabled={busy || !amount || !description.trim()} onClick={add}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />} Record</button>
          </div>
        </motion.section>
      )}
      <motion.section variants={fadeUp} className="panel" aria-labelledby="entries-money-h">
        <h3 id="entries-money-h" className="font-bold text-zinc-900 dark:text-white p-4 pb-2">History</h3>
        {data.entries.length ? (
          <ul className="divide-y divide-zinc-200 dark:divide-white/10">
            {data.entries.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                {e.kind === 'INCOME' ? <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-label="Received" /> : <ArrowUpRight className="w-4 h-4 text-zinc-500 shrink-0" aria-label="Spent" />}
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-900 dark:text-white break-words">{e.description}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{new Date(e.occurredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{e.by ? ` · ${e.by}` : ''}</p>
                </div>
                {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-icon btn-sm" aria-label={`Receipt for ${e.description}`}><FileText className="w-4 h-4" aria-hidden /></a>}
                <span className={cn('font-semibold tabular-nums', e.kind === 'INCOME' ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-white')}>{e.kind === 'INCOME' ? '+' : '−'}{money(e.amount, 'INR')}</span>
                {data.runs && <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Remove ${e.description}`} onClick={() => void write({ method: 'DELETE' }, `${key}?entry=${encodeURIComponent(e.id)}`)}><Trash2 className="w-4 h-4" aria-hidden /></button>}
              </li>
            ))}
          </ul>
        ) : <EmptyState compact icon={Wallet} title="Nothing recorded yet" hint={data.runs ? 'Record what the club spends and receives, with receipts.' : 'The founder records the club’s money here.'} />}
      </motion.section>
    </motion.div>
  );
}
