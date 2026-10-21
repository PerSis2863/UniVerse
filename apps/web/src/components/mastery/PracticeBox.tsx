'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { CheckCircle2, Dumbbell, Lightbulb, Loader2, RotateCcw, SkipForward, XCircle } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp } from '@/lib/motion';
import type { Given } from '@/lib/question-types';
import { AnswerInput, hasAnswer, type AskedQuestion } from '@/components/quizzes/AnswerInput';

// Adaptive practice (Stage 5 · B4.4, src/server/practice.ts) on the student's Mastery page: one
// question at a time, picked by what they haven't mastered; unlimited tries, a hint after a wrong one,
// the answer after three, and the teacher's explanation. Only the first try counts.

interface Next { next: (AskedQuestion & { source: string; hasHint: boolean }) | null; why?: string; stats: { today: number; rightFirst: number } }
interface Try { right: boolean; credit: number; tries: number; hint: string | null; correctAnswer: string | null; explain: string | null; done: boolean }

export function PracticeBox({ courseId }: { courseId: string }) {
  // Questions passed over with "Another question", set aside for now.
  const [skipped, setSkipped] = useState<string[]>([]);
  const { data, mutate, isLoading } = useSWR<Next>(`/api/courses/${courseId}/practice${skipped.length ? `?skip=${encodeURIComponent(skipped.join(','))}` : ''}`, authedJson, { revalidateOnFocus: false, keepPreviousData: true });
  const [answer, setAnswer] = useState<Given | undefined>(undefined);
  const [result, setResult] = useState<Try | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = data?.next ?? null;
  // An order question left as shown counts as that order.
  const given = answer ?? (q?.type === 'ORDER' ? q.options : undefined);

  const send = async (body: Record<string, unknown>) => {
    if (!q) return;
    setBusy(true); setError(null);
    try { setResult(await authedJson<Try>(`/api/courses/${courseId}/practice`, { method: 'POST', body: JSON.stringify({ questionId: q.id, ...body }) })); }
    catch (e) { setError(errorMessage(e, 'That couldn’t be checked. Try again.')); }
    finally { setBusy(false); }
  };
  const next = async () => { setAnswer(undefined); setResult(null); setError(null); await mutate(); };

  return (
    <section className="panel p-5 space-y-3" aria-labelledby="practice-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="practice-title" className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Dumbbell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Practice</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Questions picked for what you’re still learning. Try as often as you like; it never changes a grade.</p>
        </div>
        {data && data.stats.today > 0 && <p className="text-xs text-zinc-700 dark:text-zinc-300 text-end shrink-0">Today: {data.stats.today} practised<br />{data.stats.rightFirst} right first time</p>}
      </div>
      {isLoading || !data ? <p className="text-sm text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Finding a question…</p>
        : !q ? <p className="text-sm text-zinc-600 dark:text-zinc-400">Nothing to practise yet. Questions appear here when your teacher adds a practice set or a quiz closes.</p>
        : (
          <motion.div key={q.id} variants={fadeUp} initial="hidden" animate="show" className="space-y-3">
            {data.why && <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{data.why} <span className="text-zinc-600 dark:text-zinc-400 font-normal">· from “{q.source}”</span></p>}
            <h3 className="font-semibold text-zinc-900 dark:text-white">{q.question}</h3>
            <AnswerInput q={q} compact label="Your answer" value={answer} onChange={(v) => { setAnswer(v); if (result && !result.done) setResult(null); }} />
            {result && (
              <div role="status" className={`rounded-xl border px-3 py-2 text-sm space-y-1 ${result.right ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'}`}>
                <p className="font-semibold flex items-center gap-1.5">{result.right ? <><CheckCircle2 className="w-4 h-4" /> Right{result.tries > 1 ? ` (try ${result.tries})` : ''}!</> : result.correctAnswer ? <><XCircle className="w-4 h-4" /> The answer</> : <><XCircle className="w-4 h-4" /> Not quite{result.credit > 0 ? ': partly right' : ''}. Try again.</>}</p>
                {result.hint && <p className="flex gap-1.5"><Lightbulb className="w-4 h-4 shrink-0 mt-0.5" /> <span><span className="font-semibold">Hint: </span>{result.hint}</span></p>}
                {result.correctAnswer && <p><span className="font-semibold">Right answer: </span>{result.correctAnswer}</p>}
                {result.explain && <p><span className="font-semibold">Why: </span>{result.explain}</p>}
              </div>
            )}
            {error && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {result?.done ? (
                <button type="button" onClick={() => void next()} className="btn-primary btn-sm"><SkipForward className="w-4 h-4" /> Next question</button>
              ) : <>
                <button type="button" onClick={() => void send({ answer: given })} disabled={busy || !hasAnswer(given)} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check</button>
                {result && <button type="button" onClick={() => void send({ giveUp: true })} disabled={busy} className="btn-ghost btn-sm"><RotateCcw className="w-4 h-4" /> Show the answer</button>}
                {!result && <button type="button" onClick={() => { setAnswer(undefined); setError(null); setSkipped((s) => [...s.filter((x) => x !== q.id), q.id].slice(-30)); }} disabled={busy} className="btn-ghost btn-sm"><SkipForward className="w-4 h-4" /> Another question</button>}
              </>}
            </div>
          </motion.div>
        )}
    </section>
  );
}
