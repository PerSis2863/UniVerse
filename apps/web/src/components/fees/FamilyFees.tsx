'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { format } from 'date-fns';
import { ChevronDown, Receipt, Wallet } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { METHOD_LABEL, StatusChip, money, type BillStatus } from './shared';

// School fees for a family (Stage 5 · B15.2 / B16.5): what's owed and when, every bill with its
// payments and receipts. Parents see each linked child's (/api/parent/fees), students their own
// (/api/student/fees). Paying online isn't switched on yet, so it says to pay at the office.

interface Bill {
  id: string; seq: number; label: string; currency: string; amount: number; discount: number; discountNote: string | null; paid: number; owed: number; overdue: boolean; dueAt: string; status: BillStatus;
  payments: { id: string; seq: number; amount: number; method: string; paidAt: string }[];
}
interface Data { bills: Bill[]; owed: Record<string, number>; next: { label: string; owed: number; currency: string; dueAt: string; overdue: boolean } | null; online: boolean }

export function FamilyFees({ url, who }: { url: string; who?: string }) {
  const { data } = useSWR<Data>(url, authedJson);
  const [open, setOpen] = useState(false);
  // Nothing billed: no card at all.
  if (!data || !data.bills.length) return null;
  const owed = Object.entries(data.owed);
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="mt-4 rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5" aria-label="School fees">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 text-left">
        <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', data.next?.overdue ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}><Wallet className="w-5 h-5" /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-zinc-900 dark:text-white">School fees{who ? ` · ${who}` : ''}</span>
          <span className={cn('block text-sm', data.next?.overdue ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-600 dark:text-zinc-300')}>
            {data.next ? `${money(data.next.owed, data.next.currency)} ${data.next.overdue ? 'overdue since' : 'due'} ${format(new Date(data.next.dueAt), 'd MMM')} · ${data.next.label}` : 'All paid. Thank you!'}
          </span>
          {owed.length > 0 && <span className="block text-xs text-zinc-500">Owed in all: {owed.map(([c, v]) => money(v, c)).join(' + ')}</span>}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {data.bills.map((b) => (
                <li key={b.id} className="py-2.5">
                  <div className="flex items-start gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{b.label}</span>
                      <span className="block text-xs text-zinc-500">Bill #{b.seq} · due {format(new Date(b.dueAt), 'd MMM yyyy')} · {money(b.amount - b.discount, b.currency)}{b.discount ? ` after ${money(b.discount, b.currency)} off` : ''}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      {b.owed > 0 && <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{money(b.owed, b.currency)}</span>}
                      <StatusChip status={b.status} overdue={b.overdue} />
                    </span>
                  </div>
                  {b.payments.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.payments.map((p) => (
                        <li key={p.id}>
                          <a href={`/fee-receipt/${p.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] min-h-8">
                            <Receipt className="w-3.5 h-3.5" aria-hidden /> #{p.seq} · {money(p.amount, b.currency)} · {METHOD_LABEL[p.method] ?? p.method} · {format(new Date(p.paidAt), 'd MMM')}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {!data.online && <p className="mt-2 text-[11px] text-zinc-500">Pay at the school office (cash, transfer, UPI or card); your receipt shows up here.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
