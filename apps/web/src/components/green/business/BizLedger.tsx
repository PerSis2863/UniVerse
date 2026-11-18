'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { FileSpreadsheet, ListPlus, Pencil, Receipt, Trash2, X } from 'lucide-react';
import { FileDrop } from '@/components/ui/FileDrop';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { categoryById, factorFor, kgFor } from '@/lib/carbon-ledger';
import { guessCategory, guessPeriod, num, parseCsv } from '@/lib/carbon-import';
import { MONTHS, catLabel, canEdit, field, groups, h3, icon, kgText, label, monthName, muted, tonnes, unitText, type Entry, type SectionProps } from './shared';

// Green → Business → Ledger (M269, M270): the year's lines by month, each with its factor and where it comes from;
// add or change a line; import a spreadsheet (columns matched, lines sorted into categories, checked before anything
// is saved); or let AI read a bill (a photo, a PDF or its text) into lines a person checks first.

type Draft = { category: string; period: string; quantity: string; factor: string; factorSource: string; note: string };
type Row = { category: string | null; period: string | null; quantity: number | null; note: string | null };
const blank = (year: number): Draft => ({ category: 'electricity', period: `${year}-${String(Math.min(12, new Date().getMonth() + 1)).padStart(2, '0')}`, quantity: '', factor: '', factorSource: '', note: '' });

