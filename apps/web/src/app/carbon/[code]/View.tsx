'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Bike, Check, History, ShieldAlert, ShieldCheck, Truck } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';
import { BizReport, type Report } from '@/components/green/business/BizReport';
import { usePathParams } from '@/hooks/usePathParams';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { commuteKgYear } from '@/lib/carbon-ledger';
import { useAuthStore } from '@/store/auth';

// M271–M274: Green → Business's share links, one page for three: a supplier sends its own emissions (no account),
// staff answer the commute survey (signed in: counted once and joined with their own Green), and an auditor reads the
// report and the whole change log. The code in the address is the key; nothing here shows an email or a phone.

type Link_ =
  | { kind: 'supplier'; org: string; supplier: string; year: number; answered: boolean; answer: { scope1: number; scope2: number; scope3: number | null; revenue: number; currency: string; method: string | null } | null; currencies: string[] }
  | { kind: 'survey'; org: string; year: number; modes: { id: string; label: string }[] }
  | { kind: 'audit'; report: Report; whole: boolean; log: { action: string; detail: string; hash: string; prevHash: string; createdAt: string }[] };
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';
const label = 'block text-xs font-semibold text-zinc-600 dark:text-zinc-300';

export default function View() {
  const code = usePathParams('/carbon/[code]')?.code;
  const { data, error, mutate } = useSWR<Link_>(code ? `/green/link/${encodeURIComponent(code)}` : null, fetcher, { shouldRetryOnError: false });
  return (
    <main className="min-h-[100dvh] overflow-x-hidden px-4 py-8 sm:py-12" style={{ backgroundColor: 'var(--background)' }}>
      <div className={data?.kind === 'audit' ? 'mx-auto max-w-5xl' : 'mx-auto max-w-xl'}>
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-white"><LogoMark className="h-7 w-7" />UniVerse Green</Link>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Carbon footprint</span>
        </header>
        <div className="mt-8">
          {error ? <p className="panel p-6 text-sm text-zinc-700 dark:text-zinc-200">{errorMessage(error, 'This link isn’t working any more. Ask whoever sent it for a new one.')}</p>
            : !data || !code ? <div className="h-80 rounded-[var(--radius-card)] skeleton" aria-busy="true" />
            : data.kind === 'supplier' ? <SupplierForm code={code} data={data} onDone={() => void mutate()} />
            : data.kind === 'survey' ? <Survey code={code} data={data} />
            : <Auditor data={data} />}
        </div>
      </div>
    </main>
  );
}

