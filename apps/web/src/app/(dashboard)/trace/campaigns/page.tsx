'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Banknote, Check, Globe2, Loader2, MapPin, Megaphone, Pause, Play, Plus, Square, Target, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { CITIES } from '@/components/trace/map/cities';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { cn } from '@/lib/utils';

// Pay per verified scan (UniVerse Trace campaigns): a brand offers shops bonus points for every
// genuine claim of its products in an area, up to a budget; UniVerse's fee is 5 cents per campaign
// scan, so the brand pays only for proven sales. Below: the cash-outs shops ask for (mark them paid,
// or refuse and the points go back). Server: src/server/trace-campaigns.ts, trace-wallet.ts.

interface Campaign { id: string; title: string; productId: string | null; bonusPoints: number; budgetPoints: number; spentPoints: number; scans: number; feeCents: number; status: string; country: string | null; lat: number | null; lng: number | null; radiusKm: number | null; place: string | null; endsAt: string | null; createdAt: string }
interface Cashout { id: string; points: number; amount: number; currency: string; payTo: string; status: string; note: string | null; createdAt: string; user: { name: string | null; email: string } | null }
interface BrandInfo { brand: { pointValue: number; currency: string } | null }

const money = (n: number, c: string) => n.toLocaleString(undefined, { style: 'currency', currency: c, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = { ACTIVE: 'bg-pink-500/12 text-pink-700 dark:text-pink-200', PAUSED: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300', ENDED: 'bg-zinc-500/10 text-zinc-500' };

export default function CampaignsPage() {
  return (
    <>
      <Topbar title="Campaigns" subtitle="Bonus points for shops, paid only for verified sales" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <TraceTabs />
          <Suspense><Campaigns /></Suspense>
        </div>
      </div>
    </>
  );
}

function Campaigns() {
  const q = useSearchParams();
  const fromMap = q.get('place') ? { place: q.get('place')!, lat: q.get('lat') ?? '', lng: q.get('lng') ?? '' } : null;
  const { data: info } = useSWR<BrandInfo>('/trace/brand', fetcher);
  const { data: list, error, mutate } = useSWR<Campaign[]>(info?.brand ? '/trace/campaigns' : null, fetcher);
  const { data: products } = useSWR<{ id: string; name: string }[]>(info?.brand ? '/trace/products' : null, fetcher);
  const { data: cashouts, mutate: reloadCash } = useSWR<Cashout[]>(info?.brand ? '/trace/cashouts' : null, fetcher);
  const [creating, setCreating] = useState(!!fromMap);

  if (info && !info.brand) {
    return (
      <div className="panel p-8 text-center">
        <Megaphone className="w-8 h-8 mx-auto text-pink-500" aria-hidden />
        <p className="mt-3 font-bold text-zinc-900 dark:text-white">Start your brand to run campaigns.</p>
        <Link href="/trace" className="btn-primary mt-4 inline-flex">Start your brand</Link>
      </div>
    );
  }
  if (error) return <div className="panel p-6 text-sm text-zinc-500">{errorMessage(error, 'Campaigns could not load.')}</div>;

  const running = list?.filter((c) => c.status === 'ACTIVE') ?? [];
  const totals = (list ?? []).reduce((a, c) => ({ scans: a.scans + c.scans, fees: a.fees + (c.scans * c.feeCents) / 100, points: a.points + c.spentPoints }), { scans: 0, fees: 0, points: 0 });
  const currency = info?.brand?.currency ?? 'EUR', pointValue = info?.brand?.pointValue ?? 0;
  const pending = cashouts?.filter((c) => c.status === 'PENDING') ?? [];

  return (
    <>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Running', String(running.length)], ['Verified sales paid', fmt(totals.scans)], ['Bonus points given', fmt(totals.points)], ['UniVerse fees', money(totals.fees, 'EUR')]].map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="panel px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{k}</dt>
            <dd className="mt-0.5 font-mono text-xl tabular-nums text-zinc-900 dark:text-white">{v}</dd>
          </motion.div>
        ))}
      </dl>

      <section className="space-y-3" aria-labelledby="camp-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="camp-h" className="text-lg font-bold text-zinc-900 dark:text-white">Your campaigns</h2>
          <button type="button" onClick={() => setCreating((v) => !v)} className="btn-primary btn-sm"><Plus className="w-4 h-4" />New campaign</button>
        </div>
        <AnimatePresence initial={false}>
          {creating && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <CampaignForm products={products ?? []} fromMap={fromMap} currency={currency} pointValue={pointValue} onDone={() => { setCreating(false); void mutate(); }} />
            </motion.div>
          )}
        </AnimatePresence>
        {!list ? <div className="grid md:grid-cols-2 gap-4"><div className="panel h-40 skeleton" /><div className="panel h-40 skeleton" /></div>
          : list.length === 0 && !creating ? (
            <div className="panel p-8 text-center">
              <Target className="w-8 h-8 mx-auto text-pink-500" aria-hidden />
              <p className="mt-3 font-semibold text-zinc-900 dark:text-white">No campaigns yet</p>
              <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">Pick a city on the market map, or start one here: shops there earn your bonus each time they scan a genuine unit they sold.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {list.map((c, i) => <CampaignCard key={c.id} c={c} index={i} product={products?.find((p) => p.id === c.productId)?.name ?? null} currency={currency} pointValue={pointValue} onChange={() => void mutate()} />)}
            </div>
          )}
      </section>

      <section className="panel p-5" aria-labelledby="cash-h">
        <h2 id="cash-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-500" aria-hidden />Cash-out requests{pending.length > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{pending.length} waiting</span>}</h2>
        <p className="mt-1 text-sm text-zinc-500">Shops ask to turn your points into money. Pay them your usual way, then mark the request paid. Refusing gives the points back.</p>
        {!cashouts ? <div className="mt-3 h-20 skeleton rounded-xl" /> : cashouts.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No requests yet.</p> : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {cashouts.map((c) => <CashoutRow key={c.id} c={c} onChange={() => void reloadCash()} />)}
          </ul>
        )}
      </section>
    </>
  );
}

