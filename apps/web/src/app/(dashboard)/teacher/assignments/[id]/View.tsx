'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from '@/components/ui/Link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Loader2, Lock, PenLine, Send, Sparkles, Trash2, Unlock } from 'lucide-react';
import { FeedbackRecorder } from '@/components/assignments/FeedbackRecorder';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';
import { Translatable } from '@/components/shared/Translatable';
import { AiReceiptView } from '@/components/assignments/AiReceipt';
import { AI_POLICIES, type AiPolicy, type AiReceipt } from '@/lib/ai-receipt';
import { Extensions, GradePosting, RulesEditor, rulesSentence, type ClassStudent, type Extension } from '@/components/assignments/AssignmentRules';
import { withPenalty } from '@/lib/assignment-policy';
import { HandedInView } from '@/components/assignments/HandIn';
import { GroupModePicker, GroupsEditor, type Group } from '@/components/assignments/AssignmentGroups';
import { PeerReviewsOf, PeerSettings, type TeacherReview } from '@/components/assignments/PeerReview';
import { SubmissionNotes } from '@/components/assignments/SubmissionNotes';
import { ReceiptCheck, RegradeAnswers, type Regrade } from '@/components/assignments/StudentExtras';
import { WritingReplay } from '@/components/assignments/WritingReplay';
import type { GroupMode } from '@/lib/group-maker';
import { SUBMIT_KINDS, SUBMIT_LABEL, type SubmitKind } from '@/lib/submit-kinds';

interface RubricItem { id: string; criterion: string; description: string | null; points: number }
interface Score { id: string; score: number; comment: string }
interface Draft { criteria: Score[]; summary: string; strengths: string[]; improvements: string[]; concerns: string[] }
interface Submission {
  id: string;
  text: string;
  /** REOPENED: graded, and the student may hand in again (Stage 5 · B3.1). */
  status: 'SUBMITTED' | 'DRAFTED' | 'RETURNED' | 'REOPENED';
  aiDraft: Draft | null;
  attempts?: number; lateDays?: number; latePenalty?: number; lateWaived?: boolean; rawScore?: number | null;
  fileUrl?: string | null; fileName?: string | null; fileSize?: number | null; linkUrl?: string | null;
  /** A group's hand-in (Stage 5 · B3.2), and each member's grade { studentId: { gradeId, score } } (JSON). */
  groupId?: string | null; memberGrades?: string | null;
  /** When its grade reached the gradebook and the student (null: held until "Post grades"). */
  postedAt?: string | null;
  criteriaScores: Score[] | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  offlineAt?: string | null;
  returnedAt: string | null;
  student: { id: string; name: string; email: string };
  similarity?: { peer: { name: string; percent: number } | null; material: { title: string; percent: number } | null };
  feedbackMediaUrl: string | null; feedbackMediaKind: string | null; feedbackTranscript: string | null;
  styleSignals: { baseline: number; differs: { label: string; now: number; usual: number }[] } | null;
  aiReceipt?: AiReceipt | null;
  /** A writing replay was kept (Stage 5 · B3.6), and whether it ends at the text handed in. */
  replayMatches?: boolean | null;
}
interface Detail {
  id: string;
  /** False for a teaching assistant: they grade, but don't change the assignment. */
  canManage?: boolean;
  title: string;
  instructions: string;
  rubric: RubricItem[];
  maxScore: number;
  dueDate: string | null;
  status: 'OPEN' | 'CLOSED';
  aiPolicy?: string;
  latePenalty: number | null; lateGraceMinutes: number; latePenaltyMax: number; maxAttempts: number | null;
  submitKind?: SubmitKind;
  groupMode?: GroupMode | null;
  groups?: Group[];
  peerReviews?: number; peerDueDate?: string | null; peerReviewList?: TeacherReview[];
  postPolicy?: 'AUTO' | 'MANUAL';
  regrades?: Regrade[];
  course: { code: string; name: string };
  enrolled: number;
  students?: ClassStudent[];
  extensions?: Extension[];
  submissions: Submission[];
}

