'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Send, Users } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { peerAverage } from '@/lib/peer-review';
import { HandedInView, type HandedIn } from './HandIn';

// Anonymous peer review (Stage 5 · B3.2, src/server/peer-review.ts): the teacher's settings and
// "Hand out reviews", the reviews beside the teacher's grading, and the student's reviews to do and
// the reviews of their own work. Reviewers and authors never see each other's names.

interface Rubric { id: string; criterion: string; description?: string | null; points: number }
interface Score { id: string; score: number; comment: string }
export interface TeacherReview { submissionId: string; status: string; criteria: Score[] | null; comment: string | null; submittedAt: string | null; reviewer: { id: string; name: string } }

const localInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const total = (c: Score[] | null) => (c ?? []).reduce((t, x) => t + x.score, 0);

/** The teacher's settings: how many reviews each, by when, and handing them out. */
export function PeerSettings({ assignmentId, peerReviews, peerDueDate, canManage, groupWork, reviews, onChanged }: {
  assignmentId: string; peerReviews: number; peerDueDate: string | null; canManage: boolean; groupWork: boolean; reviews: TeacherReview[]; onChanged: () => void;
}) {
  const [n, setN] = useState(String(peerReviews));
  const [due, setDue] = useState(localInput(peerDueDate));
  const [busy, setBusy] = useState<'save' | 'hand' | null>(null);
  const done = reviews.filter((r) => r.status === 'DONE').length;
  const save = async () => {
    setBusy('save');
    try {
      await authedJson(`/api/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify({ peerReviews: Number(n) || 0, peerDueDate: due ? new Date(due).toISOString() : null }) });
      toast.success(Number(n) ? 'Peer review saved' : 'Peer review is off');
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'That didn’t save.')); }
    finally { setBusy(null); }
  };
  const handOut = async () => {
    setBusy('hand');
    try {
      const out = await authedJson<{ handedOut: number; done: number }>(`/api/assignments/${assignmentId}/peer/assign`, { method: 'POST' });
      toast.success(`${out.handedOut} review${out.handedOut === 1 ? '' : 's'} handed out${out.done ? ` (${out.done} already done kept)` : ''}. Students are told in the app.`);
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Reviews couldn’t be handed out.')); }
    finally { setBusy(null); }
  };
  if (groupWork) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Peer review is for work students hand in on their own.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-800 dark:text-zinc-200"><span className="block font-medium">Answers each student reviews</span>
          <input type="number" min={0} max={5} value={n} disabled={!canManage} onChange={(e) => setN(e.target.value)} className="input mt-1 w-24 py-1.5" />
        </label>
        <label className="text-sm text-zinc-800 dark:text-zinc-200"><span className="block font-medium">Reviews due (optional)</span>
          <input type="datetime-local" value={due} disabled={!canManage} onChange={(e) => setDue(e.target.value)} className="input mt-1 py-1.5" />
        </label>
        {canManage && <button type="button" onClick={() => void save()} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">0: no peer review. Each student who handed in reviews that many classmates’ answers against the rubric, without names either way. They see the reviews of their work after the date (without one, once you return their grade). Not marked.</p>
      {peerReviews > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {canManage && <button type="button" onClick={() => void handOut()} disabled={!!busy} className="btn-primary btn-sm">{busy === 'hand' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />} {reviews.length ? 'Hand out again (for late answers)' : 'Hand out reviews'}</button>}
          {reviews.length > 0 && <span className="text-sm text-zinc-700 dark:text-zinc-300"><span className="font-semibold tabular-nums">{done}</span> of {reviews.length} reviews done</span>}
        </div>
      )}
    </div>
  );
}

/** Beside the teacher's grade: the classmates' reviews of this answer, with names. */
export function PeerReviewsOf({ reviews, rubric, maxScore }: { reviews: TeacherReview[]; rubric: Rubric[]; maxScore: number }) {
  if (!reviews.length) return null;
  const done = reviews.filter((r) => r.status === 'DONE');
  const avg = peerAverage(done.map((r) => total(r.criteria)));
  return (
    <details className="panel px-5 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Peer reviews <span className="font-normal text-zinc-600 dark:text-zinc-400">· {done.length} of {reviews.length} done{avg !== null ? ` · average ${avg}/${maxScore}` : ''}</span></summary>
      <ul className="mt-3 space-y-3">
        {reviews.map((r, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium text-zinc-900 dark:text-white">{r.reviewer.name} {r.status === 'DONE' ? <span className="font-normal text-zinc-600 dark:text-zinc-400">· {total(r.criteria)}/{maxScore}</span> : <span className="font-normal text-amber-700 dark:text-amber-300">· not done yet</span>}</p>
            {r.status === 'DONE' && <>
              <ul className="text-xs text-zinc-700 dark:text-zinc-300">{(r.criteria ?? []).map((c) => <li key={c.id}>{rubric.find((x) => x.id === c.id)?.criterion ?? 'Criterion'}: {c.score}{c.comment ? ` · ${c.comment}` : ''}</li>)}</ul>
              {r.comment && <p className="mt-1 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{r.comment}</p>}
            </>}
          </li>
        ))}
      </ul>
    </details>
  );
}

interface PeerData {
  rubric: Rubric[]; maxScore: number; peerDueDate: string | null; open: boolean; receivedLater: boolean;
  toDo: { id: string; status: string; criteria: Score[] | null; comment: string | null; answer: HandedIn & { text: string } }[];
  received: { criteria: Score[]; comment: string | null; submittedAt: string | null }[];
}

/** The student's side: answers to review (no names), and the reviews of their own work. */
export function StudentPeerReview({ assignmentId }: { assignmentId: string }) {
  const key = `/api/assignments/${assignmentId}/peer`;
  const { data, mutate } = useSWR<PeerData>(key, authedJson);
  if (!data || (!data.toDo.length && !data.received.length && !data.receivedLater)) return null;
  const left = data.toDo.filter((r) => r.status !== 'DONE').length;
  return (
    <section className="panel p-5 space-y-4" aria-labelledby="peer-h">
      <div>
        <h2 id="peer-h" className="font-semibold text-zinc-900 dark:text-white">Peer review</h2>
        {data.toDo.length > 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">{left ? `${left} classmate${left === 1 ? '’s answer' : 's’ answers'} to review` : 'All your reviews are done, thank you'}{data.peerDueDate ? ` · by ${new Date(data.peerDueDate).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}. You won’t see whose they are, and they won’t see who you are.</p>}
      </div>
      {data.toDo.map((r, i) => <ReviewForm key={r.id} n={i + 1} review={r} rubric={data.rubric} open={data.open} url={key} onDone={() => void mutate()} />)}
      {data.received.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">What classmates said about your work</h3>
          <ul className="space-y-3">
            {data.received.map((r, i) => (
              <li key={i} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3 text-sm">
                <p className="font-medium text-zinc-900 dark:text-white">Review {i + 1} · {total(r.criteria)}/{data.maxScore}</p>
                <ul className="text-xs text-zinc-700 dark:text-zinc-300 mt-1">{r.criteria.map((c) => <li key={c.id}>{data.rubric.find((x) => x.id === c.id)?.criterion ?? 'Criterion'}: {c.score}{c.comment ? ` · ${c.comment}` : ''}</li>)}</ul>
                {r.comment && <p className="mt-1 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : data.receivedLater ? <p className="text-sm text-zinc-600 dark:text-zinc-400">You’ll see what classmates said about your work {data.peerDueDate ? 'after the review date' : 'when your grade is back'}.</p> : null}
    </section>
  );
}

function ReviewForm({ n, review, rubric, open, url, onDone }: { n: number; review: PeerData['toDo'][number]; rubric: Rubric[]; open: boolean; url: string; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, { score: string; comment: string }>>(() => Object.fromEntries(rubric.map((r) => {
    const c = review.criteria?.find((x) => x.id === r.id);
    return [r.id, { score: c ? String(c.score) : '', comment: c?.comment ?? '' }];
  })));
  const [comment, setComment] = useState(review.comment ?? '');
  const [busy, setBusy] = useState(false);
  const done = review.status === 'DONE';
  const ready = rubric.every((r) => scores[r.id]?.score !== '') && comment.trim().length >= 10;
  const send = async () => {
    setBusy(true);
    try {
      await authedJson(url, { method: 'POST', body: JSON.stringify({ reviewId: review.id, comment, criteria: rubric.map((r) => ({ id: r.id, score: Number(scores[r.id].score), comment: scores[r.id].comment })) }) });
      toast.success(done ? 'Review updated' : 'Review sent. Thank you!');
      onDone();
    } catch (e) { toast.error(errorMessage(e, 'The review couldn’t be sent.')); }
    finally { setBusy(false); }
  };
  return (
    <details className="rounded-2xl border border-zinc-200 dark:border-white/10 p-4" open={!done && n === 1}>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">Answer {n} {done && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium"><CheckCircle2 className="w-4 h-4" /> reviewed</span>}</summary>
      <div className="mt-3 space-y-4">
        <HandedInView h={review.answer} />
        {review.answer.text && <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">{review.answer.text}</p>}
        <fieldset className="space-y-3" disabled={!open || busy}>
          <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Your review</legend>
          {rubric.map((r) => (
            <div key={r.id} className="grid sm:grid-cols-[1fr_6rem] gap-2">
              <label htmlFor={`peer-${review.id}-${r.id}`} className="text-sm text-zinc-800 dark:text-zinc-200">{r.criterion} <span className="text-zinc-600 dark:text-zinc-400">(out of {r.points})</span>
                <input aria-label={`Comment on ${r.criterion}`} value={scores[r.id]?.comment ?? ''} maxLength={600} onChange={(e) => setScores((s) => ({ ...s, [r.id]: { ...s[r.id], comment: e.target.value } }))} placeholder="A comment (optional)" className="input mt-1 py-1.5 text-sm" />
              </label>
              <input id={`peer-${review.id}-${r.id}`} type="number" min={0} max={r.points} step={0.5} value={scores[r.id]?.score ?? ''} onChange={(e) => setScores((s) => ({ ...s, [r.id]: { ...s[r.id], score: e.target.value } }))} className="input py-1.5 sm:mt-5" />
            </div>
          ))}
          <label className="block text-sm text-zinc-800 dark:text-zinc-200">What works, and one thing to improve
            <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} className="input mt-1" />
          </label>
        </fieldset>
        {open && <button type="button" onClick={() => void send()} disabled={busy || !ready} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {done ? 'Update review' : 'Send review'}</button>}
      </div>
    </details>
  );
}
