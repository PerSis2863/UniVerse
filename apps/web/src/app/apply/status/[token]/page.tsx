'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { format } from 'date-fns';
import { Check, CheckCircle2, Clock, Loader2, MessageSquareText, Printer, X } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog } from '@/components/ui/Dialogs';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/utils';

// A family's private application page (Stage 5 · B15.1; src/server/admissions.ts familyStatus): where
// the application is, messages from the school, the offer letter with Accept / Decline, and
// withdrawing. The link is the key: no account and no email.

interface Status {
  school: string; round: string; ref: string; studentName: string; submittedAt: string; stage: string; stageLabel: string; explanation: string; message: string | null;
  offer: { letter: string; sentAt: string | null; expiresAt: string | null; respondedAt: string | null } | null;
  canRespond: boolean; offerExpired: boolean; canWithdraw: boolean; documents: string[];
}
const getJson = async (url: string) => { const r = await fetch(url); const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body.error ?? 'Couldn’t load this.'); return body; };
const GOOD = ['OFFERED', 'ACCEPTED', 'ENROLLED'], ENDED = ['DECLINED', 'REJECTED', 'WITHDRAWN'];

export default function ApplicationStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const key = `/api/admissions/status/${encodeURIComponent(token)}`;
  const { data, error, mutate } = useSWR<Status>(key, getJson, { refreshInterval: 120_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const act = async (action: 'accept' | 'decline' | 'withdraw') => {
    const text = action === 'accept' ? { title: 'Accept the offer?', message: 'The school will then complete the enrolment.', confirmLabel: 'Accept offer' }
      : action === 'decline' ? { title: 'Decline the offer?', message: 'The place goes to someone else. This can’t be undone here.', confirmLabel: 'Decline offer', destructive: true }
      : { title: 'Withdraw the application?', message: 'The school stops considering it. This can’t be undone here.', confirmLabel: 'Withdraw', destructive: true };
    if (!(await confirmDialog(text))) return;
    setBusy(action);
    setProblem(null);
    try {
      const r = await fetch(key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setProblem(body.error ?? 'Couldn’t send your answer.');
      await mutate();
    } catch { setProblem('You seem to be offline. Try again.'); }
    finally { setBusy(null); }
  };

  return (
    <main id="main" className="min-h-dvh px-4 py-8 sm:py-12 print:p-0" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto">
        <p className="mb-6 flex items-center gap-2 font-black text-zinc-900 dark:text-white print:text-black"><LogoMark className="w-7 h-7" /> {data?.school ?? 'UniVerse'}</p>
        {error && !data ? (
          <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-6 text-center">
            <h1 className="font-bold text-zinc-900 dark:text-white">Application not found</h1>
            <p className="mt-1 text-sm text-zinc-500">{error.message} Check you copied the whole link.</p>
          </section>
        ) : !data ? <ContentSkeleton variant="list" /> : (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
            <section className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-6 print:hidden">
              <p className="text-xs text-zinc-500">{data.round} · reference <span className="font-mono font-semibold">{data.ref}</span> · sent {format(new Date(data.submittedAt), 'd MMM yyyy')}</p>
              <h1 className="mt-1 text-2xl font-black text-zinc-900 dark:text-white">{data.studentName}</h1>
              <div className={cn('mt-4 rounded-2xl p-4 flex items-start gap-3', GOOD.includes(data.stage) ? 'bg-emerald-500/10' : ENDED.includes(data.stage) ? 'bg-zinc-500/10' : 'bg-indigo-500/10')}>
                {GOOD.includes(data.stage) ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden /> : <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" aria-hidden />}
                <div>
                  <p className="font-bold text-zinc-900 dark:text-white">{data.stageLabel}</p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{data.explanation}</p>
                </div>
              </div>
              {data.message && (
                <div className="mt-3 rounded-2xl border border-zinc-200 dark:border-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5"><MessageSquareText className="w-3.5 h-3.5" aria-hidden /> From the school</p>
                  <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap">{data.message}</p>
                </div>
              )}
            </section>

            {data.offer && (
              <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-5 sm:p-8 print:border-0 print:bg-white print:text-black" aria-labelledby="offer-title">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="offer-title" className="font-bold text-zinc-900 dark:text-white print:text-black">Offer letter</h2>
                  <button type="button" onClick={() => window.print()} className="btn-ghost btn-sm print:hidden"><Printer className="w-4 h-4" /> Print</button>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap print:text-black">{data.offer.letter}</p>
                {data.offer.expiresAt && data.stage === 'OFFERED' && <p className="mt-4 text-xs text-zinc-500 print:text-black">Please answer by {format(new Date(data.offer.expiresAt), 'd MMMM yyyy')}.</p>}
                {data.canRespond && (
                  <div className="mt-5 flex flex-col sm:flex-row gap-2 print:hidden">
                    <button type="button" onClick={() => void act('accept')} disabled={!!busy} className="btn-primary flex-1">{busy === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept the offer</button>
                    <button type="button" onClick={() => void act('decline')} disabled={!!busy} className="btn-secondary flex-1">{busy === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Decline</button>
                  </div>
                )}
                {data.offerExpired && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400 print:hidden">The time to answer has passed. Please contact the school.</p>}
                {data.offer.respondedAt && <p className="mt-4 text-xs text-zinc-500 print:text-black">You answered on {format(new Date(data.offer.respondedAt), 'd MMMM yyyy')}.</p>}
              </section>
            )}

            {problem && <p className="text-sm text-rose-600 dark:text-rose-400 print:hidden" role="alert">{problem}</p>}
            <section className="text-xs text-zinc-500 space-y-2 print:hidden">
              {data.documents.length > 0 && <p>Documents sent: {data.documents.join(', ')}.</p>}
              <p>Keep this page’s link: it’s the only way to see your application. It updates by itself.</p>
              {data.canWithdraw && <button type="button" onClick={() => void act('withdraw')} disabled={!!busy} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400">{busy === 'withdraw' && <Loader2 className="w-4 h-4 animate-spin" />} Withdraw the application</button>}
            </section>
          </motion.div>
        )}
      </div>
    </main>
  );
}
