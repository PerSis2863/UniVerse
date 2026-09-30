'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { mutate as globalMutate } from 'swr';
import { format } from 'date-fns';
import { Loader2, Trash2, X } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// Shared pieces of the owner console: data loading, undo, and a record editor for any table.

export type FieldInfo = { name: string; type: string; kind: 'scalar' | 'enum'; list: boolean; optional: boolean; id: boolean; updatedAt: boolean; hasDefault: boolean };
export type Schema = { models: { name: string; fields: FieldInfo[] }[]; enums: Record<string, string[]> };
export type Rec = Record<string, unknown> & { id: string };

export const fetcher = (url: string) => api.get(url).then((r) => r.data);
export const errorMessage = (e: unknown) => {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || (e as Error)?.message || 'Something went wrong';
};
export const card = 'rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50';
export const field =
  'w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

/** Refreshes everything the console shows after a change. */
export const refreshConsole = () => globalMutate((k) => typeof k === 'string' && k.startsWith('/owner/'));

export async function undoChange(changeId: string) {
  try {
    await api.post(`/owner/changes/${changeId}/undo`);
    toast.success('Change undone');
    await refreshConsole();
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

/** A toast with an Undo button for a change that was just made. */
export function toastWithUndo(message: string, changeId?: string) {
  toast.success(message, changeId ? { action: { label: 'Undo', onClick: () => void undoChange(changeId) }, duration: 10_000 } : undefined);
}

/** Short, readable one-line summary of any record. */
export function summarize(r: Record<string, unknown>) {
  const main = r.name ?? r.title ?? r.subject ?? r.email ?? r.assignmentName ?? r.body ?? r.summary ?? r.kind ?? r.status ?? r.id;
  let s = typeof main === 'string' ? main : JSON.stringify(main);
  if (s && s.length > 90) s = s.slice(0, 90) + '…';
  return s || String(r.id);
}

export function formatValue(v: unknown) {
  if (v === null || v === undefined || v === '') return <span className="text-zinc-400">—</span>;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return format(new Date(v), 'd MMM yyyy, HH:mm');
  if (typeof v === 'object') return <code className="text-xs break-all">{JSON.stringify(v)}</code>;
  return <span className="break-words">{String(v)}</span>;
}

/** Edit or delete one record of any table. Every change can be undone from the toast or Changes. */
export function RecordEditor({ model, record, schema, onClose, onSaved }: { model: string; record: Rec; schema: Schema; onClose: () => void; onSaved?: () => void }) {
  const fields = schema.models.find((m) => m.name === model)?.fields ?? [];
  const toText = (f: FieldInfo, v: unknown) => (v === null || v === undefined ? '' : f.type === 'Json' || typeof v === 'object' ? JSON.stringify(v, null, 1) : f.type === 'DateTime' ? String(v).slice(0, 16) : String(v));
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, toText(f, record[f.name])])));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    const data: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.id || f.updatedAt) continue;
      if (draft[f.name] !== toText(f, record[f.name])) data[f.name] = f.type === 'Boolean' ? draft[f.name] === 'true' : draft[f.name];
    }
    if (Object.keys(data).length === 0) return onClose();
    setBusy('save');
    try {
      const { data: res } = await api.patch(`/owner/records/${model}/${record.id}`, { data });
      toastWithUndo('Saved', res.changeId);
      await refreshConsole();
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this record?', message: 'You can undo this from the toast or from Changes. Things that were deleted along with it are not restored.', confirmLabel: 'Delete', destructive: true }))) return;
    setBusy('delete');
    try {
      const { data: res } = await api.delete(`/owner/records/${model}/${record.id}`);
      toastWithUndo('Deleted', res.changeId);
      await refreshConsole();
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label={`Edit ${model}`}>
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-zinc-100 dark:border-white/[0.06]">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-indigo-500">{model}</p>
            <h2 className="font-bold text-zinc-900 dark:text-white truncate">{summarize(record)}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid sm:grid-cols-2 gap-3">
          {fields.map((f) => {
            const readOnly = f.id || f.updatedAt;
            const label = (
              <span className="text-xs font-medium text-zinc-500">
                {f.name} <span className="text-zinc-400">({f.kind === 'enum' ? f.type : f.type}{f.optional ? ', optional' : ''})</span>
              </span>
            );
            const value = draft[f.name] ?? '';
            const set = (v: string) => setDraft((d) => ({ ...d, [f.name]: v }));
            const wide = f.type === 'Json' || (f.type === 'String' && (value.length > 60 || /body|description|message|note|about|answers/i.test(f.name)));
            return (
              <label key={f.name} className={cn('block space-y-1', wide && 'sm:col-span-2')}>
                {label}
                {readOnly ? (
                  <div className="text-sm text-zinc-500 break-all">{value || '—'}</div>
                ) : f.kind === 'enum' ? (
                  <select className={field} value={value} onChange={(e) => set(e.target.value)}>
                    {f.optional && <option value="">(empty)</option>}
                    {(schema.enums[f.type] ?? []).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === 'Boolean' ? (
                  <select className={field} value={value} onChange={(e) => set(e.target.value)}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : f.type === 'DateTime' ? (
                  <input type="datetime-local" className={field} value={value} onChange={(e) => set(e.target.value)} />
                ) : wide ? (
                  <textarea className={cn(field, 'min-h-[90px] font-mono text-xs')} value={value} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input className={field} value={value} onChange={(e) => set(e.target.value)} inputMode={f.type === 'Int' || f.type === 'Float' ? 'decimal' : undefined} />
                )}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 p-4 border-t border-zinc-100 dark:border-white/[0.06]">
          {model !== 'User' ? (
            <button onClick={remove} disabled={!!busy} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-500 disabled:opacity-50">
              {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
            </button>
          ) : (
            <span className="text-xs text-zinc-500">To remove a person, set status to SUSPENDED.</span>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500">Cancel</button>
            <button onClick={save} disabled={!!busy} className="btn-primary">
              {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
