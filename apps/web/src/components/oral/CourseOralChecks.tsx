'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronDown, Lock, Mic, Plus, RotateCcw, Trash2, Unlock, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { LANGUAGES } from '@/lib/languages';
import { fadeUp, list, spring } from '@/lib/motion';
import { ORAL_KINDS, defaultRubric, type Criterion, type OralKind } from '@/lib/oral';
import { cn } from '@/lib/utils';
import { CriterionScore, Transcript, type OralView } from './OralResult';

// Course board → Oral checks (Stage 5 · D11, src/server/oral.ts). The teacher sets a low-stakes oral
// check (what the AI examiner asks, the rubric, how long); each student does it once by voice; the
// recording, transcript and AI-suggested scores come here for the teacher to confirm or change.
// Students see the course's open checks here too, and do them on AI tutor → Oral practice.

type Row = { id: string; title: string; kind: string; topic: string; minutes: number; dueAt: string | null; status: string; done?: number; toConfirm?: number; confirmed?: number; open?: boolean; mine?: { id: string; status: string; total: number | null; max: number } | null };
type List = { checks: Row[]; canManage: boolean; enrolled?: number };
type Attempt = OralView & { student: { id: string; name: string }; aiScores: OralView['scores']; aiTotal: number | null; audioUrl: string | null };
type Detail = { check: { id: string; title: string; kind: string; topic: string; questions: string; lang: string; minutes: number; dueAt: string | null; status: string; rubric: Criterion[] }; sessions: Attempt[]; notYet: { id: string; name: string }[] };

