'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowLeft, Check, FileText, Laptop, Loader2, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { api, fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { itemScore, paperScore, paperTotal, VERSION_LABELS, type Criterion, type Marks, type PaperItem, type PaperVersion } from '@/lib/exam-paper';
import type { BankQuestion } from './QuestionBank';

// Paper exams (M291; API: /exam-papers, src/server/exam-papers.ts). A teacher picks questions from the
// course's question bank, adds written questions with a rubric, prints versions A–D with their keys,
// types each student's answers or rubric points, and sends the totals to the gradebook.

type Course = { id: string; name: string };
type PaperRow = { id: string; title: string; versions: number; questions: number; total: number; marked: number; postedAt: string | null };
type Paper = { id: string; title: string; course: string; instructions: string | null; minutes: number | null; versions: PaperVersion[]; postedAt: string | null; total: number };
type Detail = { paper: Paper; students: { id: string; name: string }[]; marks: { studentId: string; version: string; marks: Marks; score: number }[] };
type Written = { question: string; answer: string; rubric: Criterion[] };
const LETTERS = 'ABCDEFGHIJ';

export function PaperExams({ courses }: { courses: Course[] }) {
  const [picked, setPicked] = useState('');
  const courseId = picked || courses[0]?.id || '';
  const key = courseId ? `/exam-papers?courseId=${courseId}` : null;
  const { data, error, isLoading, mutate } = useSWR<{ papers: PaperRow[] }>(key, fetcher);
  const [making, setMaking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  if (open) return <PaperView id={open} onBack={() => { setOpen(null); void mutate(); }} />;
  if (!courses.length) return <EmptyState icon={FileText} title="No courses yet" hint="Paper exams are made from a course’s question bank." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {courses.length > 1 && (
          <select aria-label="Course" value={courseId} onChange={(e) => setPicked(e.target.value)} className="input w-auto">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button type="button" className="btn-primary btn-sm ms-auto" onClick={() => setMaking(true)}><Plus className="w-4 h-4" aria-hidden />New paper exam</button>
      </div>
      {error ? <LoadError onRetry={() => void mutate()} /> : isLoading ? <ContentSkeleton /> : !data?.papers.length ? (
        <EmptyState icon={FileText} title="No paper exams yet" hint="Build one from your question bank: up to four versions so neighbours don’t share a paper, each with its answer key." action={{ label: 'New paper exam', onClick: () => setMaking(true), icon: Plus }} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.papers.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p.id)} className="card w-full p-4 text-start">
                <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{p.title}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{p.questions} questions · {p.total} points · {p.versions} {p.versions === 1 ? 'version' : 'versions'}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{p.marked} marked{p.postedAt ? ' · in the gradebook' : ''}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {making && courseId && <NewPaper courseId={courseId} onClose={() => setMaking(false)} onMade={(id) => { setMaking(false); void mutate(); setOpen(id); }} />}
    </div>
  );
}

function NewPaper({ courseId, onClose, onMade }: { courseId: string; onClose: () => void; onMade: (id: string) => void }) {
  const { data } = useSWR<{ questions: BankQuestion[] }>(`/api/courses/${courseId}/question-bank`, authedJson);
  const bank = useMemo(() => data?.questions ?? [], [data]);
  const [f, setF] = useState({ title: '', instructions: 'Answer every question. Show your working.', minutes: '60', versions: '2', shuffleOptions: true });
  const [chosen, setChosen] = useState<string[]>([]);
  const [tag, setTag] = useState('');
  const [written, setWritten] = useState<Written[]>([]);
  const [busy, setBusy] = useState(false);
  const tags = useMemo(() => [...new Set(bank.flatMap((q) => q.tags))].sort(), [bank]);
  const shown = bank.filter((q) => !tag || q.tags.includes(tag));
  const points = bank.filter((q) => chosen.includes(q.id)).reduce((s, q) => s + q.points, 0) + written.reduce((s, w) => s + w.rubric.reduce((a, c) => a + (Number(c.points) || 0), 0), 0);

  const setW = (i: number, w: Partial<Written>) => setWritten((xs) => xs.map((x, j) => (j === i ? { ...x, ...w } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ paper: { id: string } }>('/exam-papers', { courseId, ...f, minutes: Number(f.minutes), versions: Number(f.versions), questionIds: chosen, written });
      toast.success('Paper made', { description: 'Print each version and its key from here.' });
      onMade(r.data.paper.id);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t make the paper.')); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title="New paper exam" onClose={onClose} wide footer={
      <div className="flex items-center gap-2">
        <span className="me-auto text-sm text-zinc-600 dark:text-zinc-300 tabular-nums">{chosen.length + written.length} questions · {points} points</span>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary btn-sm" disabled={busy || !f.title.trim() || !(chosen.length + written.length)} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Make the paper</button>
      </div>
    }>
      <div className="space-y-4">
        <Field label="Title">{(p) => <input {...p} className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="End of term exam" />}</Field>
        <Field label="Instructions on the cover">{(p) => <textarea {...p} className="input min-h-16" maxLength={1000} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />}</Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Minutes">{(p) => <input {...p} className="input" type="number" min={5} max={600} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />}</Field>
          <Field label="Versions" hint="A keeps your order; the others mix it.">{(p) => (
            <select {...p} className="input" value={f.versions} onChange={(e) => setF({ ...f, versions: e.target.value })}>
              {VERSION_LABELS.map((_, i) => <option key={i} value={i + 1}>{i + 1} ({VERSION_LABELS.slice(0, i + 1).join(', ')})</option>)}
            </select>
          )}</Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" checked={f.shuffleOptions} onChange={(e) => setF({ ...f, shuffleOptions: e.target.checked })} />Mix the options too
          </label>
        </div>

        <section aria-label="From the question bank">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-white me-auto">From the question bank</h3>
            {tags.length > 0 && (
              <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className="input w-auto">
                <option value="">Every tag</option>
                {tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {shown.length > 0 && <button type="button" className="btn-ghost btn-sm" onClick={() => setChosen((c) => [...new Set([...c, ...shown.map((q) => q.id)])])}>Pick all shown</button>}
          </div>
          {!bank.length ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">The bank is empty: add questions in the Question bank tab, or write them below.</p> : (
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {shown.map((q) => (
                <li key={q.id}>
                  <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-white/5">
                    <input type="checkbox" className="mt-1" checked={chosen.includes(q.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, q.id] : c.filter((x) => x !== q.id)))} />
                    <span className="min-w-0 flex-1 text-zinc-800 dark:text-zinc-100" translate="no">{q.question}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{q.points} pt</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Written questions">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-white me-auto">Written questions</h3>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setWritten((w) => [...w, { question: '', answer: '', rubric: [{ name: 'Ideas', points: 4 }, { name: 'Evidence', points: 4 }, { name: 'Writing', points: 2 }] }])}><Plus className="w-4 h-4" aria-hidden />Add one</button>
          </div>
          <div className="mt-2 space-y-3">
            {written.map((w, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                <div className="flex items-start gap-2">
                  <textarea aria-label={`Written question ${i + 1}`} className="input min-h-16 flex-1" maxLength={2000} value={w.question} onChange={(e) => setW(i, { question: e.target.value })} placeholder="Explain…" />
                  <button type="button" className="btn-ghost btn-sm" aria-label={`Remove written question ${i + 1}`} onClick={() => setWritten((xs) => xs.filter((_, j) => j !== i))}><X className="w-4 h-4" aria-hidden /></button>
                </div>
                <textarea aria-label={`Model answer ${i + 1}`} className="input mt-2 min-h-12" maxLength={2000} value={w.answer} onChange={(e) => setW(i, { answer: e.target.value })} placeholder="Model answer for the key (optional)" />
                <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">Rubric</p>
                {w.rubric.map((c, k) => (
                  <div key={k} className="mt-1 flex items-center gap-2">
                    <input aria-label="Criterion" className="input flex-1" maxLength={120} value={c.name} onChange={(e) => setW(i, { rubric: w.rubric.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
                    <input aria-label="Points" className="input w-20" type="number" min={0.5} max={100} step={0.5} value={c.points} onChange={(e) => setW(i, { rubric: w.rubric.map((x, j) => (j === k ? { ...x, points: Number(e.target.value) } : x)) })} />
                    <button type="button" className="btn-ghost btn-sm" aria-label="Remove criterion" onClick={() => setW(i, { rubric: w.rubric.filter((_, j) => j !== k) })}><X className="w-4 h-4" aria-hidden /></button>
                  </div>
                ))}
                {w.rubric.length < 6 && <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => setW(i, { rubric: [...w.rubric, { name: '', points: 2 }] })}><Plus className="w-4 h-4" aria-hidden />Criterion</button>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

function PaperView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/exam-papers/${id}`, fetcher);
  const [view, setView] = useState<'print' | 'mark'>('print');
  const [version, setVersion] = useState('A');
  const [withKey, setWithKey] = useState(false);
  const [busy, setBusy] = useState(false);
  if (error) return <LoadError onRetry={() => void mutate()} />;
  if (isLoading || !data) return <ContentSkeleton />;
  const { paper } = data;
  const v = paper.versions.find((x) => x.label === version) ?? paper.versions[0];

  const print = (key: boolean) => {
    setWithKey(key);
    document.documentElement.dataset.printing = 'report';
    const done = () => { delete document.documentElement.dataset.printing; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    requestAnimationFrame(() => window.print());
  };
  const post = async () => {
    setBusy(true);
    try { const r = await api.post<{ posted: number }>(`/exam-papers/${id}/post`, {}); toast.success(`${r.data.posted} grades in the gradebook`); void mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t send the grades.')); }
    finally { setBusy(false); }
  };
  const toQuiz = async () => {
    setBusy(true);
    try { await api.post(`/exam-papers/${id}/to-quiz`, {}); toast.success('Online quiz made as a draft', { description: 'Find it under Quizzes: check it, then publish it.' }); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t make the quiz.')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Remove this paper?', message: 'Its marks go too. Grades already in the gradebook stay.', destructive: true }))) return;
    try { await api.delete(`/exam-papers/${id}`); onBack(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove it.')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onBack}><ArrowLeft className="w-4 h-4" aria-hidden />Papers</button>
        <h2 className="me-auto text-lg font-semibold text-zinc-900 dark:text-white" translate="no">{paper.title}</h2>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void toQuiz()}><Laptop className="w-4 h-4" aria-hidden />Make an online quiz</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void remove()}><Trash2 className="w-4 h-4" aria-hidden />Remove</button>
      </div>
      <Segmented<"print" | "mark"> label="Show" value={view} onChange={setView} segments={[{ value: 'print', label: 'Print' }, { value: 'mark', label: 'Mark' }]} />
      {view === 'print' ? (
        <div className="panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            {paper.versions.length > 1 && <Segmented label="Version" value={v.label} onChange={setVersion} segments={paper.versions.map((x) => ({ value: x.label, label: `Version ${x.label}` }))} />}
            <span className="ms-auto" />
            <button type="button" className="btn-secondary btn-sm" onClick={() => print(true)}><Printer className="w-4 h-4" aria-hidden />Print the key</button>
            <button type="button" className="btn-primary btn-sm" onClick={() => print(false)}><Printer className="w-4 h-4" aria-hidden />Print version {v.label}</button>
          </div>
          <PrintedPaper paper={paper} version={v} withKey={withKey} />
        </div>
      ) : (
        <Marking detail={data} onSaved={() => void mutate()} onPost={() => void post()} posting={busy} />
      )}
    </div>
  );
}

/** The paper as it prints (on white in both themes, like other printed documents). */
function PrintedPaper({ paper, version, withKey }: { paper: Paper; version: PaperVersion; withKey: boolean }) {
  return (
    <article className="print-report mt-4 rounded-xl bg-white p-6 text-zinc-900 shadow-sm ring-1 ring-zinc-200">
      <header className="border-b border-zinc-300 pb-3">
        <p className="text-sm text-zinc-600" translate="no">{paper.course}</p>
        <h3 className="text-xl font-semibold" translate="no">{paper.title}{withKey ? ' · Answer key' : ''}</h3>
        <p className="mt-1 text-sm text-zinc-700">Version {version.label} · {paperTotal(version)} points{paper.minutes ? ` · ${paper.minutes} minutes` : ''}</p>
        {!withKey && <p className="mt-3 text-sm">Name: ______________________ &nbsp; Class: __________</p>}
        {paper.instructions && !withKey && <p className="mt-2 text-sm text-zinc-700" translate="no">{paper.instructions}</p>}
      </header>
      <ol className="mt-4 space-y-4">
        {version.items.map((item, n) => (
          <li key={item.id} className="break-inside-avoid">
            <p className="text-sm"><span className="font-semibold">{n + 1}.</span> <span translate="no">{item.question}</span> <span className="text-zinc-500">({item.points} {item.points === 1 ? 'point' : 'points'})</span></p>
            {item.options.length > 0 && (
              <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 ps-5 text-sm sm:grid-cols-2">
                {item.options.map((o, i) => <li key={i} className={cn(withKey && item.key.includes(LETTERS[i]) && 'font-semibold underline')}>{LETTERS[i]}. <span translate="no">{o}</span></li>)}
              </ul>
            )}
            {withKey ? <KeyLine item={item} /> : item.kind === 'written' ? <div className="mt-2 h-28 rounded border border-dashed border-zinc-300" /> : item.kind === 'number' ? <p className="mt-1 ps-5 text-sm">Answer: ____________</p> : null}
          </li>
        ))}
      </ol>
    </article>
  );
}

function KeyLine({ item }: { item: PaperItem }) {
  if (item.kind === 'written') return (
    <div className="mt-1 ps-5 text-sm text-zinc-700">
      {item.key && <p translate="no">Model answer: {item.key}</p>}
      {item.rubric.map((c) => <p key={c.name}>· {c.name}: up to {c.points}</p>)}
    </div>
  );
  return <p className="mt-1 ps-5 text-sm font-medium">Answer: {item.key}</p>;
}

function Marking({ detail, onSaved, onPost, posting }: { detail: Detail; onSaved: () => void; onPost: () => void; posting: boolean }) {
  const { paper, students } = detail;
  const [who, setWho] = useState(students[0]?.id ?? '');
  const saved = detail.marks.find((m) => m.studentId === who);
  if (!students.length) return <EmptyState icon={FileText} title="No students in this course yet" />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
      <div className="panel p-2">
        <ul className="max-h-[28rem] overflow-y-auto">
          {students.map((s) => {
            const m = detail.marks.find((x) => x.studentId === s.id);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setWho(s.id)} aria-current={who === s.id || undefined} className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm', who === s.id ? 'bg-zinc-100 dark:bg-white/10' : 'hover:bg-zinc-50 dark:hover:bg-white/5')}>
                  <span className="min-w-0 flex-1 truncate" translate="no">{s.name}</span>
                  {m ? <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{m.score}/{paper.total}</span> : <span className="text-xs text-zinc-400">not marked</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-primary btn-sm mt-2 w-full" disabled={posting || !detail.marks.length} onClick={onPost}>{posting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}{paper.postedAt ? 'Send to the gradebook again' : 'Send to the gradebook'}</button>
      </div>
      {who && <MarkSheet key={who} paper={paper} studentId={who} name={students.find((s) => s.id === who)?.name ?? ''} saved={saved} onSaved={onSaved} />}
    </div>
  );
}

function MarkSheet({ paper, studentId, name, saved, onSaved }: { paper: Paper; studentId: string; name: string; saved?: Detail['marks'][number]; onSaved: () => void }) {
  const [label, setLabel] = useState(saved?.version ?? paper.versions[0]?.label ?? 'A');
  const [marks, setMarks] = useState<Marks>(saved?.marks ?? {});
  const [busy, setBusy] = useState(false);
  const v = paper.versions.find((x) => x.label === label) ?? paper.versions[0];
  const set = (qid: string, m: Marks[string]) => setMarks((x) => ({ ...x, [qid]: { ...x[qid], ...m } }));
  const save = async () => {
    setBusy(true);
    try { await api.post(`/exam-papers/${paper.id}/marks`, { studentId, version: v.label, marks }); toast.success(`Saved for ${name.split(' ')[0]}`); onSaved(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save the marks.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto font-semibold text-zinc-900 dark:text-white" translate="no">{name}</h3>
        {paper.versions.length > 1 && <Segmented label="Their version" value={v.label} onChange={setLabel} segments={paper.versions.map((x) => ({ value: x.label, label: x.label }))} />}
        <span className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{paperScore(v, marks)}/{paperTotal(v)}</span>
      </div>
      <ol className="mt-3 space-y-3">
        {v.items.map((item, n) => {
          const m = marks[item.id];
          const got = itemScore(item, m);
          return (
            <li key={item.id} className="border-t border-zinc-200 pt-3 text-sm dark:border-white/10">
              <p className="text-zinc-800 dark:text-zinc-100"><span className="font-semibold">{n + 1}.</span> <span translate="no">{item.question}</span></p>
              {item.kind === 'written' ? (
                item.rubric.length ? item.rubric.map((c, k) => (
                  <label key={k} className="mt-1 flex items-center gap-2">
                    <span className="flex-1 text-zinc-600 dark:text-zinc-300">{c.name}</span>
                    <input type="number" className="input w-20" min={0} max={c.points} step={0.5} value={m?.rubric?.[k] ?? ''} onChange={(e) => { const r = [...(m?.rubric ?? item.rubric.map(() => 0))]; r[k] = Number(e.target.value); set(item.id, { rubric: r }); }} />
                    <span className="w-10 tabular-nums text-zinc-500">/ {c.points}</span>
                  </label>
                )) : (
                  <label className="mt-1 flex items-center gap-2"><span className="flex-1 text-zinc-600 dark:text-zinc-300">Points</span><input type="number" className="input w-20" min={0} max={item.points} step={0.5} value={m?.points ?? ''} onChange={(e) => set(item.id, { points: Number(e.target.value) })} /><span className="w-10 tabular-nums text-zinc-500">/ {item.points}</span></label>
                )
              ) : (
                <label className="mt-1 flex items-center gap-2">
                  <span className="flex-1 text-zinc-600 dark:text-zinc-300">{item.kind === 'number' ? 'Their answer' : 'Letters they chose'}</span>
                  <input className="input w-24 font-mono uppercase" maxLength={10} value={m?.answer ?? ''} onChange={(e) => set(item.id, { answer: e.target.value })} />
                  <span className={cn('flex w-10 items-center gap-1 tabular-nums', got ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>{got ? <Check className="w-4 h-4" aria-label="Right" /> : null}{got}</span>
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn-primary btn-sm mt-4" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Save marks</button>
    </div>
  );
}