function CampaignForm({ products, fromMap, currency, pointValue, onDone }: { products: { id: string; name: string }[]; fromMap: { place: string; lat: string; lng: string } | null; currency: string; pointValue: number; onDone: () => void }) {
  const [f, setF] = useState({
    title: fromMap ? `${fromMap.place}: bonus for every genuine sale` : '', productId: '', bonusPoints: '50', budgetPoints: '10000',
    area: (fromMap ? 'circle' : 'everywhere') as 'everywhere' | 'country' | 'circle', country: '', place: fromMap?.place ?? '', lat: fromMap?.lat ?? '', lng: fromMap?.lng ?? '', radiusKm: '30', endsAt: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const bonus = Number(f.bonusPoints) || 0, budget = Number(f.budgetPoints) || 0;
  const sales = bonus ? Math.floor(budget / bonus) : 0;
  const pickPlace = (name: string) => {
    const c = CITIES.find((x) => x[0].toLowerCase() === name.trim().toLowerCase());
    setF((v) => ({ ...v, place: name, ...(c && { lat: String(c[1]), lng: String(c[2]) }) }));
  };
  const cityNames = useMemo(() => [...new Set(CITIES.map((c) => c[0]))].sort(), []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.area === 'circle' && (!f.lat || !f.lng)) { toast.error('Pick a city from the list, or type its position.'); return; }
    setSaving(true);
    try {
      await api.post('/trace/campaigns', {
        title: f.title, productId: f.productId || undefined, bonusPoints: bonus, budgetPoints: budget,
        ...(f.area === 'country' && { country: f.country, place: f.country.toUpperCase() }),
        ...(f.area === 'circle' && { lat: Number(f.lat), lng: Number(f.lng), radiusKm: Number(f.radiusKm), place: `${f.place || 'Area'} (${f.radiusKm} km)` }),
        endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : undefined,
      });
      toast.success('Campaign running. Shops in the area see it in their wallet.');
      onDone();
    } catch (err) { toast.error(errorMessage(err, 'Could not start the campaign.')); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="panel p-5 grid md:grid-cols-[1fr_280px] gap-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Name (shops see it)</span><input required maxLength={100} value={f.title} onChange={set('title')} className="input mt-1" placeholder="Paris launch: +50 points per genuine bottle" /></label>
        <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Product</span>
          <select value={f.productId} onChange={set('productId')} className="input mt-1"><option value="">Every product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Ends (optional)</span><input type="date" value={f.endsAt} onChange={set('endsAt')} className="input mt-1" /></label>
        <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Bonus per verified sale (points)</span><input type="number" min={1} max={10000} required value={f.bonusPoints} onChange={set('bonusPoints')} className="input mt-1" /></label>
        <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Budget (points)</span><input type="number" min={1} max={100000000} required value={f.budgetPoints} onChange={set('budgetPoints')} className="input mt-1" /></label>
        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Where</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {([['everywhere', Globe2, 'Everywhere'], ['country', MapPin, 'A country'], ['circle', Target, 'Around a city']] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" aria-pressed={f.area === id} onClick={() => setF({ ...f, area: id })} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', f.area === id ? 'border-pink-500/50 bg-pink-500/10 text-pink-700 dark:text-pink-200' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300')}>
                <Icon className="w-3.5 h-3.5" aria-hidden />{label}
              </button>
            ))}
          </div>
          {f.area === 'country' && <label className="mt-2 block max-w-40"><span className="text-xs text-zinc-500">Country code (2 letters)</span><input required maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })} className="input mt-1 uppercase" placeholder="FR" /></label>}
          {f.area === 'circle' && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="block col-span-2"><span className="text-xs text-zinc-500">City</span><input list="campaign-cities" value={f.place} onChange={(e) => pickPlace(e.target.value)} className="input mt-1" placeholder="Paris" /><datalist id="campaign-cities">{cityNames.map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="block"><span className="text-xs text-zinc-500">Within (km)</span><input type="number" min={1} max={3000} value={f.radiusKm} onChange={set('radiusKm')} className="input mt-1" /></label>
              <p className="self-end pb-2 font-mono text-[11px] text-zinc-500">{f.lat && f.lng ? `${Number(f.lat).toFixed(2)}, ${Number(f.lng).toFixed(2)}` : 'pick a city'}</p>
            </div>
          )}
        </fieldset>
      </div>
      <aside className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-4 text-sm flex flex-col">
        <p className="font-semibold text-zinc-900 dark:text-white">What it costs at most</p>
        <dl className="mt-3 space-y-2 text-zinc-600 dark:text-zinc-300">
          <div className="flex justify-between"><dt>Verified sales</dt><dd className="font-mono">{fmt(sales)}</dd></div>
          <div className="flex justify-between"><dt>Points to shops</dt><dd className="font-mono">{money(budget * pointValue, currency)}</dd></div>
          <div className="flex justify-between"><dt>UniVerse fee (5¢ each)</dt><dd className="font-mono">{money(sales * 0.05, 'EUR')}</dd></div>
        </dl>
        <p className="mt-3 text-[11px] text-zinc-500">Only genuine first claims count, by a signed-in shop, inside the area. When the budget runs out, the campaign stops paying by itself.</p>
        <div className="mt-auto pt-4 flex gap-2 justify-end">
          <button type="button" onClick={onDone} className="btn-secondary btn-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}Start campaign</button>
        </div>
      </aside>
    </form>
  );
}

