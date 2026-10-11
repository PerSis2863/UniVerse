'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';
import { PRIORITIES, PRIORITY_LABEL } from '@/lib/task-extras';
import { actionsFor, describe, type Action, type Rule, type Trigger } from '@/lib/task-automation';

// A task board's automations (Stage 5 · B9.10; src/server/tasks.ts): "when a card moves to Done,
// tell Asha". Everyone on the board sees them; its owner adds, switches off and deletes them.

const TRIGGER_LABEL: Record<Trigger, string> = { moved: 'A card moves to', created: 'A card is added to', 'due-soon': 'A card is due within a day' };
const ACTION_LABEL: Record<Action, string> = { notify: 'Tell someone', assign: 'Give it to', priority: 'Set the priority', label: 'Add a label', done: 'Mark it done' };

export function AutomationsSheet({ boardId, lists, people, onClose }: { boardId: string; lists: { id: string; title: string }[]; people: { id: string; name: string }[]; onClose: () => void }) {
  const key = `/api/tasks/${boardId}/automations`;
  const { data, mutate } = useSWR<{ canManage: boolean; rules: Rule[] }>(key, authedJson);
  const [form, setForm] = useState<{ trigger: Trigger; listId: string; action: Action; userId: string; value: string }>({ trigger: 'moved', listId: lists.at(-1)?.id ?? '', action: 'notify', userId: '', value: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const list = (id: string) => lists.find((l) => l.id === id)?.title;
  const person = (id: string) => people.find((p) => p.id === id)?.name;
  const actions = actionsFor(form.trigger);
  const action = actions.includes(form.action) ? form.action : actions[0];
  const run = async (k: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(k);
    try { await fn(); if (ok) toast.success(ok); await mutate(); return true; } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(null); }
  };
  const add = () => run('add', () => authedJson(key, { method: 'POST', body: JSON.stringify({ trigger: form.trigger, listId: form.trigger === 'due-soon' ? null : form.listId || null, action, userId: form.userId || null, value: form.value || null }) }), 'Automation added');
  return (
    <Sheet title="Automations" onClose={onClose}>
      <p className="text-sm text-zinc-500 mb-3">Let the board do the busywork: when something happens to a card, it does the next step.</p>
      {!data ? <div className="py-6 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-label="Loading" /></div> : (
        <div className="space-y-4">
          {data.rules.length === 0 ? <p className="text-sm text-zinc-500">No automations yet.</p> : (
            <ul className="space-y-1.5">
              {data.rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2">
                  <Zap className={r.enabled ? 'w-4 h-4 text-amber-500 shrink-0' : 'w-4 h-4 text-zinc-300 shrink-0'} aria-hidden />
                  <span className={`flex-1 text-sm ${r.enabled ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-400'}`}>{describe(r, list, person)}</span>
                  {data.canManage && (
                    <>
                      <Switch checked={r.enabled} label={r.enabled ? 'On' : 'Off'} onChange={(on) => void run(r.id, () => authedJson(`/api/tasks/automations/${r.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: on }) }))} />
                      <button type="button" onClick={() => void run(r.id, () => authedJson(`/api/tasks/automations/${r.id}`, { method: 'DELETE' }), 'Automation deleted')} disabled={busy === r.id} aria-label="Delete automation" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.canManage && (
            <form className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2.5" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New automation</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-500 space-y-1">When
                  <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as Trigger })} className="input text-sm">{(Object.keys(TRIGGER_LABEL) as Trigger[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}</select>
                </label>
                {form.trigger !== 'due-soon' ? (
                  <label className="text-xs text-zinc-500 space-y-1">List
                    <select value={form.listId} onChange={(e) => setForm({ ...form, listId: e.target.value })} className="input text-sm"><option value="">Any list</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
                  </label>
                ) : <span />}
                <label className="text-xs text-zinc-500 space-y-1">Then
                  <select value={action} onChange={(e) => setForm({ ...form, action: e.target.value as Action, value: '' })} className="input text-sm">{actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}</select>
                </label>
                {(action === 'notify' || action === 'assign') && (
                  <label className="text-xs text-zinc-500 space-y-1">{action === 'notify' ? 'Who' : 'Person'}
                    <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="input text-sm">
                      {action === 'notify' && <option value="">Whoever it’s given to</option>}
                      {action === 'assign' && <option value="">Choose…</option>}
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
                {action === 'priority' && (
                  <label className="text-xs text-zinc-500 space-y-1">Priority
                    <select value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input text-sm"><option value="">Choose…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
                  </label>
                )}
                {action === 'label' && <label className="text-xs text-zinc-500 space-y-1">Label<input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} maxLength={20} placeholder="e.g. Review" className="input text-sm" /></label>}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">{describe({ trigger: form.trigger, listId: form.trigger === 'due-soon' ? null : form.listId || null, action, userId: form.userId || null, value: form.value || null }, list, person)}</p>
              <button type="submit" disabled={busy === 'add'} className="btn-primary btn-sm">{busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Add</button>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}
