'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Copy, KeyRound, Loader2, Package, Send, ShieldCheck } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { formatCode } from '@/lib/trace';

// The ownership vault (UniVerse Trace): the genuine things I own, proven by their passports. Add one
// from its passport ("Add to my vault"); selling it, make a one-time transfer code (7 days) and the
// buyer types it here to become the next owner. Each passport shows how many owners it has had, so a
// second-hand buyer can check the seller really owns it. Server: src/server/trace-plus.ts.

interface Item {
  id: string; code: string; since: string; owners: number;
  product: { id: string; name: string; imageUrl: string | null; category: string | null } | null;
  brand: { id: string; name: string; color: string | null; slug: string } | null;
  warrantyEnds: string | null; transfer: { code: string; until: string } | null;
}

export default function VaultPage() {
  return (
    <>
      <Topbar title="My vault" subtitle="Proof that the things you own are genuine and yours" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <TraceTabs />
          <Vault />
        </div>
      </div>
    </>
  );
}

function Vault() {
  const { data, error, mutate } = useSWR<Item[]>('/trace/vault', fetcher);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const receive = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post('/trace/vault/receive', { code }); toast.success('It’s yours now'); setCode(''); void mutate(); }
    catch (err) { toast.error(errorMessage(err, 'That code didn’t work.')); } finally { setBusy(false); }
  };
  return (
    <>
      <form onSubmit={(e) => void receive(e)} className="panel p-4 flex flex-wrap items-center gap-3">
        <KeyRound className="w-5 h-5 text-pink-500" aria-hidden />
        <span className="text-sm font-semibold text-zinc-900 dark:text-white">Bought something second-hand?</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Transfer code from the seller" aria-label="Transfer code" className="input flex-1 min-w-48 font-mono uppercase tracking-widest" />
        <button type="submit" disabled={busy || code.trim().length < 6} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Receive it'}</button>
      </form>
      {error ? <p className="panel p-6 text-sm text-zinc-500">{errorMessage(error, 'Could not open your vault.')}</p>
        : !data ? <div className="grid sm:grid-cols-2 gap-4">{[0, 1].map((i) => <div key={i} className="panel h-40 animate-pulse" />)}</div>
        : data.length === 0 ? (
          <div className="panel p-8 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto text-pink-500" aria-hidden />
            <p className="mt-3 font-semibold text-zinc-900 dark:text-white">Nothing here yet</p>
            <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">Scan the code on something you bought, then press “Add to my vault” on its passport. It’s proof it’s genuine and yours, handy for warranty, insurance and selling it on.</p>
            <Link href="/t/demo" className="mt-4 btn-secondary btn-sm inline-flex">See a sample passport</Link>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {data.map((it, i) => <Card key={it.id} it={it} i={i} onChange={() => void mutate()} />)}
          </ul>
        )}
    </>
  );
}

function Card({ it, i, onChange }: { it: Item; i: number; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const transfer = async () => {
    setBusy(true);
    try { await api.post(`/trace/vault/${it.id}/transfer`); onChange(); toast.success('Transfer code ready: give it to the buyer'); }
    catch (err) { toast.error(errorMessage(err, 'Could not make a code.')); } finally { setBusy(false); }
  };
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3, ease: [0.23, 1, 0.32, 1] }} className="panel p-5">
      <div className="flex gap-3">
        {it.product?.imageUrl
          // eslint-disable-next-line @next/next/no-img-element -- the brand's own product photo
          ? <img src={it.product.imageUrl} alt="" className="w-14 h-14 rounded-2xl object-cover" />
          : <span className="w-14 h-14 rounded-2xl grid place-items-center text-white" style={{ background: it.brand?.color ?? '#fe81d1' }}><Package className="w-6 h-6" aria-hidden /></span>}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-zinc-900 dark:text-white truncate">{it.product?.name ?? 'A product'}</p>
          <p className="text-xs text-zinc-500 truncate">{it.brand?.name}{it.product?.category ? ` · ${it.product.category}` : ''}</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">yours since {formatDistanceToNow(new Date(it.since), { addSuffix: true })}{it.owners > 1 ? ` · owner #${it.owners}` : ''}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2"><dt className="text-zinc-500">Code</dt><dd className="truncate text-zinc-800 dark:text-zinc-100"><Link href={`/t/${it.code}`} className="hover:underline">{formatCode(it.code)}</Link></dd></div>
        <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2"><dt className="text-zinc-500">Warranty</dt><dd className="text-zinc-800 dark:text-zinc-100">{it.warrantyEnds ? `until ${new Date(it.warrantyEnds).toLocaleDateString()}` : 'not registered'}</dd></div>
      </dl>
      <AnimatePresence mode="wait" initial={false}>
        {it.transfer ? (
          <motion.div key="t" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-xl bg-pink-500/10 px-3 py-2 flex items-center gap-2">
              <span className="flex-1 font-mono tracking-widest text-pink-700 dark:text-pink-200">{it.transfer.code}</span>
              <span className="text-[10px] text-zinc-500">until {new Date(it.transfer.until).toLocaleDateString()}</span>
              <button type="button" aria-label="Copy the transfer code" onClick={() => { void navigator.clipboard?.writeText(it.transfer!.code).then(() => toast.success('Copied')); }} className="p-1.5 rounded-lg hover:bg-pink-500/15"><Copy className="w-3.5 h-3.5" aria-hidden /></button>
            </div>
          </motion.div>
        ) : (
          <motion.button key="b" type="button" onClick={() => void transfer()} disabled={busy} className="mt-3 btn-secondary btn-sm">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Selling it? Make a transfer code</motion.button>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
