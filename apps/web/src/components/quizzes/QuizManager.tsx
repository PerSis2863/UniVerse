'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Library, Loader2, Plus, Trash2, Wand2, X } from 'lucide-react';
import type { ItemResult } from '@/lib/item-analysis';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { ReadingLevelControl, fetchLevels, useReadingLevel } from '@/components/shared/ReadingLevel';
import { errorMessage } from '@/lib/api';
import { QuestionEditor, QuestionKey, draftReady, emptyDraft, toBody } from './QuestionEditor';
import { ShortAnswerReview } from './ShortAnswerReview';
import { TYPE_LABELS, typeOf } from '@/lib/question-types';

type Question = { id: string; question: string; options: string[]; correctAnswer: string; points: number; type?: string; meta?: string | null };
type Integrity = { left: number; pasted: number; fullscreenExits: number; overtimeSeconds: number; noStart: boolean };
type Submission = { id: string; score: number | null; maxScore: number | null; submittedAt: string; integrity?: Integrity | null; student: { name: string } };
type Quiz = {
  id: string; courseId?: string; title: string; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; dueDate: string | null; timeLimit: number | null; shuffle?: boolean; examMode?: boolean; plainWords?: boolean;
  course: { name: string; code: string }; questions: Question[]; submissions: Submission[];
  analysis?: { students: number; items: ItemResult[]; consistency: number | null; toFix: number };
};

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

