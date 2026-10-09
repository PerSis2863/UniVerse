'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as revalidate } from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Archive, ArchiveRestore, BellRing, ChevronRight, Download, Loader2, Plus, Send, Wallet } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { SearchField } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list, spring } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/use-now';
import { BillSheet } from './BillSheet';
import { PlanSheet } from './PlanSheet';
import { METHOD_LABEL, StatusChip, downloadCsv, money, type BillStatus } from './shared';

// School fees for admins (Stage 5 · B15.2; src/server/fees.ts): an overview (billed, collected,
// owed, overdue; collections by month and by method), fee plans (make, issue, archive), bills
// (search, filter, open one to record a payment, discount, waive) and the overdue list with gentle
// in-app reminders. Lists download as CSV.

interface Plan {
  id: string; name: string; currency: string; archived: boolean; createdAt: string; to: string; courseId: string | null;
  items: { label: string; amount: number }[]; instalments: { label: string; dueAt: string; amount: number }[];
  bills: number; billed: number; paid: number; open: number; overdue: number;
}
interface Plans { currencies: string[]; courses: { id: string; code: string; name: string }[]; plans: Plan[] }
interface Bill {
  id: string; seq: number; label: string; currency: string; amount: number; discount: number; paid: number; owed: number; overdue: boolean;
  dueAt: string; status: BillStatus; remindedAt: string | null; student: { id: string; name: string; email: string }; plan: { name: string; course: { code: string } | null } | null;
}
interface Bills { invoices: Bill[]; shown: number; owed: number; currencies: string[] }
interface Report {
  totals: { currency: string; bills: number; billed: number; discount: number; paid: number; open: number; overdue: number; overdueBills: number }[];
  byMethod: { currency: string; method: string; total: number; count: number }[];
  byMonth: { currency: string; month: string; total: number }[];
  byStatus: Record<string, number>;
}
type View = 'overview' | 'bills' | 'plans' | 'overdue';

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const STATUSES: { value: string; label: string }[] = [{ value: '', label: 'All' }, { value: 'DUE', label: 'Due' }, { value: 'PARTIAL', label: 'Part paid' }, { value: 'PAID', label: 'Paid' }, { value: 'WAIVED', label: 'Waived' }];

