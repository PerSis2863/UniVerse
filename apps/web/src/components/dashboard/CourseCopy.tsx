'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

// Copy a course to a new term (Stage 5 · B2, src/server/course-copy.ts): the teacher names the new
// course, chooses what happens to dates, and the copy runs step by step (the free plan allows only so
// much work per request), with a progress bar. Students, work, grades and chats never come along.

const STAGE_LABEL: Record<string, string> = {
  concepts: 'Learning DNA concepts', modules: 'Modules', materials: 'Materials', quizzes: 'Quizzes', questions: 'Quiz questions',
  assignments: 'Assignments and rubrics', categories: 'Gradebook categories', assessments: 'Gradebook categories', bank: 'Question bank',
  items: 'Module items', tags: 'Concept tags', orals: 'Oral checks',
};

interface Started { course: { id: string; code: string; name: string }; stages: string[] }

/** The next code for a new term: "CS101" → "CS101-2", "CS101-2" → "CS101-3". */
export function nextCode(code: string): string {
  const m = /^(.*?)-(\d{1,2})$/.exec(code);
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${code}-2`;
}

export function CourseCopy({ course, onClose, onDone }: { course: { id: string; code: string; name: string }; onClose: () => void; onDone: (id: string) => void }) {
  const [code, setCode] = useState(() => nextCode(course.code));
  const [name, setName] = useState(course.name);
  const [dates, setDates] = useState<'clear' | 'shift'>('clear');
  const [weeks, setWeeks] = useState(52);
  const [progress, setProgress] = useState<{ at: number; of: number; label: string } | null>(null);
  const [done, setDone] = useState<Started['course'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = !!progress && !done;

  // A copy that stopped part-way carries on from the step that failed (each step can safely run again).
  const [job, setJob] = useState<{ started: Started; from: number } | null>(null);

  const run = async () => {
    setError(null);
    let started = job?.started;
    if (!started) {
      if (!code.trim()) return setError('Give the new course a code.');
      if (dates === 'shift' && !(Number.isInteger(weeks) && weeks >= -520 && weeks <= 520)) return setError('Move dates by a whole number of weeks.');
      try {
        setProgress({ at: 0, of: 1, label: 'Making the new course' });
        started = await authedJson<Started>(`/api/courses/${course.id}/copy`, { method: 'POST', body: JSON.stringify({ code: code.trim(), name: name.trim() }) });
      } catch (e) {
        setProgress(null);
        return setError(errorMessage(e, 'The course couldn’t be copied. Try again.'));
      }
    }
    const shiftDays = dates === 'shift' ? weeks * 7 : undefined;
    let at = job?.from ?? 0;
    try {
      for (; at < started.stages.length; at++) {
        const stage = started.stages[at];
        setProgress({ at, of: started.stages.length, label: STAGE_LABEL[stage] ?? 'Copying' });
        let after: string | null = null;
        do {
          const step: { after: string | null } = await authedJson(`/api/courses/${course.id}/copy/step`, { method: 'POST', body: JSON.stringify({ target: started.course.id, stage, after, shiftDays }) });
          after = step.after;
        } while (after);
      }
      setProgress({ at, of: started.stages.length, label: 'Done' });
      setJob(null);
      setDone(started.course);
      toast.success(`${started.course.code} is ready as a draft`);
    } catch (e) {
      setProgress(null);
      setJob({ started, from: at });
      setError(`${errorMessage(e, 'The copy stopped part-way.')} ${started.course.code} is made but not finished: Try again carries on where it stopped.`);
    }
  };

  const pct = progress ? Math.round((progress.at / Math.max(1, progress.of)) * 100) : 0;
  return (
    <Sheet
      title="Copy to a new term"
      onClose={() => { if (!busy) onClose(); }}
      footer={done ? (
        <button type="button" onClick={() => onDone(done.id)} className="btn-primary w-full justify-center">Open {done.code}</button>
      ) : (
        <button type="button" onClick={() => void run()} disabled={busy} className="btn-primary w-full justify-center">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />} {busy ? 'Copying…' : job ? 'Try again' : 'Copy course'}
        </button>
      )}
    >
      {done ? (
        <div className="text-center py-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="mt-3 font-semibold text-zinc-900 dark:text-white">{done.code} · {done.name}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">It’s a draft with no students yet. Quizzes are drafts too: publish them when the term starts. Live classes in modules need their new dates.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Copies {course.code}’s modules, materials, quizzes, assignments with their rubrics, gradebook categories, question bank, concepts and oral checks. Students, their work, grades and chats stay in {course.code}.
          </p>
          <Field label="New course code">{(p) => <input {...p} value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} disabled={busy || !!job} className="input" />}</Field>
          <Field label="Name">{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={busy || !!job} className="input" />}</Field>
          <fieldset disabled={busy || !!job}>
            <legend className="label">Due dates and release dates</legend>
            <div className="mt-1 space-y-2">
              <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input type="radio" name="copy-dates" checked={dates === 'clear'} onChange={() => setDates('clear')} className="mt-1" />
                <span>Clear them <span className="block text-xs text-zinc-600 dark:text-zinc-400">Set new dates when you plan the term.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input type="radio" name="copy-dates" checked={dates === 'shift'} onChange={() => setDates('shift')} className="mt-1" />
                <span className="flex-1">Move them by whole weeks <span className="block text-xs text-zinc-600 dark:text-zinc-400">They stay on the same weekday. 52 weeks is about a year.</span></span>
              </label>
              {dates === 'shift' && (
                <Field label="Weeks to move" className="ps-6">{(p) => <input {...p} type="number" inputMode="numeric" value={weeks} min={-520} max={520} onChange={(e) => setWeeks(Number(e.target.value))} className="input w-32" />}</Field>
              )}
            </div>
          </fieldset>
          {progress && (
            <div role="status" aria-live="polite">
              <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                <div className={cn('h-full bg-indigo-500 transition-[width] duration-300')} style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">{progress.label} · {pct}%</p>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}
