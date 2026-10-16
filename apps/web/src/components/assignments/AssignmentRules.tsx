'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/Dialogs';

// An assignment's rules (Stage 5 · B3.1, src/lib/assignment-policy.ts): the late penalty and the
// hand-in limit (teacher and co-teachers), and extensions for one student (the teaching team).

export interface Rules { latePenalty: number | null; lateGraceMinutes: number; latePenaltyMax: number; maxAttempts: number | null }
export interface Extension { studentId: string; dueDate: string; extraAttempts: number; note: string | null }
export interface ClassStudent { id: string; name: string; extraDays: number; extraTimePct: number }

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** For a datetime-local input, in local time. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** The rules in a sentence, for students and teachers. */
export function rulesSentence(r: Rules): string[] {
  const out: string[] = [];
  if (r.latePenalty) {
    const grace = r.lateGraceMinutes ? ` (after ${r.lateGraceMinutes >= 60 && r.lateGraceMinutes % 60 === 0 ? `${r.lateGraceMinutes / 60} hour${r.lateGraceMinutes === 60 ? '' : 's'}` : `${r.lateGraceMinutes} minutes`})` : '';
    out.push(`Late work loses ${r.latePenalty}% a day${grace}${r.latePenaltyMax < 100 ? `, ${r.latePenaltyMax}% at most` : ''}.`);
  }
  if (r.maxAttempts != null) out.push(r.maxAttempts === 1 ? 'You can hand it in once.' : `You can hand it in up to ${r.maxAttempts} times before it’s graded.`);
  return out;
}

