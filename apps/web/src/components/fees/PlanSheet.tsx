'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { addMonths, format } from 'date-fns';
import { Loader2, Plus, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { money } from './shared';

// A new fee plan (Stage 5 · B15.2): name, who it's for, currency, the items, and how many
// instalments with their due dates (equal shares; the first takes what doesn't divide).

const toMinor = (v: string) => Math.round((Number(v) || 0) * 100);

export function PlanSheet({ courses, currencies, onClose, onCreated }: {
  courses: { id: string; code: string; name: string }[]; currencies: readonly string[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [currency, setCurrency] = useState(currencies[0] ?? 'INR');
  const [items, setItems] = useState([{ label: 'Tuition', amount: '' }]);
  const [count, setCount] = useState(1);
  const [dates, setDates] = useState<string[]>(() => Array.from({ length: 12 }, (_, i) => format(addMonths(new Date(), i + 1), 'yyyy-MM-10')));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + toMinor(i.amount), 0);
  // The same split the server makes.
  const shares = useMemo(() => {
    const base = Math.floor(total / count);
    return Array.from({ length: count }, (_, i) => base + (i === 0 ? total - base * count : 0));
  }, [total, count]);

  const setItem = (i: number, patch: Partial<{ label: string; amount: string }>) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      const r = await authedJson<{ id: string }>('/api/fees/plans', { method: 'POST', body: JSON.stringify({
        name, courseId: courseId || null, currency,
        items: items.filter((i) => i.label.trim() || i.amount).map((i) => ({ label: i.label, amount: Number(i.amount) })),
        instalments: dates.slice(0, count).map((d, i) => ({ label: count === 1 ? 'Full amount' : `Instalment ${i + 1}`, dueAt: d })),
      }) });
      haptic('success');
      toast.success('Fee plan saved', { description: 'Issue it when you’re ready: each student gets their bills then.' });
      onCreated(r.id);
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t save the plan.'));
      setBusy(false);
    }
  };

  return (
    <Sheet title="New fee plan" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">{(p) => <input {...p} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Term 1 2026–27" />}</Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="For">
            {(p) => (
              <select {...p} value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input">
                <option value="">Every student</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Currency">
            {(p) => <select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">Items</legend>
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input aria-label={`Item ${i + 1} name`} value={it.label} maxLength={80} onChange={(e) => setItem(i, { label: e.target.value })} className="input flex-1 min-w-0" placeholder="Tuition, transport, books…" />
              <input aria-label={`Item ${i + 1} amount`} value={it.amount} inputMode="decimal" onChange={(e) => setItem(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} className="input w-28 tabular-nums" placeholder="0" />
              {items.length > 1 && <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>}
            </div>
          ))}
          {items.length < 20 && <button type="button" onClick={() => setItems((cur) => [...cur, { label: '', amount: '' }])} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add an item</button>}
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Total {money(total, currency)} per student</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">Pay in</legend>
          <select aria-label="Number of instalments" value={count} onChange={(e) => setCount(Number(e.target.value))} className="input">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'One payment' : `${n} instalments`}</option>)}
          </select>
          {dates.slice(0, count).map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-sm text-zinc-600 dark:text-zinc-300">{count === 1 ? 'Due' : `Instalment ${i + 1}`}</span>
              <input type="date" aria-label={`${count === 1 ? 'Due date' : `Instalment ${i + 1} due date`}`} required value={d} onChange={(e) => setDates((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} className="input flex-1 min-w-0" />
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{money(shares[i] ?? 0, currency)}</span>
            </div>
          ))}
        </fieldset>
        {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
        <button type="submit" disabled={busy || !name.trim() || !total} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save plan</button>
        <p className="text-[11px] text-zinc-500">Saving doesn’t bill anyone yet. Issue the plan from the list when it’s right.</p>
      </form>
    </Sheet>
  );
}
