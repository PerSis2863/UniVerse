'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Mic, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_BOARD_TABS, STUDENT_TUTOR_MODES } from '@/components/layout/SectionTabs';
import { Field } from '@/components/ui/Field';
import { confirmDialog } from '@/components/ui/Dialogs';
import { OralResult, type OralView } from '@/components/oral/OralResult';
import { OralRoom } from '@/components/oral/OralRoom';
import { useOralSession } from '@/components/oral/useOralSession';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { LANGUAGES } from '@/lib/languages';
import { fadeUp, spring } from '@/lib/motion';
import { ORAL_KINDS, type OralKind } from '@/lib/oral';
import { cn } from '@/lib/utils';
import { AiReceiptChoice, AiReceiptView, startChoice, type ReceiptChoice } from '@/components/assignments/AiReceipt';
import { AI_POLICIES, isAiPolicy, type AiReceipt } from '@/lib/ai-receipt';

// AI tutor → Oral practice (Stage 5 · D11, src/server/oral.ts): oral checks set by teachers (done
// once, recorded, the teacher confirms the score) and practice on your own: a viva, a debate, a
// language oral or an interview with the AI examiner, scored on clarity, depth and evidence.

type Check = { id: string; title: string; kind: string; topic: string; minutes: number; dueAt: string | null; open: boolean; aiPolicy?: string; course: { id: string; code: string; name: string }; mine: { id: string; status: string; total: number | null; max: number; receipt?: boolean } | null };
type Practice = { id: string; kind: string; topic: string; durationSec: number; createdAt: string; total: number | null; max: number };
type Overview = { checks: Check[]; practice: Practice[] };

const KEY = '/api/orals';
const KINDS = Object.keys(ORAL_KINDS) as OralKind[];
const TOPIC_LABEL: Record<OralKind, string> = {
  VIVA: 'What should the viva be about?', DEBATE: 'The motion you’re arguing for', LANGUAGE: 'What would you like to talk about?', INTERVIEW: 'The job, internship or course (optional)',
};
const TOPIC_HINT: Record<OralKind, string> = {
  VIVA: 'e.g. CPU scheduling, or your project', DEBATE: 'e.g. School uniforms should be optional', LANGUAGE: 'e.g. My town, holidays, a film you liked', INTERVIEW: 'e.g. Summer internship in web development',
};

