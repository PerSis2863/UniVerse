'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, animate, m as motion, useReducedMotion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Banknote, Gift, Loader2, Megaphone, RotateCcw, ScanLine, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cleanCode } from '@/lib/trace';
import { cn } from '@/lib/utils';
import { LiveCard } from '@/components/live/LiveCard';
import { Constellation } from '@/components/live/Constellation';
import { Heartbeat } from '@/components/live/Heartbeat';

// One wallet for everyone (UniVerse Trace): the points a shop, installer or buyer earns from every
// brand by scanning genuine products, what they're worth, the brands' live offers, cash-outs, and a
// ledger whose entries are chained by hash (verified on every load). Server: src/server/trace-wallet.ts.

interface WalletBrand { id: string; name: string; color: string | null; logoUrl: string | null; pointValue: number; currency: string; minCashout: number }
interface WalletData {
  total: number; worth: Record<string, number>; verified: boolean;
  balances: { brand: WalletBrand; points: number }[];
  history: { id: string; brandId: string; kind: string; points: number; note: string | null; createdAt: string; brand: string }[];
  cashouts: { id: string; points: number; amount: number; currency: string; status: string; note: string | null; createdAt: string; brand: string }[];
  offers: { id: string; title: string; bonusPoints: number; left: number; area: string; endsAt: string | null; brand: string; color: string | null; product: string | null }[];
}