const KINDS = Object.keys(ORAL_KINDS) as OralKind[];
const kindLabel = (k: string) => ORAL_KINDS[k as OralKind]?.label ?? 'Oral';
const STATUS: Record<string, { label: string; cls: string }> = {
  STARTED: { label: 'In progress', cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  SUBMITTED: { label: 'To confirm', cls: 'bg-amber-500/10 text-amber-800 dark:text-amber-200' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
};

export function CourseOralChecks({ courseId }: { courseId: string }) {
  const key = `/api/courses/${courseId}/oral-checks`;
  const { data, error, mutate } = useSWR<List>(key, authedJson);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>;
  if (!data.canManage) {
    return data.checks.length ? (
      <ul className="space-y-2">
        {data.checks.map((c) => (
          <li key={c.id} className="panel p-4 flex items-center gap-3">
            <Mic className="w-5 h-5 text-indigo-600 dark:text-indigo-300 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1"><p className="font-semibold text-zinc-900 dark:text-white truncate">{c.title}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">{kindLabel(c.kind)} · {c.minutes} min{c.mine ? ` · ${c.mine.status === 'CONFIRMED' ? `${c.mine.total} / ${c.mine.max}` : 'sent'}` : ''}</p></div>
            <Link href="/student/oral-practice" className="btn-secondary btn-sm shrink-0">{c.mine ? 'See it' : 'Do it'}</Link>
          </li>
        ))}
      </ul>
    ) : <EmptyState icon={Mic} title="No oral checks" hint="When your teacher sets one, it shows here and on AI tutor → Oral practice." />;
  }
  if (openId) return <CheckDetail id={openId} enrolled={data.enrolled ?? 0} onBack={() => { setOpenId(null); void mutate(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-prose">Students answer the AI examiner by voice, once. You get the recording, the transcript and suggested scores to confirm.</p>
        {!creating && <button type="button" onClick={() => setCreating(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New oral check</button>}
      </div>
      <AnimatePresence initial={false}>{creating && <NewCheck courseId={courseId} onDone={(id) => { setCreating(false); void mutate(); if (id) setOpenId(id); }} />}</AnimatePresence>
      {data.checks.length === 0 && !creating ? <EmptyState icon={Mic} title="No oral checks yet" hint="Set a short viva, debate, language oral or interview for your class." /> : (
        <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2">
          {data.checks.map((c) => (
            <motion.li key={c.id} variants={fadeUp}>
              <button type="button" onClick={() => setOpenId(c.id)} className="w-full panel p-4 flex items-center gap-3 text-left hover:border-indigo-500/40">
                <span className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0"><Mic className="w-5 h-5 text-indigo-600 dark:text-indigo-300" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-zinc-900 dark:text-white truncate">{c.title}</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindLabel(c.kind)} · {c.minutes} min · {c.done} of {data.enrolled} done{c.toConfirm ? ` · ${c.toConfirm} to confirm` : ''}{c.status === 'CLOSED' ? ' · closed' : ''}</span>
                </span>
                {!!c.toConfirm && <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-200 shrink-0">{c.toConfirm}</span>}
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function NewCheck({ courseId, onDone }: { courseId: string; onDone: (id?: string) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<OralKind>('VIVA');
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState('');
  const [lang, setLang] = useState('fr');
  const [minutes, setMinutes] = useState(8);
  const [dueAt, setDueAt] = useState('');
  const [rubric, setRubric] = useState<Criterion[]>(() => defaultRubric('VIVA'));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickKind = (k: OralKind) => { setKind(k); if (!touched) setRubric(defaultRubric(k)); };
  const edit = (i: number, patch: Partial<Criterion>) => { setTouched(true); setRubric((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c))); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ id: string }>(`/api/courses/${courseId}/oral-checks`, { method: 'POST', body: JSON.stringify({ title, kind, topic, questions, lang: kind === 'LANGUAGE' ? lang : '', minutes, dueAt: dueAt ? new Date(dueAt).toISOString() : null, rubric }) });
      toast.success('Oral check set', { description: 'Students are told in the app.' });
      onDone(r.id);
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t set the oral check.')); }
    finally { setBusy(false); }
  };
  return (
    <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} onSubmit={save} className="overflow-hidden" aria-labelledby="new-oral-title">
      <div className="panel p-5 space-y-3">
        <div className="flex items-center justify-between"><h3 id="new-oral-title" className="font-semibold text-zinc-900 dark:text-white">New oral check</h3><button type="button" onClick={() => onDone()} aria-label="Cancel" className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-4 h-4" /></button></div>
        <Field label="Title">{(p) => <input {...p} className="input" maxLength={120} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 6 viva: scheduling" />}</Field>
        <div role="group" aria-label="Kind of oral" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {KINDS.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)} className={cn('rounded-xl border px-3 py-2 text-sm font-semibold', kind === k ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300')}>{ORAL_KINDS[k].label}</button>)}
        </div>
        <Field label="Topic" hint="What the oral is about; the examiner stays on it.">{(p) => <input {...p} className="input" maxLength={300} required value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="CPU scheduling: round-robin, priorities, starvation" />}</Field>
        <Field label="Questions to cover (optional)" hint="One per line. The examiner asks them and follows up on each answer.">{(p) => <textarea {...p} className="input min-h-[5rem]" maxLength={2000} value={questions} onChange={(e) => setQuestions(e.target.value)} />}</Field>
        <div className="grid sm:grid-cols-3 gap-3">
          {kind === 'LANGUAGE' && <Field label="Language">{(p) => <select {...p} className="input" value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANGUAGES).map(([c, l]) => <option key={c} value={c}>{l.name}</option>)}</select>}</Field>}
          <Field label="Length">{(p) => <select {...p} className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[3, 5, 8, 10, 15].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>}</Field>
          <Field label="Due (optional)">{(p) => <input {...p} type="datetime-local" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />}</Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="label">Rubric</legend>
          {rubric.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input aria-label={`Criterion ${i + 1}`} className="input flex-1" maxLength={60} value={c.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <input aria-label={`Points for criterion ${i + 1}`} type="number" min={1} max={10} className="input w-20" value={c.max} onChange={(e) => edit(i, { max: Number(e.target.value) })} />
              <button type="button" onClick={() => { setTouched(true); setRubric((r) => r.filter((_, j) => j !== i)); }} disabled={rubric.length === 1} aria-label={`Remove criterion ${i + 1}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {rubric.length < 8 && <button type="button" onClick={() => { setTouched(true); setRubric((r) => [...r, { id: '', name: '', desc: '', max: 4 }]); }} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a criterion</button>}
        </fieldset>
        <button type="submit" disabled={busy || title.trim().length < 3 || topic.trim().length < 3} className="btn-primary">{busy ? 'Setting…' : 'Set the oral check'}</button>
      </div>
    </motion.form>
  );
}

function CheckDetail({ id, enrolled, onBack }: { id: string; enrolled: number; onBack: () => void }) {
  const key = `/api/oral-checks/${id}`;
  const { data, error, mutate } = useSWR<Detail>(key, authedJson);
  const [open, setOpen] = useState<string | null>(null);
  const act = async (body: object, ok: string) => {
    try { await authedJson(key, { method: 'POST', body: JSON.stringify(body) }); toast.success(ok); await mutate(); return true; }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); return false; }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this oral check?', message: 'Every attempt, recording and score is deleted.', confirmLabel: 'Delete', destructive: true }))) return;
    try { await authedJson(key, { method: 'DELETE' }); toast.success('Deleted'); onBack(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t delete it.')); }
  };
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <div className="h-48 rounded-2xl skeleton" />;
  const c = data.check;
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4" /> All oral checks</button>
      <div className="panel p-5 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-zinc-900 dark:text-white">{c.title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{kindLabel(c.kind)} · {c.minutes} min · {data.sessions.filter((s) => s.status !== 'STARTED').length} of {enrolled} done{c.dueAt ? ` · due ${new Date(c.dueAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => void act({ action: c.status === 'OPEN' ? 'close' : 'open' }, c.status === 'OPEN' ? 'Closed' : 'Open again')} className="btn-secondary btn-sm">{c.status === 'OPEN' ? <><Lock className="w-4 h-4" /> Close</> : <><Unlock className="w-4 h-4" /> Reopen</>}</button>
            <button type="button" onClick={() => void remove()} aria-label="Delete oral check" className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.topic}</p>
        {c.questions && <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line">{c.questions}</p>}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Rubric: {c.rubric.map((r) => `${r.name} (${r.max})`).join(' · ')}</p>
      </div>
      {data.sessions.length === 0 ? <p className="text-sm text-zinc-500 dark:text-zinc-400">Nobody has done it yet.</p> : (
        <ul className="space-y-2" aria-label="Attempts">
          {data.sessions.map((s) => (
            <li key={s.id} className="panel overflow-hidden">
              <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="w-full p-4 flex items-center gap-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-zinc-900 dark:text-white truncate">{s.student.name}</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {Math.max(1, Math.round(s.durationSec / 60))} min · {s.status === 'CONFIRMED' ? `${s.total} / ${s.max}` : s.aiTotal != null ? `AI suggests ${s.aiTotal} / ${s.max}` : 'no AI score'}</span>
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold shrink-0', STATUS[s.status]?.cls)}>{STATUS[s.status]?.label ?? s.status}</span>
                <motion.span animate={{ rotate: open === s.id ? 180 : 0 }} transition={spring.snappy} className="text-zinc-500"><ChevronDown className="w-4 h-4" /></motion.span>
              </button>
              {open === s.id && <AttemptReview s={s} onAct={act} />}
            </li>
          ))}
        </ul>
      )}
      {data.notYet.length > 0 && <p className="text-xs text-zinc-500 dark:text-zinc-400">Not done yet: {data.notYet.map((u) => u.name).join(', ')}</p>}
    </div>
  );
}

function AttemptReview({ s, onAct }: { s: Attempt; onAct: (body: object, ok: string) => Promise<boolean> }) {
  const { data: full } = useSWR<OralView>(`/api/orals/${s.id}`, authedJson);
  const base = s.scores ?? s.aiScores ?? [];
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(s.rubric.map((c) => [c.id, base.find((x) => x.id === c.id)?.score ?? 0])));
  const [comment, setComment] = useState(s.teacherComment ?? '');
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    await onAct({ action: 'confirm', sessionId: s.id, scores: s.rubric.map((c) => ({ id: c.id, score: scores[c.id] ?? 0 })), comment }, 'Score confirmed. The student can see it now.');
    setBusy(false);
  };
  const retry = async () => {
    if (!(await confirmDialog({ title: `Let ${s.student.name} try again?`, message: 'This attempt, its recording and its scores are deleted, and they can do the oral check once more.', confirmLabel: 'Let them try again', destructive: true }))) return;
    await onAct({ action: 'retry', sessionId: s.id }, 'They can try again');
  };
  return (
    <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 dark:border-white/[0.06] pt-3">
      {s.audioUrl ? <audio controls preload="none" src={s.audioUrl} className="w-full" aria-label={`Recording of ${s.student.name}`} /> : s.status !== 'STARTED' && <p className="text-xs text-zinc-500 dark:text-zinc-400">No recording (only the transcript).</p>}
      {s.status === 'STARTED' ? <p className="text-sm text-zinc-600 dark:text-zinc-400">They started but didn’t finish. If it broke off, let them try again.</p> : (
        <>
          <ul className="space-y-3" aria-label="Scores">
            {s.rubric.map((c) => (
              <CriterionScore key={c.id} c={c} s={s.aiScores?.find((x) => x.id === c.id)} extra={
                <label className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-1 shrink-0">Score
                  <input type="number" min={0} max={c.max} value={scores[c.id] ?? 0} onChange={(e) => setScores((x) => ({ ...x, [c.id]: Math.max(0, Math.min(c.max, Number(e.target.value))) }))} className="input w-16 py-1" aria-label={`${c.name} score for ${s.student.name}, out of ${c.max}`} />
                  <span aria-hidden>/ {c.max}</span>
                </label>
              } />
            ))}
          </ul>
          {!s.aiScores && <p className="text-xs text-zinc-500 dark:text-zinc-400">The AI didn’t score this one (too short, or AI was unavailable): score it from the recording and the transcript.</p>}
          <Field label="Comment for the student (optional)">{(p) => <textarea {...p} className="input min-h-[4rem]" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void confirm()} disabled={busy} className="btn-primary btn-sm"><Check className="w-4 h-4" /> {s.status === 'CONFIRMED' ? 'Update score' : 'Confirm score'}</button>
          </div>
        </>
      )}
      <button type="button" onClick={() => void retry()} className="btn-ghost btn-sm"><RotateCcw className="w-4 h-4" /> Let them try again</button>
      {full?.transcript && (
        <details className="rounded-xl border border-zinc-200 dark:border-white/[0.08] px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Transcript</summary>
          <div className="mt-2"><Transcript lines={full.transcript} /></div>
        </details>
      )}
    </div>
  );
}