function SupplierForm({ code, data, onDone }: { code: string; data: Extract<Link_, { kind: 'supplier' }>; onDone: () => void }) {
  const a = data.answer;
  const [f, setF] = useState({ scope1: String(a?.scope1 ?? ''), scope2: String(a?.scope2 ?? ''), scope3: String(a?.scope3 ?? ''), revenue: String(a?.revenue ?? ''), currency: a?.currency ?? 'INR', method: a?.method ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/green/link/${encodeURIComponent(code)}`, f); toast.success('Sent. Thank you.'); onDone(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t send that.')); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void send(e)} className="panel space-y-4 p-6" aria-labelledby="sup-h">
      <div>
        <h1 id="sup-h" className="flex items-center gap-2 text-2xl font-semibold text-zinc-900 dark:text-white"><Truck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />Your emissions for {data.year}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><strong translate="no">{data.org}</strong> is measuring its carbon footprint and asks <strong translate="no">{data.supplier}</strong> for its own figures. They count their share by what they spent with you; they see only these numbers.</p>
        {data.answered && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" aria-hidden />Sent. You can correct it below.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Scope 1, tonnes CO₂e (fuel you burn)<input required type="number" min={0} step="any" inputMode="decimal" value={f.scope1} onChange={set('scope1')} className={field} /></label>
        <label className={label}>Scope 2, tonnes CO₂e (electricity you buy)<input required type="number" min={0} step="any" inputMode="decimal" value={f.scope2} onChange={set('scope2')} className={field} /></label>
        <label className={label}>Scope 3, tonnes CO₂e (if you have it)<input type="number" min={0} step="any" inputMode="decimal" value={f.scope3} onChange={set('scope3')} className={field} /></label>
        <div className="grid grid-cols-[1fr_6.5rem] gap-2">
          <label className={label}>Total revenue for {data.year}<input required type="number" min={1} step="any" inputMode="decimal" value={f.revenue} onChange={set('revenue')} className={field} /></label>
          <label className={label}>Currency<select value={f.currency} onChange={set('currency')} className={field}>{data.currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className={`${label} sm:col-span-2`}>How you measured it (optional)<input maxLength={160} value={f.method} onChange={set('method')} placeholder="e.g. GHG Protocol, verified by …" className={field} /></label>
      </div>
      <button type="submit" disabled={busy} className="btn-primary">{data.answered ? 'Send the correction' : 'Send'}</button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Don’t know your footprint yet? <Link href="/green?view=business" className="font-semibold underline">Measure it on UniVerse Green</Link>, then come back.</p>
    </form>
  );
}

function Survey({ code, data }: { code: string; data: Extract<Link_, { kind: 'survey' }> }) {
  const signedIn = !!useAuthStore((s) => s.user);
  const [f, setF] = useState({ mode: 'car', kmOneWay: '', daysWeek: '5' });
  const [sent, setSent] = useState<number | null>(null);
  const kg = commuteKgYear(f.mode, Number(f.kmOneWay) || 0, Number(f.daysWeek) || 0);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    try { const r = await api.post<{ kgYear: number }>(`/green/link/${encodeURIComponent(code)}${signedIn ? '/me' : ''}`, { mode: f.mode, kmOneWay: Number(f.kmOneWay), daysWeek: Number(f.daysWeek) }); setSent(r.data.kgYear); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t send that.')); }
  };
  if (sent !== null) return (
    <section className="panel p-6 text-center">
      <Check className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
      <h1 className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-white">Thank you</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Your commute is about {Math.round(sent).toLocaleString()} kg CO₂ a year. <Link href="/green" className="font-semibold text-emerald-700 underline dark:text-emerald-300">Cut yours with UniVerse Green</Link>.</p>
    </section>
  );
  return (
    <form onSubmit={(e) => void send(e)} className="panel space-y-4 p-6" aria-labelledby="sv-h">
      <div>
        <h1 id="sv-h" className="flex items-center gap-2 text-2xl font-semibold text-zinc-900 dark:text-white"><Bike className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />How do you get to work?</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><strong translate="no">{data.org}</strong> is measuring its carbon footprint. Three questions, nothing about who you are{signedIn ? ' (signed in, you’re counted once and can change your answer)' : ''}.</p>
      </div>
      <label className={label}>Mostly by<select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className={field}>{data.modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Distance one way, km<input required type="number" min={0} max={300} step="any" inputMode="decimal" value={f.kmOneWay} onChange={(e) => setF({ ...f, kmOneWay: e.target.value })} className={field} /></label>
        <label className={label}>Days a week<input required type="number" min={0} max={7} step="0.5" inputMode="decimal" value={f.daysWeek} onChange={(e) => setF({ ...f, daysWeek: e.target.value })} className={field} /></label>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">About <strong className="tabular-nums text-zinc-900 dark:text-white">{Math.round(kg).toLocaleString()} kg</strong> CO₂ a year.</p>
      <button type="submit" className="btn-primary">Send</button>
    </form>
  );
}

function Auditor({ data }: { data: Extract<Link_, { kind: 'audit' }> }) {
  return (
    <div className="space-y-6">
      <BizReport report={data.report} />
      <section className="panel p-0 overflow-hidden" aria-labelledby="au-log">
        <div className="px-5 pt-5">
          <h2 id="au-log" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Change log</h2>
          <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${data.whole ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>{data.whole ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <ShieldAlert className="h-4 w-4" aria-hidden />}{data.whole ? 'Whole: every row’s SHA-256 fingerprint covers the row before it.' : 'A row doesn’t match its fingerprint.'}</p>
        </div>
        <ol className="mt-3 divide-y divide-[var(--hairline)]" data-no-motion>
          {data.log.map((r) => (
            <li key={r.hash} className="px-5 py-2.5 text-sm">
              <p className="text-zinc-900 dark:text-white">{r.detail}</p>
              <p className="mt-0.5 break-all text-xs text-zinc-500 dark:text-zinc-400">{new Date(r.createdAt).toLocaleString()} · <span className="font-mono">{r.hash.slice(0, 16)}</span> ← <span className="font-mono">{r.prevHash.slice(0, 16)}</span></p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
