'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { loose } from '@/lib/question-types';

// For the teaching team (Stage 5 · B4.1, src/server/quiz-marking.ts): a short-answer question's
// answers that didn't match the key. Accepting one gives everyone who wrote it the points.

interface Data { accepted: string[]; wrong: { answer: string; count: number }[] }

export function ShortAnswerReview({ quizId, questionId, onChanged }: { quizId: string; questionId: string; onChanged: () => void }) {
  const key = `/api/quizzes/${quizId}/short-answers?questionId=${encodeURIComponent(questionId)}`;
  const { data, mutate } = useSWR<Data>(key, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Map<string, string> | null>(null);
  const change = async (action: 'accept' | 'unaccept', answer: string) => {
    setBusy(answer);
    try {
      const r = await authedJson<{ accepted: string[]; rescored: number }>(`/api/quizzes/${quizId}/short-answers`, { method: 'POST', body: JSON.stringify({ action, questionId, answer }) });
      toast.success(action === 'accept' ? `Accepted. ${r.rescored} hand-in${r.rescored === 1 ? '' : 's'} marked again.` : 'No longer accepted.');
      await mutate();
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'That couldn’t be changed.')); }
    finally { setBusy(null); }
  };
  const suggest = async () => {
    setBusy('ai');
    try {
      const r = await authedJson<{ suggestions: { answer: string; reason: string }[] }>(`/api/quizzes/${quizId}/short-answers/suggest`, { method: 'POST', body: JSON.stringify({ questionId }) });
      setIdeas(new Map(r.suggestions.map((s) => [loose(s.answer), s.reason])));
      if (!r.suggestions.length) toast('The AI thinks none of them mean the same.');
    } catch (e) { toast.error(errorMessage(e, 'No suggestions right now.')); }
    finally { setBusy(null); }
  };
  if (!data) return <p className="text-xs text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the answers…</p>;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-zinc-700 dark:text-zinc-300"><span className="font-semibold">Accepted: </span>
        {data.accepted.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 me-1.5 mb-1 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 ps-2 pe-0.5 py-0.5">{a}
            {data.accepted.length > 1 && <button type="button" onClick={() => void change('unaccept', a)} disabled={!!busy} aria-label={`Stop accepting “${a}”`} className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-emerald-500/20"><X className="w-3.5 h-3.5" /></button>}
          </span>
        ))}
      </p>
      {data.wrong.length === 0 ? <p className="text-xs text-zinc-600 dark:text-zinc-400">No other answers so far.</p> : <>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Marked wrong ({data.wrong.length} different)</p>
          <button type="button" onClick={() => void suggest()} disabled={!!busy} className="btn-ghost btn-sm">{busy === 'ai' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Which are right?</button>
        </div>
        <ul className="space-y-1">
          {data.wrong.map((w) => {
            const idea = ideas?.get(loose(w.answer));
            return (
              <li key={w.answer} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${idea != null ? 'border-indigo-500/40 bg-indigo-500/[0.06]' : 'border-zinc-200 dark:border-white/10'}`}>
                <span className="flex-1 min-w-0 break-words text-zinc-800 dark:text-zinc-200">{w.answer} <span className="text-xs text-zinc-600 dark:text-zinc-400">· {w.count}</span>
                  {idea != null && <span className="block text-xs text-indigo-800 dark:text-indigo-300">AI: probably right{idea ? `, ${idea}` : ''}</span>}
                </span>
                <button type="button" onClick={() => void change('accept', w.answer)} disabled={!!busy} className="btn-secondary btn-sm">{busy === w.answer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept</button>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">Accepting an answer gives the points to everyone who wrote it, now and later.</p>
      </>}
    </div>
  );
}
