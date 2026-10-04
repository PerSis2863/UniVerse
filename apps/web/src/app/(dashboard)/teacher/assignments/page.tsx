'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarClock, ChevronRight, ClipboardList, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';

interface Row {
  id: string;
  title: string;
  dueDate: string | null;
  status: 'OPEN' | 'CLOSED';
  maxScore: number;
  course: { id: string; code: string; name: string; _count: { enrollments: number } };
  counts: { submitted: number; toGrade: number; returned: number };
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const field = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';

/** Written assignments with a rubric; the AI drafts grades for the teacher to review. */
export default function TeacherAssignmentsPage() {
  const { data, isLoading, mutate } = useSWR<Row[]>('/api/assignments', authedJson);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Topbar title="Assignments" subtitle="Written work graded against your rubric, with AI-drafted feedback you review" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-500" /> Your assignments</h2>
            {!creating && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New assignment</button>}
          </div>

          {creating && <NewAssignment onClose={() => setCreating(false)} onCreated={() => { setCreating(false); mutate(); }} />}

          {isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
          ) : !data?.length ? (
            !creating && (
              <FeatureGuide
                icon={Sparkles}
                title="Grade written work faster"
                description="Set an essay or short-answer task with a rubric. When students hand it in, the AI drafts a score and comments for each criterion. You check and adjust every grade before students see it."
                steps={['Create an assignment and its rubric', 'Students write and submit their answer', 'Draft with AI, review, then return the grade']}
                example={<ExampleRow title="Essay: causes of the French Revolution" meta="HIST201 · 24 of 30 handed in" right="6 to grade" />}
              />
            )
          ) : (
            <div className="grid gap-3 stagger">
              {data.map((a) => (
                <Link key={a.id} href={`/teacher/assignments/${a.id}`} className={`${card} lift p-4 flex items-center gap-4 hover:border-indigo-400/50`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{a.course.code}</span>
                      <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{a.title}</h3>
                      {a.status === 'CLOSED' && <span className="text-[11px] text-zinc-500">Closed</span>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      {a.counts.submitted} of {a.course._count.enrollments} handed in · {a.counts.returned} returned · out of {a.maxScore}
                      {a.dueDate && <> · <CalendarClock className="inline w-3.5 h-3.5 -mt-0.5" /> due {new Date(a.dueDate).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>}
                    </p>
                  </div>
                  {a.counts.toGrade > 0 && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">{a.counts.toGrade} to grade</span>}
                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface Criterion { criterion: string; description: string; points: string }

const START: Criterion[] = [
  { criterion: 'Understanding of the topic', description: 'Accurate, relevant ideas that answer the question', points: '5' },
  { criterion: 'Evidence and examples', description: 'Claims are supported with specific examples', points: '3' },
  { criterion: 'Clarity and structure', description: 'Logical order, clear writing', points: '2' },
];

function NewAssignment({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: courses } = useSWR<{ id: string; code: string; name: string }[]>('/courses/my', fetcher);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [due, setDue] = useState('');
  const [rubric, setRubric] = useState<Criterion[]>(START);
  const [saving, setSaving] = useState(false);
  const total = rubric.reduce((t, r) => t + (Number(r.points) || 0), 0);

  const set = (i: number, patch: Partial<Criterion>) => setRubric((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) return toast.error('Choose a course.');
    setSaving(true);
    try {
      await authedJson('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          courseId, title, instructions,
          dueDate: due ? new Date(due).toISOString() : null,
          rubric: rubric.map((r) => ({ criterion: r.criterion, description: r.description, points: Number(r.points) })),
        }),
      });
      toast.success('Assignment added. Students in the course have been told.');
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className={`${card} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-white">New assignment</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm"><span className="text-zinc-600 dark:text-zinc-400">Course</span>
          <select required value={courseId} onChange={(e) => setCourseId(e.target.value)} className={field}>
            <option value="" disabled>{courses ? 'Choose a course…' : 'Loading…'}</option>
            {courses?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-zinc-600 dark:text-zinc-400">Due (optional)</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} dark:[color-scheme:dark]`} />
        </label>
      </div>
      <label className="block space-y-1 text-sm"><span className="text-zinc-600 dark:text-zinc-400">Title</span>
        <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Essay: why recursion matters" className={field} />
      </label>
      <label className="block space-y-1 text-sm"><span className="text-zinc-600 dark:text-zinc-400">Instructions for students</span>
        <textarea required rows={4} maxLength={8000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="What should they write, how long, what to include…" className={field} />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Rubric</span>
          <span className="text-zinc-500">Total {total} points</span>
        </div>
        {rubric.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_auto] sm:grid-cols-[1fr_1.4fr_5rem_auto] gap-2 items-start">
            <input required aria-label={`Criterion ${i + 1}`} maxLength={120} value={r.criterion} onChange={(e) => set(i, { criterion: e.target.value })} placeholder="Criterion" className={field} />
            <input aria-label={`What criterion ${i + 1} means`} maxLength={400} value={r.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="What a good answer does" className={`${field} hidden sm:block`} />
            <input required aria-label={`Points for criterion ${i + 1}`} type="number" min={0.5} max={1000} step={0.5} value={r.points} onChange={(e) => set(i, { points: e.target.value })} className={field} />
            <button type="button" aria-label={`Remove criterion ${i + 1}`} disabled={rubric.length === 1} onClick={() => setRubric((l) => l.filter((_, j) => j !== i))} className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {rubric.length < 12 && (
          <button type="button" className="text-sm font-medium text-indigo-500 hover:text-indigo-400" onClick={() => setRubric((l) => [...l, { criterion: '', description: '', points: '1' }])}>+ Add criterion</button>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving} aria-busy={saving || undefined}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Create assignment</button>
      </div>
    </form>
  );
}