/** The late penalty and hand-in limit; read-only for assistants. */
export function RulesEditor({ assignmentId, rules, canManage, onSaved }: { assignmentId: string; rules: Rules; canManage: boolean; onSaved: () => void }) {
  const [f, setF] = useState({
    latePenalty: rules.latePenalty == null ? '' : String(rules.latePenalty),
    lateGraceMinutes: String(rules.lateGraceMinutes ?? 0),
    latePenaltyMax: String(rules.latePenaltyMax ?? 100),
    maxAttempts: rules.maxAttempts == null ? '' : String(rules.maxAttempts),
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await authedJson(`/api/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify({ latePenalty: f.latePenalty.trim() ? Number(f.latePenalty) : null, lateGraceMinutes: Number(f.lateGraceMinutes) || 0, latePenaltyMax: f.latePenaltyMax.trim() ? Number(f.latePenaltyMax) : 100, maxAttempts: f.maxAttempts.trim() ? Number(f.maxAttempts) : null }) });
      toast.success('Rules saved. They apply to answers handed in from now on.');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, 'The rules couldn’t be saved.'));
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof typeof f, label: string, hint: string, max: number) => (
    <label className="block text-sm text-zinc-800 dark:text-zinc-200">
      <span className="font-medium">{label}</span>
      <input type="number" inputMode="numeric" min={0} max={max} value={f[key]} disabled={!canManage} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="input mt-1 py-1.5" />
      <span className="block text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{hint}</span>
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {field('latePenalty', 'Late penalty (% a day)', 'Empty: none. Each started day counts.', 100)}
        {field('lateGraceMinutes', 'Grace (minutes)', 'Still on time this long after.', 10_080)}
        {field('latePenaltyMax', 'Most it can lose (%)', 'Usually 100.', 100)}
        {field('maxAttempts', 'Hand-ins allowed', 'Empty: any number until graded.', 20)}
      </div>
      {canManage && <button type="button" onClick={() => void save()} disabled={busy} className="btn-secondary btn-sm">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save rules</button>}
    </div>
  );
}

/** Extensions for one student: their own due date and extra hand-ins. */
export function Extensions({ assignmentId, dueDate, students, extensions, onChanged }: {
  assignmentId: string; dueDate: string | null; students: ClassStudent[]; extensions: Extension[]; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ studentId: '', due: '', extraAttempts: '0', note: '' });
  const [busy, setBusy] = useState(false);
  const name = (id: string) => students.find((s) => s.id === id)?.name ?? 'A student';
  const send = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await authedJson(`/api/assignments/${assignmentId}/extensions`, { method: 'POST', body: JSON.stringify(body) });
      toast.success(ok);
      onChanged();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'That didn’t work. Try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    const base = dueDate && new Date(dueDate) > new Date() ? new Date(dueDate) : new Date();
    setF({ studentId: '', due: localInput(new Date(base.getTime() + 2 * 86_400_000)), extraAttempts: '0', note: '' });
    setAdding(true);
  };
  const withExtra = students.filter((s) => s.extraDays || s.extraTimePct);
  return (
    <div className="space-y-3">
      {extensions.length ? (
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
          {extensions.map((x) => (
            <li key={x.studentId} className="py-2 flex items-center gap-3 flex-wrap text-sm">
              <CalendarClock className="w-4 h-4 text-indigo-500 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1"><span className="font-medium text-zinc-900 dark:text-white">{name(x.studentId)}</span><span className="text-zinc-600 dark:text-zinc-400"> · until {when(x.dueDate)}{x.extraAttempts ? ` · ${x.extraAttempts} more hand-in${x.extraAttempts === 1 ? '' : 's'}` : ''}{x.note ? ` · ${x.note}` : ''}</span></span>
              <button type="button" disabled={busy} aria-label={`Remove ${name(x.studentId)}’s extension`} onClick={async () => { if (await confirmDialog({ title: `Remove ${name(x.studentId)}’s extension?`, message: 'They go back to the class’s due date.', confirmLabel: 'Remove', destructive: true })) void send({ studentId: x.studentId, dueDate: null }, 'Extension removed'); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">No extensions.</p>}
      {withExtra.length > 0 && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Extra time already set for: {withExtra.map((s) => `${s.name} (${[s.extraDays ? `+${s.extraDays} day${s.extraDays === 1 ? '' : 's'}` : '', s.extraTimePct ? `+${s.extraTimePct}% on timed quizzes` : ''].filter(Boolean).join(', ')})`).join('; ')}.</p>
      )}
      {adding ? (
        <form className="panel p-3 space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await send({ studentId: f.studentId, dueDate: new Date(f.due).toISOString(), extraAttempts: Number(f.extraAttempts) || 0, note: f.note }, `${name(f.studentId)} has until ${when(new Date(f.due).toISOString())}`)) setAdding(false); }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm"><span className="font-medium text-zinc-800 dark:text-zinc-200">Student</span>
              <select required value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })} className="input mt-1 py-1.5">
                <option value="">Choose…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm"><span className="font-medium text-zinc-800 dark:text-zinc-200">New due date</span>
              <input required type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className="input mt-1 py-1.5" />
            </label>
            <label className="block text-sm"><span className="font-medium text-zinc-800 dark:text-zinc-200">More hand-ins (optional)</span>
              <input type="number" min={0} max={10} value={f.extraAttempts} onChange={(e) => setF({ ...f, extraAttempts: e.target.value })} className="input mt-1 py-1.5" />
            </label>
            <label className="block text-sm"><span className="font-medium text-zinc-800 dark:text-zinc-200">Note for the team (optional)</span>
              <input maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="input mt-1 py-1.5" placeholder="e.g. Ill this week" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !f.studentId || !f.due} className="btn-primary btn-sm">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Give the extension</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">They’re told in the app. If the assignment is closed, it stays open for them until then.</p>
        </form>
      ) : <button type="button" onClick={start} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" /> Give an extension</button>}
    </div>
  );
}

/** When students see grades (Stage 5 · B3.4): when returned, or all at once with "Post grades". */
export function GradePosting({ assignmentId, policy, held, canManage, onChanged }: { assignmentId: string; policy: 'AUTO' | 'MANUAL'; held: number; canManage: boolean; onChanged: () => void }) {
  const [progress, setProgress] = useState<string | null>(null);
  const setPolicy = async (v: string) => {
    try { await authedJson(`/api/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify({ postPolicy: v }) }); toast.success(v === 'MANUAL' ? 'Grades wait until you post them' : 'Each grade shows when you return it'); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'That didn’t change.')); }
  };
  // A few at a time (the server's per-request limits), until none are left.
  const post = async () => {
    if (!(await confirmDialog({ title: `Post ${held} grade${held === 1 ? '' : 's'}?`, message: 'Students see their grade, feedback and notes, and it goes into the gradebook. They’re told in the app.', confirmLabel: 'Post them' }))) return;
    let done = 0;
    setProgress(`Posting 0 of ${held}…`);
    try {
      for (let guard = 0; guard < 200; guard++) {
        const out = await authedJson<{ posted: number; left: number }>(`/api/assignments/${assignmentId}/post-grades`, { method: 'POST' });
        done += out.posted;
        setProgress(`Posting ${done} of ${done + out.left}…`);
        if (!out.left || !out.posted) break;
      }
      toast.success(`${done} grade${done === 1 ? '' : 's'} posted`);
    } catch (e) {
      toast.error(errorMessage(e, 'Posting stopped. Try again to post the rest.'));
    } finally {
      setProgress(null);
      onChanged();
    }
  };
  return (
    <div className="space-y-2">
      <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">Students see grades
        <select className="input w-auto py-1.5" value={policy} disabled={!canManage} onChange={(e) => void setPolicy(e.target.value)}>
          <option value="AUTO">when I return each one</option>
          <option value="MANUAL">when I post them, all together</option>
        </select>
      </label>
      {(held > 0 || progress) && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-700 dark:text-zinc-300"><span className="font-semibold tabular-nums">{held}</span> graded, not posted yet</span>
          {canManage && <button type="button" onClick={() => void post()} disabled={!!progress} className="btn-primary btn-sm">{progress ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress}</> : `Post ${held} grade${held === 1 ? '' : 's'}`}</button>}
        </div>
      )}
    </div>
  );
}