export function FeesAdmin() {
  const [view, setView] = useState<View>('overview');
  const [bill, setBill] = useState<string | null>(null);
  const { mutate: refreshAll } = useSWR<Plans>('/api/fees/plans', authedJson);
  // ?bill=<id> opens a bill (links from elsewhere); the address follows the open one.
  useEffect(() => {
    const t = setTimeout(() => { const id = new URLSearchParams(window.location.search).get('bill'); if (id) setBill(id); }, 0);
    return () => clearTimeout(t);
  }, []);
  const openBill = (id: string | null) => {
    setBill(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('bill', id); else url.searchParams.delete('bill');
    window.history.replaceState(window.history.state, '', url);
  };
  const changed = () => { void refreshAll(); void revalidate((k) => typeof k === 'string' && k.startsWith('/api/fees/')); };

  return (
    <div className="space-y-4">
      <Segmented<View> label="Show" value={view} onChange={setView} className="w-full sm:w-auto" segments={[
        { value: 'overview', label: 'Summary' }, { value: 'bills', label: 'Bills' }, { value: 'plans', label: 'Plans' }, { value: 'overdue', label: 'Overdue' },
      ]} />
      <motion.div key={view} variants={fadeUp} initial="hidden" animate="show">
        {view === 'overview' ? <Overview onGo={setView} />
          : view === 'plans' ? <PlansView onIssued={changed} />
          : view === 'bills' ? <BillsView onOpen={openBill} />
          : <OverdueView onOpen={openBill} />}
      </motion.div>
      {bill && <BillSheet key={bill} id={bill} onClose={() => openBill(null)} onChanged={changed} />}
    </div>
  );
}

function Overview({ onGo }: { onGo: (v: View) => void }) {
  const { data, error, mutate } = useSWR<Report>('/api/fees/report', authedJson);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="dashboard" />;
  if (!data.totals.length) {
    return (
      <section className={`${card} p-8 text-center`}>
        <Wallet className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
        <p className="font-semibold text-zinc-900 dark:text-white">No fees yet</p>
        <p className="text-sm text-zinc-500 mt-1">Make a fee plan (what a class pays, in how many instalments), then issue it to bill each student.</p>
        <button type="button" onClick={() => onGo('plans')} className="btn-primary btn-sm mt-4"><Plus className="w-4 h-4" /> Make a fee plan</button>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      {data.totals.map((t) => {
        const collected = t.billed ? Math.round((t.paid / t.billed) * 100) : 0;
        const months = data.byMonth.filter((m) => m.currency === t.currency);
        const max = Math.max(1, ...months.map((m) => m.total));
        const methods = data.byMethod.filter((m) => m.currency === t.currency).sort((a, b) => b.total - a.total);
        return (
          <section key={t.currency} className={`${card} p-4 sm:p-5 space-y-4`} aria-label={`Fees in ${t.currency}`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { k: 'Billed', v: money(t.billed, t.currency), note: `${t.bills} bill${t.bills === 1 ? '' : 's'}${t.discount ? ` · ${money(t.discount, t.currency)} discounts` : ''}` },
                { k: 'Collected', v: money(t.paid, t.currency), note: `${collected}% of billed` },
                { k: 'Still owed', v: money(t.open, t.currency), note: 'Due and part paid' },
                { k: 'Overdue', v: money(t.overdue, t.currency), note: `${t.overdueBills} bill${t.overdueBills === 1 ? '' : 's'} past due`, go: t.overdueBills > 0 },
              ].map((x) => (
                <button key={x.k} type="button" disabled={!x.go} onClick={() => onGo('overdue')} className={cn('text-left rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 disabled:cursor-default', x.go && 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10')}>
                  <span className="block text-[11px] text-zinc-500">{x.k}</span>
                  <span className="block text-lg font-black tabular-nums text-zinc-900 dark:text-white">{x.v}</span>
                  <span className="block text-[11px] text-zinc-500">{x.note}</span>
                </button>
              ))}
            </div>
            <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="img" aria-label={`${collected}% collected`}>
              <motion.div className="h-full bg-emerald-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, collected)}%` }} transition={spring.gentle} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Collected by month</p>
                {months.length === 0 ? <p className="text-sm text-zinc-500">No payments yet.</p> : (
                  <ul className="space-y-1.5">
                    {months.map((m) => (
                      <li key={m.month} className="flex items-center gap-2 text-sm">
                        <span className="w-16 shrink-0 text-zinc-500 tabular-nums">{format(new Date(`${m.month}-01T12:00:00Z`), 'MMM yy')}</span>
                        <span className="flex-1 h-3 rounded-r-full bg-transparent">
                          <motion.span className="block h-full rounded-r-full bg-indigo-500" initial={{ width: 0 }} animate={{ width: `${Math.max(2, (m.total / max) * 100)}%` }} transition={spring.gentle} />
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums text-zinc-800 dark:text-zinc-100">{money(m.total, t.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">By how it was paid</p>
                {methods.length === 0 ? <p className="text-sm text-zinc-500">No payments yet.</p> : (
                  <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06] text-sm">
                    {methods.map((m) => (
                      <li key={m.method} className="flex items-center justify-between py-1.5">
                        <span className="text-zinc-700 dark:text-zinc-200">{METHOD_LABEL[m.method] ?? m.method} <span className="text-zinc-500">· {m.count}</span></span>
                        <span className="tabular-nums font-semibold text-zinc-900 dark:text-white">{money(m.total, t.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}
      <p className="text-[11px] text-zinc-500">Parents see their children’s bills and receipts in the parent app. Paying online isn’t switched on: it needs the school’s payment account.</p>
    </div>
  );
}

function PlansView({ onIssued }: { onIssued: () => void }) {
  const { data, error, mutate } = useSWR<Plans>('/api/fees/plans', authedJson);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const plans = data.plans.filter((p) => showArchived || !p.archived);

  const act = async (p: Plan, action: 'issue' | 'archive' | 'unarchive') => {
    if (action === 'issue') {
      const total = p.items.reduce((s, i) => s + i.amount, 0);
      const ok = await confirmDialog({
        title: `Issue “${p.name}”?`,
        message: `${p.to}: each student gets ${p.instalments.length === 1 ? 'a bill' : `${p.instalments.length} bills`} for ${money(total, p.currency)} in all. Students who already have these bills are skipped, so you can issue again for students who join later.`,
        confirmLabel: 'Issue bills',
      });
      if (!ok) return;
    }
    setBusy(p.id);
    try {
      const r = await authedJson<{ issued?: number }>(`/api/fees/plans/${p.id}`, { method: 'POST', body: JSON.stringify({ action }) });
      haptic('success');
      toast.success(action === 'issue' ? (r.issued ? `${r.issued} bill${r.issued === 1 ? '' : 's'} issued` : 'Everyone already has these bills') : action === 'archive' ? 'Plan archived' : 'Plan back in the list');
      await mutate();
      onIssued();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 accent-indigo-600" /> Show archived</label>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New fee plan</button>
      </div>
      {plans.length === 0 ? (
        <section className={`${card} p-8 text-center`}>
          <p className="font-semibold text-zinc-900 dark:text-white">No fee plans{showArchived ? '' : ' yet'}</p>
          <p className="text-sm text-zinc-500 mt-1">A plan says what a class pays (tuition, transport, books…) and when.</p>
        </section>
      ) : (
        <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
          {plans.map((p) => {
            const total = p.items.reduce((s, i) => s + i.amount, 0);
            const pct = p.billed ? Math.round((p.paid / p.billed) * 100) : 0;
            return (
              <motion.li key={p.id} variants={fadeUp} className={cn(card, 'p-4', p.archived && 'opacity-70')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-white">{p.name}{p.archived && <span className="ml-2 text-[11px] font-semibold text-zinc-500">Archived</span>}</p>
                    <p className="text-xs text-zinc-500">{p.to} · {money(total, p.currency)} per student · {p.instalments.length === 1 ? `due ${format(new Date(p.instalments[0].dueAt), 'd MMM yyyy')}` : `${p.instalments.length} instalments from ${format(new Date(p.instalments[0].dueAt), 'd MMM')}`}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{p.items.map((i) => `${i.label} ${money(i.amount, p.currency)}`).join(' · ')}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!p.archived && (
                      <button type="button" onClick={() => void act(p, 'issue')} disabled={!!busy} className="btn-secondary btn-sm">
                        {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {p.bills ? 'Issue to new students' : 'Issue bills'}
                      </button>
                    )}
                    <button type="button" onClick={() => void act(p, p.archived ? 'unarchive' : 'archive')} disabled={!!busy} aria-label={p.archived ? `Unarchive ${p.name}` : `Archive ${p.name}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10">
                      {p.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {p.bills > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden>
                      <motion.div className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={spring.gentle} />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">{p.bills} bills · collected {money(p.paid, p.currency)} of {money(p.billed, p.currency)} ({pct}%){p.overdue ? ` · ${money(p.overdue, p.currency)} overdue` : ''}</p>
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
      {creating && <PlanSheet courses={data.courses} currencies={data.currencies} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void mutate(); }} />}
    </div>
  );
}

function BillRow({ b, onOpen, extra }: { b: Bill; onOpen: () => void; extra?: React.ReactNode }) {
  return (
    <motion.li variants={fadeUp}>
      <button type="button" onClick={() => { haptic('tap'); onOpen(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
        <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-zinc-500">#{b.seq}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{b.student.name}</span>
          <span className="block text-xs text-zinc-500 truncate">{b.label} · due {format(new Date(b.dueAt), 'd MMM yyyy')}{extra}</span>
        </span>
        <span className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{money(b.owed || b.amount - b.discount, b.currency)}</span>
          <StatusChip status={b.status} overdue={b.overdue} />
        </span>
        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
      </button>
    </motion.li>
  );
}

function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function BillsView({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const dq = useDebounced(q);
  const { data: plans } = useSWR<Plans>('/api/fees/plans', authedJson);
  const key = `/api/fees/invoices?${new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(status ? { status } : {}), ...(planId ? { planId } : {}) })}`;
  const { data, error, mutate, isLoading } = useSWR<Bills>(key, authedJson, { keepPreviousData: true });
  const csv = () => data && downloadCsv(`fee-bills-${format(new Date(), 'yyyy-MM-dd')}.csv`, ['Bill', 'Student', 'Email', 'For', 'Due', 'Currency', 'Amount', 'Discount', 'Paid', 'Owed', 'Status'],
    data.invoices.map((b) => [b.seq, b.student.name, b.student.email, b.label, b.dueAt.slice(0, 10), b.currency, b.amount / 100, b.discount / 100, b.paid / 100, b.owed / 100, b.overdue ? 'OVERDUE' : b.status]));
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Student, email or bill number" className="flex-1" />
        <select aria-label="Fee plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className="input sm:w-56">
          <option value="">Every plan</option>
          {plans?.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <Segmented<string> label="Status" value={status} onChange={setStatus} className="w-full" segments={STATUSES} />
      {error && !data ? <LoadError onRetry={() => mutate()} />
        : !data ? <ContentSkeleton variant="list" />
        : data.invoices.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>{dq || status || planId ? 'No bills match.' : 'No bills yet. Issue a fee plan to bill students.'}</p>
        : (
          <section className={cn(card, 'p-2 sm:p-3 transition-opacity', isLoading && 'opacity-60')} aria-label="Bills">
            <div className="flex items-center justify-between px-3 pt-1 pb-2 text-xs text-zinc-500">
              <span>{data.shown}{data.shown === 300 ? '+' : ''} bill{data.shown === 1 ? '' : 's'}{data.currencies.length === 1 && data.owed ? ` · ${money(data.owed, data.currencies[0])} owed` : ''}</span>
              <button type="button" onClick={csv} className="btn-ghost btn-sm"><Download className="w-4 h-4" /> CSV</button>
            </div>
            <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {data.invoices.map((b) => <BillRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}
            </motion.ul>
          </section>
        )}
    </div>
  );
}

function OverdueView({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, error, mutate } = useSWR<Bills>('/api/fees/invoices?overdue=1', authedJson);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const days = (iso: string) => Math.max(1, Math.round(((now || new Date(iso).getTime()) - new Date(iso).getTime()) / 86_400_000));
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of data?.invoices ?? []) out[b.currency] = (out[b.currency] ?? 0) + b.owed;
    return Object.entries(out);
  }, [data]);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;

  const remind = async () => {
    const ok = await confirmDialog({ title: 'Send gentle reminders?', message: 'Each family with an overdue bill gets a friendly note in the app (parents if linked, otherwise the student). A bill is reminded at most every 3 days. No emails.', confirmLabel: 'Send reminders' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await authedJson<{ reminded: number; people: number; left: number }>('/api/fees/remind', { method: 'POST', body: '{}' });
      haptic('success');
      toast.success(r.reminded ? `Reminded ${r.people} ${r.people === 1 ? 'person' : 'people'} about ${r.reminded} bill${r.reminded === 1 ? '' : 's'}` : 'Everyone was reminded in the last 3 days', { description: r.left ? `${r.left} more to remind: press again.` : undefined });
      await mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t send reminders.')); }
    finally { setBusy(false); }
  };
  const csv = () => downloadCsv(`overdue-fees-${format(new Date(), 'yyyy-MM-dd')}.csv`, ['Bill', 'Student', 'Email', 'For', 'Due', 'Days overdue', 'Currency', 'Owed', 'Last reminded'],
    data.invoices.map((b) => [b.seq, b.student.name, b.student.email, b.label, b.dueAt.slice(0, 10), days(b.dueAt), b.currency, b.owed / 100, b.remindedAt?.slice(0, 10) ?? '']));

  if (!data.invoices.length) return <p className={`${card} p-8 text-center text-sm text-zinc-500`}>Nothing overdue. 🎉</p>;
  return (
    <section className={`${card} p-2 sm:p-3`} aria-label="Overdue bills">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-1 pb-2">
        <span className="text-sm text-zinc-700 dark:text-zinc-200">{data.invoices.length} overdue · {totals.map(([c, v]) => money(v, c)).join(' + ')}</span>
        <span className="flex gap-1">
          <button type="button" onClick={csv} className="btn-ghost btn-sm"><Download className="w-4 h-4" /> CSV</button>
          <button type="button" onClick={() => void remind()} disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Remind families</button>
        </span>
      </div>
      <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
        {data.invoices.map((b) => <BillRow key={b.id} b={b} onOpen={() => onOpen(b.id)} extra={` · ${days(b.dueAt)} day${days(b.dueAt) === 1 ? '' : 's'} late${b.remindedAt ? ` · reminded ${format(new Date(b.remindedAt), 'd MMM')}` : ''}`} />)}
      </motion.ul>
    </section>
  );
}
