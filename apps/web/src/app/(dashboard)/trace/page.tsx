'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Ban, ExternalLink, Gift, Loader2, MapPin, Package, Plus, Printer, ScanLine, ShieldCheck, Sparkles, Truck, Wand2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Facts, HeatStrip, Meter, Ring, Spark, Stack } from '@/components/instruments/parts';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';
import { useNow } from '@/lib/use-now';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/trace';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// UniVerse Trace, the brand's side (the owner, 24 Oct 2026: "something unique and different and
// bold"): every product gets a passport. Add a product, make a batch (one signed code per unit),
// print the codes, record where the batch goes, and watch every scan live: genuine checks, likely
// copies, where products really end up and the points shops earn. Everyone who isn't an admin sees
// their own points from scanning (Scan & earn). Server: src/server/trace.ts.

interface Batch { id: string; label: string; quantity: number; origin: string | null; madeAt: string | null; createdAt: string }
interface Product { id: string; name: string; sku: string | null; category: string | null; description: string | null; story: string | null; rewardPoints: number; warrantyMonths: number; batches: Batch[]; _count: { codes: number } }
interface Overview {
  days: number; products: number; batches: number; units: number; scanned: number; claimed: number; points: number;
  scans: number[]; suspect: number[]; first: number; seen: number; suspects: number;
  places: { place: string; scans: number }[];
  recent: { id: string; verdict: string; place: string | null; createdAt: string; code: { id: string; label: string; serial: number; product: { name: string }; batch: { label: string } } }[];
  suspectList: { id: string; place: string | null; createdAt: string; code: { id: string; label: string; status: string; firstPlace: string | null; scanCount: number; product: { name: string } } }[];
}

const VERDICT: Record<string, { label: string; cls: string }> = {
  FIRST: { label: 'Genuine · first check', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  SEEN: { label: 'Genuine · checked again', cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  SUSPECT: { label: 'Likely copy', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
};

export default function TracePage() {
  const admin = useAuthStore((s) => s.user?.role === 'ADMIN' || s.user?.owner === true);
  return (
    <>
      <Topbar title="Trace" subtitle={admin ? 'Every product gets a passport: genuine checks, where it goes, rewards for shops' : 'Scan products, prove they’re genuine, earn points'} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">{admin ? <BrandConsole /> : <ScanAndEarn />}</div>
      </div>
    </>
  );
}

function BrandConsole() {
  const poll = useActivePoll(30_000);
  const now = useNow();
  const { data: products, mutate: reloadProducts } = useSWR<Product[]>('/trace/products', fetcher);
  const { data: ov, mutate: reloadOverview } = useSWR<Overview>('/trace/overview?days=30', fetcher, { refreshInterval: poll });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const reload = () => { void reloadProducts(); void reloadOverview(); };

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

  if (products.length === 0 && !adding) {
    return (
      <section className="trace-hero relative overflow-hidden rounded-[32px] p-8 sm:p-12 text-white">
        <span aria-hidden className="passport-glow passport-glow-a" />
        <div className="relative max-w-2xl">
          <span className="passport-pill">UniVerse Trace</span>
          <h2 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">Every product gets a passport.</h2>
          <p className="mt-4 text-lg text-zinc-300">One code on each unit. Buyers scan it and see it’s genuine. Shops scan it and earn points. You see where every product really goes, and catch copied labels the moment they appear.</p>
          <ol className="mt-6 grid sm:grid-cols-3 gap-3 text-sm">
            {[['1', 'Add a product', 'Its name, story and the points a shop earns.'], ['2', 'Print the codes', 'One signed code per unit: nobody can guess or forge one.'], ['3', 'Watch it live', 'Every scan, where it happened, and every likely copy.']].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl bg-white/[0.06] p-4"><span className="font-mono text-pink-300">{n}</span><p className="mt-1 font-bold">{t}</p><p className="text-zinc-300">{d}</p></li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={() => void tryDemo()} disabled={busy} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Try it with a sample product</button>
            <button type="button" onClick={() => setAdding(true)} className="btn-secondary"><Plus className="w-4 h-4" />Add your first product</button>
          </div>
        </div>
      </section>
    );
  }

  const total = ov.first + ov.seen + ov.suspects;
  const genuinePct = total ? ((ov.first + ov.seen) / total) * 100 : 100;
  const labels = ov.scans.map((_, i) => (now ? new Date(now - (ov.days - 1 - i) * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''));
  const cells: InstrumentCell[] = [
    { id: 'scans', label: 'Scans · 30 days', value: total, unit: 'scans', note: `${ov.scans.at(-1) ?? 0} today`, body: <Spark values={ov.scans} />,
      detail: { title: 'Scans per day', description: 'Every time someone checked one of your products.', series: ov.scans, labels } },
    { id: 'genuine', label: 'Genuine', value: Math.round(genuinePct * 10) / 10, unit: '%', note: `${ov.first} first checks · ${ov.seen} re-checks`,
      body: <span className="flex justify-center"><Ring pct={Math.round(genuinePct * 10) / 10} label="genuine" size={104} /></span> },
    { id: 'copies', label: 'Likely copies', value: ov.suspects, unit: 'scans', warn: ov.suspects > 0, note: ov.suspects ? 'labels seen far from their first check' : 'none: every label checks out',
      body: <HeatStrip rows={[{ label: 'copies', values: ov.suspect.slice(-30) }, { label: 'scans', values: ov.scans.slice(-30) }]} foot={[labels[0] ?? '', 'today']} />,
      detail: { title: 'Likely copies per day', description: 'Scans of a code far from where it was first checked, or checked too often.', series: ov.suspect, labels, threshold: 1 } },
    { id: 'units', label: 'Units with a passport', value: ov.units, unit: 'units', note: `${ov.scanned.toLocaleString()} scanned at least once`, body: <Meter pct={ov.units ? (ov.scanned / ov.units) * 100 : 0} /> },
    { id: 'points', label: 'Points earned by shops', value: ov.points, unit: 'points', note: `${ov.claimed} units claimed`, body: <Stack a={ov.scans.map((n, i) => n - (ov.suspect[i] ?? 0))} b={ov.suspect} /> },
    { id: 'places', label: 'Where it’s scanned', value: ov.places.length, unit: 'places', body: ov.places.length ? <Facts rows={ov.places.map((p) => [p.place, String(p.scans)] as [string, string])} /> : <p className="text-sm text-zinc-500">No scans yet.</p> },
  ];

  return (
    <>
      <InstrumentBoard icon={ScanLine} title="Trace live" subtitle={`${ov.products} products · ${ov.batches} batches · last 30 days`} cells={cells} storageKey="trace-live" />

      <section aria-labelledby="products-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="products-h" className="text-lg font-bold text-zinc-900 dark:text-white">Products</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => void tryDemo()} disabled={busy} className="btn-secondary btn-sm"><Wand2 className="w-4 h-4" />Sample product</button>
            <button type="button" onClick={() => setAdding((v) => !v)} className="btn-primary btn-sm"><Plus className="w-4 h-4" />New product</button>
          </div>
        </div>
        {adding && <ProductForm onDone={() => { setAdding(false); reload(); }} />}
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
    </>
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
  return (
    <article className="panel p-5">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Package className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-zinc-900 dark:text-white truncate">{p.name}</h3>
          <p className="text-xs text-zinc-500">{[p.category, `${p.rewardPoints} points per unit`, p.warrantyMonths ? `${p.warrantyMonths}-month warranty` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{p._count.codes.toLocaleString()} scanned</span>
      </div>
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
          <span className="block font-mono text-[11px] text-zinc-500">{batch.quantity.toLocaleString()} units{batch.origin ? ` · made in ${batch.origin}` : ''}</span>
        </span>
        <Link href={`/trace/print?batch=${batch.id}`} className="btn-secondary btn-sm"><Printer className="w-3.5 h-3.5" />Print codes</Link>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary btn-sm" aria-expanded={open}><Truck className="w-3.5 h-3.5" />Where is it?</button>
        <button type="button" onClick={() => void sample()} className="btn-secondary btn-sm" aria-label={`Open a passport from ${batch.label}`} title="Open a passport"><ExternalLink className="w-3.5 h-3.5" /></button>
      </div>
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

function ScanAndEarn() {
  const { data } = useSWR<{ balance: number; claims: { code: string; at: string; product: string; points: number }[] }>('/trace/me', fetcher);
  return (
    <>
      <section className="trace-hero relative overflow-hidden rounded-[32px] p-8 text-white">
        <span aria-hidden className="passport-glow passport-glow-a" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-60">
            <span className="passport-pill">Scan &amp; earn</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">Scan a product. Prove it’s real. Get points.</h2>
            <p className="mt-2 text-zinc-300">Point your phone’s camera at the code on a product. You’ll see if it’s genuine, and if you sell or install it, you earn the brand’s points.</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-6xl font-light tabular-nums">{data ? data.balance.toLocaleString() : '…'}</p>
            <p className="text-sm text-zinc-300 inline-flex items-center gap-1.5"><Gift className="w-4 h-4 text-pink-300" />your points</p>
          </div>
        </div>
      </section>
      <section className="panel p-5">
        <h2 className="font-bold text-zinc-900 dark:text-white">Products you scanned</h2>
        {!data ? <div className="mt-3 h-20 skeleton rounded-xl" /> : data.claims.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Nothing yet. Your first scan shows here.</p> : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {data.claims.map((c) => (
              <li key={c.code} className="py-2.5 flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{c.product} <span className="font-mono text-[11px] text-zinc-500">{c.code}</span></span>
                <span className="shrink-0 font-semibold text-zinc-900 dark:text-white">+{c.points}</span>
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">{formatDistanceToNow(new Date(c.at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