export function BizLedger({ org, role, year, onChanged }: SectionProps) {
  const key = `/green/biz/${org.id}/entries?year=${year}`;
  const { data, mutate } = useSWR<{ entries: Entry[] }>(key, fetcher);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rows, setRows] = useState<{ rows: Row[]; source: 'import' | 'ai' } | null>(null);
  const edit = canEdit(role);
  const refresh = () => { void mutate(); onChanged(); };
  const byMonth = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of data?.entries ?? []) m.set(e.period, [...(m.get(e.period) ?? []), e]);
    return [...m];
  }, [data]);

  const save = async () => {
    if (!draft) return;
    const body = { ...draft, factor: draft.factor === '' ? null : Number(draft.factor) };
    try {
      if (editing) await api.put(`/green/biz/${org.id}/entries/${editing}`, body); else await api.post(`/green/biz/${org.id}/entries`, body);
      toast.success(editing ? 'Line changed.' : 'Line added.'); setDraft(null); setEditing(null); refresh();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that line.')); }
  };
  const remove = async (e: Entry) => {
    if (!confirm(`Remove ${catLabel(e.category)}, ${monthName(e.period)}?`)) return;
    try { await api.delete(`/green/biz/${org.id}/entries/${e.id}`); refresh(); } catch (err) { toast.error(errorMessage(err, 'Couldn’t remove it.')); }
  };

  return (
    <div className="space-y-6">
      {edit && !draft && !rows && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => { setEditing(null); setDraft(blank(year)); }}><ListPlus className="h-4 w-4" aria-hidden />Add a line</button>
          <Importer org={org} year={year} onRows={(r) => setRows({ rows: r, source: 'import' })} />
          <BillReader orgId={org.id} onRows={(r) => setRows({ rows: r, source: 'ai' })} />
        </div>
      )}
      {draft && <LineForm org={org} year={year} draft={draft} setDraft={setDraft} editing={!!editing} onSave={() => void save()} onCancel={() => { setDraft(null); setEditing(null); }} />}
      {rows && <Preview org={org} year={year} rows={rows.rows} source={rows.source} onDone={() => { setRows(null); refresh(); }} onCancel={() => setRows(null)} />}

      {!data ? <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-zinc-200/60 dark:bg-white/[0.05]" /> : !data.entries.length ? (
        <p className={`panel p-5 ${muted}`}>No lines for {year} yet.{edit ? ' Add one, import a spreadsheet, or let AI read a bill.' : ''}</p>
      ) : byMonth.map(([period, list]) => (
        <section key={period} className="panel p-0 overflow-hidden" aria-label={monthName(period)}>
          <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3">
            <h3 className="font-semibold text-zinc-900 dark:text-white">{monthName(period)}</h3>
            <span className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{tonnes(list.reduce((a, e) => a + e.kg, 0))}</span>
          </header>
          <ul className="divide-y divide-[var(--hairline)]">
            {list.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{catLabel(e.category)} <span className="ms-1 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">Scope {e.scope}</span>{e.source !== 'manual' && <span className="ms-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{{ import: 'Imported', ai: 'Read from a bill', supplier: 'Supplier', survey: 'Staff survey' }[e.source] ?? e.source}</span>}</p>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400"><span className="tabular-nums">{e.quantity.toLocaleString()} {unitText(e.category)} × {e.factor} kg</span> · {e.factorSource}{e.note ? <> · <span translate="no">{e.note}</span></> : null}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{kgText(e.kg)}</span>
                {edit && e.source !== 'supplier' && e.source !== 'survey' && (
                  <span className="flex gap-1">
                    <button type="button" className="btn-ghost btn-icon" aria-label={`Change ${catLabel(e.category)}`} onClick={() => { setEditing(e.id); setDraft({ category: e.category, period: e.period, quantity: String(e.quantity), factor: String(e.factor), factorSource: e.factorSource, note: e.note ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="h-4 w-4" aria-hidden /></button>
                    <button type="button" className="btn-ghost btn-icon" aria-label={`Remove ${catLabel(e.category)}`} onClick={() => void remove(e)}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LineForm({ org, year, draft, setDraft, editing, onSave, onCancel }: { org: SectionProps['org']; year: number; draft: Draft; setDraft: (d: Draft) => void; editing: boolean; onSave: () => void; onCancel: () => void }) {
  const cat = categoryById(draft.category);
  const auto = cat ? factorFor(cat, org.country, org.currency) : 0;
  const factor = draft.factor === '' ? auto : Number(draft.factor) || 0;
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [k]: e.target.value, ...(k === 'category' ? { factor: '', factorSource: '' } : {}) });
  return (
    <form className="panel p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(); }} aria-labelledby="line-form">
      <h3 id="line-form" className={h3}><ListPlus className={icon} aria-hidden />{editing ? 'Change the line' : 'A new line'}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`${label} lg:col-span-2`}>What it is<select value={draft.category} onChange={set('category')} className={field}>{groups().map(([g, cs]) => <optgroup key={g} label={g}>{cs.map((c) => <option key={c.id} value={c.id}>{c.label} (scope {c.scope})</option>)}</optgroup>)}</select></label>
        <label className={label}>Month<select value={draft.period} onChange={set('period')} className={field}>{MONTHS(year).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select></label>
        <label className={label}>Amount, {cat?.unit === 'money' ? `${org.currency} spent` : unitText(draft.category)}<input required type="number" min={0} step="any" inputMode="decimal" value={draft.quantity} onChange={set('quantity')} className={field} /></label>
        <label className={label}>Own factor, kg CO₂e a unit (optional)<input type="number" min={0} step="any" inputMode="decimal" value={draft.factor} placeholder={String(auto)} onChange={set('factor')} className={field} /></label>
        {draft.factor !== '' && <label className={label}>Where your factor comes from<input maxLength={160} value={draft.factorSource} onChange={set('factorSource')} placeholder="e.g. our supplier’s 2025 fuel mix" className={field} /></label>}
        <label className={`${label} lg:col-span-2`}>Note (optional)<input maxLength={200} value={draft.note} onChange={set('note')} placeholder="e.g. Bill 4471, main office" className={field} /></label>
      </div>
      <p className={muted}>= <strong className="tabular-nums text-zinc-900 dark:text-white">{kgText(kgFor(Number(draft.quantity) || 0, factor))}</strong> CO₂e · {draft.factor === '' ? cat?.source : 'Your own factor'}{cat?.id === 'electricity' && draft.factor === '' ? ` (${org.country ?? 'world'} average)` : ''}</p>
      <div className="flex gap-2"><button type="submit" className="btn-primary">{editing ? 'Save' : 'Add'}</button><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button></div>
    </form>
  );
}

// ——— Spreadsheet import (M270) ———

function Importer({ year, onRows }: { org: SectionProps['org']; year: number; onRows: (r: Row[]) => void }) {
  const read = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    if (f.size > 2_000_000) { toast.error('A spreadsheet up to 2 MB: save it as CSV first.'); return; }
    const table = parseCsv(await f.text());
    if (table.length < 2) { toast.error('That file has no rows. Save the sheet as CSV (comma-separated).'); return; }
    const head = table[0].map((h) => h.toLowerCase());
    const col = (re: RegExp) => head.findIndex((h) => re.test(h));
    const cMonth = col(/month|date|period/), cCat = col(/category|type|item|description|what/), cQty = col(/qty|quantity|amount|kwh|litre|liter|km|value|spend|cost|total/), cNote = col(/note|supplier|vendor|memo/);
    if (cCat < 0 || cQty < 0) { toast.error('The first row needs column names: at least “category” (or “description”) and “amount”.'); return; }
    onRows(table.slice(1, 1001).map((r) => ({ category: guessCategory(r[cCat] ?? ''), period: cMonth >= 0 ? guessPeriod(r[cMonth] ?? '', year) : `${year}-12`, quantity: num(r[cQty] ?? ''), note: cNote >= 0 ? (r[cNote] ?? '').slice(0, 200) || null : (r[cCat] ?? '').slice(0, 200) || null })));
  };
  return (
    <FileDrop accept=".csv,text/csv,text/plain" onFiles={(f) => void read(f)} hint={false}>
      <span className="btn-secondary inline-flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4" aria-hidden />Import a spreadsheet (CSV)</span>
    </FileDrop>
  );
}

function BillReader({ orgId, onRows }: { orgId: string; onRows: (r: Row[]) => void }) {
  const [busy, setBusy] = useState(false);
  const read = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    if (f.size > 4_000_000) { toast.error('A bill up to 4 MB.'); return; }
    setBusy(true);
    try {
      const body = f.type.startsWith('text/') ? { text: await f.text() } : { image: { mimeType: f.type, data: await base64(f) } };
      const r = await api.post<{ lines: Row[] }>(`/green/biz/${orgId}/read-bill`, body);
      if (!r.data.lines.length) toast.info('Nothing on that bill fitted a category: add it by hand.'); else onRows(r.data.lines);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t read that bill.')); } finally { setBusy(false); }
  };
  return (
    <FileDrop accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onFiles={(f) => void read(f)} disabled={busy} hint={false}>
      <span className="btn-secondary inline-flex items-center gap-1.5" aria-busy={busy}><Receipt className="h-4 w-4" aria-hidden />{busy ? 'Reading the bill…' : 'Read a bill with AI'}</span>
    </FileDrop>
  );
}
const base64 = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => no(r.error); r.readAsDataURL(f); });

function Preview({ org, year, rows: start, source, onDone, onCancel }: { org: SectionProps['org']; year: number; rows: Row[]; source: 'import' | 'ai'; onDone: () => void; onCancel: () => void }) {
  const [rows, setRows] = useState(start);
  const [busy, setBusy] = useState(false);
  const ok = rows.filter((r) => r.category && r.period && r.quantity !== null && r.quantity >= 0);
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: k === 'quantity' ? num(v) : v || null } : r)));
  const add = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < ok.length; i += 120) await api.post(`/green/biz/${org.id}/entries/batch`, { source, rows: ok.slice(i, i + 120) });
      toast.success(`${ok.length} lines added.`); onDone();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add those lines.')); } finally { setBusy(false); }
  };
  return (
    <section className="panel p-5 space-y-4" aria-labelledby="preview">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="preview" className={h3}>{source === 'ai' ? <Receipt className={icon} aria-hidden /> : <FileSpreadsheet className={icon} aria-hidden />}{source === 'ai' ? 'What the AI read: check it' : 'Check the import'}</h3>
          <p className={`mt-1 ${muted}`}>{ok.length} of {rows.length} lines are ready. Fix or leave out the rest: nothing is saved until you add them.</p>
        </div>
        <button type="button" className="btn-ghost btn-icon" aria-label="Close" onClick={onCancel}><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-xl border border-[var(--hairline)]">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="sticky top-0 bg-[var(--surface)] text-start text-xs text-zinc-600 dark:text-zinc-300"><tr><th className="px-3 py-2 text-start">What it is</th><th className="px-3 py-2 text-start">Month</th><th className="px-3 py-2 text-start">Amount</th><th className="px-3 py-2 text-start">Note</th><th className="px-3 py-2 text-end">CO₂e</th><th><span className="sr-only">Leave out</span></th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const c = r.category ? categoryById(r.category) : null;
              return (
                <tr key={i} className="border-t border-[var(--hairline)]">
                  <td className="px-2 py-1.5"><select aria-label={`Line ${i + 1}: what it is`} value={r.category ?? ''} onChange={(e) => set(i, 'category', e.target.value)} className={`${field} mt-0 ${!r.category ? 'border-amber-500' : ''}`}><option value="">Pick…</option>{groups().map(([g, cs]) => <optgroup key={g} label={g}>{cs.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}</select></td>
                  <td className="px-2 py-1.5"><select aria-label={`Line ${i + 1}: month`} value={r.period ?? ''} onChange={(e) => set(i, 'period', e.target.value)} className={`${field} mt-0 ${!r.period ? 'border-amber-500' : ''}`}><option value="">Pick…</option>{[...new Set([...MONTHS(year), ...(r.period ? [r.period] : [])])].map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input aria-label={`Line ${i + 1}: amount${c ? `, ${unitText(c.id)}` : ''}`} inputMode="decimal" value={r.quantity ?? ''} onChange={(e) => set(i, 'quantity', e.target.value)} className={`${field} mt-0 w-28`} /></td>
                  <td className="px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400" translate="no">{r.note}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums">{c && r.quantity !== null ? kgText(kgFor(r.quantity, factorFor(c, org.country, org.currency))) : '–'}</td>
                  <td className="px-2"><button type="button" className="btn-ghost btn-icon" aria-label={`Leave out line ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" aria-hidden /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2"><button type="button" disabled={busy || !ok.length} onClick={() => void add()} className="btn-primary">Add {ok.length} lines</button><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button></div>
    </section>
  );
}