function CampaignCard({ c, index, product, currency, pointValue, onChange }: { c: Campaign; index: number; product: string | null; currency: string; pointValue: number; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const used = c.budgetPoints ? (c.spentPoints / c.budgetPoints) * 100 : 0;
  const set = async (status: string) => {
    setBusy(true);
    try { await api.patch(`/trace/campaigns/${c.id}`, { status }); toast.success(status === 'ACTIVE' ? 'Campaign running again' : status === 'PAUSED' ? 'Campaign paused' : 'Campaign ended'); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not change it.')); } finally { setBusy(false); }
  };
  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * 0.04, type: 'spring', stiffness: 360, damping: 32 }} className={cn('panel p-5 relative overflow-hidden', c.status === 'ENDED' && 'opacity-70')}>
      {c.status === 'ACTIVE' && <span aria-hidden className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-pink-500/15 blur-2xl" />}
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-zinc-900 dark:text-white">{c.title}</h3>
          <p className="text-xs text-zinc-500">{[c.place ?? c.country ?? 'Everywhere', product ?? 'every product', `+${c.bonusPoints} points per sale`, c.endsAt ? `ends ${new Date(c.endsAt).toLocaleDateString()}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS[c.status])}>{c.status === 'ACTIVE' ? 'Running' : c.status === 'PAUSED' ? 'Paused' : 'Ended'}</span>
      </div>
      <div className="relative mt-4">
        <div className="flex justify-between text-[11px] text-zinc-500"><span>Budget used</span><span className="font-mono">{fmt(c.spentPoints)} / {fmt(c.budgetPoints)} points</span></div>
        <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
          <motion.div className={cn('h-full rounded-full', used > 90 ? 'bg-amber-500' : 'bg-gradient-to-r from-pink-500 to-fuchsia-500')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, used)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </div>
      <dl className="relative mt-4 grid grid-cols-3 gap-2 text-center">
        {[['Sales', fmt(c.scans)], ['Paid out', money(c.spentPoints * pointValue, currency)], ['Fees', money((c.scans * c.feeCents) / 100, 'EUR')]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] py-2"><dd className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{v}</dd><dt className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</dt></div>
        ))}
      </dl>
      {c.status !== 'ENDED' && (
        <div className="relative mt-4 flex gap-2">
          {c.status === 'ACTIVE'
            ? <button type="button" disabled={busy} onClick={() => void set('PAUSED')} className="btn-secondary btn-sm"><Pause className="w-3.5 h-3.5" />Pause</button>
            : <button type="button" disabled={busy} onClick={() => void set('ACTIVE')} className="btn-secondary btn-sm"><Play className="w-3.5 h-3.5" />Resume</button>}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm('End this campaign? It stops paying for good.')) void set('ENDED'); }} className="btn-secondary btn-sm"><Square className="w-3.5 h-3.5" />End</button>
        </div>
      )}
    </motion.article>
  );
}

function CashoutRow({ c, onChange }: { c: Cashout; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState('');
  const decide = async (status: 'PAID' | 'REJECTED') => {
    setBusy(true);
    try { await api.patch(`/trace/cashouts/${c.id}`, { status, note: note || undefined }); toast.success(status === 'PAID' ? 'Marked paid' : 'Refused: the points went back'); onChange(); }
    catch (e) { toast.error(errorMessage(e, 'Could not record it.')); } finally { setBusy(false); setRefusing(false); }
  };
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-zinc-900 dark:text-white truncate">{c.user?.name ?? c.user?.email ?? 'Someone'} · {money(c.amount, c.currency)}</span>
          <span className="block font-mono text-[11px] text-zinc-500 truncate">{c.points.toLocaleString()} points · pay to {c.payTo} · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
        </span>
        {c.status === 'PENDING' ? (
          <span className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void decide('PAID')} className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" />Mark paid</button>
            <button type="button" disabled={busy} onClick={() => setRefusing((v) => !v)} className="btn-secondary btn-sm"><X className="w-3.5 h-3.5" />Refuse</button>
          </span>
        ) : <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', c.status === 'PAID' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-500')}>{c.status === 'PAID' ? 'Paid' : 'Refused'}</span>}
      </div>
      {refusing && (
        <form onSubmit={(e) => { e.preventDefault(); void decide('REJECTED'); }} className="mt-2 flex gap-2">
          <label className="flex-1"><span className="sr-only">Why (optional)</span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Why (optional): the shop sees this" /></label>
          <button type="submit" disabled={busy} className="btn-secondary btn-sm">Refuse and return points</button>
        </form>
      )}
    </li>
  );
}
