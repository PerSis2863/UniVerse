'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { DPP_PARTS, dppScore, parseDpp, readDpp, type Dpp, type SupplyAnswer } from '@/lib/dpp';
import { cn } from '@/lib/utils';

// A product's EU Digital Product Passport in the Trace console (M108, src/server/trace-dpp.ts): its
// GTIN, the passport's parts with a checklist of what's missing, and requests to suppliers to fill in
// their material from a link. The server cleans everything again (parseDpp); this form keeps numbers
// as typed text until saving.

interface Req { id: string; supplier: string; asks: string; status: 'OPEN' | 'ANSWERED' | 'USED' | 'CLOSED'; answer: SupplyAnswer | null; answeredAt: string | null; expiresAt: string }
const label = 'text-xs font-medium text-zinc-600 dark:text-zinc-300';
const num = (v: number | null) => (v === null ? '' : String(v));

/** The form's own copy of a passport: every number as the text in its box. */
type Form = Omit<Dpp, 'carbonKg' | 'recycledContent' | 'recyclable' | 'durabilityYears' | 'repairScore' | 'spareYears' | 'certifications'> & {
  carbonKg: string; recycledContent: string; recyclable: string; durabilityYears: string; repairScore: string; spareYears: string; certifications: string;
};
const toForm = (d: Dpp): Form => ({ ...d, carbonKg: num(d.carbonKg), recycledContent: num(d.recycledContent), recyclable: num(d.recyclable), durabilityYears: num(d.durabilityYears), repairScore: num(d.repairScore), spareYears: num(d.spareYears), certifications: d.certifications.join(', ') });
const fromForm = (f: Form): Dpp => parseDpp({ ...f, certifications: f.certifications.split(',').map((x) => x.trim()).filter(Boolean) });