const money = (n: number, c: string) => n.toLocaleString(undefined, { style: 'currency', currency: c, maximumFractionDigits: 2 });
const KIND: Record<string, { label: string; icon: typeof Gift; cls: string }> = {
  SCAN: { label: 'Genuine scan', icon: ScanLine, cls: 'text-pink-600 dark:text-pink-300 bg-pink-500/10' },
  CAMPAIGN: { label: 'Campaign bonus', icon: Megaphone, cls: 'text-fuchsia-600 dark:text-fuchsia-300 bg-fuchsia-500/10' },
  CASHOUT: { label: 'Cash-out', icon: ArrowUpRight, cls: 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10' },
  REFUND: { label: 'Points returned', icon: RotateCcw, cls: 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10' },
};

export default function WalletPage() {
  return (
    <>
      <Topbar title="Wallet" subtitle="Points from every brand, for every genuine product you scan" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <TraceTabs />
          <Wallet />
        </div>
      </div>
    </>
  );
}

/** A number that counts up to its value. */
function CountUp({ value }: { value: number }) {
  const calm = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (calm) { const t = setTimeout(() => setShown(value), 0); return () => clearTimeout(t); }
    const c = animate(0, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [value, calm]);
  return <>{shown.toLocaleString()}</>;
}

function Wallet() {
  const router = useRouter();
  const { data, error, mutate } = useSWR<WalletData>('/trace/wallet', fetcher);
  const [code, setCode] = useState('');
  const [cashing, setCashing] = useState<string | null>(null);

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanCode(code);
    if (c.length < 10) { toast.error('That doesn’t look like a full code. It’s printed under the QR code.'); return; }
    router.push(`/t/${c}`);
  };

  if (error) return <div className="panel p-6 text-sm text-zinc-500">{errorMessage(error, 'Your wallet could not load.')}</div>;

  return (
    <>
      <section className="trace-hero relative overflow-hidden rounded-[32px] p-7 sm:p-10 text-white">
        <span aria-hidden className="passport-glow passport-glow-a" />
        <div className="relative grid lg:grid-cols-[1fr_360px] gap-8 items-center">
          <div>
            <span className="passport-pill">Your points</span>
            <p className="mt-4 font-mono text-6xl sm:text-7xl font-light tabular-nums tracking-tight">{data ? <CountUp value={data.total} /> : '…'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data && Object.entries(data.worth).map(([c, n]) => <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">≈ {money(n, c)}</span>)}
              {data && data.total === 0 && <span className="text-sm text-zinc-300">Scan your first genuine product to start earning.</span>}
            </div>
            {data && (
              <p className={cn('mt-4 inline-flex items-center gap-1.5 text-xs font-semibold', data.verified ? 'text-emerald-300' : 'text-amber-300')}>
                {data.verified ? <ShieldCheck className="w-4 h-4" aria-hidden /> : <ShieldAlert className="w-4 h-4" aria-hidden />}
                {data.verified ? 'Every entry checked: the ledger’s hash chain is intact' : 'The ledger chain doesn’t check out. Tell support.'}
              </p>
            )}
          </div>
          <form onSubmit={open} className="rounded-3xl bg-white/[0.06] ring-1 ring-white/10 p-5">
            <p className="font-bold flex items-center gap-2"><ScanLine className="w-4 h-4 text-pink-300" aria-hidden />Scan a product</p>
            <p className="mt-1 text-sm text-zinc-300">Point your phone’s camera at the code on the product. Or type the code printed under it:</p>
            <label className="mt-3 block"><span className="sr-only">Product code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" className="w-full h-11 rounded-xl bg-white/10 px-3 font-mono uppercase tracking-wider text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-pink-400" />
            </label>
            <button type="submit" className="btn-primary mt-3 w-full justify-center">Check it</button>
          </form>
        </div>
      </section>

      {data && data.balances.length > 0 && <WalletLive data={data} />}

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-6">
          <section aria-labelledby="bal-h">
            <h2 id="bal-h" className="text-lg font-bold text-zinc-900 dark:text-white">By brand</h2>
            {!data ? <div className="mt-3 grid sm:grid-cols-2 gap-3"><div className="panel h-36 skeleton" /><div className="panel h-36 skeleton" /></div>
              : data.balances.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No points yet. Each genuine product you sell or fit earns the brand’s points here.</p> : (
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  {data.balances.map((b, i) => (
                    <motion.article key={b.brand.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 360, damping: 32 }} className="panel p-5 relative overflow-hidden">
                      <span aria-hidden className="absolute -right-8 -top-8 w-28 h-28 rounded-full blur-2xl opacity-25" style={{ background: b.brand.color ?? '#ec4899' }} />
                      <div className="relative flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl grid place-items-center text-white font-black" style={{ background: b.brand.color ?? '#ec4899' }} aria-hidden>{b.brand.name.slice(0, 1)}</span>
                        <span className="min-w-0 flex-1"><span className="block font-bold text-zinc-900 dark:text-white truncate">{b.brand.name}</span><span className="block text-xs text-zinc-500">1 point = {money(b.brand.pointValue, b.brand.currency)}</span></span>
                      </div>
                      <p className="relative mt-4 font-mono text-3xl tabular-nums text-zinc-900 dark:text-white">{b.points.toLocaleString()}<span className="ml-2 text-sm text-zinc-500">≈ {money(b.points * b.brand.pointValue, b.brand.currency)}</span></p>
                      <div className="relative mt-3">
                        <div className="flex justify-between text-[11px] text-zinc-500"><span>Cash-out from {b.brand.minCashout.toLocaleString()}</span><span>{Math.min(100, Math.round((b.points / b.brand.minCashout) * 100))}%</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (b.points / b.brand.minCashout) * 100)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} /></div>
                      </div>
                      <button type="button" disabled={b.points < b.brand.minCashout} onClick={() => setCashing(cashing === b.brand.id ? null : b.brand.id)} className="relative mt-4 btn-secondary btn-sm"><Banknote className="w-3.5 h-3.5" />Cash out</button>
                      <AnimatePresence initial={false}>
                        {cashing === b.brand.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden">
                            <CashoutForm brand={b.brand} max={b.points} onDone={() => { setCashing(null); void mutate(); }} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  ))}
                </div>
              )}
          </section>

          <section className="panel p-5" aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-bold text-zinc-900 dark:text-white">History</h2>
            {!data ? <div className="mt-3 h-24 skeleton rounded-xl" /> : data.history.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Nothing yet.</p> : (
              <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {data.history.map((h) => {
                  const k = KIND[h.kind] ?? KIND.SCAN;
                  return (
                    <li key={h.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className={cn('w-8 h-8 shrink-0 rounded-xl grid place-items-center', k.cls)}><k.icon className="w-4 h-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-zinc-800 dark:text-zinc-100">{h.note ?? k.label}</span><span className="block text-[11px] text-zinc-500">{h.brand} · {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}</span></span>
                      <span className={cn('shrink-0 font-mono font-semibold tabular-nums', h.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>{h.points >= 0 ? '+' : ''}{h.points.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="offers-h">
            <h2 id="offers-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Gift className="w-4 h-4 text-pink-500" aria-hidden />Earn more now</h2>
            <p className="mt-1 text-xs text-zinc-500">Brands paying a bonus for each genuine unit you sell in these places.</p>
            {!data ? <div className="mt-3 h-32 skeleton rounded-xl" /> : data.offers.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No offers right now.</p> : (
              <ul className="mt-3 space-y-2">
                {data.offers.map((o, i) => (
                  <motion.li key={o.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3 flex gap-3">
                    <span className="w-1 rounded-full shrink-0" style={{ background: o.color ?? '#ec4899' }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{o.title}</span>
                      <span className="block text-[11px] text-zinc-500">{[o.brand, o.product, o.area, `${o.left.toLocaleString()} left`, o.endsAt ? `until ${new Date(o.endsAt).toLocaleDateString()}` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 self-center font-mono font-bold text-pink-600 dark:text-pink-300">+{o.bonusPoints}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="co-h">
            <h2 id="co-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ArrowDownLeft className="w-4 h-4 text-emerald-500" aria-hidden />Cash-outs</h2>
            {!data ? <div className="mt-3 h-16 skeleton rounded-xl" /> : data.cashouts.length === 0 ? <p className="mt-2 text-sm text-zinc-500">None yet.</p> : (
              <ul className="mt-3 space-y-2">
                {data.cashouts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1"><span className="block truncate text-zinc-800 dark:text-zinc-100">{c.brand} · {money(c.amount, c.currency)}</span><span className="block text-[11px] text-zinc-500">{c.points.toLocaleString()} points · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}{c.note ? ` · ${c.note}` : ''}</span></span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', c.status === 'PAID' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : c.status === 'PENDING' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-zinc-500/10 text-zinc-500')}>{c.status === 'PAID' ? 'Paid' : c.status === 'PENDING' ? 'Waiting' : 'Refused'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function CashoutForm({ brand, max, onDone }: { brand: WalletBrand; max: number; onDone: () => void }) {
  const [points, setPoints] = useState(String(max));
  const [payTo, setPayTo] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/trace/wallet/cashouts', { brandId: brand.id, points: Number(points), payTo }); toast.success(`Asked ${brand.name} to pay you. You’ll see it here when they do.`); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not ask for it.')); } finally { setSaving(false); }
  };
  const n = Number(points) || 0;
  return (
    <form onSubmit={(e) => void save(e)} className="mt-3 grid gap-2">
      <label className="block"><span className="text-xs text-zinc-600 dark:text-zinc-300">Points ({brand.minCashout.toLocaleString()}–{max.toLocaleString()})</span><input type="number" min={brand.minCashout} max={max} required value={points} onChange={(e) => setPoints(e.target.value)} className="input mt-1" /></label>
      <label className="block"><span className="text-xs text-zinc-600 dark:text-zinc-300">Pay to (bank, UPI or PayPal)</span><input required maxLength={200} value={payTo} onChange={(e) => setPayTo(e.target.value)} className="input mt-1" placeholder="name@upi, IBAN or PayPal email" /></label>
      <button type="submit" disabled={saving} className="btn-primary btn-sm justify-center">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />}Ask for {money(n * brand.pointValue, brand.currency)}</button>
    </form>
  );
}

/** M50: the brands you hold points with, around you, and your points over time as a heartbeat. */
function WalletLive({ data }: { data: WalletData }) {
  const ordered = [...data.history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const running = ordered.reduce<number[]>((acc, h) => [...acc, (acc.at(-1) ?? 0) + h.points], []);
  return (
    <LiveCard title="Your points, live" sub="Each brand you hold points with, and how your total grew"
      stats={[{ label: 'Points', value: data.total.toLocaleString() }, { label: 'Brands', value: String(data.balances.length) }]}
      ticker={data.history.slice(0, 6).map((h) => `${h.brand}: ${h.points > 0 ? '+' : ''}${h.points.toLocaleString()} · ${KIND[h.kind]?.label ?? h.kind}`)}>
      <Constellation className="h-[240px]" label="The brands you hold points with" center="★"
        groups={data.balances.map((b) => ({ label: b.brand.name, n: Math.max(6, Math.round(Math.sqrt(b.points))), value: `${b.points.toLocaleString()} pts` }))} />
      {running.length > 1 && <div className="mt-3 h-[80px]"><Heartbeat values={running} label="Your total points over time" /></div>}
    </LiveCard>
  );
}
