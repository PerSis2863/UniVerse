'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Camera, Eye, Lightbulb, Loader2, Lock, MessagesSquare, ShieldCheck } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { MathText } from '@/components/ui/MathText';
import { TUTOR_MODES, type TutorMode } from '@/lib/tutor-rules';

// The tutor's study tools (Stage 5 · Q13): the mode picker, a photo of a homework problem (hints one
// at a time, the answer only when asked), the banner when the teacher has turned the tutor off, the
// teacher's panel (hints only, their instruction, off before an exam, the class's common questions),
// and the evening flashcard reminder.

export interface RuleInfo { hintsOnly: boolean; off: boolean; offUntil: string | null; note?: string; whisperOff?: boolean }
export const useTutorRule = (courseId: string | null) => useSWR<RuleInfo>(courseId ? `/api/tutor/${courseId}/rule` : null, authedJson);

export function TutorOffBanner({ rule }: { rule: RuleInfo }) {
  return (
    <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100 flex gap-3 items-start">
      <Lock className="w-5 h-5 shrink-0 mt-0.5" />
      <p>Your teacher has turned the tutor off for this course{rule.offUntil ? ` until ${format(new Date(rule.offUntil), 'EEE d MMM, h:mm a')}` : ' for now'}, probably for an exam. Your flashcards still work. Good luck!</p>
    </div>
  );
}

export function ModePicker({ mode, setMode, rule }: { mode: TutorMode; setMode: (m: TutorMode) => void; rule?: RuleInfo }) {
  if (rule?.hintsOnly) return <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5"><Lightbulb className="w-4 h-4" />Hints only: your teacher’s choice for this course</p>;
  return <Segmented<TutorMode> label="How the tutor answers" value={mode} onChange={setMode} segments={TUTOR_MODES} className="w-full sm:w-auto" />;
}

/** A photo as a JPEG at most 1600 px across (a phone's photo is often 4–12 MB as it is). */
export async function photoData(file: File): Promise<{ mimeType: string; data: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('That file isn’t a photo the browser can open.');
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return { mimeType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

export interface HomeworkStart { ref: string; readable: boolean; problem: string; topic: string; hints: string[]; total: number; answerAllowed: boolean }

/** The tutor's reply to a homework photo: the problem as read, then hints one by one, then (if wanted) the answer. */
export function HomeworkTurn({ courseId, start, mode }: { courseId: string; start: HomeworkStart; mode: TutorMode }) {
  const [hints, setHints] = useState(start.hints);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!start.readable) return <p>I couldn’t find a problem in that photo. Try again with the whole problem in view, in good light.</p>;
  const more = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await authedJson<{ hints: string[]; answer?: string }>(`/api/tutor/${courseId}/photo`, { method: 'POST', body: JSON.stringify({ ref: start.ref, mode, ...body }) });
      setHints(r.hints);
      if (r.answer) setAnswer(r.answer);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const showAnswer = async () => {
    if (hints.length < start.total && !(await confirmDialog({ title: 'See the answer now?', message: 'You’ll learn more by trying the next hint first. The answer stays here when you’re ready.', confirmLabel: 'Show the answer' }))) return;
    void more({ answer: true });
  };
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">The problem{start.topic ? ` · ${start.topic}` : ''}</p>
        <p className="mt-1"><MathText text={start.problem} /></p>
      </div>
      <ol className="space-y-2">
        {hints.map((h, i) => (
          <li key={i} className="rounded-xl bg-white/70 dark:bg-black/20 p-2.5">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" />Hint {i + 1} of {start.total}</p>
            <p className="mt-1"><MathText text={h} /></p>
          </li>
        ))}
      </ol>
      {answer && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
          <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200">Worked answer</p>
          <p className="mt-1"><MathText text={answer} /></p>
        </div>
      )}
      {!answer && (
        <div className="flex flex-wrap gap-2">
          {hints.length < start.total && <button type="button" disabled={busy} onClick={() => void more({ hints: hints.length + 1 })} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}Another hint</button>}
          {start.answerAllowed ? (
            <button type="button" disabled={busy} onClick={() => void showAnswer()} className="btn-ghost btn-sm"><Eye className="w-4 h-4" />Show the answer</button>
          ) : <span className="text-xs text-zinc-600 dark:text-zinc-400 self-center">Hints only{mode === 'hints' ? ' (your choice)' : ': your teacher’s choice'}</span>}
        </div>
      )}
    </div>
  );
}

export function PhotoButton({ disabled, onPicked }: { disabled?: boolean; onPicked: (file: File) => void }) {
  return (
    <label className={`w-11 h-11 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : 'hover:bg-indigo-500/10'}`} title="A photo of a homework problem">
      <Camera className="w-5 h-5" aria-hidden />
      <span className="sr-only">Send a photo of a homework problem</span>
      <input type="file" accept="image/*" capture="environment" disabled={disabled} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPicked(f); }} />
    </label>
  );
}

// ── The teacher's panel ──────────────────────────────────────────────────────────────────────────

