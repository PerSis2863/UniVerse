'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FileText, GraduationCap, Loader2, Mail, MessageSquareText, Paperclip, Phone, Send, Star, StickyNote } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { fadeUp } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useCan } from '@/lib/use-can';
import { MOVABLE, STAGE_LABEL, fillLetter, type Answers, type FormField, type Stage } from '@/lib/admission-form';
import { StageChip } from './StageChip';

// One application for admins (Stage 5 · B15.1): the family's answers and documents, everyone's
// scores, the history; move it along, write to the family, make an offer, record their answer,
// enrol the student.

interface Detail {
  id: string; ref: string; studentName: string; studentDob: string | null; studentEmail: string | null; contactName: string; contactEmail: string; contactPhone: string | null; relation: string | null;
  answers: Answers; files: { fieldId: string; url: string; name: string }[]; stage: Stage; message: string | null; offerLetter: string | null; offerSentAt: string | null; offerExpiresAt: string | null;
  createdAt: string; history: { at: string; byName?: string; type: string; note?: string }[];
  round: { title: string; fields: FormField[]; courses: { code: string; name: string }[]; offerTemplate: string | null };
  reviews: { score: number; comment: string | null; updatedAt: string; reviewer: { id: string; name: string } }[];
  myReview: { score: number; comment: string | null } | null;
}

const EVENT: Record<string, string> = { submitted: 'Sent the application', message: 'Wrote to the family', note: 'Note', offer: 'Made an offer', enrolled: 'Enrolled', withdrawn: 'Withdrew the application' };
const eventText = (t: string) => EVENT[t] ?? (t.startsWith('stage:') ? `Moved to ${STAGE_LABEL[t.slice(6) as Stage] ?? t.slice(6)}` : t.startsWith('answered:') ? (t.endsWith('ACCEPTED') ? 'Accepted the offer' : 'Declined the offer') : t);

