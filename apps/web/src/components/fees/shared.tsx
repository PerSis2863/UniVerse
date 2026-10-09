'use client';

import { CheckCircle2, CircleDashed, Clock, MinusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared bits for school fees (Stage 5 · B15.2): money in minor units, bill statuses, CSV.

export type BillStatus = 'DUE' | 'PARTIAL' | 'PAID' | 'WAIVED' | 'CANCELLED';
export const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', BANK: 'Bank transfer', CHEQUE: 'Cheque', UPI: 'UPI', CARD: 'Card', OTHER: 'Other' };

/** 125000 INR → "₹1,250" (minor units; decimals only when there are some). */
export const money = (minor: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
};
/** Minor units → the number to show in an input ("1250" or "1250.50"). */
export const major = (minor: number) => (minor % 100 ? (minor / 100).toFixed(2) : String(minor / 100));

export function StatusChip({ status, overdue, className }: { status: BillStatus; overdue?: boolean; className?: string }) {
  const [label, tone, Icon] = overdue ? ['Overdue', 'text-rose-700 dark:text-rose-300 bg-rose-500/10', Clock]
    : status === 'PAID' ? ['Paid', 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', CheckCircle2]
    : status === 'PARTIAL' ? ['Part paid', 'text-amber-800 dark:text-amber-300 bg-amber-500/10', CircleDashed]
    : status === 'WAIVED' ? ['Waived', 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', MinusCircle]
    : status === 'CANCELLED' ? ['Cancelled', 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', XCircle]
    : ['Due', 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/10', Clock];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0', tone, className)}><Icon className="w-3 h-3" aria-hidden />{label}</span>;
}

/** Downloads rows as a CSV file (spreadsheet-safe: formulas are neutralised). */
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => { let x = String(v ?? ''); if (/^[=+\-@]/.test(x)) x = `'${x}`; return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