export function DppEditor({ product, onDone }: { product: { id: string; name: string; gtin?: string | null; dpp?: string | null }; onDone: () => void }) {
  const [gtin, setGtin] = useState(product.gtin ?? '');
  const [f, setF] = useState<Form>(() => toForm(readDpp(product.dpp)));
  const [saving, setSaving] = useState(false);
  const score = dppScore(fromForm(f), gtin.trim() || null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put<{ gtin: string | null; dpp: Dpp; score: ReturnType<typeof dppScore> }>(`/trace/products/${product.id}/dpp`, { gtin, dpp: fromForm(f) });
      setGtin(data.gtin ?? ''); setF(toForm(data.dpp));
      toast.success(`Passport saved: ${data.score.done} of ${data.score.of} parts filled in`);
      onDone();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the passport.')); } finally { setSaving(false); }
  };
  const row = 'grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1.4fr_1.4fr_auto] items-end';
  return (
    <div className="mt-4 rounded-2xl border border-[var(--card-border)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-zinc-900 dark:text-white">Digital Product Passport</h4>
          <p className="text-xs text-zinc-500 max-w-[60ch]">What the EU’s Ecodesign rules ask a product to tell buyers, shops, customs and recyclers. It shows on every unit’s page and at its GS1 address.</p>
        </div>
        <div className="text-end">
          <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white" data-no-motion>{score.done}<span className="text-sm text-zinc-500"> / {score.of}</span></p>
          <p className="text-[11px] text-zinc-500">parts filled in</p>
        </div>
      </div>
      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Passport checklist">
        {DPP_PARTS.map((p) => {
          const done = !score.missing.includes(p.label);
          return <li key={p.id} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', done ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300')}>{done ? '✓ ' : ''}{p.label}</li>;
        })}
      </ol>

      <form onSubmit={(e) => void save(e)} className="mt-5 space-y-6">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">The product and its maker</legend>
          <label className="block"><span className={label}>GTIN (the number under its barcode)</span><input value={gtin} onChange={(e) => setGtin(e.target.value)} inputMode="numeric" maxLength={18} className="input mt-1 font-mono" placeholder="05012345678900" /></label>
          <label className="block"><span className={label}>Made in (country)</span><input value={f.madeIn ?? ''} onChange={(e) => set('madeIn', e.target.value)} maxLength={80} className="input mt-1" placeholder="Portugal" /></label>
          <label className="block"><span className={label}>Maker’s legal name</span><input value={f.manufacturer.name ?? ''} onChange={(e) => set('manufacturer', { ...f.manufacturer, name: e.target.value })} maxLength={120} className="input mt-1" /></label>
          <label className="block"><span className={label}>Maker’s website</span><input type="url" value={f.manufacturer.website ?? ''} onChange={(e) => set('manufacturer', { ...f.manufacturer, website: e.target.value })} maxLength={500} className="input mt-1" placeholder="https://" /></label>
          <label className="block sm:col-span-2"><span className={label}>Maker’s address</span><input value={f.manufacturer.address ?? ''} onChange={(e) => set('manufacturer', { ...f.manufacturer, address: e.target.value })} maxLength={240} className="input mt-1" /></label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Materials</legend>
          {f.materials.map((m, i) => (
            <div key={i} className={row}>
              <label className="block"><span className={label}>Material</span><input value={m.name} onChange={(e) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={80} className="input mt-1" /></label>
              <label className="block"><span className={label}>Share %</span><input type="number" min={0} max={100} step="0.1" value={m.percent ?? ''} onChange={(e) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, percent: e.target.value === '' ? null : Number(e.target.value) } : x)))} className="input mt-1" /></label>
              <label className="block"><span className={label}>Recycled %</span><input type="number" min={0} max={100} step="0.1" value={m.recycled ?? ''} onChange={(e) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, recycled: e.target.value === '' ? null : Number(e.target.value) } : x)))} className="input mt-1" /></label>
              <label className="block"><span className={label}>From</span><input value={m.origin ?? ''} onChange={(e) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, origin: e.target.value } : x)))} maxLength={80} className="input mt-1" placeholder="Country" /></label>
              <label className="block"><span className={label}>Supplier</span><input value={m.supplier ?? ''} onChange={(e) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, supplier: e.target.value } : x)))} maxLength={120} className="input mt-1" /></label>
              <button type="button" onClick={() => set('materials', f.materials.filter((_, j) => j !== i))} aria-label={`Remove material ${m.name || i + 1}`} className="mb-1 w-9 h-9 grid place-items-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden /></button>
            </div>
          ))}
          {f.materials.length < 30 && <button type="button" onClick={() => set('materials', [...f.materials, { name: '', percent: null, recycled: null, origin: null, supplier: null }])} className="btn-secondary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add a material</button>}
        </fieldset>

        <fieldset className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Footprint and how long it lasts</legend>
          <label className="block"><span className={label}>kg CO₂e per unit</span><input type="number" min={0} step="0.001" value={f.carbonKg} onChange={(e) => set('carbonKg', e.target.value)} className="input mt-1" /></label>
          <label className="block col-span-2 sm:col-span-1"><span className={label}>Worked out with</span><input value={f.carbonMethod ?? ''} onChange={(e) => set('carbonMethod', e.target.value)} maxLength={60} className="input mt-1" placeholder="ISO 14067" /></label>
          <label className="block"><span className={label}>Recycled content %</span><input type="number" min={0} max={100} step="0.1" value={f.recycledContent} onChange={(e) => set('recycledContent', e.target.value)} className="input mt-1" /></label>
          <label className="block"><span className={label}>Recyclable %</span><input type="number" min={0} max={100} step="0.1" value={f.recyclable} onChange={(e) => set('recyclable', e.target.value)} className="input mt-1" /></label>
          <label className="block"><span className={label}>Lasts (years)</span><input type="number" min={0} max={100} step="0.5" value={f.durabilityYears} onChange={(e) => set('durabilityYears', e.target.value)} className="input mt-1" /></label>
          <label className="block"><span className={label}>Repair score (0–10)</span><input type="number" min={0} max={10} step="0.1" value={f.repairScore} onChange={(e) => set('repairScore', e.target.value)} className="input mt-1" /></label>
          <label className="block"><span className={label}>Spare parts (years)</span><input type="number" min={0} max={50} step="0.5" value={f.spareYears} onChange={(e) => set('spareYears', e.target.value)} className="input mt-1" /></label>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          {([['care', 'Care and use'], ['repair', 'How to repair it'], ['endOfLife', 'End of life: recycling or taking it back']] as const).map(([k, l]) => (
            <label key={k} className="block"><span className={label}>{l}</span><textarea rows={4} maxLength={1500} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} className="input mt-1 resize-y" /></label>
          ))}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Substances of concern</legend>
          {f.substances.map((x, i) => (
            <div key={i} className="grid gap-2 grid-cols-[2fr_1fr_1fr_auto] items-end">
              <label className="block"><span className={label}>Substance</span><input value={x.name} onChange={(e) => set('substances', f.substances.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} maxLength={120} className="input mt-1" /></label>
              <label className="block"><span className={label}>CAS number</span><input value={x.cas ?? ''} onChange={(e) => set('substances', f.substances.map((y, j) => (j === i ? { ...y, cas: e.target.value } : y)))} maxLength={20} className="input mt-1 font-mono" placeholder="117-81-7" /></label>
              <label className="block"><span className={label}>%</span><input type="number" min={0} max={100} step="0.001" value={x.percent ?? ''} onChange={(e) => set('substances', f.substances.map((y, j) => (j === i ? { ...y, percent: e.target.value === '' ? null : Number(e.target.value) } : y)))} className="input mt-1" /></label>
              <button type="button" onClick={() => set('substances', f.substances.filter((_, j) => j !== i))} aria-label={`Remove substance ${x.name || i + 1}`} className="mb-1 w-9 h-9 grid place-items-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => set('substances', [...f.substances, { name: '', cas: null, percent: null }])} className="btn-secondary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add a substance</button>
            {!f.substances.length && !/no substances of concern/i.test(f.certifications) && <button type="button" onClick={() => set('certifications', [f.certifications, 'No substances of concern (REACH)'].filter(Boolean).join(', '))} className="btn-secondary btn-sm">It has none</button>}
          </div>
        </fieldset>

        <label className="block"><span className={label}>Certifications (separated by commas)</span><input value={f.certifications} onChange={(e) => set('certifications', e.target.value)} maxLength={1200} className="input mt-1" placeholder="EU Ecolabel, GOTS, Fairtrade" /></label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Documents (declaration of conformity, certificates)</legend>
          {f.documents.map((d, i) => (
            <div key={i} className="grid gap-2 grid-cols-[1fr_1.4fr_auto] items-end">
              <label className="block"><span className={label}>Name</span><input value={d.title} onChange={(e) => set('documents', f.documents.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} maxLength={120} className="input mt-1" /></label>
              <label className="block"><span className={label}>Link</span><input type="url" value={d.url} onChange={(e) => set('documents', f.documents.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} maxLength={500} className="input mt-1" placeholder="https://" /></label>
              <button type="button" onClick={() => set('documents', f.documents.filter((_, j) => j !== i))} aria-label={`Remove document ${d.title || i + 1}`} className="mb-1 w-9 h-9 grid place-items-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden /></button>
            </div>
          ))}
          {f.documents.length < 20 && <button type="button" onClick={() => set('documents', [...f.documents, { title: '', url: '' }])} className="btn-secondary btn-sm"><Plus className="w-4 h-4" aria-hidden />Add a document</button>}
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {product.gtin && <a href={`/dpp?g=${product.gtin}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm me-auto"><ExternalLink className="w-4 h-4" aria-hidden />See it as buyers do</a>}
          <button type="button" onClick={onDone} className="btn-secondary btn-sm">Close</button>
          <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden />}Save the passport</button>
        </div>
      </form>

      <Suppliers productId={product.id} onUsed={(d) => setF(toForm(d))} />
    </div>
  );
}

/** Ask suppliers to describe their material from a link; add their answers to the passport. */
function Suppliers({ productId, onUsed }: { productId: string; onUsed: (d: Dpp) => void }) {
  const { data, mutate } = useSWR<Req[]>(`/trace/products/${productId}/supply`, fetcher);
  const [f, setF] = useState({ supplier: '', asks: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied: send it to your supplier'); } catch { toast.error('Could not copy. Select the link and copy it.'); }
  };
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('new');
    try {
      const { data: r } = await api.post<{ id: string; link: string }>(`/trace/products/${productId}/supply`, f);
      const url = `${window.location.origin}${r.link}`;
      setLink({ id: r.id, url }); setF({ supplier: '', asks: '' }); void mutate();
      void copy(url);
    } catch (err) { toast.error(errorMessage(err, 'Could not make the link.')); } finally { setBusy(null); }
  };
  const act = async (r: Req, what: 'link' | 'use' | 'close') => {
    setBusy(r.id + what);
    try {
      const { data: out } = await api.post<{ link?: string; dpp?: Dpp }>(`/trace/supply/${r.id}/${what}`);
      if (what === 'link' && out.link) { const url = `${window.location.origin}${out.link}`; setLink({ id: r.id, url }); void copy(url); }
      if (what === 'use' && out.dpp) { onUsed(out.dpp); toast.success('Added to the passport'); }
      if (what === 'close') toast('Closed: the link no longer works');
      void mutate();
    } catch (err) { toast.error(errorMessage(err, 'Could not do that.')); } finally { setBusy(null); }
  };
  const STATUS: Record<Req['status'], string> = { OPEN: 'Waiting for them', ANSWERED: 'Answered', USED: 'In the passport', CLOSED: 'Closed' };
  return (
    <section className="mt-6 border-t border-[var(--card-border)] pt-5" aria-labelledby={`sup-${productId}`}>
      <h4 id={`sup-${productId}`} className="font-bold text-zinc-900 dark:text-white">Ask your suppliers</h4>
      <p className="text-xs text-zinc-500 max-w-[65ch]">Send a supplier a link to describe their material: where it comes from, its recycled share, footprint and certificates. They need no account; you check their answer before it goes in.</p>
      <form onSubmit={(e) => void ask(e)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
        <label className="block"><span className={label}>Supplier</span><input required maxLength={120} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} className="input mt-1" placeholder="Vidrios del Sur" /></label>
        <label className="block"><span className={label}>Which material or part</span><input required maxLength={200} value={f.asks} onChange={(e) => setF({ ...f, asks: e.target.value })} className="input mt-1" placeholder="Glass bottle 500 ml" /></label>
        <button type="submit" disabled={busy === 'new'} className="btn-primary btn-sm mb-0.5">{busy === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden />}Make a link</button>
      </form>
      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3">
          <code className="min-w-0 flex-1 truncate text-xs" title={link.url}>{link.url}</code>
          <button type="button" onClick={() => void copy(link.url)} className="btn-secondary btn-sm"><Copy className="w-4 h-4" aria-hidden />Copy</button>
          <button type="button" onClick={() => setLink(null)} aria-label="Hide the link" className="w-8 h-8 grid place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X className="w-4 h-4" aria-hidden /></button>
          <p className="basis-full text-[11px] text-zinc-500">Shown this once. Lost it? Make a new link from the request below.</p>
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {(data ?? []).map((r) => (
          <li key={r.id} className="rounded-xl border border-[var(--card-border)] p-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{r.supplier}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-300">· {r.asks}</span>
              <span className={cn('ms-auto text-xs font-semibold', r.status === 'ANSWERED' ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500')}>{STATUS[r.status]}</span>
            </div>
            {r.answer && (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{[r.answer.material.name, r.answer.material.origin && `from ${r.answer.material.origin}`, r.answer.material.recycled !== null && `${r.answer.material.recycled}% recycled`, r.answer.carbonKg !== null && `${r.answer.carbonKg} kg CO₂e`, r.answer.certifications.join(', ')].filter(Boolean).join(' · ')}{r.answer.note ? ` · “${r.answer.note}”` : ''}</p>
            )}
            {(r.status === 'OPEN' || r.status === 'ANSWERED') && (
              <div className="mt-2 flex flex-wrap gap-2">
                {r.status === 'ANSWERED' && <button type="button" disabled={!!busy} onClick={() => void act(r, 'use')} className="btn-primary btn-sm">{busy === r.id + 'use' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden />}Add to the passport</button>}
                <button type="button" disabled={!!busy} onClick={() => void act(r, 'link')} className="btn-secondary btn-sm">New link</button>
                <button type="button" disabled={!!busy} onClick={() => void act(r, 'close')} className="btn-secondary btn-sm">Close</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