export function ApplicationSheet({ id, school, onClose, onChanged }: { id: string; school: string; onClose: () => void; onChanged: () => void }) {
  const key = `/api/admissions/applications/${id}`;
  const { data, error, mutate } = useSWR<Detail>(key, authedJson);
  const [panel, setPanel] = useState<'offer' | 'message' | 'note' | 'enrol' | null>(null);
  const [busy, setBusy] = useState(false);
  // Reviewers (B15.6) read and score; moving, offering and enrolling need the manage permission.
  const manage = useCan('admissions.manage');

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await authedJson(key, { method: 'POST', body: JSON.stringify(body) });
      haptic('success');
      toast.success(done);
      setPanel(null);
      await mutate();
      onChanged();
      return true;
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); return false; }
    finally { setBusy(false); }
  };

  if (error && !data) return <Sheet title="Application" onClose={onClose}><LoadError onRetry={() => mutate()} /></Sheet>;
  if (!data) return <Sheet title="Application" onClose={onClose}><ContentSkeleton variant="list" /></Sheet>;
  const a = data;
  const avg = a.reviews.length ? (a.reviews.reduce((s, r) => s + r.score, 0) / a.reviews.length).toFixed(1) : null;
  const canOffer = !['ACCEPTED', 'ENROLLED', 'DECLINED', 'REJECTED', 'WITHDRAWN'].includes(a.stage);

  return (
    <Sheet title={a.studentName} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-zinc-500">{a.round.title} · <span className="font-mono">{a.ref}</span> · sent {format(new Date(a.createdAt), 'd MMM yyyy')}</p>
          <StageChip stage={a.stage} />
        </div>

        <section className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 text-sm space-y-1">
          <p className="text-zinc-900 dark:text-white font-semibold">{a.studentName}{a.studentDob ? <span className="font-normal text-zinc-500"> · born {format(new Date(`${a.studentDob}T12:00:00Z`), 'd MMM yyyy')}</span> : null}</p>
          {a.studentEmail && <p className="text-zinc-600 dark:text-zinc-300">Student email: {a.studentEmail}</p>}
          <p className="text-zinc-700 dark:text-zinc-200 pt-1">{a.contactName}{a.relation ? ` (${a.relation.toLowerCase()})` : ''}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-600 dark:text-zinc-300">
            <a href={`mailto:${a.contactEmail}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="w-3.5 h-3.5" aria-hidden />{a.contactEmail}</a>
            {a.contactPhone && <a href={`tel:${a.contactPhone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="w-3.5 h-3.5" aria-hidden />{a.contactPhone}</a>}
          </p>
        </section>

        {a.round.fields.length > 0 && (
          <section aria-label="Answers" className="space-y-2">
            {a.round.fields.map((f) => {
              const v = a.answers[f.id];
              const file = a.files.find((x) => x.fieldId === f.id);
              const href = safeHref(file?.url);
              return (
                <div key={f.id}>
                  <p className="text-xs font-semibold text-zinc-500">{f.label}</p>
                  {f.type === 'file'
                    ? (href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300"><Paperclip className="w-4 h-4" aria-hidden />{file!.name}</a> : <p className="text-sm text-zinc-400">No document</p>)
                    : <p className="text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">{Array.isArray(v) ? v.join(', ') || '—' : v === 'yes' && f.type === 'yesno' ? 'Yes' : v === 'no' && f.type === 'yesno' ? 'No' : v || '—'}</p>}
                </div>
              );
            })}
          </section>
        )}

        <Score key={a.myReview?.score ?? 0} mine={a.myReview} busy={busy} onSave={(score, comment) => act({ action: 'score', score, comment }, 'Score saved')} />
        {a.reviews.length > 0 && (
          <section aria-label="Scores" className="text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Scores · average {avg}</p>
            <ul className="space-y-1">
              {a.reviews.map((r) => <li key={r.reviewer.id} className="text-zinc-700 dark:text-zinc-200"><span className="font-semibold tabular-nums">{r.score}/5</span> {r.reviewer.name}{r.comment ? <span className="text-zinc-500">: {r.comment}</span> : null}</li>)}
            </ul>
          </section>
        )}

        {manage && <section aria-label="Move along" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stage</p>
          {a.stage !== 'ENROLLED' && (
            <div className="flex flex-wrap gap-1.5">
              {MOVABLE.map((s) => (
                <button key={s} type="button" disabled={busy || s === a.stage} onClick={() => void act({ action: 'stage', stage: s }, `Moved to ${STAGE_LABEL[s]}`)}
                  className={cn('min-h-9 px-3 rounded-full border text-xs font-semibold transition-colors', s === a.stage ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]')}>
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canOffer && <button type="button" onClick={() => setPanel(panel === 'offer' ? null : 'offer')} className="btn-primary btn-sm"><FileText className="w-4 h-4" /> {a.stage === 'OFFERED' ? 'Change the offer' : 'Make an offer'}</button>}
            {a.stage === 'OFFERED' && <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Record that they accepted?', message: 'Use this when the family told you directly.', confirmLabel: 'They accepted' })) void act({ action: 'respond', answer: 'accept' }, 'Recorded: offer accepted'); }} className="btn-secondary btn-sm">They accepted</button>}
            {a.stage === 'OFFERED' && <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Record that they declined?', confirmLabel: 'They declined', destructive: true })) void act({ action: 'respond', answer: 'decline' }, 'Recorded: offer declined'); }} className="btn-ghost btn-sm">They declined</button>}
            {a.stage === 'ACCEPTED' && <button type="button" onClick={() => setPanel(panel === 'enrol' ? null : 'enrol')} className="btn-primary btn-sm"><GraduationCap className="w-4 h-4" /> Enrol</button>}
            <button type="button" onClick={() => setPanel(panel === 'message' ? null : 'message')} className="btn-secondary btn-sm"><MessageSquareText className="w-4 h-4" /> Message the family</button>
            <button type="button" onClick={() => setPanel(panel === 'note' ? null : 'note')} className="btn-ghost btn-sm"><StickyNote className="w-4 h-4" /> Note</button>
          </div>
        </section>}

        {panel === 'offer' && <OfferForm a={a} school={school} busy={busy} onSend={(letter, expiresAt) => act({ action: 'offer', letter, expiresAt }, 'Offer made: the family sees it on their page')} />}
        {panel === 'message' && <TextForm label="Message for the family" hint="Shown on their application page (replaces the last message)." initial={a.message ?? ''} max={2000} submit="Save message" busy={busy} onSubmit={(message) => act({ action: 'message', message }, 'Message saved')} />}
        {panel === 'note' && <TextForm label="Note for admins" hint="Only admins see notes." initial="" max={1000} submit="Add note" busy={busy} onSubmit={(note) => act({ action: 'note', note }, 'Note added')} />}
        {panel === 'enrol' && <EnrolForm a={a} busy={busy} onEnrol={(studentEmail) => act({ action: 'enrol', studentEmail }, 'Enrolled')} />}

        <section aria-label="History">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">History</p>
          <ol className="space-y-1.5 text-xs">
            {[...a.history].reverse().map((h, i) => (
              <li key={i} className="text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-500 tabular-nums">{format(new Date(h.at), 'd MMM, HH:mm')}</span> · {h.byName ? `${h.byName}: ` : ''}{eventText(h.type)}{h.note ? <span className="block text-zinc-500 whitespace-pre-wrap pl-2 border-l-2 border-zinc-200 dark:border-white/10 mt-0.5">{h.note}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Sheet>
  );
}

function Score({ mine, busy, onSave }: { mine: { score: number; comment: string | null } | null; busy: boolean; onSave: (score: number, comment: string) => void }) {
  const [score, setScore] = useState(mine?.score ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  return (
    <section aria-label="Your score" className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Your score</p>
        <div role="group" aria-label="Score from 1 to 5" className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} out of 5`} aria-pressed={score === n} onClick={() => setScore(n)} className="w-9 h-9 flex items-center justify-center">
              <Star className={cn('w-5 h-5', n <= score ? 'fill-amber-400 text-amber-500' : 'text-zinc-300 dark:text-zinc-600')} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input aria-label="Comment on your score" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} className="input flex-1 min-w-0 text-sm" placeholder="Why (optional)" />
        <button type="button" disabled={busy || !score} onClick={() => onSave(score, comment)} className="btn-secondary btn-sm shrink-0">Save</button>
      </div>
    </section>
  );
}

function OfferForm({ a, school, busy, onSend }: { a: Detail; school: string; busy: boolean; onSend: (letter: string, expiresAt: string) => void }) {
  const [letter, setLetter] = useState(() => a.offerLetter ?? fillLetter(a.round.offerTemplate ?? '', { student: a.studentName, contact: a.contactName, round: a.round.title, school, date: format(new Date(), 'd MMMM yyyy') }));
  const [expiresAt, setExpiresAt] = useState(a.offerExpiresAt?.slice(0, 10) ?? '');
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-3">
      <Field label="Offer letter" count={letter.length} max={8000}>{(p) => <textarea {...p} rows={10} maxLength={8000} value={letter} onChange={(e) => setLetter(e.target.value)} className="input text-sm" />}</Field>
      <Field label="Answer by (optional)">{(p) => <input {...p} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />}</Field>
      <button type="button" disabled={busy || !letter.trim()} onClick={() => onSend(letter, expiresAt)} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Make the offer</button>
      <p className="text-[11px] text-zinc-500">The family sees it on their application page with Accept and Decline. No email is sent: you may want to call them.</p>
    </motion.div>
  );
}

function TextForm({ label, hint, initial, max, submit, busy, onSubmit }: { label: string; hint: string; initial: string; max: number; submit: string; busy: boolean; onSubmit: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2">
      <Field label={label} hint={hint} count={v.length} max={max}>{(p) => <textarea {...p} rows={3} maxLength={max} value={v} onChange={(e) => setV(e.target.value)} className="input text-sm" />}</Field>
      <button type="button" disabled={busy} onClick={() => onSubmit(v)} className="btn-primary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {submit}</button>
    </motion.div>
  );
}

function EnrolForm({ a, busy, onEnrol }: { a: Detail; busy: boolean; onEnrol: (email: string) => void }) {
  const [email, setEmail] = useState(a.studentEmail ?? '');
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2">
      <Field label="The student’s own email" hint="They sign up with it and are approved as a student straight away.">{(p) => <input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />}</Field>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">{a.round.courses.length ? `They’ll be put in ${a.round.courses.map((c) => c.code).join(', ')}.` : 'This round has no classes set: put them in classes later.'}</p>
      <button type="button" disabled={busy || !email.trim()} onClick={() => onEnrol(email)} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />} Enrol {a.studentName.split(' ')[0]}</button>
    </motion.div>
  );
}
