'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { HeartHandshake, Receipt } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { money } from '@/components/fees/shared';
import { useAuthStore } from '@/store/auth';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list } from '@/lib/motion';
import { usePaymentReturn } from '@/lib/use-payment-return';

// Stage 5 · Q16: my donations to NGO projects and their receipts. Stripe sends donors back here,
// where the payment is checked with Stripe before it counts (src/lib/use-payment-return.ts).

interface Donation { id: string; projectName: string; ngoName: string; amount: number; currency: string; status: string; receipt: string | null; paidAt: string; with80G: boolean }

export default function DonationsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const { data, error, isLoading, mutate } = useSWR<{ donations: Donation[] }>('/api/impact/donations', authedJson);
  usePaymentReturn(() => { void mutate(); });
  const rows = data?.donations ?? [];
  return (
    <>
      <Topbar title="My donations" subtitle="Gifts to NGO projects, with receipts" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-3xl mx-auto w-full min-w-0 space-y-4">
          {error ? (
            <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load your donations.'}</p><button type="button" className="btn-secondary btn-sm mt-3" onClick={() => mutate()}>Try again</button></div>
          ) : isLoading || !data ? <ContentSkeleton variant="list" /> : rows.length ? (
            <motion.ul variants={list} initial="hidden" animate="show" className="panel divide-y divide-zinc-200 dark:divide-white/10">
              {rows.map((d) => (
                <motion.li key={d.id} variants={fadeUp} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <HeartHandshake className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-white break-words">{d.projectName}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">{d.ngoName} · {new Date(d.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{d.status === 'REFUNDED' ? ' · Refunded' : ''}{d.with80G ? ' · 80G' : ''}</p>
                  </div>
                  <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{money(d.amount, d.currency)}</span>
                  {d.receipt && <a href={`/donation-receipt/${d.id}`} target="_blank" rel="noopener" className="btn-secondary btn-sm"><Receipt className="w-4 h-4" aria-hidden /> Receipt {d.receipt}</a>}
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <div className="panel"><EmptyState icon={HeartHandshake} title="No donations yet" hint="NGO projects that take donations have a Donate button." action={role === 'STUDENT' ? { label: 'See NGO projects', href: '/student/impact/ngo-marketplace' } : undefined} /></div>
          )}
        </div>
      </div>
    </>
  );
}
