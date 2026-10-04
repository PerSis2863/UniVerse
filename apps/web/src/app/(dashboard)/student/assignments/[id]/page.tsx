'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';

interface RubricItem { id: string; criterion: string; description: string | null; points: number }
interface Detail {
  id: string;
  title: string;
  instructions: string;
  rubric: RubricItem[];
  maxScore: number;
  dueDate: string | null;
  status: 'OPEN' | 'CLOSED';
  course: { code: string; name: string };
  mine: {
    text: string;
    status: 'SUBMITTED' | 'RETURNED';
    submittedAt: string;
    returnedAt: string | null;
    score: number | null;
    feedback: string | null;
    criteriaScores: { id: string; score: number; comment: string }[] | null;
  } | null;
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const MAX = 20_000;

export default function StudentAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/assignments/${id}`, authedJson);
  const [text, setText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const answer = text ?? data?.mine?.text ?? '';
  const returned = data?.mine?.status === 'RETURNED';
  const canSubmit = !!data && data.status === 'OPEN' && !returned;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  const submit = async () => {
    setSending(true);
    try {
      const r = await authedJson<{ late: boolean }>(`/api/assignments/${id}/submission`, { method: 'PUT', body: JSON.stringify({ text: answer }) });
      toast.success(r.late ? 'Handed in (after the due date).' : 'Handed in. You can change it until it’s graded.');
      setText(null);
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (error) return <><Topbar title="Assignment" /><p className="p-8 text-sm text-rose-500">{(error as Error).message}</p></>;

  return (
    <>
      <Topbar title={data?.title ?? 'Assignment'} subtitle={data ? `${data.course.code} · ${data.course.name}` : undefined} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-5 stagger">
          <Link href="/student/assignments" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4" /> All assignments</Link>
          {isLoading || !data ? (
            <div className="h-64 rounded-2xl skeleton" />
          ) : (
            <>
              <section className={`${card} p-5 space-y-4`}>
                {data.dueDate && <p className="text-sm text-zinc-500">Due {new Date(data.dueDate).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{data.status === 'CLOSED' ? ' · closed' : ''}</p>}
                <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{data.instructions}</p>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">How it’s graded ({data.maxScore} points)</h3>
                  <ul className="space-y-1.5">
                    {data.rubric.map((r) => {
                      const got = data.mine?.criteriaScores?.find((c) => c.id === r.id);
                      return (
                        <li key={r.id} className="text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="text-zinc-800 dark:text-zinc-200">{r.criterion}{r.description && <span className="text-zinc-500"> · {r.description}</span>}</span>
                            <span className="font-semibold text-zinc-900 dark:text-white shrink-0">{got ? `${got.score}/` : ''}{r.points}</span>
                          </div>
                          {got?.comment && <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">{got.comment}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>

              {returned && data.mine && (
                <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-2" aria-label="Your grade">
                  <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="w-5 h-5" /> Graded: {data.mine.score}/{data.maxScore}</p>
                  {data.mine.feedback && <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{data.mine.feedback}</p>}
                </section>
              )}

              <section className={`${card} p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  <label htmlFor="answer" className="font-semibold text-zinc-900 dark:text-white">Your answer</label>
                  {data.mine && !returned && <span className="text-xs text-indigo-600 dark:text-indigo-300">Handed in {new Date(data.mine.submittedAt).toLocaleString()}</span>}
                </div>
                {canSubmit ? (
                  <>
                    <textarea
                      id="answer"
                      rows={14}
                      maxLength={MAX}
                      value={answer}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Write your answer here…"
                      className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-zinc-500">{words} words · {answer.length.toLocaleString()}/{MAX.toLocaleString()} characters</span>
                      <button type="button" className="btn-primary" onClick={submit} disabled={sending || answer.trim().length < 20 || (text === null && !!data.mine)} aria-busy={sending || undefined}>
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {data.mine ? 'Hand in new version' : 'Hand in'}
                      </button>
                    </div>
                  </>
                ) : data.mine ? (
                  <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{data.mine.text}</p>
                ) : (
                  <p className="text-sm text-zinc-500">This assignment is closed. Ask your teacher if you still need to hand it in.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