interface Groups { since: string; asked: number; students: number; groups: { label: string; asked: number; people: number; examples: string[]; last: string }[] }
const localInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function TeacherPanel({ courseId }: { courseId: string }) {
  const { data: rule, mutate } = useTutorRule(courseId);
  const { data: qs } = useSWR<Groups>(`/api/tutor/${courseId}/questions`, authedJson);
  const [draft, setDraft] = useState<{ note: string; until: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!rule) return <div className="h-40 rounded-3xl skeleton" />;
  const form = draft ?? { note: rule.note ?? '', until: localInput(rule.offUntil) };
  const save = async (patch: Partial<{ hintsOnly: boolean; off: boolean; note: string; offUntil: string | null; whisperOff: boolean }>) => {
    setBusy(true);
    try {
      const next = await authedJson<RuleInfo>(`/api/tutor/${courseId}/rule`, { method: 'PUT', body: JSON.stringify({ hintsOnly: rule.hintsOnly, whisperOff: rule.whisperOff === true, off: rule.off, note: form.note, offUntil: form.until ? new Date(form.until).toISOString() : null, ...patch }) });
      await mutate(next, { revalidate: false });
      setDraft(null);
      toast.success('Saved');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <section aria-labelledby="tp-rules" className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5 space-y-4">
        <h2 id="tp-rules" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />The tutor in this course</h2>
        <div className="flex items-start gap-3">
          <Switch checked={rule.hintsOnly} onChange={(v) => void save({ hintsOnly: v })} disabled={busy} label="Hints only" />
          <div><p className="text-sm font-semibold text-zinc-900 dark:text-white">Hints only</p><p className="text-xs text-zinc-600 dark:text-zinc-400">The tutor guides with hints and questions and never gives a final answer, even for a photo of homework.</p></div>
        </div>
        <div className="flex items-start gap-3">
          <Switch checked={rule.whisperOff !== true} onChange={(v) => void save({ whisperOff: !v })} disabled={busy} label="Class TA (Whisper TA)" />
          <div><p className="text-sm font-semibold text-zinc-900 dark:text-white">Class TA (Whisper TA)</p><p className="text-xs text-zinc-600 dark:text-zinc-400">Students can quietly ask the TA during this course’s class calls and in-person classes. Turn it off for this class only.</p></div>
        </div>
        <label className="block text-sm font-semibold text-zinc-900 dark:text-white">Your instruction to the tutor
          <textarea value={form.note} maxLength={500} rows={2} onChange={(e) => setDraft({ ...form, note: e.target.value })} className="input mt-1 font-normal" placeholder="Always ask for the units. Use the method from week 3." />
        </label>
        {draft && draft.note !== (rule.note ?? '') && <button type="button" disabled={busy} onClick={() => void save({})} className="btn-primary btn-sm">Save instruction</button>}
        <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-start gap-3">
            <Switch checked={rule.off} onChange={(v) => void save({ off: v, offUntil: v && form.until ? new Date(form.until).toISOString() : null })} disabled={busy} label="Turn the tutor off for students" />
            <div><p className="text-sm font-semibold text-zinc-900 dark:text-white">Turn the tutor off for students</p><p className="text-xs text-zinc-600 dark:text-zinc-400">Before an exam: asking, photos, practice, new flashcards and the voice tutor stop for this course. Flashcards they have still work.</p></div>
          </div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Back on by itself at (optional)
            <input type="datetime-local" value={form.until} onChange={(e) => setDraft({ ...form, until: e.target.value })} className="input mt-1 w-60" />
          </label>
          {rule.off && draft && draft.until !== localInput(rule.offUntil) && <button type="button" disabled={busy} onClick={() => void save({ off: true })} className="btn-secondary btn-sm">Save the time</button>}
          {rule.off && <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Off for students{rule.offUntil ? ` until ${format(new Date(rule.offUntil), 'EEE d MMM, h:mm a')}` : ' until you turn it back on'}.</p>}
        </div>
      </section>
      <section aria-labelledby="tp-questions" className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5">
        <h2 id="tp-questions" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><MessagesSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />What your class asks the tutor</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">The last 90 days, grouped by topic. No names, and only topics two or more students asked about.{qs ? ` ${qs.asked} questions from ${qs.students} student${qs.students === 1 ? '' : 's'}.` : ''}</p>
        {!qs ? <div className="mt-3 h-24 rounded-2xl skeleton" /> : !qs.groups.length ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Nothing yet that several students asked.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {qs.groups.map((g) => (
              <li key={g.label + g.last} className="py-3">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{g.label}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{g.people} students · {g.asked} question{g.asked === 1 ? '' : 's'} · last {format(new Date(g.last), 'd MMM')}</p>
                <ul className="mt-1.5 space-y-1">{g.examples.map((x) => <li key={x} className="text-sm text-zinc-700 dark:text-zinc-300">“<MathText text={x} />”</li>)}</ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ReminderSwitch({ on, onChanged }: { on: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (v: boolean) => {
    setBusy(true);
    try {
      await authedJson('/api/tutor/cards/reminder', { method: 'PUT', body: JSON.stringify({ on: v, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      toast.success(v ? 'We’ll remind you at 6 pm on days with cards due' : 'Reminder off');
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
      <Switch checked={on} onChange={(v) => void set(v)} disabled={busy} label="Remind me at 6 pm when cards are due" />
      <span aria-hidden>Remind me at 6 pm when cards are due</span>
    </div>
  );
}
