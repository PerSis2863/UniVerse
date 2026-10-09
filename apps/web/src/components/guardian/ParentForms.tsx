'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { CheckCircle2, ChevronRight, Clock, FileSignature, Loader2, Paperclip, PenLine, RotateCcw, XCircle } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// Consent forms in the parent app (Stage 5 · B16.4; src/server/consent-forms.ts): forms from the
// school or a teacher, each answered for every child it's for, with a typed-name signature, the
// "I sign electronically" box and, if the parent likes, a drawn signature.

interface Answer { answer: 'YES' | 'NO'; note: string | null; signedName: string; signedAt: string; mine: boolean; by: string }
interface Form {
  id: string; title: string; body: string; attachmentUrl: string | null; attachmentName: string | null; dueAt: string | null; allowDecline: boolean;
  closed: boolean; createdAt: string; from: string; children: { studentId: string; firstName: string; response: Answer | null }[];
}
export interface ParentFormsData { waiting: number; forms: Form[] }

export const FORMS_KEY = '/api/parent/forms';
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const isWaiting = (f: Form) => !f.closed && f.children.some((c) => !c.response);

export function ParentForms({ formId, onForm }: { formId: string | null; onForm: (id: string | null) => void }) {
  const { data, error, isLoading, mutate } = useSWR<ParentFormsData>(FORMS_KEY, authedJson);
  const open = data?.forms.find((f) => f.id === formId) ?? null;

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <div className="p-6"><ContentSkeleton variant="list" /></div>;
  if (!data) return null;
  const toSign = data.forms.filter(isWaiting);
  const rest = data.forms.filter((f) => !isWaiting(f));
  return (
    <>
      {data.forms.length === 0 ? (
        <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-6 text-center`}>
          <FileSignature className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
          <p className="font-semibold text-zinc-900 dark:text-white">No forms to sign</p>
          <p className="text-sm text-zinc-500 mt-1">Permission slips and consent forms from the school show up here. We’ll let you know when one arrives.</p>
        </motion.section>
      ) : (
        <div className="space-y-4">
          {toSign.length > 0 && <FormList title="To sign" forms={toSign} onOpen={onForm} />}
          {rest.length > 0 && <FormList title={toSign.length ? 'Answered and closed' : 'Your forms'} forms={rest} onOpen={onForm} />}
        </div>
      )}
      {open && <FormSheet key={open.id} form={open} onClose={() => onForm(null)} onSigned={() => void mutate()} />}
    </>
  );
}

function FormList({ title, forms, onOpen }: { title: string; forms: Form[]; onOpen: (id: string) => void }) {
  const now = useNow();
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-label={title}>
      <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
        {forms.map((f) => {
          const waiting = isWaiting(f);
          const late = waiting && !!f.dueAt && now > 0 && new Date(f.dueAt).getTime() < now;
          return (
            <motion.li key={f.id} variants={fadeUp}>
              <button type="button" onClick={() => { haptic('tap'); onOpen(f.id); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
                <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', waiting ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'bg-zinc-500/10 text-zinc-500')}>
                  <FileSignature className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-zinc-900 dark:text-white truncate">{f.title}</span>
                  <span className="block text-xs text-zinc-500 truncate">{f.from}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {f.children.map((c) => <ChildChip key={c.studentId} name={c.firstName} answer={c.response?.answer ?? null} closed={f.closed} />)}
                    {f.dueAt && waiting && (
                      <span className={cn('inline-flex items-center gap-1 text-[11px]', late ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-zinc-500')}>
                        <Clock className="w-3 h-3" />{late ? 'Past the answer-by date' : `Answer by ${format(new Date(f.dueAt), 'd MMM')}`}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              </button>
            </motion.li>
          );
        })}
      </motion.ul>
    </motion.section>
  );
}

function ChildChip({ name, answer, closed }: { name: string; answer: 'YES' | 'NO' | null; closed: boolean }) {
  const [label, tone, Icon] = answer === 'YES' ? ['Agreed', 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10', CheckCircle2]
    : answer === 'NO' ? ['Declined', 'text-rose-700 dark:text-rose-300 bg-rose-500/10', XCircle]
    : closed ? ['Not answered', 'text-zinc-600 dark:text-zinc-300 bg-zinc-500/10', Clock]
    : ['To sign', 'text-amber-800 dark:text-amber-300 bg-amber-500/10', PenLine];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}><Icon className="w-3 h-3" />{name}: {label}</span>;
}

function FormSheet({ form, onClose, onSigned }: { form: Form; onClose: () => void; onSigned: () => void }) {
  const me = useAuthStore((s) => s.user);
  // Children still to answer for are ticked; answered ones can be changed while the form is open.
  const [editing, setEditing] = useState(() => form.children.every((c) => c.response) ? [] : form.children.filter((c) => !c.response).map((c) => c.studentId));
  const [answer, setAnswer] = useState<'YES' | 'NO'>('YES');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const href = safeHref(form.attachmentUrl);
  const signing = !form.closed && editing.length > 0;

  const toggle = (id: string) => setEditing((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      for (const studentId of editing) {
        await authedJson(`${FORMS_KEY}/${form.id}`, { method: 'POST', body: JSON.stringify({ studentId, answer, note, signedName: name, signature: signature || undefined, agree }) });
      }
      haptic('success');
      toast.success(answer === 'YES' ? 'Signed and sent' : 'Your answer was sent');
      setEditing([]);
      onSigned();
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t send your answer.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={form.title} onClose={onClose}>
      <p className="text-xs text-zinc-500">From {form.from} · {format(new Date(form.createdAt), 'd MMM yyyy')}{form.dueAt ? ` · answer by ${format(new Date(form.dueAt), 'd MMM')}` : ''}</p>
      <p className="mt-3 text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">{form.body}</p>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
          <Paperclip className="w-4 h-4" />{form.attachmentName || 'Attachment'}
        </a>
      )}

      <ul className="mt-5 space-y-2">
        {form.children.map((c) => (
          <li key={c.studentId} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3">
            <div className="flex items-center gap-3">
              {/* Which children this answer is for: a tick each when there's a choice to make. */}
              {!form.closed && (!c.response || editing.includes(c.studentId)) && (form.children.length > 1 || !!c.response) ? (
                <input type="checkbox" aria-label={`Answer for ${c.firstName}`} checked={editing.includes(c.studentId)} onChange={() => toggle(c.studentId)} className="w-5 h-5 accent-indigo-600 shrink-0" />
              ) : null}
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-zinc-900 dark:text-white">{c.firstName}</span>
                {c.response ? (
                  <span className="block text-xs text-zinc-500">
                    {c.response.answer === 'YES' ? 'Agreed' : 'Declined'} · signed “{c.response.signedName}”{c.response.mine ? '' : ` (${c.response.by})`} · {formatDistanceToNowStrict(new Date(c.response.signedAt), { addSuffix: true })}
                  </span>
                ) : <span className="block text-xs text-zinc-500">{form.closed ? 'Not answered before the form closed' : 'Waiting for your answer'}</span>}
              </span>
              <ChildChip name={c.firstName} answer={c.response?.answer ?? null} closed={form.closed} />
            </div>
            {c.response?.note && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Note: {c.response.note}</p>}
            {c.response && !form.closed && !editing.includes(c.studentId) && (
              <button type="button" onClick={() => { setEditing((cur) => [...cur, c.studentId]); setAnswer(c.response!.answer); }} className="mt-2 btn-ghost btn-sm"><RotateCcw className="w-3.5 h-3.5" /> Change answer</button>
            )}
          </li>
        ))}
      </ul>

      {signing && (
        <motion.form variants={fadeUp} initial="hidden" animate="show" onSubmit={submit} className="mt-5 space-y-4">
          {form.allowDecline ? (
            <Segmented<'YES' | 'NO'> label="Your answer" value={answer} onChange={setAnswer} large className="w-full" segments={[{ value: 'YES', label: 'Yes, I agree' }, { value: 'NO', label: 'No, I don’t' }]} />
          ) : <p className="text-sm font-semibold text-zinc-900 dark:text-white">This form can only be agreed to. Contact the school if you have a question.</p>}
          <Field label="Note for the school (optional)" count={note.length} max={500}>
            {(p) => <textarea {...p} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Allergies, pick-up details, anything they should know" />}
          </Field>
          <Field label="Type your full name to sign" error={problem}>
            {(p) => <input {...p} required autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setProblem(null); }} className="input" placeholder={me?.name ?? 'Your full name'} maxLength={100} />}
          </Field>
          <SignaturePad value={signature} onChange={setSignature} />
          <label className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-5 h-5 accent-indigo-600 shrink-0" />
            <span>I’m {editing.length > 1 ? 'their' : `${form.children.find((c) => c.studentId === editing[0])?.firstName ?? 'their'}’s`} parent or guardian, and I agree to sign this form electronically.</span>
          </label>
          <button type="submit" disabled={busy || !agree || name.trim().length < 2} className="btn-primary w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
            {answer === 'YES' ? 'Sign and send' : 'Send my answer'}{editing.length > 1 ? ` for ${editing.length} children` : ''}
          </button>
        </motion.form>
      )}
      {form.closed && <p className="mt-4 text-xs text-zinc-500">This form is closed. Contact the school if something has changed.</p>}
    </Sheet>
  );
}

/** A box to draw a signature with a finger, pen or mouse; the value is SVG path data in a 300×100 box. */
function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const box = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  // The path so far: pointer moves can come faster than renders, so each adds to this, not to `value`.
  const path = useRef(value);
  const set = (next: string) => { path.current = next; onChange(next); };
  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return `${Math.round(((e.clientX - r.left) / r.width) * 300)} ${Math.round(((e.clientY - r.top) / r.height) * 100)}`;
  };
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">Draw your signature (optional)</span>
        {value && <button type="button" onClick={() => set('')} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 min-h-8 px-2">Clear</button>}
      </div>
      <svg
        ref={box} viewBox="0 0 300 100" role="img" aria-label={value ? 'Your drawn signature' : 'Signature box: draw here'}
        className="w-full h-28 rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900/60 touch-none cursor-crosshair text-zinc-900 dark:text-white"
        onPointerDown={(e) => { if (path.current.length > 19_000) return; drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); set(`${path.current} M${point(e)}`.trim()); }}
        onPointerMove={(e) => { if (drawing.current && path.current.length < 19_900) set(`${path.current} L${point(e)}`); }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      >
        <line x1="16" x2="284" y1="80" y2="80" className="stroke-zinc-200 dark:stroke-white/10" strokeWidth="1" />
        {value && <path d={value} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </div>
  );
}