/** Teacher panel: publish/close a quiz, set due date and time limit, add questions, see results. */
export function QuizManager({ quizId, onClose, onChanged }: { quizId: string; onClose: () => void; onChanged: () => void }) {
  const { data: quiz, isLoading, error, mutate } = useSWR<Quiz>(`/api/quizzes/${quizId}`, authedJson);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [points, setPoints] = useState(1);
  const [busy, setBusy] = useState(false);

  // Copies a question into the course's question bank (Stage 5 · B4.1) to reuse in other quizzes.
  const saveToBank = async (questionId: string) => {
    if (!quiz?.courseId) return;
    try {
      await authedJson(`/api/courses/${quiz.courseId}/question-bank`, { method: 'POST', body: JSON.stringify({ action: 'save-from-quiz', questionId }) });
      toast.success('Saved to the question bank');
    } catch (e) { toast.error((e as Error).message); }
  };

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
    setBusy(true);
    const sent = draft;
    try {
      await authedJson(`/api/quizzes/${quizId}/questions`, { method: 'POST', body: JSON.stringify({ ...toBody(sent), points }) });
      // The next question starts with the same type (unless they've started another one meanwhile).
      setDraft((d) => (d === sent ? emptyDraft(sent.type) : d));
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
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-medium text-zinc-900 dark:text-white">Shuffle questions and answers</p><p className="text-xs text-zinc-500">Each student gets their own order (the same if they reload).</p></div>
                  <Switch checked={!!quiz.shuffle} disabled={busy} onChange={(v) => void patch({ shuffle: v }, v ? 'Questions and answers are shuffled for each student' : 'Same order for everyone')} label="Shuffle questions and answers" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-medium text-zinc-900 dark:text-white">Exam mode</p><p className="text-xs text-zinc-500">The time limit counts from when each student starts, on the server. You see how often they left the quiz, pasted or left full screen. No webcam, nothing recorded.</p></div>
                  <Switch checked={!!quiz.examMode} disabled={busy} onChange={(v) => void patch({ examMode: v }, v ? 'Exam mode on' : 'Exam mode off')} label="Exam mode" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-medium text-zinc-900 dark:text-white">Reading help</p><p className="text-xs text-zinc-500 dark:text-zinc-400">Students can see the questions in simpler words or in their language, and listen to them; the answers stay as written. Turn it off when reading the words is what you’re testing.</p></div>
                  <Switch checked={quiz.plainWords !== false} disabled={busy} onChange={(v) => void patch({ plainWords: v }, v ? 'Reading help on' : 'Reading help off')} label="Reading help" />
                </div>
                {quiz.plainWords !== false && quiz.questions.length > 0 && <PrepareLevels ids={quiz.questions.map((q) => q.id)} />}
              </div>
            </section>

            {/* Questions */}
            <section className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Questions ({quiz.questions.length})</p>
              {quiz.questions.length === 0 && <p className="text-sm text-zinc-500">No questions yet — add the first one below. A quiz needs at least one question before you can publish it.</p>}
              {quiz.questions.map((q, i) => (
                <div key={q.id} className="p-4 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{i + 1}. {q.question} <span className="text-xs font-normal text-zinc-500">· {TYPE_LABELS[typeOf(q)]} · {q.points} pt{q.points === 1 ? '' : 's'}</span></p>
                      {quiz.plainWords !== false && <QuestionLevels id={q.id} text={q.question} />}
                    </div>
                    {quiz.courseId && <button onClick={() => void saveToBank(q.id)} aria-label="Save to the question bank" title="Save to the question bank" className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500"><Library className="w-4 h-4" /></button>}
                    <button onClick={() => removeQuestion(q.id)} aria-label="Delete question" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <QuestionKey q={q} />
                  {typeOf(q) === 'SHORT' && quiz.submissions.length > 0 && <CheckShortAnswers quizId={quizId} questionId={q.id} onChanged={() => { void mutate(); onChanged(); }} />}
                </div>
              ))}

              <div className="p-4 rounded-2xl border border-dashed border-indigo-300/60 dark:border-indigo-400/25 space-y-2.5">
                <QuestionEditor draft={draft} onChange={setDraft} idPrefix={`quiz-${quizId}`} />
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2">Points <input type="number" min={0.5} max={100} step={0.5} value={points} onChange={(e) => setPoints(Number(e.target.value))} className="w-20 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white" /></label>
                  <button onClick={addQuestion} disabled={busy || !draftReady(draft)} className="btn-primary"><Plus className="w-4 h-4" /> Add question</button>
                </div>
              </div>
            </section>

            {quiz.analysis && quiz.analysis.students >= 2 && <ItemAnalysis questions={quiz.questions} analysis={quiz.analysis} />}

            {/* Results */}
            <section className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Results ({quiz.submissions.length})</p>
              {quiz.submissions.length === 0 ? <p className="text-sm text-zinc-500">No submissions yet.</p> : quiz.submissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-white/60 dark:bg-white/[0.03] text-sm">
                  <span className="min-w-0"><span className="text-zinc-800 dark:text-zinc-200">{s.student.name}</span>{s.integrity && <IntegrityNote i={s.integrity} />}</span>
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

/** Students' short answers that didn't match the key, loaded when opened. */
function CheckShortAnswers({ quizId, questionId, onChanged }: { quizId: string; questionId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-2" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-xs font-semibold text-indigo-700 dark:text-indigo-300">Check the answers</summary>
      {open && <div className="mt-2"><ShortAnswerReview quizId={quizId} questionId={questionId} onChanged={onChanged} /></div>}
    </details>
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

/** Exam mode signals for one submission: worth a conversation, not a verdict. */
function IntegrityNote({ i }: { i: Integrity }) {
  const notes = [
    i.left ? `left the quiz ${i.left}×` : '',
    i.pasted ? `pasted ${i.pasted}×` : '',
    i.fullscreenExits ? `left full screen ${i.fullscreenExits}×` : '',
    i.overtimeSeconds ? `arrived ${Math.ceil(i.overtimeSeconds / 60)} min after the time limit` : '',
    i.noStart ? 'no start time (taken offline?)' : '',
  ].filter(Boolean);
  return <span className={cn('block text-[11px]', notes.length ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-500')}>{notes.length ? notes.join(' · ') : 'Exam mode: nothing to note'}</span>;
}

/** A question in simpler words, for the teacher to check (and correct: Edit), as students would see it (Stage 5 · D9). */
function QuestionLevels({ id, text }: { id: string; text: string }) {
  const r = useReadingLevel('quiz-question', id, '', { auto: false });
  return (
    <>
      {r.leveled && <p className="mt-1.5 text-sm rounded-xl bg-indigo-500/[0.06] dark:bg-indigo-400/[0.08] px-3 py-2 text-zinc-800 dark:text-zinc-200">{r.leveled.text}</p>}
      <ReadingLevelControl r={r} speakText={r.leveled?.text ?? text} />
    </>
  );
}

/** Makes both simpler versions of every question now, so students don't wait (and don't use their AI allowance). */
function PrepareLevels({ ids }: { ids: string[] }) {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const run = async () => {
    const total = ids.length * 2;
    setBusy({ done: 0, total });
    try {
      let done = 0;
      for (const level of ['g8', 'g5'] as const) {
        for (let i = 0; i < ids.length; i += 6) {
          await fetchLevels(ids.slice(i, i + 6).map((id) => ({ kind: 'quiz-question' as const, id })), level);
          done += Math.min(6, ids.length - i);
          setBusy({ done, total });
        }
      }
      toast.success('Simpler versions are ready', { description: 'Check them under each question; Edit changes what students see.' });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t prepare the simpler versions.')); }
    finally { setBusy(null); }
  };
  return (
    <button type="button" onClick={() => void run()} disabled={!!busy} className="btn-secondary btn-sm">
      {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing {busy.done} of {busy.total}</> : <><Wand2 className="w-4 h-4" /> Prepare simpler versions</>}
    </button>
  );
}
