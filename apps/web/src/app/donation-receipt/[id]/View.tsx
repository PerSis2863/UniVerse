'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import useSWR from 'swr';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { money } from '@/components/fees/shared';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';

// A donation receipt to keep or print (Stage 5 · Q16; src/server/donations.ts donationReceipt): for
// the donor and admins. With an Indian rupee gift to an NGO that has its 80G number and PAN, it
// carries the 80G details; the deduction itself needs the NGO's Form 10BE, which it says.

interface Receipt {
  number: string; status: string; paidAt: string; amount: number; currency: string; project: string; ngo: string;
  donor: { name: string; email: string | null; pan: string | null; address: string | null };
  collectedBy: string; payment: { method: string; reference: string | null };
  tax80G: { ngoPan: string; reg80G: string; donorPanGiven: boolean } | null;
}

function ReceiptPage({ id }: { id: string }) {
  const { data, error } = useSWR<Receipt>(`/api/impact/donations/${encodeURIComponent(id)}`, authedJson);
  const dt = 'text-zinc-500 print:text-black';
  return (
    <main id="main" className="min-h-dvh px-4 py-8 print:p-0" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-xl mx-auto">
        {error && !data ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 p-6 text-center">
            <h1 className="font-bold text-zinc-900 dark:text-white">Receipt not available</h1>
            <p className="mt-1 text-sm text-zinc-500">{errorMessage(error, 'This receipt couldn’t be loaded.')} Receipts open for the donor and the school’s admins.</p>
          </div>
        ) : !data ? <ContentSkeleton variant="list" /> : (
          <>
            <article className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-6 sm:p-8 text-zinc-900 dark:text-zinc-100 print:border-0 print:rounded-none print:bg-white print:text-black">
              {data.status === 'REFUNDED' && <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300 print:text-black">This donation was refunded. This receipt is no longer valid.</p>}
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-lg font-black break-words">{data.ngo}</h1>
                  <p className="text-sm text-zinc-500 print:text-black">Donation receipt</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 print:text-black">Receipt</p>
                  <p className="text-xl font-black tabular-nums">{data.number}</p>
                </div>
              </header>
              <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className={dt}>Donor</dt><dd className="font-semibold break-words">{data.donor.name}</dd>
                {data.donor.address && <><dt className={dt}>Address</dt><dd className="break-words">{data.donor.address}</dd></>}
                {data.donor.pan && <><dt className={dt}>Donor PAN</dt><dd className="font-mono">{data.donor.pan}</dd></>}
                <dt className={dt}>Date</dt><dd>{format(new Date(data.paidAt), 'd MMMM yyyy')}</dd>
                <dt className={dt}>For</dt><dd className="break-words">{data.project}</dd>
                <dt className={dt}>Paid by</dt><dd className="break-words">{data.payment.method}{data.payment.reference ? ` · ref ${data.payment.reference}` : ''}</dd>
                <dt className={dt}>Collected by</dt><dd className="break-words">{data.collectedBy}, on behalf of {data.ngo}</dd>
              </dl>
              <div className="mt-6 rounded-2xl bg-zinc-50 dark:bg-white/[0.04] p-4 flex items-center justify-between print:bg-white print:border print:border-black">
                <span className="text-sm font-semibold">Amount donated</span>
                <span className={`text-2xl font-black tabular-nums ${data.status === 'REFUNDED' ? 'line-through' : ''}`}>{money(data.amount, data.currency)}</span>
              </div>
              {data.tax80G && (
                <section className="mt-6 rounded-2xl border border-zinc-200 dark:border-white/10 p-4 text-sm space-y-2 print:border-black" aria-labelledby="tax-h">
                  <h2 id="tax-h" className="font-bold">Section 80G (India)</h2>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                    <dt className={dt}>NGO PAN</dt><dd className="font-mono">{data.tax80G.ngoPan}</dd>
                    <dt className={dt}>80G registration</dt><dd className="font-mono break-all">{data.tax80G.reg80G}</dd>
                  </dl>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 print:text-black">
                    {data.tax80G.donorPanGiven
                      ? `To claim the deduction you need Form 10BE, which ${data.ngo} issues after filing Form 10BD with your PAN. This receipt records the gift; keep it with Form 10BE.`
                      : 'No PAN was given, so this gift can’t be reported for an 80G deduction.'}
                  </p>
                </section>
              )}
              <footer className="mt-8 pt-4 border-t border-zinc-200 dark:border-white/10 flex items-center gap-2 text-[11px] text-zinc-500 print:text-black">
                <LogoMark className="w-4 h-4" /> Recorded in UniVerse. Keep this receipt for your records.
              </footer>
            </article>
            <div className="mt-4 flex justify-center gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="btn-primary"><Printer className="w-4 h-4" aria-hidden /> Print or save as PDF</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function DonationReceiptRoute() {
  const p = usePathParams('/donation-receipt/[id]');
  return p ? <ReceiptPage key={p.id} id={p.id} /> : <AddressLoading />;
}
