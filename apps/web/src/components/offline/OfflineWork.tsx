'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, Clock, CloudUpload, Loader2, RotateCcw, Send, Trash2 } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { discard, enqueue, getDraft, listOutbox, newClientId, onOutbox, retry, saveDraft, type OutboxItem } from '@/lib/outbox';
import type { PackAssignment, PackQuiz } from '@/lib/offline-packs';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Offline-first classroom (upgrade 4): take a saved quiz or write a saved assignment with no
// connection. Both go to the device's outbox (src/lib/outbox.ts) and are sent when it's back.

const when = (t: number | string) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** What's waiting to be sent from this device, and anything the server refused. */
export function OutboxList() {
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  useEffect(() => {
    const load = () => { listOutbox().then(setItems).catch(() => setItems([])); };
    load();
    return onOutbox(load);
  }, []);
  if (!items?.length) return null;

  const drop = async (i: OutboxItem) => {
    if (!(await confirmDialog({ title: `Discard “${i.label}”?`, message: i.kind === 'assignment' ? 'Your answer goes back to your draft on this device.' : 'It won’t be sent.', confirmLabel: 'Discard', destructive: true }))) return;
    if (i.kind === 'assignment' && typeof i.body.text === 'string') await saveDraft(`assignment:${i.ref}`, i.body.text);
    await discard(i.id);
  };

  return (
    <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4 space-y-2" aria-label="Waiting to send">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><CloudUpload className="w-4 h-4 text-indigo-500" /> Waiting to send ({items.length})</h2>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {items.map((i) => (
            <motion.li key={i.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0">
                <span className="block truncate text-zinc-900 dark:text-white">{i.label}</span>
                <span className={cn('block text-xs', i.error ? 'text-rose-500' : 'text-zinc-500')}>
                  {i.error ? `Not accepted: ${i.error}` : `Saved ${when(i.createdAt)}${i.attempts ? ` · tried ${i.attempts}×, trying again soon` : ' · sends when you’re online'}`}
                </span>
              </span>
              {i.error && <button type="button" className="btn-ghost btn-sm" onClick={() => void retry(i.id)} aria-label={`Try “${i.label}” again`}><RotateCcw className="w-4 h-4" /></button>}
              <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={() => void drop(i)} aria-label={`Discard “${i.label}”`}><Trash2 className="w-4 h-4" /></button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

/** Whether this quiz/assignment is already waiting in the outbox. */
function useQueued(ref: string) {
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    const load = () => { listOutbox().then((all) => setQueued(all.some((i) => i.ref === ref && !i.error))).catch(() => {}); };
    load();
    return onOutbox(load);
  }, [ref]);
  return queued;
}

export function OfflineQuiz({ quiz }: { quiz: PackQuiz }) {
  const queued = useQueued(quiz.id);
  const [done, setDone] = useState<string | null>(null);
  const [run, setRun] = useState<null | { startedAt: number }>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const finishing = useRef(false);

  useEffect(() => { getDraft(`quizdone:${quiz.id}`).then((d) => setDone(d?.text ?? null)).catch(() => {}); }, [quiz.id]);

  const finish = async () => {
    if (!run || finishing.current) return;
    finishing.current = true;
    const finishedAt = new Date().toISOString();
    const id = newClientId();
    await enqueue({
      id, kind: 'quiz', method: 'POST', url: `/api/core/quizzes/${encodeURIComponent(quiz.id)}/submit`, ref: quiz.id, label: `Quiz: ${quiz.title}`,
      body: { answers, offline: { clientId: id, startedAt: new Date(run.startedAt).toISOString(), finishedAt } },
    });
    await saveDraft(`quizdone:${quiz.id}`, finishedAt);
    setDone(finishedAt);
    setRun(null);
    finishing.current = false;
    toast.success(navigator.onLine ? 'Quiz finished: sending now.' : 'Quiz finished and saved on this device. It’s sent when you’re back online.');
  };

  const left = run && quiz.timeLimit ? Math.max(0, Math.round((run.startedAt + quiz.timeLimit * 60_000 - now) / 1000)) : null;
  useEffect(() => {
    if (!run || !quiz.timeLimit) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run, quiz.timeLimit]);
  useEffect(() => { if (left === 0) void finish(); });

  if (done || queued) {
    return (
      <div className="p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <span className="text-sm"><b className="text-zinc-900 dark:text-white">{quiz.title}</b><span className="block text-xs text-zinc-500">{queued ? 'Finished offline · waiting to send' : `Finished ${done ? when(done) : ''} · your score shows in My Quizzes once it’s sent`}</span></span>
      </div>
    );
  }
  if (!run) {
    return (
      <div className="p-4 flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{quiz.title}</span>
          <span className="block text-xs text-zinc-500">{quiz.questions.length} questions{quiz.timeLimit ? ` · ${quiz.timeLimit} min` : ''}{quiz.dueDate ? ` · due ${when(quiz.dueDate)}` : ''}</span>
        </span>
        <button type="button" className="btn-primary btn-sm" onClick={() => { setAnswers({}); setNow(Date.now()); setRun({ startedAt: Date.now() }); }}>Start</button>
      </div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.gentle} className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-zinc-900 dark:text-white">{quiz.title}</h3>
        {left !== null && <span className={cn('text-sm font-mono inline-flex items-center gap-1', left < 60 ? 'text-rose-500' : 'text-zinc-500')}><Clock className="w-4 h-4" />{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
      </div>
      <p className="text-xs text-zinc-500">Taken offline: the time you finish is saved with your answers. Your teacher decides if it arrives after the due date.</p>
      <ol className="space-y-4">
        {quiz.questions.map((q, n) => (
          <li key={q.id} className="space-y-2">
            <p className="text-sm font-medium text-zinc-900 dark:text-white">{n + 1}. {q.question}</p>
            <div className="grid gap-1.5">
              {q.options.map((o) => (
                <label key={o} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer', answers[q.id] === o ? 'border-indigo-500 bg-indigo-500/10 text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300')}>
                  <input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o }))} className="accent-indigo-500" /> {o}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">{Object.keys(answers).length} of {quiz.questions.length} answered</span>
        <button type="button" className="btn-primary" onClick={async () => {
          const missing = quiz.questions.length - Object.keys(answers).length;
          if (missing && !(await confirmDialog({ title: `Finish with ${missing} unanswered?`, confirmLabel: 'Finish' }))) return;
          void finish();
        }}><Send className="w-4 h-4" /> Finish</button>
      </div>
    </motion.div>
  );
}

export function OfflineAssignment({ assignment }: { assignment: PackAssignment }) {
  const key = `assignment:${assignment.id}`;
  const queued = useQueued(assignment.id);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getDraft(key).then((d) => { if (d) { setText(d.text); setSaved(d.savedAt); } loaded.current = true; }).catch(() => { loaded.current = true; });
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => { void saveDraft(key, text).then(() => setSaved(Date.now())); }, 600);
    return () => clearTimeout(t);
  }, [key, text]);

  const handIn = async () => {
    const id = newClientId();
    await enqueue({ id, kind: 'assignment', method: 'PUT', url: `/api/assignments/${encodeURIComponent(assignment.id)}/submission`, ref: assignment.id, label: `Assignment: ${assignment.title}`, body: { text, offlineAt: new Date().toISOString() } });
    await saveDraft(key, '');
    setText('');
    setOpen(false);
    toast.success(navigator.onLine ? 'Handing in now.' : 'Saved on this device. It’s handed in when you’re back online.');
  };

  return (
    <div className="p-4 space-y-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left flex items-center gap-3" aria-expanded={open}>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{assignment.title}</span>
          <span className="block text-xs text-zinc-500">{queued ? 'Handed in offline · waiting to send' : `${assignment.maxScore} points${assignment.dueDate ? ` · due ${when(assignment.dueDate)}` : ''}${text ? ' · draft saved on this device' : ''}`}</span>
        </span>
        {queued ? <CloudUpload className="w-4 h-4 text-indigo-500" /> : <span className="text-xs text-indigo-500">{open ? 'Close' : 'Write'}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy} className="space-y-3 overflow-hidden">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{assignment.instructions}</p>
            {assignment.rubric.length > 0 && <ul className="text-xs text-zinc-500 list-disc pl-5">{assignment.rubric.map((r) => <li key={r.id}>{r.criterion} ({r.points})</li>)}</ul>}
            <textarea rows={10} maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer here. It’s saved on this device as you type."
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-500">{saved ? `Draft saved ${when(saved)}` : 'Not saved yet'}</span>
              <button type="button" className="btn-primary btn-sm" disabled={text.trim().length < 20} onClick={() => void handIn()}>
                {queued ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Hand in
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
