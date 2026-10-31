'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowRight, Ban, Crown, ExternalLink, Globe2, Loader2, MapPin, Megaphone, Package, Plus, Printer, Rocket, ScanLine, Settings2, ShieldAlert, ShieldCheck, Sparkles, Trash2, Truck, Wallet, Wand2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Facts, HeatStrip, Meter, Ring, Spark, Stack } from '@/components/instruments/parts';
import { TraceTabs } from '@/components/trace/TraceTabs';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { fmt } from '@/lib/instruments';
import { useActivePoll } from '@/lib/realtime-client';
import { useNow } from '@/lib/use-now';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/trace';
import { cn } from '@/lib/utils';
import { LiveCard } from '@/components/live/LiveCard';
import { Funnel } from '@/components/live/Funnel';

// UniVerse Trace, the brand's console (the owner, 24 Oct 2026: "something unique and different and
// bold"; then "do all 4 of them"). Anyone signed in can start a brand for free: every product gets a
// passport, batches get printable signed codes, every scan shows up live with likely copies caught,
// shops earn the brand's points, campaigns pay per verified scan, and the maps show where it sells and
// where each shipment is. Server: src/server/trace*.ts. The other Trace pages hang off TraceTabs.

interface Brand { id: string; name: string; slug: string; category: string | null; color: string | null; logoUrl: string | null; plan: string; pointValue: number; currency: string; minCashout: number }
interface BrandInfo { brand: Brand | null; pro?: boolean; units?: number; unitLimit?: number }
interface Batch { id: string; label: string; quantity: number; origin: string | null; madeAt: string | null; createdAt: string; status: string; destPlace: string | null; carrierKey: string | null; allowedCountries?: string | null; blockedAt?: string | null; recall?: { id: string; reason: string; severity: string } | null }
interface Product { id: string; name: string; sku: string | null; category: string | null; description: string | null; story: string | null; rewardPoints: number; warrantyMonths: number; sample: boolean; batches: Batch[]; _count: { codes: number }; winOdds?: number | null; winPrize?: string | null; maxTempC?: number | null; weightKg?: number }
interface Overview {
  days: number; products: number; batches: number; units: number; scanned: number; claimed: number; points: number;
  scans: number[]; suspect: number[]; first: number; seen: number; suspects: number;
  places: { place: string; scans: number }[];
  recent: { id: string; verdict: string; place: string | null; createdAt: string; code: { id: string; label: string; serial: number; product: { name: string }; batch: { label: string } } }[];
  suspectList: { id: string; place: string | null; createdAt: string; code: { id: string; label: string; status: string; firstPlace: string | null; scanCount: number; product: { name: string } } }[];
  campaigns: { active: number; scans: number; fees: number }; pendingCashouts: number; currency: string;
}