const STATUS: Record<Submission['status'], { label: string; style: string }> = {
  SUBMITTED: { label: 'To grade', style: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  DRAFTED: { label: 'AI draft ready', style: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' },
  RETURNED: { label: 'Returned', style: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  REOPENED: { label: 'Reopened', style: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
};
/** Graded (a reopened one waits for the student, not the teacher). */
const graded = (s: Submission) => s.status === 'RETURNED' || s.status === 'REOPENED';

function TeacherAssignmentPage({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, error, mutate } = useSWR<Detail>(`/api/assignments/${id}`, authedJson);
  const [selected, setSelected] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const subs = useMemo(() => data?.submissions ?? [], [data]);
  // Group work: a hand-in shows its group's name.
  const groupOf = useMemo(() => new Map((data?.groups ?? []).map((g) => [g.id, g])), [data]);
  const who = (s: Submission) => (s.groupId && groupOf.get(s.groupId)?.name) || s.student.name;
  const current = subs.find((s) => s.id === selected) ?? subs.find((s) => !graded(s)) ?? subs[0];
  // The AI drafts written answers (a file or link with a long note too).
  const draftable = (s: Submission) => (data?.submitKind ?? 'TEXT') === 'TEXT' || s.text.length >= 200;
  const waiting = subs.filter((s) => s.status === 'SUBMITTED' && draftable(s));
  const returned = subs.filter(graded).length;

  // Grading at speed: J / K move to the next / previous student (not while typing), and returning a
  // grade moves on to the next answer still to grade.
  const go = (dir: 1 | -1) => {
    const i = subs.findIndex((s) => s.id === current?.id);
    const next = subs[i + dir];
    if (next) setSelected(next.id);
  };
  const nextToGrade = () => {
    const i = subs.findIndex((s) => s.id === current?.id);
    const after = [...subs.slice(i + 1), ...subs.slice(0, i)].find((s) => !graded(s));
    if (after) setSelected(after.id);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); go(1); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Whether students may use AI here (Stage 5 · D12).
  const setKind = async (submitKind: SubmitKind) => {
    try { await authedJson(`/api/assignments/${id}`, { method: 'PATCH', body: JSON.stringify({ submitKind }) }); toast.success(`Students hand in: ${SUBMIT_LABEL[submitKind].label.toLowerCase()}`); mutate(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const setPolicy = async (aiPolicy: AiPolicy) => {
    try { await authedJson(`/api/assignments/${id}`, { method: 'PATCH', body: JSON.stringify({ aiPolicy }) }); toast.success(`AI use: ${AI_POLICIES[aiPolicy].label}`); mutate(); }
    catch (err) { toast.error((err as Error).message); }
  };
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

  // Two at a time: each draft is a separate AI request (counted toward today's AI limit) and
  // one server request, so the Worker's per-request limits are never stretched. Stops as soon as
  // the daily AI limit is reached; other failures are skipped and reported at the end.
  const draftAll = async () => {
    const list = [...waiting];
    let done = 0, failed = 0, stopped: string | null = null;
    setBulk({ done: 0, total: list.length });
    const worker = async () => {
      while (list.length && !stopped) {
        const s = list.shift()!;
        try {
          await authedJson(`/api/assignments/submissions/${s.id}/draft`, { method: 'POST' });
        } catch (err) {
          const e = err as Error & { status?: number };
          if (e.status === 429 || /limit|today/i.test(e.message)) stopped = e.message; else failed += 1;
        }
        done += 1;
        setBulk({ done, total: done + list.length });
        mutate();
      }
    };
    await Promise.all([worker(), worker()]);
    setBulk(null);
    if (stopped) toast.error(stopped);
    else if (failed) toast.error(`${failed} draft${failed === 1 ? '' : 's'} couldn’t be made. Try those again one by one.`);
    else toast.success('AI drafts ready. Check each one before returning it.');
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
            {data?.canManage !== false && <>
              {data && <button type="button" className="btn-secondary" onClick={toggleOpen}>{data.status === 'OPEN' ? <><Lock className="w-4 h-4" /> Close</> : <><Unlock className="w-4 h-4" /> Reopen</>}</button>}
              <button type="button" className="btn-ghost text-rose-500" onClick={remove} aria-label="Delete assignment"><Trash2 className="w-4 h-4" /></button>
            </>}
          </div>

          {data && (
            <details className="panel px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white py-1">Instructions <span className="font-normal text-zinc-500 dark:text-zinc-400">· what students read (also in simpler words: check or edit them here)</span></summary>
              <div className="mt-2 pb-1 space-y-3">
                <Translatable kind="assignment" id={data.id} text={data.instructions} levels={{ auto: false }} className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap" />
                <GroupModePicker assignmentId={data.id} mode={data.groupMode ?? null} disabled={data.canManage === false} onChanged={() => void mutate()} />
                <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">Students hand in
                  <select className="input w-auto py-1.5" value={data.submitKind ?? 'TEXT'} disabled={data.canManage === false} onChange={(e) => void setKind(e.target.value as SubmitKind)}>
                    {SUBMIT_KINDS.map((k) => <option key={k} value={k}>{SUBMIT_LABEL[k].label}</option>)}
                  </select>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 basis-full">{SUBMIT_LABEL[data.submitKind ?? 'TEXT'].hint}</span>
                </label>
                <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">AI use
                  <select className="input w-auto py-1.5" value={data.aiPolicy ?? 'FREE'} disabled={data.canManage === false} onChange={(e) => void setPolicy(e.target.value as AiPolicy)}>
                    {(Object.keys(AI_POLICIES) as AiPolicy[]).map((p) => <option key={p} value={p}>{AI_POLICIES[p].label}</option>)}
                  </select>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 basis-full">{AI_POLICIES[(data.aiPolicy ?? 'FREE') as AiPolicy]?.hint} Answers handed in before a change keep what they had.</span>
                </label>
              </div>
            </details>
          )}

          {data?.groupMode && (
            <details className="panel px-4 py-3" open={!(data.groups?.length)}>
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white py-1">Groups <span className="font-normal text-zinc-600 dark:text-zinc-400">· {data.groups?.length ? `${data.groups.length} group${data.groups.length === 1 ? '' : 's'}` : 'none yet'}</span></summary>
              <div className="mt-3 pb-1"><GroupsEditor assignmentId={data.id} groups={data.groups ?? []} students={data.students ?? []} canManage={data.canManage !== false} onChanged={() => void mutate()} /></div>
            </details>
          )}

          {data && (
            <details className="panel px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white py-1">Rules and extensions <span className="font-normal text-zinc-600 dark:text-zinc-400">· {[...rulesSentence(data).map((x) => x.replace(/^You can/, 'Students can')), data.extensions?.length ? `${data.extensions.length} extension${data.extensions.length === 1 ? '' : 's'}.` : ''].filter(Boolean).join(' ') || 'no late penalty, any number of hand-ins'}</span></summary>
              <div className="mt-3 pb-1 space-y-5">
                <GradePosting assignmentId={data.id} policy={data.postPolicy ?? 'AUTO'} held={subs.filter((s) => graded(s) && !s.postedAt).length} canManage={data.canManage !== false} onChanged={() => void mutate()} />
                <RulesEditor key={`${data.latePenalty}:${data.lateGraceMinutes}:${data.latePenaltyMax}:${data.maxAttempts}`} assignmentId={data.id} rules={data} canManage={data.canManage !== false} onSaved={() => void mutate()} />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Peer review</h3>
                  <PeerSettings key={`${data.peerReviews}:${data.peerDueDate}`} assignmentId={data.id} peerReviews={data.peerReviews ?? 0} peerDueDate={data.peerDueDate ?? null} canManage={data.canManage !== false} groupWork={!!data.groupMode} reviews={data.peerReviewList ?? []} onChanged={() => void mutate()} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Check a hand-in receipt</h3>
                  <ReceiptCheck />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Extensions</h3>
                  <Extensions assignmentId={data.id} dueDate={data.dueDate} students={data.students ?? []} extensions={data.extensions ?? []} onChanged={() => void mutate()} />
                </div>
              </div>
            </details>
          )}

          {isLoading || !data ? (
            <div className="h-64 rounded-2xl skeleton" />
          ) : subs.length === 0 ? (
            <div className={`panel p-10 text-center text-sm text-zinc-500`}>
              No answers yet. Students in {data.course.code} see this assignment under Assignments{data.dueDate ? `, due ${new Date(data.dueDate).toLocaleString()}` : ''}.
            </div>
          ) : (
            <div className="grid lg:grid-cols-[18rem_1fr] gap-5 items-start">
              <div className="space-y-2">
              <div className="panel p-3">
                <div className="flex items-baseline justify-between text-xs text-zinc-500 mb-1.5"><span><b className="text-zinc-900 dark:text-white tabular-nums">{returned}</b> of {subs.length} returned</span><span className="hidden lg:inline">J / K: next / previous</span></div>
                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="progressbar" aria-label="Grades returned" aria-valuemin={0} aria-valuemax={subs.length} aria-valuenow={returned}>
                  <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${subs.length ? (returned / subs.length) * 100 : 0}%` }} />
                </div>
              </div>
              <nav aria-label="Submissions" className={`panel p-2 max-h-[70vh] overflow-y-auto stagger`}>
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s.id)}
                    aria-current={current?.id === s.id || undefined}
                    className={cn('relative isolate w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2 transition-colors', current?.id === s.id ? '' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.04]')}
                  >{current?.id === s.id && <TabPill id="-teacher-assignments-id-page-0" variant="soft" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{who(s)}</span>
                      <span className="block text-[11px] text-zinc-500">{new Date(s.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{s.lateDays ? ` · ${s.lateDays} day${s.lateDays === 1 ? '' : 's'} late${s.latePenalty && !s.lateWaived ? ` (−${s.latePenalty}%)` : ''}` : ''}{s.attempts && s.attempts > 1 ? ` · hand-in ${s.attempts}` : ''}{s.offlineAt ? ' · offline' : ''}</span>
                    </span>
                    {(data.regrades ?? []).some((r) => r.submissionId === s.id && r.status === 'OPEN') && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-amber-500/15 text-amber-800 dark:text-amber-200">Regrade?</span>}
                    {(s.similarity?.peer || s.similarity?.material) && <Copy className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Similarity to check" />}
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', (STATUS[s.status] ?? STATUS.SUBMITTED).style)}>{s.status === 'RETURNED' ? `${s.score}/${data.maxScore}${s.postedAt ? '' : ' · not posted'}` : (STATUS[s.status] ?? STATUS.SUBMITTED).label}</span>
                  </button>
                ))}
              </nav>
              </div>
              {current && <Grader key={`${current.id}:${current.status}:${current.aiDraft ? 1 : 0}`} detail={data} sub={current} group={current.groupId ? groupOf.get(current.groupId) ?? null : null} onChange={() => mutate()} onReturned={nextToGrade} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Grader({ detail, sub, group, onChange, onReturned }: { detail: Detail; sub: Submission; group: Group | null; onChange: () => void; onReturned: () => void }) {
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
  const [waive, setWaive] = useState(!!sub.lateWaived);
  // A grade for each member (groups, "a grade each"): empty means the group's grade.
  const [own, setOwn] = useState<Record<string, string>>(() => {
    try { const m = JSON.parse(sub.memberGrades ?? '{}') as Record<string, { score: number }>; return Object.fromEntries(Object.entries(m).filter(([, v]) => v.score !== sub.score).map(([k, v]) => [k, String(v.score)])); } catch { return {}; }
  });
  const each = detail.groupMode === 'INDIVIDUAL' && !!group;
  const total = detail.rubric.reduce((t, r) => t + (Number(scores[r.id]?.score) || 0), 0);
  // The late penalty set when it was handed in (Stage 5 · B3.1), unless waived.
  const penalty = sub.latePenalty && !waive ? sub.latePenalty : 0;
  const reopen = async () => {
    if (!(await confirmDialog({ title: `Let ${sub.student.name} hand in again?`, message: 'Their grade stays until you grade the new version. They’re told in the app.', confirmLabel: 'Let them' }))) return;
    try { await authedJson(`/api/assignments/submissions/${sub.id}/reopen`, { method: 'POST' }); toast.success(`${sub.student.name} can hand in again`); onChange(); }
    catch (err) { toast.error((err as Error).message); }
  };
  // Per-criterion AI suggestions the teacher can accept one by one (or all at once).
  const aiFor = (id: string) => sub.aiDraft?.criteria.find((c) => c.id === id) ?? null;
  const applyAi = (id: string) => {
    const a = aiFor(id);
    if (a) setScores((s) => ({ ...s, [id]: { score: String(a.score), comment: s[id]?.comment || a.comment } }));
  };
  const aiChanged = detail.rubric.filter((r) => aiFor(r.id) && String(aiFor(r.id)!.score) !== scores[r.id]?.score).length;
  const acceptAllAi = () => detail.rubric.forEach((r) => applyAi(r.id));


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
        body: JSON.stringify({
          criteria: detail.rubric.map((r) => ({ id: r.id, score: Number(scores[r.id].score), comment: scores[r.id].comment })), feedback,
          ...(sub.latePenalty ? { waiveLate: waive } : {}),
          ...(each ? { members: Object.entries(own).filter(([, v]) => v.trim() !== '').map(([studentId, v]) => ({ studentId, score: Number(v) })) } : {}),
        }),
      });
      toast.success(`${graded(sub) ? 'Grade updated' : 'Grade returned'} to ${group ? group.name : sub.student.name}`);
      onChange();
      if (!graded(sub)) onReturned();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 stagger" aria-label={`Answer by ${group ? group.name : sub.student.name}`}>
      <div className={`panel p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-zinc-900 dark:text-white">{group ? <>{group.name} <span className="font-normal text-sm text-zinc-600 dark:text-zinc-400">· {group.members.map((m) => m.name).join(', ')} · handed in by {sub.student.name}</span></> : sub.student.name}</h3>
          <span className="text-xs text-zinc-500">{sub.text.trim() ? `${sub.text.trim().split(/\s+/).length} words · ` : ''}{sub.offlineAt ? <>written offline, handed in on the device {new Date(sub.offlineAt).toLocaleString()} · arrived {new Date(sub.submittedAt).toLocaleString()}</> : <>handed in {new Date(sub.submittedAt).toLocaleString()}</>}</span>
        </div>
        {(sub.fileUrl || sub.linkUrl) && <div className="mb-3"><HandedInView h={sub} /></div>}
        {(sub.fileUrl || sub.linkUrl) && sub.text && <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1">Their note</p>}
        {/* Read it in your language; the grade is always for the original (Stage 5 · D8). */}
        <Translatable kind="submission" id={sub.id} text={sub.text} className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words max-h-96 overflow-y-auto" />
      </div>

      {(sub.aiReceipt || (detail.aiPolicy && detail.aiPolicy !== 'FREE')) && (
        <div className="panel p-5 space-y-2">
          <h3 className="font-semibold text-zinc-900 dark:text-white">AI receipt</h3>
          <AiReceiptView receipt={sub.aiReceipt ?? null} policy={detail.aiPolicy} who={sub.student.name.split(' ')[0]} />
        </div>
      )}

      <WritingReplay key={sub.id} submissionId={sub.id} matches={sub.replayMatches} name={sub.student.name} />

      <RegradeAnswers regrades={(detail.regrades ?? []).filter((r) => r.submissionId === sub.id)} onChanged={onChange} />

      <SubmissionNotes sub={sub} title="Notes for the student" />

      <PeerReviewsOf reviews={(detail.peerReviewList ?? []).filter((r) => r.submissionId === sub.id)} rubric={detail.rubric} maxScore={detail.maxScore} />

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

      {sub.styleSignals?.differs?.length ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-4 text-sm text-sky-800 dark:text-sky-200" role="note">
          <p className="font-semibold flex items-center gap-2 mb-1"><PenLine className="w-4 h-4" /> Writing style differs from {sub.student.name.split(' ')[0]}’s earlier writing</p>
          <ul className="space-y-0.5">{sub.styleSignals.differs.map((d) => <li key={d.label}>{d.label}: <b>{d.now}</b> here, usually about {d.usual}</li>)}</ul>
          <p className="text-xs mt-2 opacity-80">Compared with their {sub.styleSignals.baseline} earlier answers. Worth a conversation, not a conclusion: people write differently for different tasks, and they may simply have improved. This is not an AI-detection result.</p>
        </div>
      ) : null}

      {sub.aiDraft?.concerns?.length ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300" role="note">
          <p className="font-semibold flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> For you to check (not shown to the student)</p>
          <ul className="list-disc pl-5 space-y-0.5">{sub.aiDraft.concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}

      <div className={`panel p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-900 dark:text-white">Grade · {total}/{detail.maxScore}{penalty ? <span className="font-normal text-rose-700 dark:text-rose-300"> → {withPenalty(total, penalty)} after −{penalty}% late</span> : null}</h3>
          {!graded(sub) && ((detail.submitKind ?? 'TEXT') === 'TEXT' || sub.text.length >= 200) && (
            <button type="button" className="btn-secondary" onClick={draft} disabled={drafting} aria-busy={drafting || undefined}>
              {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {sub.aiDraft ? 'Redo AI draft' : 'Draft with AI'}
            </button>
          )}
        </div>
        {sub.lateDays ? (
          <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 px-3 py-2">
            {sub.latePenalty ? <input type="checkbox" className="mt-1" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> : null}
            <span>Handed in {sub.lateDays} day{sub.lateDays === 1 ? '' : 's'} late{sub.latePenalty ? <>: <b>−{sub.latePenalty}%</b>. Tick to waive it (an agreed reason, a problem on our side).</> : ' (no penalty set).'}</span>
          </label>
        ) : null}
        {sub.aiDraft && !graded(sub) && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-indigo-600 dark:text-indigo-300 flex-1 min-w-[12rem]">Filled in from the AI draft. Change anything that isn’t right; the student only sees what you return.</p>
            {aiChanged > 0 && <button type="button" onClick={acceptAllAi} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20">Use all AI scores</button>}
          </div>
        )}

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
                className={`input mt-1.5`}
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
                className="input"
              />
              <span className="text-xs text-zinc-500 sm:text-center">out of {r.points}</span>
              {aiFor(r.id) && String(aiFor(r.id)!.score) !== scores[r.id]?.score && (
                <button type="button" onClick={() => applyAi(r.id)} title={aiFor(r.id)!.comment || 'AI suggestion'} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 whitespace-nowrap">AI: {aiFor(r.id)!.score} · use</button>
              )}
            </div>
          </div>
        ))}

        {group && (each ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-900 dark:text-white">A grade for each member <span className="font-normal text-zinc-600 dark:text-zinc-400">(empty: the group’s {withPenalty(total, penalty)})</span></legend>
            <ul className="grid sm:grid-cols-2 gap-2">
              {group.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <label htmlFor={`own-${m.id}`} className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200 truncate">{m.name}</label>
                  <input id={`own-${m.id}`} type="number" min={0} max={detail.maxScore} step={0.5} value={own[m.id] ?? ''} placeholder={String(withPenalty(total, penalty))} onChange={(e) => setOwn((o) => ({ ...o, [m.id]: e.target.value }))} className="input w-24 py-1.5" />
                </li>
              ))}
            </ul>
          </fieldset>
        ) : <p className="text-xs text-zinc-600 dark:text-zinc-400">Everyone in {group.name} gets this grade.</p>)}

        <FeedbackRecorder submissionId={sub.id} media={{ url: sub.feedbackMediaUrl, kind: sub.feedbackMediaKind, transcript: sub.feedbackTranscript }} onChange={onChange} />

        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-900 dark:text-white">Overall feedback</span>
          <textarea rows={4} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="input" placeholder="What went well, what to improve next time" />
        </label>

        <div className="flex items-center justify-between gap-3">
          {sub.status === 'RETURNED' ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {sub.postedAt ? 'Returned' : 'Graded, not posted yet'} {sub.returnedAt ? new Date(sub.returnedAt).toLocaleDateString() : ''}</span>
              <button type="button" onClick={() => void reopen()} className="btn-ghost btn-sm">Let them hand in again</button>
            </span>
          ) : sub.status === 'REOPENED' ? <span className="text-xs text-sky-700 dark:text-sky-300">Reopened: waiting for their new version</span> : <span />}
          <button type="button" className="btn-primary" onClick={send} disabled={sending} aria-busy={sending || undefined}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {graded(sub) ? 'Update grade' : 'Return grade'}
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

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function TeacherAssignmentPageRoute() {
  const p = usePathParams('/teacher/assignments/[id]');
  return p ? <TeacherAssignmentPage key={p.id} id={p.id} /> : <AddressLoading portal />;
}
