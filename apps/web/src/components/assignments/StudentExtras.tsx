'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, Copy, HelpCircle, Loader2, MessageSquareWarning, Send } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

// The student side of assignments (Stage 5 · B3.5, src/server/student-assignment.ts): the rubric in
// plain words, a signed hand-in receipt, regrade requests; and for the teaching team, answering them
// and checking a receipt.

export interface RubricHelpItem { id: string; plain: string; great: string; weak: string }
export interface Regrade { id: string; reason: string; status: 'OPEN' | 'ANSWERED' | string; outcome: string | null; reply: string | null; repliedByName: string | null; createdAt: string; repliedAt: string | null; submissionId?: string; student?: { id: string; name: string } }

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "What does this rubric mean?": one AI request for the whole class, kept until the rubric changes. */
export function RubricHelpButton({ assignmentId, onHelp }: { assignmentId: string; onHelp: (h: RubricHelpItem[]) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try { onHelp((await authedJson<{ criteria: RubricHelpItem[] }>(`/api/assignments/${assignmentId}/rubric-help`, { method: 'POST' })).criteria); }
      catch (e) { toast.error(errorMessage(e, 'The rubric couldn’t be explained right now.')); }
      finally { setBusy(false); }
    }} className="btn-ghost btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HelpCircle className="w-4 h-4" />} What does this rubric mean?</button>
  );
}

export function RubricHelpText({ help }: { help: RubricHelpItem | undefined }) {
  if (!help) return null;
  return (
    <div className="mt-1 rounded-lg bg-sky-500/[0.06] border border-sky-500/20 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 space-y-0.5">
      <p>{help.plain}</p>
      {help.great && <p><span className="font-semibold text-emerald-800 dark:text-emerald-300">A top answer: </span>{help.great}</p>}
      {help.weak && <p><span className="font-semibold text-amber-800 dark:text-amber-300">Where marks are often lost: </span>{help.weak}</p>}
    </div>
  );
}

/** The signed receipt of a hand-in: proof of what was handed in, and when. */
export function HandInReceipt({ code, submittedAt }: { code: string | null; submittedAt: string }) {
  if (!code) return null;
  return (
    <details className="panel px-5 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Hand-in receipt</summary>
      <div className="mt-2 space-y-2 text-sm">
        <p className="text-zinc-700 dark:text-zinc-300">Received {when(submittedAt)}. This code proves what you handed in and when; your teacher can check it.</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-100 dark:bg-white/[0.06] px-2 py-1.5 text-xs">{code}</code>
          <button type="button" aria-label="Copy the receipt code" onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success('Receipt copied'), () => toast.error('Couldn’t copy it.'))} className="btn-secondary btn-icon"><Copy className="w-4 h-4" /></button>
        </div>
      </div>
    </details>
  );
}

/** The student's regrade requests on a graded hand-in, and asking for one. */
export function RegradeBox({ submissionId, regrades, onChanged }: { submissionId: string; regrades: Regrade[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const waiting = regrades.some((r) => r.status === 'OPEN');
  const send = async () => {
    setBusy(true);
    try {
      await authedJson(`/api/assignments/submissions/${submissionId}/regrade`, { method: 'POST', body: JSON.stringify({ reason }) });
      toast.success('Sent to your teacher');
      setOpen(false); setReason('');
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'That couldn’t be sent.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {regrades.map((r) => (
        <div key={r.id} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3 text-sm space-y-1">
          <p className="text-zinc-800 dark:text-zinc-200"><span className="font-semibold">You asked</span> ({when(r.createdAt)}): {r.reason}</p>
          {r.status === 'OPEN' ? <p className="text-amber-800 dark:text-amber-200">Waiting for your teacher’s answer.</p>
            : <p className="text-zinc-800 dark:text-zinc-200"><span className={cn('font-semibold', r.outcome === 'CHANGED' ? 'text-emerald-800 dark:text-emerald-300' : '')}>{r.outcome === 'CHANGED' ? 'Grade changed' : 'Grade stays'}</span>{r.repliedByName ? ` · ${r.repliedByName}` : ''}: {r.reply}</p>}
        </div>
      ))}
      {!waiting && (open ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-900 dark:text-white">Which part should be looked at again, and why?
            <textarea rows={3} maxLength={1500} value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1" placeholder="e.g. I think my second paragraph answers the “evidence” criterion: I quote two sources." />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => void send()} disabled={busy || reason.trim().length < 20} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      ) : <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm"><MessageSquareWarning className="w-4 h-4" /> Ask for a regrade</button>)}
    </div>
  );
}

