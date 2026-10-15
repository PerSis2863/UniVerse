'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { enqueue, getDraft, isOfflineError, newClientId, saveDraft } from '@/lib/outbox';
import { Translatable } from '@/components/shared/Translatable';
import { AiPolicyNote, AiReceiptChoice, AiReceiptView, startChoice, type ReceiptChoice } from '@/components/assignments/AiReceipt';
import { isAiPolicy, type AiReceipt } from '@/lib/ai-receipt';
import { rulesSentence } from '@/components/assignments/AssignmentRules';
import { HandInFields, HandedInView, type HandedIn } from '@/components/assignments/HandIn';

interface RubricItem { id: string; criterion: string; description: string | null; points: number }
interface Detail {
  id: string;
  title: string;
  instructions: string;
  rubric: RubricItem[];
  maxScore: number;
  dueDate: string | null;
  status: 'OPEN' | 'CLOSED';
  aiPolicy?: string;
  latePenalty: number | null; lateGraceMinutes: number; latePenaltyMax: number; maxAttempts: number | null;
  /** What to hand in (Stage 5 · B3.2): a written answer, a file or a link. */
  submitKind?: 'TEXT' | 'FILE' | 'LINK';
  /** Group work (Stage 5 · B3.2): the student's group (null: not in one yet). */
  groupMode?: 'SHARED' | 'INDIVIDUAL' | null;
  group?: { id: string; name: string; members: { id: string; name: string }[] } | null;
  /** The student's own due date (an extension or extra days), and whether they may hand in (again). */
  myDue?: string | null; extended?: boolean; canHandIn?: boolean; attemptsAllowed?: number | null;
  course: { code: string; name: string };
  mine: {
    id: string;
    text: string;
    /** REOPENED: graded, and the teacher let them hand in again. */
    status: 'SUBMITTED' | 'RETURNED' | 'REOPENED';
    attempts?: number; lateDays?: number; latePenalty?: number; lateWaived?: boolean; rawScore?: number | null;
    fileUrl?: string | null; fileName?: string | null; fileSize?: number | null; linkUrl?: string | null;
    submittedAt: string;
    returnedAt: string | null;
    score: number | null;
    feedback: string | null;
    criteriaScores: { id: string; score: number; comment: string }[] | null;
    feedbackMediaUrl?: string | null; feedbackMediaKind?: string | null; feedbackTranscript?: string | null;
    aiReceipt?: AiReceipt | null;
  } | null;
}

const MAX = 20_000;

