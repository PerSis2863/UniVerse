'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Plus, Send } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import type { SupplyAnswer } from '@/lib/dpp';

// A supplier answers a brand's request (M108, src/server/trace-dpp.ts): one material or part of a
// product's Digital Product Passport, where it comes from, its recycled share, footprint and
// certificates. No account; the link's secret (?k=) is checked on the server, and the brand reviews
// the answer before it reaches the passport. The supplier can correct it until then.

interface Ask { brand: string; product: string; category: string | null; supplier: string; asks: string; answer: SupplyAnswer | null; expiresAt: string }
const label = 'text-xs font-medium text-zinc-300';

function Form({ k, ask }: { k: string; ask: Ask }) {
  const a = ask.answer;
  const [f, setF] = useState({
    name: a?.material.name ?? ask.asks, percent: a?.material.percent?.toString() ?? '', recycled: a?.material.recycled?.toString() ?? '', origin: a?.material.origin ?? '',
    supplier: a?.material.supplier ?? ask.supplier, carbonKg: a?.carbonKg?.toString() ?? '', certifications: a?.certifications.join(', ') ?? '', note: a?.note ?? '',
    docs: a?.documents.length ? a.documents.map((d) => ({ ...d })) : [{ title: '', url: '' }],
  });
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/trace/supplier', { k, answer: {
        material: { name: f.name, percent: f.percent, recycled: f.recycled, origin: f.origin, supplier: f.supplier },
        carbonKg: f.carbonKg, certifications: f.certifications.split(',').map((x) => x.trim()).filter(Boolean), documents: f.docs.filter((d) => d.title.trim() && d.url.trim()), note: f.note,
      } });
      setSent(true);
      toast.success('Sent. Thank you!');
    } catch (err) { toast.error(errorMessage(err, 'Could not send it.')); } finally { setSaving(false); }
  };
  if (sent) return (
    <section className="passport-card mt-6 p-6 text-center pp-rise" aria-live="polite">
      <CheckCircle2 className="mx-auto w-10 h-10 text-emerald-300" aria-hidden />
      <h2 className="mt-3 text-xl font-bold">Thank you</h2>
      <p className="mt-1 text-sm text-zinc-300">{ask.brand} will check it and add it to the passport of {ask.product}. You can open this link again to correct it until they do.</p>
      <button type="button" onClick={() => setSent(false)} className="mt-4 text-sm font-semibold text-pink-200 underline underline-offset-2">Change my answer</button>
    </section>
  );
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [key]: e.target.value });
  return (
    <form onSubmit={(e) => void send(e)} className="passport-card mt-6 p-5 pp-rise space-y-3">
      <label className="block"><span className={label}>Material or part</span><input required maxLength={80} value={f.name} onChange={set('name')} className="input mt-1" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Where it’s made or grown</span><input maxLength={80} value={f.origin} onChange={set('origin')} className="input mt-1" placeholder="Jaén, Spain" /></label>
        <label className="block"><span className={label}>Made by</span><input maxLength={120} value={f.supplier} onChange={set('supplier')} className="input mt-1" /></label>
        <label className="block"><span className={label}>Share of the product (%)</span><input type="number" min={0} max={100} step="0.1" value={f.percent} onChange={set('percent')} className="input mt-1" /></label>
        <label className="block"><span className={label}>Recycled content (%)</span><input type="number" min={0} max={100} step="0.1" value={f.recycled} onChange={set('recycled')} className="input mt-1" /></label>
        <label className="block col-span-2"><span className={label}>Carbon footprint, kg CO₂e per product (if you know it)</span><input type="number" min={0} step="0.001" value={f.carbonKg} onChange={set('carbonKg')} className="input mt-1" /></label>
      </div>
      <label className="block"><span className={label}>Certifications (separated by commas)</span><input maxLength={400} value={f.certifications} onChange={set('certifications')} className="input mt-1" placeholder="GOTS, Fairtrade, FSC" /></label>
      <fieldset className="space-y-2">
        <legend className={label}>Certificates or test reports (links starting with https://)</legend>
        {f.docs.map((d, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input aria-label={`Document ${i + 1} name`} maxLength={120} value={d.title} onChange={(e) => setF({ ...f, docs: f.docs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className="input" placeholder="FSC certificate" />
            <input aria-label={`Document ${i + 1} link`} type="url" maxLength={500} value={d.url} onChange={(e) => setF({ ...f, docs: f.docs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className="input" placeholder="https://" />
          </div>
        ))}
        {f.docs.length < 5 && <button type="button" onClick={() => setF({ ...f, docs: [...f.docs, { title: '', url: '' }] })} className="text-sm font-semibold text-pink-200 inline-flex items-center gap-1"><Plus className="w-4 h-4" aria-hidden />Another document</button>}
      </fieldset>
      <label className="block"><span className={label}>Anything else (optional)</span><textarea rows={3} maxLength={600} value={f.note} onChange={set('note')} className="input mt-1 resize-y" /></label>
      <button type="submit" disabled={saving || !f.name.trim()} className="btn-primary w-full justify-center">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden />}Send to {ask.brand}</button>
    </form>
  );
}

function View() {
  const k = useSearchParams().get('k') ?? '';
  const { data, error } = useSWR<Ask>(k ? `/trace/supplier?k=${encodeURIComponent(k)}` : null, fetcher, { revalidateOnFocus: false });
  return (
    <main className="dark passport min-h-[100dvh] relative overflow-hidden text-white">
      <span aria-hidden className="passport-glow passport-glow-a" /><span aria-hidden className="passport-glow passport-glow-b" />
      <div className="relative max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 min-w-0"><LogoMark className="w-7 h-7" /><span className="font-semibold truncate">{data?.brand ?? 'UniVerse Trace'}</span></span>
          <span className="passport-pill">For a supplier</span>
        </header>
        {!k || error ? (
          <p className="mt-24 text-center text-zinc-300">{errorMessage(error, 'This link has ended. Ask the brand for a new one.')}</p>
        ) : !data ? (
          <div className="mt-24 flex flex-col items-center gap-3" role="status"><Loader2 className="w-8 h-8 animate-spin text-pink-300" /><p className="text-zinc-300">Opening…</p></div>
        ) : (
          <>
            <h1 className="mt-8 text-2xl font-black leading-tight">{data.brand} asks about <span translate="no">{data.asks}</span></h1>
            <p className="mt-2 text-sm text-zinc-300 max-w-[60ch]">For the Digital Product Passport of <span translate="no">{data.product}</span>: buyers, shops, customs and recyclers can read where its materials come from. {data.brand} checks your answer before it’s shown. The link works until {new Date(data.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
            <Form k={k} ask={data} />
          </>
        )}
      </div>
    </main>
  );
}

export default function SupplyPage() {
  return <Suspense><View /></Suspense>;
}