/** For the teaching team: a hand-in's regrade requests, and answering the open one. */
export function RegradeAnswers({ regrades, onChanged }: { regrades: Regrade[]; onChanged: () => void }) {
  const [reply, setReply] = useState('');
  const [outcome, setOutcome] = useState<'SAME' | 'CHANGED'>('SAME');
  const [busy, setBusy] = useState(false);
  if (!regrades.length) return null;
  const answer = async (id: string) => {
    setBusy(true);
    try { await authedJson(`/api/assignments/regrades/${id}`, { method: 'POST', body: JSON.stringify({ outcome, reply }) }); toast.success('Answer sent'); setReply(''); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'That couldn’t be sent.')); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-3" aria-label="Regrade requests">
      <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><MessageSquareWarning className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Regrade requests</h3>
      {regrades.map((r) => (
        <div key={r.id} className="text-sm space-y-2">
          <p className="text-zinc-800 dark:text-zinc-200"><span className="font-semibold">{r.student?.name ?? 'The student'}</span> ({when(r.createdAt)}): {r.reason}</p>
          {r.status === 'OPEN' ? (
            <div className="space-y-2">
              <div role="radiogroup" aria-label="The grade" className="flex flex-wrap gap-3 text-sm text-zinc-800 dark:text-zinc-200">
                <label className="inline-flex items-center gap-1.5"><input type="radio" name={`out-${r.id}`} checked={outcome === 'SAME'} onChange={() => setOutcome('SAME')} /> The grade stays</label>
                <label className="inline-flex items-center gap-1.5"><input type="radio" name={`out-${r.id}`} checked={outcome === 'CHANGED'} onChange={() => setOutcome('CHANGED')} /> I changed the grade</label>
              </div>
              <label className="block text-sm text-zinc-800 dark:text-zinc-200">Your answer
                <textarea rows={2} maxLength={1500} value={reply} onChange={(e) => setReply(e.target.value)} className="input mt-1" />
              </label>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">To change it, update the grade below first; it’s kept in the grade history.</p>
              <button type="button" onClick={() => void answer(r.id)} disabled={busy || reply.trim().length < 5} className="btn-primary btn-sm">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Send the answer</button>
            </div>
          ) : <p className="text-xs text-zinc-700 dark:text-zinc-300">Answered{r.repliedByName ? ` by ${r.repliedByName}` : ''}: {r.outcome === 'CHANGED' ? 'grade changed' : 'grade stays'}. “{r.reply}”</p>}
        </div>
      ))}
    </section>
  );
}

/** For the teaching team: checks a receipt a student shows. */
export function ReceiptCheck() {
  const [code, setCode] = useState('');
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const r = await authedJson<{ valid: boolean; gone?: boolean; submittedAt?: string; assignment?: string; student?: string; current?: boolean }>(`/api/assignments/receipts?code=${encodeURIComponent(code.trim())}`);
      setOut(!r.valid ? 'Not a valid receipt: it wasn’t made here, or it was changed.'
        : r.gone ? `A valid receipt from ${when(r.submittedAt!)}; that hand-in has since been deleted.`
        : `Valid: ${r.student} handed in “${r.assignment}” on ${when(r.submittedAt!)}. ${r.current ? 'It matches what’s handed in now.' : 'A later version has replaced it since.'}`);
    } catch (e) { setOut(errorMessage(e, 'It couldn’t be checked.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void check(); }}>
        <label htmlFor="receipt-code" className="sr-only">Receipt code</label>
        <input id="receipt-code" value={code} onChange={(e) => { setCode(e.target.value); setOut(null); }} placeholder="r1.…" className="input py-1.5 font-mono text-xs flex-1 min-w-0" />
        <button type="submit" disabled={busy || code.trim().length < 20} className="btn-secondary btn-sm">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Check</button>
      </form>
      {out && <p className="text-sm text-zinc-800 dark:text-zinc-200" aria-live="polite">{out}</p>}
    </div>
  );
}
