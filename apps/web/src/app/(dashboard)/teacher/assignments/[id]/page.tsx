'use client';

import { use, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Loader2, Lock, Send, Sparkles, Trash2, Unlock } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { cn } from '@/lib/utils';

interface RubricItem { id: string; criterion: string; description: string | null; points: number }
interface Score { id: string; score: number; comment: string }
interface Draft { criteria: Score[]; summary: string; strengths: string[]; improvements: string[]; concerns: string[] }
interface Submission {
  id: string;
  text: string;
  status: 'SUBMITTED' | 'DRAFTED' | 'RETURNED';
  aiDraft: Draft | null;
  criteriaScores: Score[] | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  returnedAt: string | null;
  student: { id: string; name: string; email: string };
  similarity?: { peer: { name: string; percent: number } | null; material: { title: string; percent: number } | null };
}
interface Detail {
  id: string;
  title: string;
  instructions: string;
  rubric: RubricItem[];
  maxScore: number;
  dueDate: string | null;
  status: 'OPEN' | 'CLOSED';
  course: { code: string; name: string };
  enrolled: number;
  submissions: Submission[];
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const field = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';
const STATUS: Record<Submission['status'], { label: string; style: string }> = {
  SUBMITTED: { label: 'To grade', style: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  DRAFTED: { label: 'AI draft ready', style: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' },
  RETURNED: { label: 'Returned', style: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
};

export default function TeacherAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading, error, mutate } = useSWR<Detail>(`/api/assignments/${id}`, authedJson);
  const [selected, setSelected] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const subs = useMemo(() => data?.submissions ?? [], [data]);
  const current = subs.find((s) => s.id === selected) ?? subs.find((s) => s.status !== 'RETURNED') ?? subs[0];
  const waiting = subs.filter((s) => s.status === 'SUBMITTED');

  const toggleOpen = async () => {
    if (!data) return;
    try {
      await authedJson(`/api/assignments/${id}`, { method: 'PATCH', body: JSON.stringify({ status: data.status === 'OPEN' ? 'CLOSED' : 'OPEN' }) });
      mutate();
    } catch (err) { toast.error((err as Error).message); }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this assignment?', message: 'Students’ answers are deleted too. Grades you already returned stay in Grades.', destructive: true, confirmLabel: 'Delete' }))) return;
    try {
      await authedJson(`/api/assignments/${id}`, { method: 'DELETE' });
      toast.success('Assignment deleted');
      router.push('/teacher/assignments');
    } catch (err) { toast.error((err as Error).message); }
  };

  // One at a time: each draft is a separate AI request (and counts toward today's AI limit).
  const draftAll = async () => {
    const list = waiting;
    setBulk({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      try {
        await authedJson(`/api/assignments/submissions/${list[i].id}/draft`, { method: 'POST' });
      } catch (err) {
        toast.error((err as Error).message);
        break;
      }
      setBulk({ done: i + 1, total: list.length });
    }
    setBulk(null);
    mutate();
  };

  if (error) return <><Topbar title="Assignment" /><p className="p-8 text-sm text-rose-500">{(error as Error).message}</p></>;

  return (
    <>
      <Topbar title={data?.title ?? 'Assignment'} subtitle={data ? `${data.course.code} · ${subs.length} of ${data.enrolled} handed in · out of ${data.maxScore}` : undefined} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/teacher/assignments" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mr-auto"><ArrowLeft className="w-4 h-4" /> All assignments</Link>
            {waiting.length > 0 && (
              <button type="button" className="btn-secondary" onClick={draftAll} disabled={!!bulk} aria-busy={!!bulk || undefined}>
                {bulk ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting {bulk.done}/{bulk.total}</> : <><Sparkles className="w-4 h-4" /> Draft {waiting.length} with AI</>}
              </button>
            )}
            {data && <button type="button" className="btn-secondary" onClick={toggleOpen}>{data.status === 'OPEN' ? <><Lock className="w-4 h-4" /> Close</> : <><Unlock className="w-4 h-4" /> Reopen</>}</button>}
            <button type="button" className="btn-ghost text-rose-500" onClick={remove} aria-label="Delete assignment"><Trash2 className="w-4 h-4" /></button>
          </div>

          {isLoading || !data ? (
            <div className="h-64 rounded-2xl skeleton" />
          ) : subs.length === 0 ? (
            <div className={`${card} p-10 text-center text-sm text-zinc-500`}>
              No answers yet. Students in {data.course.code} see this assignment under Assignments{data.dueDate ? `, due ${new Date(data.dueDate).toLocaleString()}` : ''}.
            </div>
          ) : (
            <div className="grid lg:grid-cols-[18rem_1fr] gap-5 items-start">
              <nav aria-label="Submissions" className={`${card} p-2 max-h-[70vh] overflow-y-auto`}>
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s.id)}
                    aria-current={current?.id === s.id || undefined}
                    className={cn('w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2 transition-colors', current?.id === s.id ? 'bg-indigo-500/10' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.04]')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{s.student.name}</span>
                      <span className="block text-[11px] text-zinc-500">{new Date(s.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{data.dueDate && new Date(s.submittedAt) > new Date(data.dueDate) ? ' · late' : ''}</span>
                    </span>
                    {(s.similarity?.peer || s.similarity?.material) && <Copy className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Similarity to check" />}
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', STATUS[s.status].style)}>{s.status === 'RETURNED' ? `${s.score}/${data.maxScore}` : STATUS[s.status].label}</span>
                  </button>
                ))}
              </nav>
              {current && <Grader key={`${current.id}:${current.status}:${current.aiDraft ? 1 : 0}`} detail={data} sub={current} onChange={() => mutate()} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Grader({ detail, sub, onChange }: { detail: Detail; sub: Submission; onChange: () => void }) {
  // Start from the returned grade, else the AI draft, else blank.
  const start = sub.criteriaScores ?? sub.aiDraft?.criteria ?? [];
  const [scores, setScores] = useState<Record<string, { score: string; comment: string }>>(() =>
    Object.fromEntries(detail.rubric.map((r) => {
      const s = start.find((x) => x.id === r.id);
      return [r.id, { score: s ? String(s.score) : '', comment: s?.comment ?? '' }];
    })),
  );
  const [feedback, setFeedback] = useState(() => sub.feedback ?? (sub.aiDraft ? draftFeedback(sub.aiDraft) : ''));
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const total = detail.rubric.reduce((t, r) => t + (Number(scores[r.id]?.score) || 0), 0);


  const draft = async () => {
    setDrafting(true);
    try {
      const r = await authedJson<{ aiLeft: number | null }>(`/api/assignments/submissions/${sub.id}/draft`, { method: 'POST' });
      toast.success(`AI draft ready. Check it before returning.${r.aiLeft !== null ? ` ${r.aiLeft} AI requests left today.` : ''}`);
      onChange();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    const missing = detail.rubric.find((r) => scores[r.id]?.score === '');
    if (missing) return toast.error(`Give “${missing.criterion}” a score.`);
    setSending(true);
    try {
      await authedJson(`/api/assignments/submissions/${sub.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ criteria: detail.rubric.map((r) => ({ id: r.id, score: Number(scores[r.id].score), comment: scores[r.id].comment })), feedback }),
      });
      toast.success(`${sub.status === 'RETURNED' ? 'Grade updated' : 'Grade returned'} to ${sub.student.name}`);
      onChange();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4" aria-label={`Answer by ${sub.student.name}`}>
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-zinc-900 dark:text-white">{sub.student.name}</h3>
          <span className="text-xs text-zinc-500">{sub.text.trim().split(/\s+/).length} words · handed in {new Date(sub.submittedAt).toLocaleString()}</span>
        </div>
        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">{sub.text}</p>
      </div>

      {(sub.similarity?.peer || sub.similarity?.material) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300" role="note">
          <p className="font-semibold flex items-center gap-2 mb-1"><Copy className="w-4 h-4" /> Similar wording (worth a look, not proof)</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {sub.similarity.peer && <li>About {sub.similarity.peer.percent}% of the phrasing is shared with {sub.similarity.peer.name}&apos;s answer.</li>}
            {sub.similarity.material && <li>About {sub.similarity.material.percent}% of its phrases appear in the course material “{sub.similarity.material.title}”.</li>}
          </ul>
          <p className="text-xs mt-2 opacity-80">Quotes, set definitions and group work can share wording too.</p>
        </div>
      )}

      {sub.aiDraft?.concerns?.length ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300" role="note">
          <p className="font-semibold flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> For you to check (not shown to the student)</p>
          <ul className="list-disc pl-5 space-y-0.5">{sub.aiDraft.concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}

      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-900 dark:text-white">Grade · {total}/{detail.maxScore}</h3>
          {sub.status !== 'RETURNED' && (
            <button type="button" className="btn-secondary" onClick={draft} disabled={drafting} aria-busy={drafting || undefined}>
              {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {sub.aiDraft ? 'Redo AI draft' : 'Draft with AI'}
            </button>
          )}
        </div>
        {sub.aiDraft && sub.status !== 'RETURNED' && <p className="text-xs text-indigo-600 dark:text-indigo-300">Filled in from the AI draft. Change anything that isn’t right; the student only sees what you return.</p>}

        {detail.rubric.map((r) => (
          <div key={r.id} className="grid sm:grid-cols-[1fr_7rem] gap-2">
            <div>
              <label htmlFor={`score-${r.id}`} className="text-sm font-medium text-zinc-900 dark:text-white">{r.criterion}</label>
              {r.description && <p className="text-xs text-zinc-500">{r.description}</p>}
              <textarea
                aria-label={`Comment on ${r.criterion}`}
                rows={2}
                maxLength={800}
                value={scores[r.id]?.comment ?? ''}
                onChange={(e) => setScores((s) => ({ ...s, [r.id]: { ...s[r.id], comment: e.target.value } }))}
                placeholder="Comment for the student (optional)"
                className={`${field} mt-1.5`}
              />
            </div>
            <div className="flex sm:flex-col items-center sm:items-stretch gap-2">
              <input
                id={`score-${r.id}`}
                type="number"
                min={0}
                max={r.points}
                step={0.5}
                value={scores[r.id]?.score ?? ''}
                onChange={(e) => setScores((s) => ({ ...s, [r.id]: { ...s[r.id], score: e.target.value } }))}
                className={field}
              />
              <span className="text-xs text-zinc-500 sm:text-center">out of {r.points}</span>
            </div>
          </div>
        ))}

        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-900 dark:text-white">Overall feedback</span>
          <textarea rows={4} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} className={field} placeholder="What went well, what to improve next time" />
        </label>

        <div className="flex items-center justify-between gap-3">
          {sub.status === 'RETURNED' ? <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Returned {sub.returnedAt ? new Date(sub.returnedAt).toLocaleDateString() : ''}</span> : <span />}
          <button type="button" className="btn-primary" onClick={send} disabled={sending} aria-busy={sending || undefined}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {sub.status === 'RETURNED' ? 'Update grade' : 'Return grade'}
          </button>
        </div>
      </div>
    </section>
  );
}

function draftFeedback(d: Draft) {
  return [
    d.summary,
    d.strengths.length ? `What went well:\n${d.strengths.map((s) => `- ${s}`).join('\n')}` : '',
    d.improvements.length ? `To improve:\n${d.improvements.map((s) => `- ${s}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}