const VERDICT: Record<string, { label: string; cls: string }> = {
  FIRST: { label: 'Genuine · first check', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  SEEN: { label: 'Genuine · checked again', cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  SUSPECT: { label: 'Likely copy', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
};
const BATCH_STATUS: Record<string, string> = { MADE: 'Made', IN_TRANSIT: 'On the move', DELIVERED: 'Delivered' };
const CATEGORIES = ['Food', 'Drinks', 'Cosmetics', 'Fashion', 'Electronics', 'Auto parts', 'Pharma', 'Home', 'Toys', 'Agriculture'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'INR', 'AED', 'CHF'];
const money = (n: number, c: string) => n.toLocaleString(undefined, { style: 'currency', currency: c, maximumFractionDigits: 2 });

export default function TracePage() {
  const { data, mutate } = useSWR<BrandInfo>('/trace/brand', fetcher);
  return (
    <>
      <Topbar title="Trace" subtitle="Every product gets a passport: genuine checks, live maps, rewards and campaigns" />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <TraceTabs />
          {!data ? <div className="ins-board"><div className="ins-board-inner h-[420px] skeleton" /></div>
            : data.brand ? <BrandConsole info={data as Required<BrandInfo> & { brand: Brand }} onChange={() => void mutate()} />
            : <StartBrand onDone={() => void mutate()} />}
        </div>
      </div>
    </>
  );
}

/** No brand yet: start one, free, in one step. */
function StartBrand({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState<'start' | 'sample' | null>(null);
  const start = async (sample: boolean) => {
    if (!name.trim()) { toast.error('What is your brand called?'); return; }
    setBusy(sample ? 'sample' : 'start');
    try {
      await api.post('/trace/brand', { name, category });
      if (sample) { await api.post('/trace/demo'); toast.success('Your brand is ready, with a sample product to explore.'); }
      else toast.success('Your brand is ready. Add your first product.');
      onDone();
    } catch (e) { toast.error(errorMessage(e, 'Could not start the brand.')); } finally { setBusy(null); }
  };
  return (
    <>
      <section className="trace-hero relative overflow-hidden rounded-[32px] p-8 sm:p-12 text-white">
        <span aria-hidden className="passport-glow passport-glow-a" />
        <div className="relative grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <span className="passport-pill">UniVerse Trace · free to start</span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">Every product gets a passport.</h2>
            <p className="mt-4 text-lg text-zinc-300">One code on each unit. Buyers scan it and see it’s genuine. Shops scan it and earn your points. You see where every product sells, live on a map, where each shipment is right now, and every copied label the moment it appears.</p>
            <ul className="mt-6 grid sm:grid-cols-2 gap-2 text-sm text-zinc-200">
              {['10,000 passports free', 'Live market map', 'Real-time shipment tracking', 'Pay only per verified scan'].map((t) => (
                <li key={t} className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-pink-300 shrink-0" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void start(false); }} className="rounded-3xl bg-white/[0.06] ring-1 ring-white/10 p-6 backdrop-blur">
            <h3 className="text-lg font-bold">Start your brand</h3>
            <label className="mt-4 block text-xs font-semibold text-zinc-300">Brand name
              <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Aurora Foods" className="mt-1 w-full h-11 rounded-xl bg-white/10 px-3 text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-pink-400" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-zinc-300">What you make
              <input list="trace-categories" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Food, cosmetics, auto parts…" className="mt-1 w-full h-11 rounded-xl bg-white/10 px-3 text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-pink-400" />
              <datalist id="trace-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <div className="mt-5 grid gap-2">
              <button type="submit" disabled={!!busy} className="btn-primary justify-center">{busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}Start free</button>
              <button type="button" onClick={() => void start(true)} disabled={!!busy} className="btn-secondary justify-center">{busy === 'sample' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Start with a sample product</button>
            </div>
            <p className="mt-3 text-[11px] text-zinc-400">The sample fills your maps with a made-up olive oil so you can see everything working. Delete it any time.</p>
          </form>
        </div>
      </section>
      <section className="grid sm:grid-cols-3 gap-4">
        {[
          [ScanLine, '1 · Passports', 'Add a product, make a batch, print one signed code per unit. Nobody can guess or forge one.'],
          [Globe2, '2 · Live maps', 'Every scan lights up its city. Every shipment moves on the map while a driver shares the link.'],
          [Megaphone, '3 · Campaigns', 'Offer shops bonus points for each genuine sale in a city. You pay only for scans that prove a sale.'],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof ScanLine;
          return <div key={t as string} className="panel p-5"><I className="w-5 h-5 text-pink-500" aria-hidden /><p className="mt-3 font-bold text-zinc-900 dark:text-white">{t as string}</p><p className="mt-1 text-sm text-zinc-500">{d as string}</p></div>;
        })}
      </section>
      <Link href="/trace/wallet" className="panel p-5 flex items-center gap-4 group">
        <span className="w-11 h-11 rounded-2xl grid place-items-center bg-pink-500/10 text-pink-600 dark:text-pink-300"><Wallet className="w-5 h-5" aria-hidden /></span>
        <span className="flex-1"><span className="block font-bold text-zinc-900 dark:text-white">Just selling or fitting products?</span><span className="block text-sm text-zinc-500">Scan the codes on what you sell and collect the brands’ points in your wallet.</span></span>
        <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:translate-x-1 transition-transform" aria-hidden />
      </Link>
    </>
  );
}

function BrandConsole({ info, onChange }: { info: { brand: Brand; pro: boolean; units: number; unitLimit: number }; onChange: () => void }) {
  const poll = useActivePoll(30_000);
  const now = useNow();
  const { data: products, mutate: reloadProducts } = useSWR<Product[]>('/trace/products', fetcher);
  const { data: ov, mutate: reloadOverview } = useSWR<Overview>('/trace/overview?days=30', fetcher, { refreshInterval: poll });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const reload = () => { void reloadProducts(); void reloadOverview(); onChange(); };
  const { brand } = info;

  const tryDemo = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ code: string }>('/trace/demo');
      toast.success('Sample product ready. Open its passport to see what buyers see.');
      reload();
      window.open(`/t/${res.data.code}`, '_blank', 'noopener');
    } catch (e) { toast.error(errorMessage(e, 'Could not make the sample.')); } finally { setBusy(false); }
  };

  if (!products || !ov) return <div className="ins-board"><div className="ins-board-inner h-[420px] skeleton" /></div>;

  const total = ov.first + ov.seen + ov.suspects;
  const genuinePct = total ? ((ov.first + ov.seen) / total) * 100 : 100;
  const labels = ov.scans.map((_, i) => (now ? new Date(now - (ov.days - 1 - i) * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''));
  const usage = info.unitLimit ? (info.units / info.unitLimit) * 100 : 0;
  const cells: InstrumentCell[] = [
    { id: 'scans', label: 'Scans · 30 days', value: total, unit: 'scans', note: `${ov.scans.at(-1) ?? 0} today`, body: <Spark values={ov.scans} />,
      detail: { title: 'Scans per day', description: 'Every time someone checked one of your products.', series: ov.scans, labels } },
    { id: 'genuine', label: 'Genuine', value: Math.round(genuinePct * 10) / 10, unit: '%', note: `${ov.first} first checks · ${ov.seen} re-checks`,
      body: <span className="flex justify-center"><Ring pct={Math.round(genuinePct * 10) / 10} label="genuine" size={104} /></span> },
    { id: 'copies', label: 'Likely copies', value: ov.suspects, unit: 'scans', warn: ov.suspects > 0, note: ov.suspects ? 'labels seen far from their first check' : 'none: every label checks out',
      body: <HeatStrip rows={[{ label: 'copies', values: ov.suspect.slice(-30) }, { label: 'scans', values: ov.scans.slice(-30) }]} foot={[labels[0] ?? '', 'today']} />,
      detail: { title: 'Likely copies per day', description: 'Scans of a code far from where it was first checked, or checked too often.', series: ov.suspect, labels, threshold: 1 } },
    { id: 'units', label: 'Units with a passport', value: ov.units, unit: 'units', note: `${ov.scanned.toLocaleString()} scanned at least once`, body: <Meter pct={ov.units ? (ov.scanned / ov.units) * 100 : 0} /> },
    { id: 'points', label: 'Points earned by shops', value: ov.points, unit: 'points', note: `${ov.claimed} units claimed · worth ${money(ov.points * brand.pointValue, brand.currency)}`, body: <Stack a={ov.scans.map((n, i) => n - (ov.suspect[i] ?? 0))} b={ov.suspect} /> },
    { id: 'campaigns', label: 'Campaign scans', value: ov.campaigns.scans, unit: 'scans', warn: ov.pendingCashouts > 0,
      note: `${ov.campaigns.active} running · fees ${money(ov.campaigns.fees, 'EUR')}${ov.pendingCashouts ? ` · ${ov.pendingCashouts} cash-out${ov.pendingCashouts === 1 ? '' : 's'} waiting` : ''}`,
      body: <Facts rows={[['Running', String(ov.campaigns.active)], ['Verified sales paid', String(ov.campaigns.scans)], ['Cash-outs waiting', String(ov.pendingCashouts)]]} /> },
    { id: 'places', label: 'Where it’s scanned', value: ov.places.length, unit: 'places', body: ov.places.length ? <Facts rows={ov.places.map((p) => [p.place, String(p.scans)] as [string, string])} /> : <p className="text-sm text-zinc-500">No scans yet.</p> },
  ];

  return (
    <>
      {/* The brand */}
      <section className="panel p-5 flex flex-wrap items-center gap-4">
        <span className="w-12 h-12 rounded-2xl grid place-items-center text-white font-black text-lg shadow-lg" style={{ background: brand.color ?? '#ec4899' }} aria-hidden>{brand.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">{brand.name}
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider', info.pro ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>{info.pro ? 'PRO' : 'FREE'}</span>
          </h2>
          <p className="text-xs text-zinc-500">{[brand.category, `1 point = ${money(brand.pointValue, brand.currency)}`, `cash-outs from ${brand.minCashout.toLocaleString()} points`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="w-full sm:w-64">
          <div className="flex justify-between text-[11px] text-zinc-500"><span>Passports used</span><span className="font-mono">{fmt(info.units)} / {fmt(info.unitLimit)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
            <motion.div className={cn('h-full rounded-full', usage > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-pink-500 to-fuchsia-500')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, usage)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
        <button type="button" onClick={() => setSettings((v) => !v)} aria-expanded={settings} className="btn-secondary btn-sm"><Settings2 className="w-4 h-4" />Brand settings</button>
      </section>
      <AnimatePresence initial={false}>
        {settings && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <BrandSettings brand={brand} pro={info.pro} onDone={() => { setSettings(false); onChange(); }} />
          </motion.div>
        )}
      </AnimatePresence>

      <InstrumentBoard icon={ScanLine} title="Trace live" subtitle={`${ov.products} products · ${ov.batches} batches · last 30 days`} cells={cells} storageKey="trace-live" />

      {/* M48: from a printed code to an owner, as a stream of light. */}
      <LiveCard title="From label to owner" sub="Codes printed, checked by someone, and claimed by an owner"
        ticker={ov.recent.slice(0, 6).map((r) => `${r.code.product.name}${r.place ? ` · ${r.place}` : ''} · ${VERDICT[r.verdict]?.label ?? r.verdict}`)}>
        <Funnel className="h-[200px]" label="Codes printed, scanned and claimed"
          stages={[{ label: 'Printed', value: ov.units }, { label: 'Scanned', value: ov.scanned }, { label: 'Claimed', value: ov.claimed }]} />
      </LiveCard>

      <div className="grid sm:grid-cols-3 gap-3">
        {([['/trace/map', Globe2, 'Market map', 'Where it sells, city by city, live'], ['/trace/tracking', Truck, 'Tracking', 'Every shipment, where it is now'], ['/trace/campaigns', Megaphone, 'Campaigns', 'Pay per verified sale']] as const).map(([href, Icon, t, d]) => (
          <Link key={href} href={href} className="panel p-4 flex items-center gap-3 group hover:-translate-y-0.5 transition-transform">
            <span className="w-10 h-10 rounded-2xl grid place-items-center bg-pink-500/10 text-pink-600 dark:text-pink-300"><Icon className="w-5 h-5" aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold text-sm text-zinc-900 dark:text-white">{t}</span><span className="block text-xs text-zinc-500 truncate">{d}</span></span>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" aria-hidden />
          </Link>
        ))}
      </div>

      <section aria-labelledby="products-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="products-h" className="text-lg font-bold text-zinc-900 dark:text-white">Products</h2>
          <div className="flex gap-2">
            {!products.some((p) => p.sample) && <button type="button" onClick={() => void tryDemo()} disabled={busy} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Sample product</button>}
            <button type="button" onClick={() => setAdding((v) => !v)} className="btn-primary btn-sm"><Plus className="w-4 h-4" />New product</button>
          </div>
        </div>
        {adding && <ProductForm onDone={() => { setAdding(false); reload(); }} />}
        {products.length === 0 && !adding && (
          <div className="panel p-8 text-center">
            <Package className="w-8 h-8 mx-auto text-zinc-400" aria-hidden />
            <p className="mt-3 font-semibold text-zinc-900 dark:text-white">No products yet</p>
            <p className="mt-1 text-sm text-zinc-500">Add one, or try the sample to see the maps and passports working.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => void tryDemo()} disabled={busy} className="btn-secondary btn-sm"><Wand2 className="w-4 h-4" />Try the sample</button>
              <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" />Add a product</button>
            </div>
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-4">{products.map((p) => <ProductCard key={p.id} p={p} onChange={reload} />)}</div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="panel p-5" aria-labelledby="recent-h">
          <h2 id="recent-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-500" />Latest scans</h2>
          {ov.recent.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No scans yet. Print a code and scan it with your phone.</p> : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {ov.recent.map((s) => (
                <li key={s.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold', VERDICT[s.verdict]?.cls)}>{VERDICT[s.verdict]?.label ?? s.verdict}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{s.code.product.name} <span className="text-zinc-500">#{s.code.serial + 1}</span></span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">{s.place ?? ''} · {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-5" aria-labelledby="copies-h">
          <h2 id="copies-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Ban className="w-4 h-4 text-amber-500" />Likely copies</h2>
          {ov.suspectList.length === 0 ? <p className="mt-3 text-sm text-zinc-500">None. When a label turns up far from its first check, it shows here, and you can block it.</p> : (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {ov.suspectList.map((s) => <SuspectRow key={s.id} s={s} onChange={reload} />)}
            </ul>
          )}
        </section>
      </div>

      <PlanCard pro={info.pro} />
    </>
  );
}

function PlanCard({ pro }: { pro: boolean }) {
  return (
    <section id="plan" className="grid md:grid-cols-2 gap-4 scroll-mt-24" aria-label="Plans">
      <div className={cn('panel p-6', !pro && 'ring-2 ring-pink-500/40')}>
        <p className="text-xs font-bold tracking-wider text-zinc-500">FREE {!pro && '· YOUR PLAN'}</p>
        <p className="mt-2 text-3xl font-black text-zinc-900 dark:text-white">0 €</p>
        <ul className="mt-4 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          {['10,000 passports', 'Your live market map and tracking', 'Shop rewards and wallet', 'Campaigns: 5 cents per verified sale'].map((t) => <li key={t} className="flex gap-2"><ShieldCheck className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" aria-hidden />{t}</li>)}
        </ul>
      </div>
      <div className={cn('trace-hero text-white rounded-[28px] p-6 relative overflow-hidden', pro && 'ring-2 ring-fuchsia-400/60')}>
        <span aria-hidden className="passport-glow passport-glow-a" />
        <div className="relative">
          <p className="text-xs font-bold tracking-wider text-fuchsia-200 flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" aria-hidden />PRO {pro && '· YOUR PLAN'}</p>
          <p className="mt-2 text-3xl font-black">Market intelligence</p>
          <ul className="mt-4 space-y-1.5 text-sm text-zinc-200">
            {['1,000,000 passports', 'Your whole category on the map, city by city (anonymised, live)', 'Your share in each city and where you’re missing', 'Everything in Free'].map((t) => <li key={t} className="flex gap-2"><Sparkles className="w-4 h-4 text-fuchsia-300 shrink-0 mt-0.5" aria-hidden />{t}</li>)}
          </ul>
          {!pro && <Link href="/contact" className="btn-primary mt-5 inline-flex">Talk to us about PRO</Link>}
        </div>
      </div>
    </section>
  );
}

function BrandSettings({ brand, pro, onDone }: { brand: Brand; pro: boolean; onDone: () => void }) {
  const [f, setF] = useState({ name: brand.name, category: brand.category ?? '', color: brand.color ?? '#ec4899', logoUrl: brand.logoUrl ?? '', pointValue: String(brand.pointValue), currency: brand.currency, minCashout: String(brand.minCashout) });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await api.patch('/trace/brand', f); toast.success('Brand saved'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not save.')); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={(e) => void save(e)} className="panel p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Brand name</span><input required maxLength={80} value={f.name} onChange={set('name')} className="input mt-1" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Category{pro ? '' : ' (decides your market on PRO)'}</span><input list="trace-categories-2" maxLength={60} value={f.category} onChange={set('category')} className="input mt-1" /><datalist id="trace-categories-2">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Colour</span><input type="color" value={f.color} onChange={set('color')} className="input mt-1 h-10 p-1" /></label>
      <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Logo address (https)</span><input type="url" value={f.logoUrl} onChange={set('logoUrl')} className="input mt-1" placeholder="https://…" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">What 1 point is worth</span><input type="number" min={0} max={100} step={0.001} value={f.pointValue} onChange={set('pointValue')} className="input mt-1" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Currency</span><select value={f.currency} onChange={set('currency')} className="input mt-1">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Smallest cash-out (points)</span><input type="number" min={1} max={1000000} value={f.minCashout} onChange={set('minCashout')} className="input mt-1" /></label>
      <div className="sm:col-span-2 flex items-end justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
      </div>
    </form>
  );
}

function SuspectRow({ s, onChange }: { s: Overview['suspectList'][number]; onChange: () => void }) {
  const blocked = s.code.status === 'FLAGGED';
  const toggle = async () => {
    try {
      await api.post(`/trace/codes/${s.code.id}/flag`, { flagged: !blocked });
      toast.success(blocked ? 'Code unblocked' : 'Code blocked: every scan now says it may be a copy');
      onChange();
    } catch (e) { toast.error(errorMessage(e, 'Could not change the code.')); }
  };
  return (
    <li className="py-2.5 flex items-center gap-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-zinc-800 dark:text-zinc-100">{s.code.product.name} · <span className="font-mono text-xs">{s.code.label}</span></span>
        <span className="block font-mono text-[11px] text-zinc-500">first {s.code.firstPlace ?? 'unknown'} · now {s.place ?? 'unknown'} · {s.code.scanCount} checks</span>
      </span>
      <button type="button" onClick={() => void toggle()} className={cn('shrink-0 btn-sm', blocked ? 'btn-secondary' : 'btn-primary')}>{blocked ? 'Unblock' : 'Block code'}</button>
    </li>
  );
}

function ProductForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', category: '', description: '', story: '', imageUrl: '', rewardPoints: '10', warrantyMonths: '0' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/trace/products', f); toast.success('Product added. Now make a batch of codes.'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not add the product.')); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={(e) => void save(e)} className="panel p-5 grid sm:grid-cols-2 gap-3">
      <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Product name</span><input required maxLength={120} value={f.name} onChange={set('name')} className="input mt-1" placeholder="Cold-pressed olive oil, 500 ml" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Category</span><input maxLength={60} value={f.category} onChange={set('category')} className="input mt-1" placeholder="Food, auto parts, cosmetics…" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Photo address (https)</span><input type="url" value={f.imageUrl} onChange={set('imageUrl')} className="input mt-1" placeholder="https://…" /></label>
      <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">One line about it</span><input maxLength={2000} value={f.description} onChange={set('description')} className="input mt-1" /></label>
      <label className="block sm:col-span-2"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Its story (buyers read this after scanning)</span><textarea rows={3} maxLength={4000} value={f.story} onChange={set('story')} className="input mt-1 resize-y" placeholder="Where it comes from, who makes it, why it’s worth it." /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Points a shop earns per unit</span><input type="number" min={0} max={10000} value={f.rewardPoints} onChange={set('rewardPoints')} className="input mt-1" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Warranty (months, 0 for none)</span><input type="number" min={0} max={120} value={f.warrantyMonths} onChange={set('warrantyMonths')} className="input mt-1" /></label>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving || !f.name.trim()} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add product</button>
      </div>
    </form>
  );
}

function ProductCard({ p, onChange }: { p: Product; onChange: () => void }) {
  const [batchOpen, setBatchOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [b, setB] = useState({ quantity: '100', label: '', origin: '' });
  const [saving, setSaving] = useState(false);
  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ quantity: number }>(`/trace/products/${p.id}/batches`, b);
      toast.success(`${res.data.quantity.toLocaleString()} codes ready to print`);
      setBatchOpen(false); onChange();
    } catch (err) { toast.error(errorMessage(err, 'Could not make the batch.')); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm(p.sample ? 'Delete the sample product and all its sample scans, shipments and campaign?' : `Delete “${p.name}” and all its batches and scans? This can’t be undone.`)) return;
    try { await api.delete(`/trace/products/${p.id}`); toast.success(p.sample ? 'Sample removed' : 'Product deleted'); onChange(); }
    catch (err) { toast.error(errorMessage(err, 'Could not delete it.')); }
  };
  return (
    <article className="panel p-5">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Package className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-2">{p.name}{p.sample && <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-700 dark:text-pink-200"><Sparkles className="w-3 h-3" aria-hidden />sample</span>}</h3>
          <p className="text-xs text-zinc-500">{[p.category, `${p.rewardPoints} points per unit`, p.warrantyMonths ? `${p.warrantyMonths}-month warranty` : null, p.winOdds && p.winPrize ? `1 in ${p.winOdds.toLocaleString()} wins ${p.winPrize}` : null, p.maxTempC != null ? `kept at ${p.maxTempC} °C or colder` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{p._count.codes.toLocaleString()} scanned</span>
        <button type="button" onClick={() => setExtrasOpen((v) => !v)} aria-expanded={extrasOpen} aria-label={`Settings for ${p.name}`} title="Prize, cold chain and weight" className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-zinc-400 hover:text-pink-600 hover:bg-pink-500/10 transition-colors"><Settings2 className="w-4 h-4" /></button>
        <button type="button" onClick={() => void remove()} aria-label={`Delete ${p.name}`} title="Delete" className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-zinc-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
      </div>
      {extrasOpen && <ProductExtras p={p} onDone={() => { setExtrasOpen(false); onChange(); }} />}
      <ul className="mt-4 space-y-2">
        {p.batches.map((x) => <BatchRow key={x.id} batch={x} onChange={onChange} />)}
        {p.batches.length === 0 && <li className="text-sm text-zinc-500">No batches yet. Make one to get printable codes.</li>}
      </ul>
      {batchOpen ? (
        <form onSubmit={(e) => void make(e)} className="mt-3 grid grid-cols-2 gap-2">
          <label className="block"><span className="text-xs text-zinc-600 dark:text-zinc-300">How many units</span><input type="number" min={1} max={1000000} required value={b.quantity} onChange={(e) => setB({ ...b, quantity: e.target.value })} className="input mt-1" /></label>
          <label className="block"><span className="text-xs text-zinc-600 dark:text-zinc-300">Made in</span><input maxLength={160} value={b.origin} onChange={(e) => setB({ ...b, origin: e.target.value })} className="input mt-1" placeholder="City, country" /></label>
          <label className="block col-span-2"><span className="text-xs text-zinc-600 dark:text-zinc-300">Batch name (optional)</span><input maxLength={80} value={b.label} onChange={(e) => setB({ ...b, label: e.target.value })} className="input mt-1" placeholder="Harvest 2026 · press 3" /></label>
          <div className="col-span-2 flex justify-end gap-2"><button type="button" onClick={() => setBatchOpen(false)} className="btn-secondary btn-sm">Cancel</button><button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Make codes</button></div>
        </form>
      ) : (
        <button type="button" onClick={() => setBatchOpen(true)} className="mt-3 btn-secondary btn-sm"><Plus className="w-4 h-4" />New batch</button>
      )}
    </article>
  );
}

function BatchRow({ batch, onChange }: { batch: Batch; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [guard, setGuard] = useState(false);
  const [stage, setStage] = useState<Stage>('SHIPPED');
  const [place, setPlace] = useState('');
  const sample = async () => {
    try {
      const res = await api.get<{ codes: { code: string }[] }>(`/trace/batches/${batch.id}/codes?from=0&count=1`);
      if (res.data.codes[0]) window.open(`/t/${res.data.codes[0].code}`, '_blank', 'noopener');
    } catch (e) { toast.error(errorMessage(e, 'Could not open the passport.')); }
  };
  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post(`/trace/batches/${batch.id}/events`, { stage, place }); toast.success(`${STAGE_LABEL[stage]}${place ? `: ${place}` : ''}`); setOpen(false); setPlace(''); onChange(); }
    catch (err) { toast.error(errorMessage(err, 'Could not record it.')); }
  };
  return (
    <li className="rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{batch.label}</span>
          <span className="block font-mono text-[11px] text-zinc-500">{batch.quantity.toLocaleString()} units{batch.origin ? ` · made in ${batch.origin}` : ''} · <span className={cn(batch.status === 'IN_TRANSIT' && 'text-pink-600 dark:text-pink-300', batch.status === 'DELIVERED' && 'text-emerald-600 dark:text-emerald-400')}>{BATCH_STATUS[batch.status] ?? batch.status}{batch.destPlace && batch.status === 'IN_TRANSIT' ? ` → ${batch.destPlace}` : ''}</span></span>
        </span>
        <Link href={`/trace/print?batch=${batch.id}`} className="btn-secondary btn-sm"><Printer className="w-3.5 h-3.5" />Print codes</Link>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary btn-sm" aria-expanded={open}><MapPin className="w-3.5 h-3.5" />Record a stop</button>
        {batch.status === 'IN_TRANSIT' && <Link href="/trace/tracking" className="btn-secondary btn-sm" aria-label={`Track ${batch.label}`} title="Track it"><Truck className="w-3.5 h-3.5" /></Link>}
        <button type="button" onClick={() => setGuard((v) => !v)} className={cn('btn-secondary btn-sm', (batch.recall || batch.blockedAt) && 'text-rose-600 dark:text-rose-300')} aria-expanded={guard} aria-label={`Protect ${batch.label}`} title="Markets, block, recall"><ShieldAlert className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => void sample()} className="btn-secondary btn-sm" aria-label={`Open a passport from ${batch.label}`} title="Open a passport"><ExternalLink className="w-3.5 h-3.5" /></button>
      </div>
      {(batch.recall || batch.blockedAt || batch.allowedCountries) && (
        <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {batch.recall && <span className="rounded-full bg-rose-500/12 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-200">Recalled: {batch.recall.reason}</span>}
          {batch.blockedAt && <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 font-semibold text-zinc-700 dark:text-zinc-200">Blocked</span>}
          {batch.allowedCountries && <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 font-mono text-fuchsia-700 dark:text-fuchsia-200">sold in {batch.allowedCountries.split(',').join(' ')}</span>}
        </p>
      )}
      {guard && <BatchGuard batch={batch} onChange={onChange} />}
      {open && (
        <form onSubmit={(e) => void record(e)} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block"><span className="text-xs text-zinc-600 dark:text-zinc-300">Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="input mt-1">{STAGES.filter((s) => s !== 'MADE').map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
          </label>
          <label className="block flex-1 min-w-40"><span className="text-xs text-zinc-600 dark:text-zinc-300">Place</span><input value={place} maxLength={160} onChange={(e) => setPlace(e.target.value)} className="input mt-1" placeholder="Lyon warehouse" /></label>
          <button type="submit" className="btn-primary btn-sm"><MapPin className="w-3.5 h-3.5" />Record</button>
        </form>
      )}
    </li>
  );
}

/** A product's extras: an instant win on the first check, cold chain and weight (for each shipment's CO₂). */
function ProductExtras({ p, onDone }: { p: Product; onDone: () => void }) {
  const [f, setF] = useState({ winOdds: p.winOdds ? String(p.winOdds) : '', winPrize: p.winPrize ?? '', maxTempC: p.maxTempC != null ? String(p.maxTempC) : '', weightKg: String(p.weightKg ?? 1) });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await api.patch(`/trace/products/${p.id}`, f); toast.success('Saved'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Could not save.')); } finally { setSaving(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => void save(e)} className="mt-4 rounded-2xl bg-pink-500/[0.05] ring-1 ring-pink-500/15 p-4 grid sm:grid-cols-2 gap-3">
      <p className="sm:col-span-2 text-xs text-zinc-600 dark:text-zinc-300"><b>Instant win:</b> the first person to check a winning unit sees a prize and a code to claim it. Which units win is fixed when they’re made, so rescanning can’t cheat it.</p>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">One in how many units wins (empty for none)</span><input type="number" min={2} max={1000000} value={f.winOdds} onChange={set('winOdds')} className="input mt-1" placeholder="50" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">The prize</span><input maxLength={120} value={f.winPrize} onChange={set('winPrize')} className="input mt-1" placeholder="A free bottle" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Keep at or below (°C, empty if it doesn’t matter)</span><input type="number" step="0.1" min={-80} max={80} value={f.maxTempC} onChange={set('maxTempC')} className="input mt-1" placeholder="8" /></label>
      <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Weight of one unit (kg)</span><input type="number" step="0.001" min={0.001} value={f.weightKg} onChange={set('weightKg')} className="input mt-1" /></label>
      <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={onDone} className="btn-secondary btn-sm">Cancel</button><button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</button></div>
    </form>
  );
}

/** Protecting a batch: the countries it's sold to (checks elsewhere show on the Radar), blocking it, recalling it. */
function BatchGuard({ batch, onChange }: { batch: Batch; onChange: () => void }) {
  const [countries, setCountries] = useState(batch.allowedCountries?.split(',').join(' ') ?? '');
  const [recall, setRecall] = useState({ reason: '', advice: '', severity: 'HIGH' });
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (what: string, call: () => Promise<unknown>, done: string) => {
    setBusy(what);
    try { await call(); toast.success(done); onChange(); } catch (err) { toast.error(errorMessage(err, 'Could not save.')); } finally { setBusy(null); }
  };
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className="rounded-2xl bg-white dark:bg-white/[0.04] p-3 space-y-3">
        <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Sold only in (country codes, e.g. FR DE BE; empty for anywhere)</span>
          <span className="mt-1 flex gap-2"><input value={countries} onChange={(e) => setCountries(e.target.value.toUpperCase())} className="input flex-1 font-mono" placeholder="FR DE BE" />
          <button type="button" disabled={busy !== null} onClick={() => void run('c', () => api.patch(`/trace/batches/${batch.id}`, { allowedCountries: countries }), 'Markets saved: checks elsewhere show on the Radar')} className="btn-secondary btn-sm">{busy === 'c' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}</button></span>
        </label>
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs text-zinc-600 dark:text-zinc-300">{batch.blockedAt ? 'Blocked: passports warn it was reported stolen and it earns no points.' : 'Stolen or lost? Block it: passports warn buyers and it earns no points.'}</p>
          <button type="button" disabled={busy !== null} onClick={() => void run('b', () => api.patch(`/trace/batches/${batch.id}`, { blocked: !batch.blockedAt }), batch.blockedAt ? 'Batch unblocked' : 'Batch blocked')} className={cn('btn-sm', batch.blockedAt ? 'btn-secondary' : 'btn-primary')}>{busy === 'b' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : batch.blockedAt ? 'Unblock' : 'Block batch'}</button>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void run('r', () => api.post(`/trace/batches/${batch.id}/recall`, recall), 'Recall started: every passport of this batch shows it'); }} className="rounded-2xl bg-white dark:bg-white/[0.04] p-3 space-y-2">
        <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">{batch.recall ? `Recalled: ${batch.recall.reason} (end it on the Radar)` : 'Recall this batch'}</p>
        <input required maxLength={300} value={recall.reason} onChange={(e) => setRecall({ ...recall, reason: e.target.value })} className="input" placeholder="Why, in words a buyer understands" aria-label="Reason" />
        <input maxLength={500} value={recall.advice} onChange={(e) => setRecall({ ...recall, advice: e.target.value })} className="input" placeholder="What to do (return it for a refund…)" aria-label="Advice" />
        <div className="flex gap-2">
          <select value={recall.severity} onChange={(e) => setRecall({ ...recall, severity: e.target.value })} className="input flex-1" aria-label="How serious"><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical: stop using it</option></select>
          <button type="submit" disabled={busy !== null || !recall.reason.trim()} className="btn-primary btn-sm">{busy === 'r' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Start recall'}</button>
        </div>
      </form>
    </div>
  );
}
