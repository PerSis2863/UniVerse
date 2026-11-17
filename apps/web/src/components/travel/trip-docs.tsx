'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, BellRing, FileCheck2, Lock, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useNow } from '@/lib/use-now';
import { DOC_KINDS, DOC_LABEL, docAlerts, type DocKind } from '@/lib/travel-docs';
import { cn } from '@/lib/utils';

// M245: my documents for a trip (the trip page's Ready part): passport, visa, insurance, bookings, by name and date
// only; what needs doing now (expiring, expiring during the trip, six months on a passport, the trip coming up) and a
// reminder in the app before the trip (the daily job). Only I see them, never the others on the trip.

interface Doc { id: string; tripId: string | null; kind: DocKind; label: string; expires: string | null; note: string | null; reminded: string }
const field = 'mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white';

export function TripDocs({ tripId, start, end }: { tripId: string; start: string | null; end: string | null }) {
  const key = `/travel/docs?trip=${encodeURIComponent(tripId)}`;
  const { data, mutate } = useSWR<{ docs: Doc[] }>(key, fetcher);
  const now = useNow();
  const today = new Date(now || 0).toISOString().slice(0, 10);
  const trip = start && end ? { start, end } : null;
  const docs = useMemo(() => data?.docs ?? [], [data]);
  const [kind, setKind] = useState<DocKind>('passport'), [label, setLabel] = useState(''), [expires, setExpires] = useState(''), [note, setNote] = useState(''), [mine, setMine] = useState(true);
  const act = async (call: () => Promise<unknown>, ok?: string) => { try { await call(); if (ok) toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); } await mutate(); };
  const add = () => act(async () => { await api.post('/travel/docs', { kind, label: label || DOC_LABEL[kind], expires: expires || null, note, tripId: mine ? tripId : null }); setLabel(''); setExpires(''); setNote(''); }, 'Saved. Only you can see it.');
  const missing = (['passport', 'insurance'] as const).filter((k) => !docs.some((d) => d.kind === k));

  return (
    <section className="panel p-5" aria-labelledby="docs-h">
      <h3 id="docs-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><FileCheck2 className="h-5 w-5 text-indigo-500" aria-hidden />Documents</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300"><Lock className="h-3.5 w-3.5" aria-hidden />Only you can see these. Keep names and dates here, never a document’s number.</p>
      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => {
            const alerts = now ? docAlerts(d, today, d.tripId ? trip : null) : [];
            return (
              <li key={d.id} data-key={d.id} className="rounded-2xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{d.label || DOC_LABEL[d.kind]}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">{DOC_LABEL[d.kind] ?? 'Other'}{d.tripId ? ' · this trip' : ' · every trip'}{d.note ? ` · ${d.note}` : ''}</p>
                  </div>
                  <label className="text-xs text-zinc-600 dark:text-zinc-300"><span className="sr-only">Expires</span>
                    <input type="date" defaultValue={d.expires ?? ''} aria-label={`${d.label || DOC_LABEL[d.kind]} expires`} onBlur={(e) => { if ((e.target.value || null) !== d.expires) void act(() => api.patch(`/travel/docs/${d.id}`, { expires: e.target.value || null })); }} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
                  </label>
                  <button type="button" className="btn-ghost btn-sm p-1.5 text-red-600 dark:text-red-400" aria-label={`Remove ${d.label || DOC_LABEL[d.kind]}`} onClick={() => { if (confirm('Remove this document?')) void act(() => api.delete(`/travel/docs/${d.id}`)); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
                {alerts.map((a) => (
                  <p key={a.key} className={cn('mt-2 flex items-start gap-1.5 text-sm', a.level === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-200')}>
                    {a.level === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}<span><span className="font-semibold">{a.title}.</span> {a.body}</span>
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {data && missing.length > 0 && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Not added yet: {missing.map((k) => DOC_LABEL[k].toLowerCase()).join(' and ')}.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className={field}>{DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={DOC_LABEL[kind]} className={field} />
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Expires (optional)
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={cn(field, 'min-w-[9.5rem]')} />
        </label>
        <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Where it is, who to call" className={field} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-indigo-500" />Just for this trip</label>
        <button type="button" onClick={() => void add()} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Add</button>
      </div>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">You’ll get a reminder here in UniVerse a month, a week and a day before the trip, and when something is about to expire.</p>
    </section>
  );
}