function StudentAssignmentPage({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/assignments/${id}`, authedJson);
  const [text, setText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A file or link (Stage 5 · B3.2), until handed in.
  const [picked, setPicked] = useState<HandedIn | null>(null);
  // The AI receipt or "no AI" declaration handed in with the answer (Stage 5 · D12).
  const [receipt, setReceipt] = useState<ReceiptChoice | null>(null);
  // Drafts are kept on this device as you type (upgrade 4), so nothing is lost offline.
  const draftKey = `assignment:${id}`;
  const draftLoaded = useRef(false);
  useEffect(() => {
    getDraft(draftKey).then((d) => {
      if (d?.text) { setText((cur) => cur ?? d.text); toast('Your draft from this device is back.'); }
    }).catch(() => {}).finally(() => { draftLoaded.current = true; });
  }, [draftKey]);
  useEffect(() => {
    if (!draftLoaded.current || text === null) return;
    const t = setTimeout(() => void saveDraft(draftKey, text).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [draftKey, text]);

  const answer = text ?? data?.mine?.text ?? '';
  const kind = data?.submitKind ?? 'TEXT';
  const handIn: HandedIn = picked ?? (data?.mine ? { fileUrl: data.mine.fileUrl, fileName: data.mine.fileName, fileSize: data.mine.fileSize, linkUrl: data.mine.linkUrl } : {});
  const handInReady = kind === 'TEXT' ? answer.trim().length >= 20 : kind === 'FILE' ? !!handIn.fileUrl : /^https?:\/\/\S+\.\S+/i.test(handIn.linkUrl?.trim() ?? '');
  const changed = text !== null || receipt !== null || picked !== null;
  const returned = data?.mine?.status === 'RETURNED' || data?.mine?.status === 'REOPENED';
  const reopened = data?.mine?.status === 'REOPENED';
  // Open (or still open for them: an extension), not graded, and hand-ins left (or reopened).
  const due = data ? (data.myDue ?? data.dueDate) : null;
  const openForMe = !!data && (data.status === 'OPEN' || (!!data.extended && !!due && new Date(due) > new Date()));
  const noGroup = !!data?.groupMode && !data.group;
  const canSubmit = !!data && openForMe && !noGroup && (data.canHandIn ?? !returned);
  const left = data?.attemptsAllowed != null ? Math.max(0, data.attemptsAllowed - (data.mine?.attempts ?? 0)) : null;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const policy = data?.aiPolicy && isAiPolicy(data.aiPolicy) ? data.aiPolicy : 'FREE';
  const choice = receipt ?? startChoice(policy);
  const choiceOk = policy !== 'NONE' || choice.attach || choice.declaredNone;

  const submit = async () => {
    setSending(true);
    try {
      const r = await authedJson<{ late: boolean; latePenalty?: number }>(`/api/assignments/${id}/submission`, { method: 'PUT', body: JSON.stringify({ text: answer, aiReceipt: choice, ...handIn }) });
      toast.success(r.late ? `Handed in after the due date${r.latePenalty ? `: ${r.latePenalty}% comes off the grade` : ''}.` : 'Handed in. You can change it until it’s graded.');
      setText(null);
      setReceipt(null);
      setPicked(null);
      void saveDraft(draftKey, '').catch(() => {});
      mutate();
    } catch (err) {
      if (!isOfflineError(err)) { toast.error((err as Error).message); return; }
      // No connection: hand it in from this device's outbox when it's back.
      await enqueue({ id: newClientId(), kind: 'assignment', method: 'PUT', url: `/api/assignments/${encodeURIComponent(id)}/submission`, ref: id, label: `Assignment: ${data?.title ?? 'answer'}`, body: { text: answer, aiReceipt: choice, ...handIn, offlineAt: new Date().toISOString() } }).catch(() => null);
      void saveDraft(draftKey, '').catch(() => {});
      toast.success('You’re offline: it’s saved on this device and handed in when you’re back online.');
    } finally {
      setSending(false);
    }
  };

  if (error) return <><Topbar title="Assignment" /><p className="p-8 text-sm text-rose-500">{(error as Error).message}</p></>;

  return (
    <>
      <Topbar title={data?.title ?? 'Assignment'} sharedId={data ? `assignment:${id}` : undefined} subtitle={data ? `${data.course.code} · ${data.course.name}` : undefined} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-5 stagger">
          <Link href="/student/assignments" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4" /> All assignments</Link>
          {isLoading || !data ? (
            <div className="h-64 rounded-2xl skeleton" />
          ) : (
            <>
              <section className={`panel p-5 space-y-4`}>
                {due && <p className="text-sm text-zinc-600 dark:text-zinc-400">Due {new Date(due).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{data.extended ? ' (your own date)' : ''}{data.status === 'CLOSED' && !openForMe ? ' · closed' : ''}</p>}
                {rulesSentence(data).length > 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">{rulesSentence(data).join(' ')}{left !== null && data.mine && !returned ? ` ${left} left.` : ''}</p>}
                {data.groupMode && (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.group
                    ? <>Group work: <span className="font-semibold">{data.group.name}</span> ({data.group.members.map((m) => m.name).join(', ')}). One of you hands in for everyone{data.groupMode === 'SHARED' ? ', and you all get the same grade' : ''}.</>
                    : 'Group work: you’re not in a group yet. Your teacher will put you in one.'}</p>
                )}
                {policy !== 'FREE' && <AiPolicyNote policy={policy} />}
                <Translatable kind="assignment" id={data.id} text={data.instructions} levels className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">How it’s graded ({data.maxScore} points)</h3>
                  <ul className="space-y-1.5">
                    {data.rubric.map((r) => {
                      const got = data.mine?.criteriaScores?.find((c) => c.id === r.id);
                      return (
                        <li key={r.id} className="text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="text-zinc-800 dark:text-zinc-200">{r.criterion}{r.description && <span className="text-zinc-500"> · {r.description}</span>}</span>
                            <span className="font-semibold text-zinc-900 dark:text-white shrink-0">{got ? `${got.score}/` : ''}{r.points}</span>
                          </div>
                          {got?.comment && <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">{got.comment}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>

              {returned && data.mine && (
                <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-2" aria-label="Your grade">
                  <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="w-5 h-5" /> Graded: {data.mine.score}/{data.maxScore}</p>
                  {data.mine.lateDays ? <p className="text-sm text-zinc-700 dark:text-zinc-300">{data.mine.lateWaived || !data.mine.latePenalty ? `Handed in ${data.mine.lateDays} day${data.mine.lateDays === 1 ? '' : 's'} late${data.mine.latePenalty ? ': your teacher waived the penalty.' : '.'}` : `${data.mine.rawScore ?? ''}/${data.maxScore} less ${data.mine.latePenalty}% for handing it in ${data.mine.lateDays} day${data.mine.lateDays === 1 ? '' : 's'} late.`}</p> : null}
                  {reopened && <p className="text-sm font-medium text-sky-800 dark:text-sky-200">Your teacher has let you hand in again. This grade stays until they grade the new version.</p>}
                  {data.mine.feedback && <Translatable kind="feedback" id={data.mine.id} text={data.mine.feedback} levels className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap" />}
                  {data.mine.feedbackMediaUrl && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{data.mine.feedbackMediaKind === 'VIDEO' ? 'Video' : 'Voice'} feedback from your teacher</p>
                      {data.mine.feedbackMediaKind === 'VIDEO'
                        ? <video src={data.mine.feedbackMediaUrl} controls preload="metadata" playsInline className="w-full max-h-72 rounded-xl bg-black" />
                        : <audio src={data.mine.feedbackMediaUrl} controls preload="metadata" className="w-full" />}
                      {data.mine.feedbackTranscript && <details className="text-xs text-zinc-600 dark:text-zinc-400"><summary className="cursor-pointer font-semibold">Read the transcript</summary><p className="mt-1 whitespace-pre-wrap">{data.mine.feedbackTranscript}</p></details>}
                    </div>
                  )}
                </section>
              )}

              <section className={`panel p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  {kind === 'TEXT' ? <label htmlFor="answer" className="font-semibold text-zinc-900 dark:text-white">Your answer</label> : <h3 className="font-semibold text-zinc-900 dark:text-white">What you hand in</h3>}
                  {data.mine && !returned && <span className="text-xs text-indigo-600 dark:text-indigo-300">Handed in {new Date(data.mine.submittedAt).toLocaleString()}{data.mine.lateDays ? ` · ${data.mine.lateDays} day${data.mine.lateDays === 1 ? '' : 's'} late` : ''}</span>}
                </div>
                {canSubmit ? (
                  <>
                    {kind !== 'TEXT' && <HandInFields kind={kind} value={handIn} onChange={setPicked} disabled={sending} />}
                    {kind !== 'TEXT' && <label htmlFor="answer" className="block text-sm font-semibold text-zinc-900 dark:text-white">A note for your teacher (optional)</label>}
                    <textarea
                      id="answer"
                      rows={kind === 'TEXT' ? 14 : 3}
                      maxLength={MAX}
                      value={answer}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={kind === 'TEXT' ? 'Write your answer here…' : 'Anything your teacher should know about it'}
                      className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                    <AiReceiptChoice assignmentId={data.id} policy={policy} value={choice} onChange={setReceipt} />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-zinc-500">{words} words · {answer.length.toLocaleString()}/{MAX.toLocaleString()} characters</span>
                      <button type="button" className="btn-primary" onClick={submit} disabled={sending || !handInReady || (!changed && !!data.mine) || !choiceOk} aria-busy={sending || undefined}>
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {data.mine ? 'Hand in new version' : 'Hand in'}
                      </button>
                    </div>
                  </>
                ) : data.mine ? (
                  <>
                    <HandedInView h={data.mine} />
                    {data.mine.text && <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">{data.mine.text}</p>}
                    {!returned && data.canHandIn === false && <p className="text-xs text-zinc-600 dark:text-zinc-400">You’ve handed it in as many times as allowed. Ask your teacher if you need to change it.</p>}
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">{noGroup ? 'You can hand in once you’re in a group.' : 'This assignment is closed. Ask your teacher if you still need to hand it in.'}</p>
                )}
              </section>
              {data.mine && (data.mine.aiReceipt || policy !== 'FREE') && (
                <details className="panel px-5 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">The AI receipt you handed in</summary>
                  <div className="mt-2"><AiReceiptView receipt={data.mine.aiReceipt ?? null} policy={policy} who="You" /></div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function StudentAssignmentPageRoute() {
  const p = usePathParams('/student/assignments/[id]');
  return p ? <StudentAssignmentPage key={p.id} id={p.id} /> : <AddressLoading portal />;
}
