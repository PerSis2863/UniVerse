'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BellRing, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { ui } from '@/components/sim/bench-ui';

// M522: a channel's alerts (src/server/iot.ts): a rule on one field, above or below a value; a reading that breaks it
// tells the owner in the app and by push, at most once per its quiet time.
interface Alert { id: string; field: number; op: string; value: number; note: string | null; quietMinutes: number; lastFiredAt: string | null; fired: number }
const OPS = [['>', 'above'], ['<', 'below'], ['>=', 'at or above'], ['<=', 'at or below']] as const;
const word = (op: string) => OPS.find(([o]) => o === op)?.[1] ?? op;

export function IotAlerts({ channelId, fields }: { channelId: string; fields: string[] }) {
  const { data, mutate } = useSWR<{ alerts: Alert[]; max: number }>(`/iot/channels/${channelId}/alerts`, fetcher);
  const [field, setField] = useState(1);
  const [op, setOp] = useState('>');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await api.post(`/iot/channels/${channelId}/alerts`, { field, op, value: Number(value), note: note.trim() || undefined }); setValue(''); setNote(''); void mutate(); }
    catch (e) { toast.error(errorMessage(e, 'The alert wasn’t added.')); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await api.delete(`/iot/alerts/${id}`); void mutate(); } catch (e) { toast.error(errorMessage(e, 'It couldn’t be deleted.')); }
  };
  const list = data?.alerts ?? [];
  return (
    <div className="rounded-xl border border-zinc-200/80 p-3 dark:border-white/10" aria-label="Alerts" role="group">
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300"><BellRing className="h-3.5 w-3.5" aria-hidden />Alerts <span className="font-normal text-zinc-500 dark:text-zinc-400">(told in UniVerse and on your devices, at most every 15 minutes each)</span></p>
      {list.length > 0 && (
        <ul className="mt-2 space-y-1">
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[13px] text-zinc-800 dark:text-zinc-100" data-alert>
              <span className="min-w-0 flex-1 truncate"><span translate="no">{fields[a.field - 1] ?? `Field ${a.field}`}</span> {word(a.op)} <span className="font-mono tabular-nums">{a.value}</span>{a.note ? <span className="text-zinc-500 dark:text-zinc-400"> · <span translate="no">{a.note}</span></span> : null}</span>
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{a.fired ? `told ${a.fired}×` : 'not yet'}</span>
              <button type="button" className={ui.small} onClick={() => void remove(a.id)} aria-label={`Delete the alert ${fields[a.field - 1] ?? ''} ${word(a.op)} ${a.value}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {list.length < (data?.max ?? 10) && (
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className={ui.label}>When<select value={field} onChange={(e) => setField(Number(e.target.value))} className={`${ui.select} mt-1 block`}>{fields.map((f, i) => <option key={f} value={i + 1}>{f}</option>)}</select></label>
          <label className={ui.label}>is<select value={op} onChange={(e) => setOp(e.target.value)} className={`${ui.select} mt-1 block`}>{OPS.map(([o, w]) => <option key={o} value={o}>{w}</option>)}</select></label>
          <label className={ui.label}>Value<input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="input mt-1 block w-24 font-mono tabular-nums" /></label>
          <label className={`${ui.label} min-w-[10rem] flex-1`}>Message <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="input mt-1 block w-full" /></label>
          <button type="submit" className="btn-primary inline-flex items-center gap-1.5" disabled={busy || value.trim() === '' || !Number.isFinite(Number(value))}><Plus className="h-4 w-4" aria-hidden />Add alert</button>
        </form>
      )}
    </div>
  );
}
