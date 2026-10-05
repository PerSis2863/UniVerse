'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

type Question = { id: string; question: string; options: string[]; correctAnswer: string; points: number };
type Submission = { id: string; score: number | null; maxScore: number | null; submittedAt: string; student: { name: string } };
type Quiz = {
  id: string; title: string; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; dueDate: string | null; timeLimit: number | null;
  course: { name: string; code: string }; questions: Question[]; submissions: Submission[];
};

const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

/** Teacher panel: publish/close a quiz, set due date and time limit, add questions, see results. */
export function QuizManager({ quizId, onClose, onChanged }: { quizId: string; onClose: () => void; onChanged: () => void }) {
  const { data: quiz, isLoading, error, mutate } = useSWR<Quiz>(`/api/quizzes/${quizId}`, authedJson);
  const [draft, setDraft] = useState({ question: '', options: ['', '', '', ''], correct: 0, points: 1 });
  const [busy, setBusy] = useState(false);

  const patch = async (body: object, ok: string) => {
    setBusy(true);
    try {
      await authedJson(`/api/quizzes/${quizId}`, { method: 'PATCH', body: JSON.stringify(body) });
      await mutate();
      onChanged();
      toast.success(ok);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const addQuestion = async () => {
    const options = draft.options.map((o) => o.trim()).filter(Boolean);
    const correctAnswer = draft.options[draft.correct]?.trim();
    setBusy(true);
    try {
      await authedJson(`/api/quizzes/${quizId}/questions`, { method: 'POST', body: JSON.stringify({ question: draft.question, options, correctAnswer, points: draft.points }) });
      setDraft({ question: '', options: ['', '', '', ''], correct: 0, points: 1 });
      await mutate();
      toast.success('Question added');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const removeQuestion = async (qid: string) => {
    try { await authedJson(`/api/quizzes/${quizId}/questions?qid=${qid}`, { method: 'DELETE' }); await mutate(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-in w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-zinc-200/70 dark:border-white/[0.07] bg-white/70 dark:bg-[#121830]/80 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 truncate">{quiz ? `${quiz.course.code} · ${quiz.course.name}` : 'Quiz'}</p>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white truncate">{quiz?.title ?? 'Loading…'}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-5 h-5" /></button>
        </div>

        {isLoading && <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>}
        {error && <p className="p-6 text-sm text-rose-500">{(error as Error).message}</p>}

        {quiz && (
          <div className="p-6 space-y-6">
            {/* Status & settings */}
            <section className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Status</p>
              <div className="flex flex-wrap gap-2">
                {(['DRAFT', 'PUBLISHED', 'CLOSED'] as const).map((st) => (
                  <button key={st} disabled={busy || quiz.status === st} onClick={() => patch({ status: st }, st === 'PUBLISHED' ? 'Quiz published — students can take it now' : st === 'CLOSED' ? 'Quiz closed' : 'Moved back to draft')}
                    className={cn('px-4 py-2 rounded-xl text-sm font-semibold transition-colors', quiz.status === st ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10')}>
                    {st === 'DRAFT' ? 'Draft' : st === 'PUBLISHED' ? 'Published' : 'Closed'}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-zinc-500">Due date
                  <input type="datetime-local" className={input} defaultValue={toLocalInput(quiz.dueDate)} onBlur={(e) => e.target.value !== toLocalInput(quiz.dueDate) && patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null }, 'Due date saved')} />
                </label>
                <label className="text-xs text-zinc-500">Time limit (minutes)
                  <input type="number" min={1} max={600} className={input} defaultValue={quiz.timeLimit ?? ''} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== quiz.timeLimit) patch({ timeLimit: v }, 'Time limit saved'); }} />
                </label>
              </div>
            </section>

            {/* Questions */}
            <section className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Questions ({quiz.questions.length})</p>
              {quiz.questions.length === 0 && <p className="text-sm text-zinc-500">No questions yet — add the first one below. A quiz needs at least one question before you can publish it.</p>}
              {quiz.questions.map((q, i) => (
                <div key={q.id} className="p-4 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-sm font-semibold text-zinc-900 dark:text-white">{i + 1}. {q.question} <span className="text-xs font-normal text-zinc-500">· {q.points} pt{q.points === 1 ? '' : 's'}</span></p>
                    <button onClick={() => removeQuestion(q.id)} aria-label="Delete question" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <ul className="mt-2 grid sm:grid-cols-2 gap-1.5">
                    {q.options.map((o) => (
                      <li key={o} className={cn('text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5', o === q.correctAnswer ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold' : 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400')}>
                        {o === q.correctAnswer && <CheckCircle2 className="w-3.5 h-3.5" />} {o}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="p-4 rounded-2xl border border-dashed border-indigo-300/60 dark:border-indigo-400/25 space-y-2.5">
                <textarea className={`${input} min-h-[70px]`} placeholder="Write a question…" value={draft.question} maxLength={1000} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
                {draft.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={draft.correct === i} onChange={() => setDraft({ ...draft, correct: i })} aria-label={`Option ${i + 1} is correct`} className="accent-indigo-600" />
                    <input className={input} placeholder={`Option ${i + 1}${i < 2 ? '' : ' (optional)'}`} value={o} maxLength={300} onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-zinc-500 flex items-center gap-2">Points <input type="number" min={0.5} max={100} step={0.5} value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} className="w-20 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white" /></label>
                  <button onClick={addQuestion} disabled={busy || !draft.question.trim()} className="btn-primary"><Plus className="w-4 h-4" /> Add question</button>
                </div>
                <p className="text-[11px] text-zinc-500">Select the circle next to the correct answer.</p>
              </div>
            </section>

            {/* Results */}
            <section className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Results ({quiz.submissions.length})</p>
              {quiz.submissions.length === 0 ? <p className="text-sm text-zinc-500">No submissions yet.</p> : quiz.submissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.03] text-sm">
                  <span className="text-zinc-800 dark:text-zinc-200">{s.student.name}</span>
                  <span className="font-bold text-zinc-900 dark:text-white tabular-nums">{s.score ?? 0}/{s.maxScore ?? 0} <span className="text-xs text-zinc-500 font-normal">· {new Date(s.submittedAt).toLocaleDateString()}</span></span>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
