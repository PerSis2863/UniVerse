'use client';

import { use } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { METHOD_LABEL, money } from '@/components/fees/shared';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';

// A fee receipt to keep or print (Stage 5 · B15.2; src/server/fees.ts feeReceipt): for the school's
// admins, the student and their linked parents. Outside the app's frame, so it prints on its own.
// (/receipt/<id> is the receipt for online payments, a different record.)

interface Receipt {
  school: string; number: number; amount: number; currency: string; method: string; reference: string | null; note: string | null; paidAt: string;
  voided: { at: string; reason: string | null } | null; receivedBy: string;
  bill: { number: number; label: string; amount: number; discount: number; discountNote: string | null; paid: number; owed: number; status: string };
  student: { name: string; email: string };
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useSWR<Receipt>(`/api/fees/receipts/${encodeURIComponent(id)}`, authedJson);
  return (
    <main id="main" className="min-h-dvh px-4 py-8 print:p-0" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-xl mx-auto">
        {error && !data ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 p-6 text-center">
            <h1 className="font-bold text-zinc-900 dark:text-white">Receipt not available</h1>
            <p className="mt-1 text-sm text-zinc-500">{errorMessage(error, 'This receipt couldn’t be loaded.')} Receipts open for the school, the student and their parents.</p>
          </div>
        )
          : !data ? <ContentSkeleton variant="list" />
          : (
            <>
              <article className="relative rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 sm:p-8 text-zinc-900 dark:text-zinc-100 print:border-0 print:rounded-none print:bg-white print:text-black">
                {data.voided && (
                  <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300 print:text-black">
                    Voided on {format(new Date(data.voided.at), 'd MMM yyyy')}{data.voided.reason ? `: ${data.voided.reason}` : ''}. This receipt is not valid.
                  </p>
                )}
                <header className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-lg font-black">{data.school}</h1>
                    <p className="text-sm text-zinc-500 print:text-black">Fee receipt</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 print:text-black">Receipt</p>
                    <p className="text-xl font-black tabular-nums">#{String(data.number).padStart(6, '0')}</p>
                  </div>
                </header>
                <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <dt className="text-zinc-500 print:text-black">Student</dt><dd className="font-semibold">{data.student.name}</dd>
                  <dt className="text-zinc-500 print:text-black">Date</dt><dd>{format(new Date(data.paidAt), 'd MMMM yyyy')}</dd>
                  <dt className="text-zinc-500 print:text-black">For</dt><dd>{data.bill.label} <span className="text-zinc-500 print:text-black">(bill #{data.bill.number})</span></dd>
                  <dt className="text-zinc-500 print:text-black">Paid by</dt><dd>{METHOD_LABEL[data.method] ?? data.method}{data.reference ? ` · ref ${data.reference}` : ''}</dd>
                  {data.note && <><dt className="text-zinc-500 print:text-black">Note</dt><dd>{data.note}</dd></>}
                  <dt className="text-zinc-500 print:text-black">Received by</dt><dd>{data.receivedBy}</dd>
                </dl>
                <div className="mt-6 rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-4 flex items-center justify-between print:bg-white print:border print:border-black">
                  <span className="text-sm font-semibold">Amount received</span>
                  <span className={`text-2xl font-black tabular-nums ${data.voided ? 'line-through' : ''}`}>{money(data.amount, data.currency)}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-zinc-500 print:text-black">Bill</dt><dd className="text-right tabular-nums">{money(data.bill.amount, data.currency)}</dd>
                  {data.bill.discount > 0 && <><dt className="text-zinc-500 print:text-black">Discount{data.bill.discountNote ? ` (${data.bill.discountNote})` : ''}</dt><dd className="text-right tabular-nums">− {money(data.bill.discount, data.currency)}</dd></>}
                  <dt className="text-zinc-500 print:text-black">Paid so far</dt><dd className="text-right tabular-nums">{money(data.bill.paid, data.currency)}</dd>
                  <dt className="font-semibold">Balance</dt><dd className="text-right font-semibold tabular-nums">{data.bill.status === 'WAIVED' ? 'Waived' : money(data.bill.owed, data.currency)}</dd>
                </dl>
                <footer className="mt-8 pt-4 border-t border-zinc-200 dark:border-white/10 flex items-center gap-2 text-[11px] text-zinc-500 print:text-black">
                  <LogoMark className="w-4 h-4" /> Recorded in UniVerse. Keep this receipt for your records.
                </footer>
              </article>
              <div className="mt-4 flex justify-center gap-2 print:hidden">
                <button type="button" onClick={() => window.print()} className="btn-primary"><Printer className="w-4 h-4" /> Print or save as PDF</button>
              </div>
            </>
          )}
      </div>
    </main>
  );
}
