'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, FileUp, Library, Loader2, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SearchField } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { DIFFICULTIES, parseQuestionCsv, type BankQuestionIn, type Difficulty } from '@/lib/question-bank';

// A course's question bank (Stage 5 · B4.1; API: /api/courses/[id]/question-bank). Teachers keep
// reusable questions with tags and a difficulty, import them from CSV, and add them to quizzes.

export interface BankQuestion { id: string; question: string; options: string[]; correctAnswer: string; points: number; tags: string[]; difficulty: Difficulty | null }
type Quiz = { id: string; title: string; courseId?: string; status: string };

const LEVEL: Record<Difficulty, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const LEVEL_STYLE: Record<Difficulty, string> = { EASY: 'badge-green', MEDIUM: 'badge-amber', HARD: 'badge-red' };

export function QuestionBank({ courses, quizzes, onAdded }: { courses: { id: string; name: string }[]; quizzes: Quiz[]; onAdded: () => void }) {
  const [picked, setPicked] = useState('');
  const courseId = picked || courses[0]?.id || '';
  const key = courseId ? `/api/courses/${courseId}/question-bank` : null;
  const { data, error, isLoading, mutate } = useSWR<{ questions: BankQuestion[] }>(key, authedJson);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [level, setLevel] = useState<Difficulty | ''>('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState<{ questions: BankQuestionIn[]; errors: { line: number; error: string }[] } | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const all = useMemo(() => data?.questions ?? [], [data]);
  const tags = useMemo(() => [...new Set(all.flatMap((q) => q.tags))].sort(), [all]);
  const shown = all.filter((q) => (!tag || q.tags.includes(tag)) && (!level || q.difficulty === level) && (!search || q.question.toLowerCase().includes(search.toLowerCase())));
  const courseQuizzes = quizzes.filter((q) => q.courseId === courseId && q.status !== 'CLOSED');

  const post = async <T,>(body: object): Promise<T | null> => {
    if (!key) return null;
    setBusy(true);
    try { return await authedJson<T>(key, { method: 'POST', body: JSON.stringify(body) }); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); return null; }
    finally { setBusy(false); }
  };

  const readCsv = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return void toast.error('That file is over 1 MB. Split it into smaller files.');
    const parsed = parseQuestionCsv(await f.text());
    if (!parsed.questions.length && !parsed.errors.length) return void toast.error('That file has no questions.');
    setImporting(parsed);
  };
  const runImport = async () => {
    if (!importing) return;
    let done = 0;
    for (let i = 0; i < importing.questions.length; i += 200) {
      const r = await post<{ imported: number; questions: BankQuestion[] }>({ action: 'import', questions: importing.questions.slice(i, i + 200) });
      if (!r) break;
      done += r.imported;
      await mutate({ questions: r.questions }, { revalidate: false });
    }
    if (done) toast.success(`${done} question${done === 1 ? '' : 's'} added to the bank`);
    setImporting(null);
  };
  const addToQuiz = async () => {
    const quiz = courseQuizzes.find((q) => q.id === target);
    if (!quiz || !chosen.length) return;
    const r = await post<{ added: number }>({ action: 'add-to-quiz', quizId: quiz.id, ids: chosen });
    if (r) { toast.success(`${r.added} question${r.added === 1 ? '' : 's'} added to “${quiz.title}”`); setChosen([]); onAdded(); }
  };

  if (!courses.length) return <EmptyState icon={Library} title="No courses yet" hint="Once a course is assigned to you, it gets its own question bank." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <select aria-label="Course" className="input md:w-72" value={courseId} onChange={(e) => { setPicked(e.target.value); setChosen([]); setTag(''); }}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2">
          <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file to import" onChange={(e) => { void readCsv(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" onClick={() => file.current?.click()} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><FileUp className="w-4 h-4" /> Import CSV</button>
          <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> New question</button>
        </div>
      </div>

      {all.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <SearchField value={search} onChange={setSearch} placeholder="Search questions" className="flex-1 min-w-[12rem]" />
          <select aria-label="Tag" className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Difficulty" className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value as Difficulty | '')}>
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{LEVEL[d]}</option>)}
          </select>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="panel p-3 flex flex-wrap items-center gap-2 sticky top-2 z-10">
          <span className="text-sm font-medium text-zinc-900 dark:text-white">{chosen.length} selected</span>
          <select aria-label="Quiz to add to" className="input w-auto flex-1 min-w-[10rem]" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Add to which quiz?</option>
            {courseQuizzes.map((q) => <option key={q.id} value={q.id}>{q.title}{q.status === 'DRAFT' ? ' (draft)' : ''}</option>)}
          </select>
          <button type="button" onClick={() => void addToQuiz()} disabled={busy || !target} className="btn-primary btn-sm">Add to quiz</button>
          <button type="button" onClick={() => setChosen([])} className="btn-ghost btn-sm">Clear</button>
        </div>
      )}

      {error ? <LoadError onRetry={() => mutate()} message="Couldn’t load the question bank." />
        : isLoading || !data ? <ContentSkeleton variant="list" />
        : all.length === 0 ? (
          <EmptyState icon={Library} title="This course’s question bank is empty" hint="Add questions one by one, import a CSV (question, options A–D, correct letter, points, tags, difficulty), or save questions from a quiz." action={{ label: 'New question', onClick: () => setAdding(true), icon: Plus }} />
        ) : shown.length === 0 ? <p className="text-sm text-zinc-500 text-center py-8">No questions match these filters.</p>
        : (
          <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2">
            {shown.map((q) => {
              const on = chosen.includes(q.id);
              return (
                <motion.li key={q.id} variants={fadeUp} className={cn('panel p-4 flex gap-3', on && 'ring-2 ring-indigo-500/60')}>
                  <input type="checkbox" checked={on} onChange={() => setChosen((c) => (on ? c.filter((x) => x !== q.id) : [...c, q.id]))} aria-label={`Select “${q.question}”`} className="mt-1 w-5 h-5 accent-indigo-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{q.question}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {q.options.map((o) => <li key={o} className={cn('text-xs px-2 py-0.5 rounded-md', o === q.correctAnswer ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>{o === q.correctAnswer && <CheckCircle2 className="w-3 h-3 inline mr-1" aria-label="Right answer" />}{o}</li>)}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      {q.difficulty && <span className={cn('badge', LEVEL_STYLE[q.difficulty])}>{LEVEL[q.difficulty]}</span>}
                      {q.tags.map((t) => <button key={t} type="button" onClick={() => setTag(t)} className="badge badge-blue">#{t}</button>)}
                      <span className="text-[11px] text-zinc-500">{q.points} pt{q.points === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <button type="button" aria-label="Delete question" disabled={busy} onClick={() => void (async () => {
                    if (!(await confirmDialog({ title: 'Delete this question from the bank?', message: 'Quizzes that already use it keep their copy.', destructive: true, confirmLabel: 'Delete' }))) return;
                    const r = await post<{ questions: BankQuestion[] }>({ action: 'delete', questionId: q.id });
                    if (r) { await mutate(r, { revalidate: false }); setChosen((c) => c.filter((x) => x !== q.id)); }
                  })()} className="btn-ghost btn-icon text-rose-600 dark:text-rose-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}

      {adding && <NewQuestion busy={busy} onClose={() => setAdding(false)} onSave={async (q) => { const r = await post<{ questions: BankQuestion[] }>({ action: 'create', ...q }); if (r) { await mutate(r, { revalidate: false }); setAdding(false); toast.success('Added to the bank'); } }} />}
      {importing && (
        <Sheet title="Import questions" onClose={() => setImporting(null)}
          footer={<button type="button" onClick={() => void runImport()} disabled={busy || !importing.questions.length} className="btn-primary w-full inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Import {importing.questions.length} question{importing.questions.length === 1 ? '' : 's'}</button>}>
          <div className="space-y-3 text-sm">
            <p className="text-zinc-700 dark:text-zinc-200">{importing.questions.length} question{importing.questions.length === 1 ? '' : 's'} ready{importing.errors.length ? `, ${importing.errors.length} line${importing.errors.length === 1 ? '' : 's'} skipped` : ''}.</p>
            {importing.errors.length > 0 && (
              <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-amber-800 dark:text-amber-300">
                {importing.errors.slice(0, 50).map((e) => <li key={e.line}>Line {e.line}: {e.error}</li>)}
              </ul>
            )}
            <ul className="space-y-1 max-h-60 overflow-y-auto">
              {importing.questions.slice(0, 30).map((q, i) => <li key={i} className="truncate text-zinc-600 dark:text-zinc-300">{i + 1}. {q.question} <span className="text-emerald-700 dark:text-emerald-400">({q.correctAnswer})</span></li>)}
            </ul>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function NewQuestion({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (q: { question: string; options: string[]; correctAnswer: string; points: number; tags: string; difficulty: Difficulty | null }) => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [points, setPoints] = useState('1');
  const [tags, setTags] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim() && filled.length >= 2 && options[correct]?.trim();
  return (
    <Sheet title="New question" onClose={onClose}
      footer={<button type="button" disabled={busy || !ready} onClick={() => void onSave({ question: question.trim(), options: filled, correctAnswer: options[correct].trim(), points: Number(points) || 1, tags, difficulty: difficulty || null })} className="btn-primary w-full inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Add to bank</button>}>
      <div className="space-y-4">
        <Field label="Question" count={question.length} max={1000}>{(p) => <textarea {...p} className="input min-h-[80px]" value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} />}</Field>
        <fieldset className="space-y-2">
          <legend className="label">Answers (pick the right one)</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="bank-correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Answer ${i + 1} is right`} className="w-5 h-5 accent-indigo-600" />
              <input className="input" aria-label={`Answer ${i + 1}`} placeholder={`Answer ${i + 1}${i < 2 ? '' : ' (optional)'}`} value={o} maxLength={300} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Points">{(p) => <input {...p} type="number" min={0.5} max={100} step={0.5} className="input" value={points} onChange={(e) => setPoints(e.target.value)} />}</Field>
          <Field label="Difficulty">{(p) => (
            <select {...p} className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}>
              <option value="">Not set</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{LEVEL[d]}</option>)}
            </select>
          )}</Field>
        </div>
        <Field label="Tags (optional)" hint="Comma-separated, e.g. week 3, scheduling">{(p) => <input {...p} className="input" value={tags} maxLength={200} onChange={(e) => setTags(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
