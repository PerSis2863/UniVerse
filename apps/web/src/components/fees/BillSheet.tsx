'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Ban, BadgePercent, CalendarClock, Loader2, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { METHOD_LABEL, StatusChip, major, money, type BillStatus } from './shared';

// One fee bill for admins (Stage 5 · B15.2; src/server/fees.ts): its sums, payments with receipts,
// the student's parents, and what can be done: record a payment, a discount, a new due date, waive,
// cancel or reopen; void a wrong payment (kept, crossed out).

interface Payment { id: string; seq: number; amount: number; method: string; reference: string | null; note: string | null; paidAt: string; voidedAt: string | null; voidReason: string | null; receivedBy: { name: string } }
interface Bill {
  id: string; seq: number; label: string; currency: string; amount: number; discount: number; discountNote: string | null; paid: number; owed: number; overdue: boolean;
  dueAt: string; status: BillStatus; remindedAt: string | null; student: { id: string; name: string; email: string }; payments: Payment[];
}
interface Detail { invoice: Bill; parents: { name: string; email: string; relation: string | null }[] }

const METHODS = ['CASH', 'BANK', 'UPI', 'CHEQUE', 'CARD', 'OTHER'] as const;

export function BillSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const key = `/api/fees/invoices/${id}`;
  const { data, error, mutate } = useSWR<Detail>(key, authedJson);
  const [mode, setMode] = useState<'pay' | 'discount' | 'due' | null>(null);
  const [busy, setBusy] = useState(false);
  const bill = data?.invoice;

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await authedJson(key, { method: 'POST', body: JSON.stringify(body) });
      haptic('success');
      toast.success(done);
      setMode(null);
      await mutate();
      onChanged();
      return true;
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); return false; }
    finally { setBusy(false); }
  };
  const voidPayment = async (p: Payment) => {
    const reason = await promptDialog({ title: `Void receipt #${p.seq}?`, message: `${money(p.amount, bill!.currency)} on ${format(new Date(p.paidAt), 'd MMM yyyy')}. It stays on record, crossed out, and the bill goes back to owing it.`, placeholder: 'Why? For example “entered twice”', confirmLabel: 'Void' });
    if (!reason?.trim()) return;
    try {
      await authedJson(`/api/fees/payments/${p.id}`, { method: 'POST', body: JSON.stringify({ reason }) });
      toast.success(`Receipt #${p.seq} voided`);
      await mutate();
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t void the payment.')); }
  };
  const close = async (action: 'waive' | 'cancel') => {
    if (action === 'cancel') {
      if (await confirmDialog({ title: 'Cancel this bill?', message: 'It no longer counts as owed or billed. You can reopen it.', confirmLabel: 'Cancel bill', destructive: true })) void act({ action }, 'Bill cancelled');
      return;
    }
    const note = await promptDialog({ title: 'Waive what’s left?', message: `${money(bill!.owed, bill!.currency)} won’t be owed any more. Payments already made stay.`, placeholder: 'Why? For example “hardship, approved by the principal”', confirmLabel: 'Waive' });
    if (note?.trim()) void act({ action, note }, 'Bill waived');
  };

  return (
    <Sheet title={bill ? `Bill #${bill.seq}` : 'Bill'} onClose={onClose}>
      {error && !data ? <LoadError onRetry={() => mutate()} />
        : !bill ? <ContentSkeleton variant="list" />
        : (
          <div className="space-y-4">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-zinc-900 dark:text-white">{bill.student.name}</p>
                <StatusChip status={bill.status} overdue={bill.overdue} />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{bill.label}</p>
              <p className="text-xs text-zinc-500">Due {format(new Date(bill.dueAt), 'd MMM yyyy')}{bill.remindedAt ? ` · reminded ${format(new Date(bill.remindedAt), 'd MMM')}` : ''}</p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Bill', money(bill.amount, bill.currency)],
                ['Discount', bill.discount ? `− ${money(bill.discount, bill.currency)}` : '—'],
                ['Paid', money(bill.paid, bill.currency)],
                ['Still owed', money(bill.owed, bill.currency)],
              ].map(([k, v], i) => (
                <div key={k} className={cn('rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3', i === 3 && bill.owed > 0 && 'border-indigo-500/40 bg-indigo-500/5')}>
                  <dt className="text-[11px] text-zinc-500">{k}</dt>
                  <dd className="font-bold tabular-nums text-zinc-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            {bill.discountNote && <p className="text-xs text-zinc-500">{bill.status === 'WAIVED' ? 'Waived' : 'Discount'}: {bill.discountNote}</p>}

            <div className="flex flex-wrap gap-2">
              {bill.owed > 0 && <button type="button" onClick={() => setMode(mode === 'pay' ? null : 'pay')} className="btn-primary btn-sm"><Wallet className="w-4 h-4" /> Record a payment</button>}
              {['DUE', 'PARTIAL'].includes(bill.status) && <button type="button" onClick={() => setMode(mode === 'discount' ? null : 'discount')} className="btn-secondary btn-sm"><BadgePercent className="w-4 h-4" /> Discount</button>}
              {['DUE', 'PARTIAL'].includes(bill.status) && <button type="button" onClick={() => setMode(mode === 'due' ? null : 'due')} className="btn-secondary btn-sm"><CalendarClock className="w-4 h-4" /> Due date</button>}
            </div>
            {mode === 'pay' && <PayForm bill={bill} busy={busy} onSubmit={(b) => act({ action: 'pay', ...b }, 'Payment recorded')} />}
            {mode === 'discount' && <DiscountForm bill={bill} busy={busy} onSubmit={(b) => act({ action: 'discount', ...b }, 'Discount saved')} />}
            {mode === 'due' && <DueForm bill={bill} busy={busy} onSubmit={(b) => act({ action: 'due', ...b }, 'Due date changed')} />}

            <section aria-label="Payments">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Payments</p>
              {bill.payments.length === 0 ? <p className="text-sm text-zinc-500">None yet.</p> : (
                <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                  {bill.payments.map((p) => (
                    <li key={p.id} className={cn('py-2 flex items-start gap-3', p.voidedAt && 'opacity-60')}>
                      <span className="flex-1 min-w-0">
                        <span className={cn('block text-sm font-semibold tabular-nums text-zinc-900 dark:text-white', p.voidedAt && 'line-through')}>{money(p.amount, bill.currency)} · {METHOD_LABEL[p.method] ?? p.method}</span>
                        <span className="block text-xs text-zinc-500">Receipt #{p.seq} · {format(new Date(p.paidAt), 'd MMM yyyy')} · {p.receivedBy.name}{p.reference ? ` · ref ${p.reference}` : ''}</span>
                        {p.voidedAt && <span className="block text-xs text-rose-600 dark:text-rose-400">Voided: {p.voidReason}</span>}
                      </span>
                      <a href={`/fee-receipt/${p.id}`} target="_blank" rel="noopener" className="btn-ghost btn-sm shrink-0"><Receipt className="w-4 h-4" /> Receipt</a>
                      {!p.voidedAt && <button type="button" onClick={() => void voidPayment(p)} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400 shrink-0">Void</button>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Family">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Family</p>
              {data.parents.length === 0 ? <p className="text-sm text-zinc-500">No parent account linked. Reminders go to {bill.student.name.split(' ')[0]} ({bill.student.email}).</p> : (
                <ul className="text-sm space-y-0.5">
                  {data.parents.map((p) => <li key={p.email} className="text-zinc-700 dark:text-zinc-200">{p.name}{p.relation ? ` (${p.relation.toLowerCase()})` : ''} · <span className="text-zinc-500">{p.email}</span></li>)}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-200/70 dark:border-white/[0.07]">
              {['DUE', 'PARTIAL'].includes(bill.status) && bill.owed > 0 && <button type="button" onClick={() => void close('waive')} className="btn-ghost btn-sm"><BadgePercent className="w-4 h-4" /> Waive what’s left</button>}
              {bill.status === 'DUE' && !bill.payments.some((p) => !p.voidedAt) && <button type="button" onClick={() => void close('cancel')} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Ban className="w-4 h-4" /> Cancel bill</button>}
              {['WAIVED', 'CANCELLED'].includes(bill.status) && <button type="button" onClick={() => void act({ action: 'reopen' }, 'Bill reopened')} className="btn-ghost btn-sm"><RotateCcw className="w-4 h-4" /> Reopen</button>}
            </div>
          </div>
        )}
    </Sheet>
  );
}

function PayForm({ bill, busy, onSubmit }: { bill: Bill; busy: boolean; onSubmit: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [amount, setAmount] = useState(major(bill.owed));
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  return (
    <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={(e) => { e.preventDefault(); void onSubmit({ amount, method, reference, paidAt, note }); }} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount (${bill.currency})`} hint={`Owed: ${money(bill.owed, bill.currency)}`}>
          {(p) => <input {...p} required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="input tabular-nums" />}
        </Field>
        <Field label="Paid on">{(p) => <input {...p} type="date" required value={paidAt} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setPaidAt(e.target.value)} className="input" />}</Field>
      </div>
      <Field label="How">
        {(p) => <select {...p} value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} className="input">{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select>}
      </Field>
      {method !== 'CASH' && <Field label="Reference (optional)" hint="Transaction or cheque number">{(p) => <input {...p} maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} className="input" />}</Field>}
      <Field label="Note (optional)">{(p) => <input {...p} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="input" />}</Field>
      <button type="submit" disabled={busy || !Number(amount)} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Save and make a receipt</button>
    </motion.form>
  );
}

function DiscountForm({ bill, busy, onSubmit }: { bill: Bill; busy: boolean; onSubmit: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [kind, setKind] = useState<'amount' | 'percent'>('amount');
  const [value, setValue] = useState(bill.discount ? major(bill.discount) : '');
  const [note, setNote] = useState(bill.discountNote ?? '');
  const minor = kind === 'percent' ? Math.round((bill.amount * Math.min(100, Number(value) || 0)) / 100) : Math.round((Number(value) || 0) * 100);
  return (
    <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={(e) => { e.preventDefault(); void onSubmit({ amount: minor / 100, note }); }} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-3">
      <Segmented<'amount' | 'percent'> label="Discount as" value={kind} onChange={(k) => { setKind(k); setValue(''); }} className="w-full" segments={[{ value: 'amount', label: `Amount (${bill.currency})` }, { value: 'percent', label: 'Percent' }]} />
      <Field label={kind === 'percent' ? 'Percent off' : 'Amount off'} hint={minor ? `${money(minor, bill.currency)} off · the bill becomes ${money(Math.max(0, bill.amount - minor), bill.currency)}` : 'Enter 0 to remove the discount.'}>
        {(p) => <input {...p} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} className="input tabular-nums" />}
      </Field>
      <Field label="Why">{(p) => <input {...p} maxLength={300} required={minor > 0} value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Sibling discount, scholarship…" />}</Field>
      <button type="submit" disabled={busy || minor > bill.amount} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save discount</button>
    </motion.form>
  );
}

function DueForm({ bill, busy, onSubmit }: { bill: Bill; busy: boolean; onSubmit: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [dueAt, setDueAt] = useState(bill.dueAt.slice(0, 10));
  return (
    <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={(e) => { e.preventDefault(); void onSubmit({ dueAt }); }} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-3">
      <Field label="New due date">{(p) => <input {...p} type="date" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input" />}</Field>
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Change due date</button>
    </motion.form>
  );
}
