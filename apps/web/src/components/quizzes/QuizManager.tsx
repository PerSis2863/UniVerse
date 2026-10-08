'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Plus, Trash2, X } from 'lucide-react';
import type { ItemResult } from '@/lib/item-analysis';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

type Question = { id: string; question: string; options: string[]; correctAnswer: string; points: number };
type Submission = { id: string; score: number | null; maxScore: number | null; submittedAt: string; student: { name: string } };
type Quiz = {
  id: string; title: string; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; dueDate: string | null; timeLimit: number | null;
  course: { name: string; code: string }; questions: Question[]; submissions: Submission[];
  analysis?: { students: number; items: ItemResult[]; consistency: number | null; toFix: number };
};

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
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
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
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const removeQuestion = async (qid: string) => {
    try { await authedJson(`/api/quizzes/${quizId}/questions?qid=${qid}`, { method: 'DELETE' }); await mutate(); } catch (e) { toast.error((e as Error).message); }
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

        {isLoading && <div className="p-10"><ContentSkeleton variant="list" /></div>}
        {error && <p className="p-6 text-sm text-rose-500">{(error as Error).message}</p>}

        {quiz && (
          <div className="p-6 space-y-6">
            {/* Status & settings */}
            <section className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Status</p>
              <div className="flex flex-wrap gap-2">
                {(['DRAFT', 'PUBLISHED', 'CLOSED'] as const).map((st) => (
                  <button key={st} disabled={busy || quiz.status === st} onClick={() => patch({ status: st }, st === 'PUBLISHED' ? 'Quiz published — students can take it now' : st === 'CLOSED' ? 'Quiz closed' : 'Moved back to draft')}
                    className={cn('relative isolate px-4 py-2 rounded-xl text-sm font-semibold transition-colors', quiz.status === st ? 'text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10')}>{quiz.status === st && <TabPill id="mponents-quizzes-quizmanager-0" />}
                    {st === 'DRAFT' ? 'Draft' : st === 'PUBLISHED' ? 'Published' : 'Closed'}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-zinc-500">Due date
                  <input type="datetime-local" className="input" defaultValue={toLocalInput(quiz.dueDate)} onBlur={(e) => e.target.value !== toLocalInput(quiz.dueDate) && patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null }, 'Due date saved')} />
                </label>
                <label className="text-xs text-zinc-500">Time limit (minutes)
                  <input type="number" min={1} max={600} className="input" defaultValue={quiz.timeLimit ?? ''} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== quiz.timeLimit) patch({ timeLimit: v }, 'Time limit saved'); }} />
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
                <textarea className={`input min-h-[70px]`} placeholder="Write a question…" value={draft.question} maxLength={1000} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
                {draft.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={draft.correct === i} onChange={() => setDraft({ ...draft, correct: i })} aria-label={`Option ${i + 1} is correct`} className="accent-indigo-600" />
                    <input className="input" placeholder={`Option ${i + 1}${i < 2 ? '' : ' (optional)'}`} value={o} maxLength={300} onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-zinc-500 flex items-center gap-2">Points <input type="number" min={0.5} max={100} step={0.5} value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })} className="w-20 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white" /></label>
                  <button onClick={addQuestion} disabled={busy || !draft.question.trim()} className="btn-primary"><Plus className="w-4 h-4" /> Add question</button>
                </div>
                <p className="text-[11px] text-zinc-500">Select the circle next to the correct answer.</p>
              </div>
            </section>

            {quiz.analysis && quiz.analysis.students >= 2 && <ItemAnalysis questions={quiz.questions} analysis={quiz.analysis} />}

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

/** How each question worked (Stage 5 · B4.6, src/lib/item-analysis.ts), questions to fix first. */
function ItemAnalysis({ questions, analysis }: { questions: Question[]; analysis: NonNullable<Quiz['analysis']> }) {
  const byId = new Map(analysis.items.map((i) => [i.id, i]));
  const ordered = [...questions].sort((a, b) => Number(byId.get(b.id)?.fix ?? false) - Number(byId.get(a.id)?.fix ?? false));
  const separation = (d: number | null) => (d == null ? null : d >= 0.3 ? 'separates well' : d >= 0.15 ? 'separates a little' : d >= 0 ? 'doesn’t separate' : 'reversed');
  return (
    <section className="space-y-2" aria-labelledby="item-analysis">
      <p id="item-analysis" className="text-xs font-bold uppercase tracking-widest text-zinc-500">How the questions worked</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        From {analysis.students} students. {analysis.toFix ? <b className="text-amber-700 dark:text-amber-300">{analysis.toFix} question{analysis.toFix === 1 ? '' : 's'} to check.</b> : 'No question looks broken.'}
        {analysis.consistency != null && <> Consistency {analysis.consistency.toFixed(2)} ({analysis.consistency >= 0.7 ? 'good for a test' : analysis.consistency >= 0.5 ? 'fair' : 'low: questions may test different things'}).</>}
      </p>
      {ordered.map((q) => {
        const a = byId.get(q.id);
        if (!a) return null;
        const most = Math.max(1, ...a.counts.map((c) => c.n));
        return (
          <div key={q.id} className={cn('p-3 rounded-2xl border', a.fix ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-zinc-200/70 dark:border-white/[0.07]')}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-white min-w-0">{q.question}</p>
              <span className="text-xs text-zinc-500 shrink-0 text-right">{a.right != null && <b className="text-zinc-900 dark:text-white">{Math.round(a.right * 100)}% right</b>}{separation(a.separates) && <><br />{separation(a.separates)}</>}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {a.counts.map((c) => (
                <li key={c.option} className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2 text-xs">
                  <span className={cn('truncate', c.correct ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300')}>{c.correct && <CheckCircle2 className="w-3 h-3 inline mr-1" aria-label="Right answer" />}{c.option}</span>
                  <span className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><span className={cn('block h-full rounded-full', c.correct ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-500')} style={{ width: `${(c.n / most) * 100}%` }} /></span>
                  <span className="tabular-nums text-zinc-500 text-right">{c.n}</span>
                </li>
              ))}
              {a.blank > 0 && <li className="text-[11px] text-zinc-500">{a.blank} left it blank</li>}
            </ul>
            {a.flags.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {a.flags.map((f) => <li key={f} className="text-xs text-amber-800 dark:text-amber-300 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />{f}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
