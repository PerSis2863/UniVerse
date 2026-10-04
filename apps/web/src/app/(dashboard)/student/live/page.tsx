'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Radio } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { PollResults } from '@/components/live/PollResults';
import { cn } from '@/lib/utils';

interface Poll { id: string; question: string; options: string[]; status: 'OPEN' | 'CLOSED'; course: { code: string; name: string }; myVote: number | null; results: number[] | null; total: number | null }

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';

/** Live polls from your teachers during class. */
export default function StudentLivePage() {
  const { data, error, isLoading, mutate } = useSWR<Poll[]>('/api/live', authedJson, {
    refreshInterval: (d) => (d?.some((p) => p.status === 'OPEN') ? 5000 : 30000),
  });
  const [sending, setSending] = useState<string | null>(null);

  const answer = async (p: Poll, option: number) => {
    setSending(p.id);
    try {
      await authedJson(`/api/live/${p.id}/vote`, { method: 'POST', body: JSON.stringify({ option }) });
      await mutate((list) => list?.map((x) => (x.id === p.id ? { ...x, myVote: option } : x)), { revalidate: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <Topbar title="Live class" subtitle="Answer your teacher’s questions during class" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-4 stagger">
          {error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : isLoading ? (
            <div className="h-40 rounded-2xl skeleton" />
          ) : !data?.length ? (
            <FeatureGuide
              icon={Radio}
              title="No live polls right now"
              description="When a teacher asks a question in class, it appears here and in your notifications. Tap an answer; you can change it until the poll closes."
              steps={['Your teacher starts a poll', 'You tap your answer', 'See the results when it closes']}
              example={<ExampleRow title="Which sorting algorithm is stable?" meta="CS201 · live now" right="Answer" />}
            />
          ) : (
            data.map((p) => (
              <section key={p.id} className={`${card} p-5 space-y-4`} aria-label={p.question}>
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${p.status === 'OPEN' ? 'text-rose-500' : 'text-zinc-500'}`}>{p.status === 'OPEN' ? '● Live' : 'Closed'} · {p.course.code}</p>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{p.question}</h2>
                </div>
                {p.results && p.total !== null && (p.status === 'CLOSED' || p.myVote !== null) ? (
                  <PollResults options={p.options} results={p.results} total={p.total} mine={p.myVote} />
                ) : p.status === 'OPEN' ? (
                  <div className="grid gap-2" role="radiogroup" aria-label="Answers">
                    {p.options.map((o, i) => (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={p.myVote === i}
                        disabled={sending === p.id}
                        onClick={() => answer(p, i)}
                        className={cn('w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors flex items-center justify-between', p.myVote === i ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'border-zinc-200 dark:border-white/10 hover:border-indigo-400 text-zinc-800 dark:text-zinc-200')}
                      >
                        {o}
                        {sending === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : p.myVote === i ? <CheckCircle2 className="w-4 h-4" /> : null}
                      </button>
                    ))}
                    {p.myVote !== null && <p className="text-xs text-zinc-500">Answer saved. You can change it until the poll closes.</p>}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">This poll has closed.</p>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