export default function OralPracticePage() {
  const { data, error, mutate } = useSWR<Overview>(KEY, authedJson);
  const { data: courses } = useSWR<{ id: string; code: string; name: string }[]>('/courses/my', fetcher);
  const oral = useOralSession(() => void mutate());
  const [open, setOpen] = useState<string | null>(null);
  const [kind, setKind] = useState<OralKind>('VIVA');
  const [topic, setTopic] = useState('');
  const [lang, setLang] = useState('fr');
  const [courseId, setCourseId] = useState('');
  const [minutes, setMinutes] = useState(8);

  const startCheck = async (c: Check) => {
    if (!(await confirmDialog({ title: `Start “${c.title}”?`, message: `About ${c.minutes} minutes with the AI examiner. You can do it once. Your voice is recorded and the conversation is written down; both go to your teacher with the scores the AI suggests, and your teacher decides the score. Find a quiet place first.${isAiPolicy(c.aiPolicy) && c.aiPolicy !== 'FREE' ? ` ${AI_POLICIES[c.aiPolicy].short}: afterwards, ${c.aiPolicy === 'NONE' ? 'you say you didn’t use AI, or attach your AI receipt and explain' : 'you attach your AI receipt'}.` : ''}`, confirmLabel: 'Start' }))) return;
    void oral.begin({ checkId: c.id });
  };
  const startPractice = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind !== 'INTERVIEW' && topic.trim().length < 3) { toast.error('Say what the oral is about.'); return; }
    void oral.begin({ kind, topic: topic.trim(), lang: kind === 'LANGUAGE' ? lang : undefined, courseId: courseId || undefined, minutes });
  };

  const checks = data?.checks ?? [];
  return (
    <>
      <Topbar title="AI tutor" subtitle="Practise speaking: vivas, debates, language orals and interviews" />
      <SectionTabs tabs={STUDENT_BOARD_TABS} />
      <SectionTabs tabs={STUDENT_TUTOR_MODES} small label="AI tutor mode" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-5">
          {oral.phase !== 'idle' ? <OralRoom oral={oral} onBack={oral.reset} /> : (
            <>
              {error && !data && <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t load your orals.')}</p>}
              {checks.length > 0 && (
                <motion.section variants={fadeUp} initial="hidden" animate="show" className="panel p-5 space-y-3" aria-labelledby="checks-title">
                  <h2 id="checks-title" className="font-semibold text-zinc-900 dark:text-white">From your teachers</h2>
                  <ul className="space-y-2">
                    {checks.map((c) => (
                      <li key={c.id} className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0"><Mic className="w-5 h-5 text-indigo-600 dark:text-indigo-300" aria-hidden /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-zinc-900 dark:text-white truncate">{c.title}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.course.code} · {ORAL_KINDS[c.kind as OralKind]?.label ?? 'Oral'} · {c.minutes} min{c.dueAt ? ` · due ${new Date(c.dueAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}{isAiPolicy(c.aiPolicy) && c.aiPolicy !== 'FREE' ? ` · ${AI_POLICIES[c.aiPolicy].short}` : ''}</p>
                          {c.mine?.status === 'SUBMITTED' && isAiPolicy(c.aiPolicy) && c.aiPolicy !== 'FREE' && !c.mine.receipt && <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Add your AI receipt: open it</p>}
                        </div>
                        {c.mine ? (
                          <button type="button" onClick={() => setOpen(c.mine!.id)} className="btn-secondary btn-sm shrink-0">
                            {c.mine.status === 'CONFIRMED' ? `${c.mine.total} / ${c.mine.max}` : c.mine.status === 'STARTED' ? 'Started' : 'Sent'} <ChevronRight className="w-4 h-4" />
                          </button>
                        ) : c.open ? <button type="button" onClick={() => void startCheck(c)} className="btn-primary btn-sm shrink-0"><Mic className="w-4 h-4" /> Start</button>
                          : <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">Closed</span>}
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={startPractice} className="panel p-5 space-y-4" aria-labelledby="practice-title">
                <div>
                  <h2 id="practice-title" className="font-semibold text-zinc-900 dark:text-white">Practise an oral</h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">The AI examiner asks questions and follow-ups by voice. Afterwards you get scores for clarity, depth and evidence, with what went well and what to try next.</p>
                </div>
                <div role="group" aria-label="Kind of oral" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {KINDS.map((k) => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn('rounded-xl border px-3 py-2 text-sm font-semibold transition-colors', kind === k ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-indigo-400')}>{ORAL_KINDS[k].label}</button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-2">{ORAL_KINDS[kind].hint}</p>
                <Field label={TOPIC_LABEL[kind]} hint={TOPIC_HINT[kind]}>
                  {(p) => <input {...p} className="input" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} />}
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  {kind === 'LANGUAGE' && (
                    <Field label="Language">
                      {(p) => <select {...p} className="input" value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANGUAGES).map(([code, l]) => <option key={code} value={code}>{l.name}</option>)}</select>}
                    </Field>
                  )}
                  <Field label="Course (optional)">
                    {(p) => <select {...p} className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">None</option>{courses?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>}
                  </Field>
                </div>
                <div role="group" aria-label="Length" className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 me-1">Length</span>
                  {[5, 8, 10].map((m) => <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={cn('btn-sm', minutes === m ? 'btn-primary' : 'btn-secondary')}>{m} min</button>)}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={oral.phase !== 'idle'} className="btn-primary"><Mic className="w-4 h-4" /> Start the oral</button>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Uses 2 of your AI requests: the conversation and the scores.</p>
                </div>
              </motion.form>

              {!!data?.practice.length && (
                <section className="panel p-5 space-y-3" aria-labelledby="history-title">
                  <h2 id="history-title" className="font-semibold text-zinc-900 dark:text-white">Your practice</h2>
                  <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    {data.practice.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setOpen(p.id)} className="w-full flex items-center gap-3 py-2.5 text-start">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{ORAL_KINDS[p.kind as OralKind]?.label ?? 'Oral'}: {p.topic || 'open topic'}</span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">{new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {Math.max(1, Math.round(p.durationSec / 60))} min</span>
                          </span>
                          <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{p.total == null ? '–' : `${p.total} / ${p.max}`}</span>
                          <ChevronRight className="w-4 h-4 text-zinc-400" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      <AnimatePresence>{open && <ResultSheet id={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); void mutate(); }} />}</AnimatePresence>
    </>
  );
}

function ResultSheet({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const { data, error } = useSWR<OralView>(`/api/orals/${id}`, authedJson);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this practice?', message: 'Its transcript and scores are deleted.', confirmLabel: 'Delete', destructive: true }))) return;
    setBusy(true);
    try { await authedJson(`/api/orals/${id}`, { method: 'DELETE' }); toast.success('Deleted'); onDeleted(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t delete it.')); }
    finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="oral-sheet-title" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={spring.smooth} className="bg-white dark:bg-zinc-900 w-full sm:max-w-xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 id="oral-sheet-title" className="font-semibold text-zinc-900 dark:text-white">Your oral</h2>
          <div className="flex items-center gap-1">
            {data?.status === 'PRACTICE' && <button type="button" onClick={() => void remove()} disabled={busy} aria-label="Delete this practice" className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>}
            <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-4" role="region" aria-label="Result" tabIndex={0}>
          {data?.checkId && data.status !== 'STARTED' && <OralReceipt id={id} />}
          {data ? <OralResult data={data} /> : error ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t open it.')}</p> : <div className="h-40 rounded-2xl skeleton" />}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** An oral check's AI receipt (Stage 5 · Q22): attached after the oral, until the teacher marks it. */
function OralReceipt({ id }: { id: string }) {
  const url = `/api/orals/${id}/ai-receipt`;
  const { data, mutate } = useSWR<{ policy: string; given: AiReceipt | null; canChange: boolean }>(url, authedJson);
  const [choice, setChoice] = useState<ReceiptChoice | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data || (!data.given && (!data.canChange || data.policy === 'FREE'))) return null;
  const save = async () => {
    setBusy(true);
    try {
      await authedJson(url, { method: 'POST', body: JSON.stringify(choice ?? startChoice(isAiPolicy(data.policy) ? data.policy : 'FREE')) });
      toast.success('Your AI receipt is with your teacher');
      setChoice(null);
      await mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save it.')); }
    finally { setBusy(false); }
  };
  if (data.given && !choice) {
    return (
      <section className="mb-4 rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-4 space-y-2" aria-label="Your AI receipt">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Your AI receipt</h3>
        <AiReceiptView receipt={data.given} policy={data.policy} who="You" what="oral check" />
        {data.canChange && <button type="button" onClick={() => setChoice({ attach: data.given!.attached, declaredNone: data.given!.declaredNone, note: data.given!.note })} className="btn-ghost btn-sm">Change it</button>}
      </section>
    );
  }
  return (
    <div className="mb-4 space-y-2">
      <AiReceiptChoice previewUrl={url} policy={data.policy} value={choice ?? startChoice(isAiPolicy(data.policy) ? data.policy : 'FREE')} onChange={setChoice} what="oral check" />
      <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Send my AI receipt</button>
    </div>
  );
}
