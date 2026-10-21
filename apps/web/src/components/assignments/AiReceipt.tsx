'use client';

import useSWR from 'swr';
import { Bot, ReceiptText, ShieldCheck } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { AI_POLICIES, isAiPolicy, aiUseLabel, receiptSummary, usesSummary, type AiPolicy, type AiReceipt, type AiUseItem } from '@/lib/ai-receipt';
import { cn } from '@/lib/utils';

// Honest AI receipts (Stage 5 · D12). The assignment's AI rule; when handing in, the student attaches
// the AI help they used in UniVerse since it was set (made on the server from their own record) or
// says they didn't use AI; the teacher sees the receipt with the answer. Quizzes and oral checks
// (Q22) have the same rules; their receipt covers the attempt itself (`during`).

/** What the receipt is for, in the wording. */
export type ReceiptWhat = 'assignment' | 'quiz' | 'oral check';
const span = (what: ReceiptWhat, during?: boolean) => (during ? `while you did this ${what}` : `since this ${what} was set`);

export interface ReceiptChoice { attach: boolean; declaredNone: boolean; note: string }
export const startChoice = (policy: AiPolicy): ReceiptChoice => ({ attach: policy === 'RECEIPT', declaredNone: false, note: '' });

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The rule, for students and teachers: "AI allowed with a receipt" and what it means. */
export function AiPolicyNote({ policy, className }: { policy: string; className?: string }) {
  const p = isAiPolicy(policy) ? policy : 'FREE';
  return (
    <p className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', p === 'NONE' ? 'bg-amber-500/10 text-amber-900 dark:text-amber-100' : 'bg-indigo-500/[0.07] text-indigo-950 dark:text-indigo-100', className)}>
      <Bot className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <span><span className="font-semibold">{AI_POLICIES[p].short}.</span> {AI_POLICIES[p].hint}</span>
    </p>
  );
}

/** The list of AI help on a receipt. */
export function ReceiptUses({ uses, empty = 'No AI help used in UniVerse since this assignment was set.' }: { uses: AiUseItem[]; empty?: string }) {
  if (!uses.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400">{empty}</p>;
  return (
    <ol className="space-y-1.5 text-sm">
      {uses.map((u, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0 w-28">{when(u.at)}</span>
          <span className="min-w-0"><span className="font-medium text-zinc-900 dark:text-white">{aiUseLabel(u.kind)}</span>{u.detail && <span className="text-zinc-600 dark:text-zinc-400">: {u.detail}</span>}</span>
        </li>
      ))}
    </ol>
  );
}

/** What the student attaches when handing in. `previewUrl`: their record that would go on it. */
export function AiReceiptChoice({ previewUrl, policy: raw, value, onChange, what = 'assignment' }: { previewUrl: string; policy: string; value: ReceiptChoice; onChange: (v: ReceiptChoice) => void; what?: ReceiptWhat }) {
  const policy: AiPolicy = isAiPolicy(raw) ? raw : 'FREE';
  const { data } = useSWR<{ uses: AiUseItem[]; since: string; during?: boolean }>(previewUrl, authedJson);
  const uses = data?.uses ?? [];
  const range = span(what, data?.during);
  const n = uses.length;
  const count = data ? `${n} use${n === 1 ? '' : 's'} of AI help` : 'your AI help';
  return (
    <fieldset className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-4 space-y-3">
      <legend className="px-1 text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><ReceiptText className="w-4 h-4 text-indigo-500" aria-hidden /> AI receipt</legend>
      <AiPolicyNote policy={policy} />
      {policy === 'NONE' ? (
        <div role="radiogroup" aria-label="Did you use AI?" className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <input type="radio" name="ai-none" checked={value.declaredNone} onChange={() => onChange({ ...value, declaredNone: true, attach: false })} className="mt-1" />
            I didn’t use AI for this {what}.
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <input type="radio" name="ai-none" checked={value.attach} onChange={() => onChange({ ...value, attach: true, declaredNone: false })} className="mt-1" />
            I used AI: attach my receipt ({count}) and explain below.
          </label>
          {n > 0 && <p className="text-xs text-zinc-600 dark:text-zinc-400">Your record shows {count} {range} (only you can see it). If any of it was for this {what}, attach it and explain: being honest counts.</p>}
        </div>
      ) : policy === 'RECEIPT' ? (
        <p className="text-sm text-zinc-800 dark:text-zinc-200">Your receipt is attached: {count} {range}.</p>
      ) : (
        <label className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input type="checkbox" checked={value.attach} onChange={(e) => onChange({ ...value, attach: e.target.checked })} className="mt-1" />
          Attach my AI receipt ({count}) anyway.
        </label>
      )}
      {(value.attach || policy === 'RECEIPT') && data && (
        <details className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-zinc-900 dark:text-white">What your teacher will see{n ? ` (${usesSummary(uses)})` : ''}</summary>
          <div className="mt-2"><ReceiptUses uses={uses} empty={`No AI help used in UniVerse ${range}.`} /></div>
        </details>
      )}
      <Field label="Anything to add? (optional)" hint="For example AI you used outside UniVerse, and what for." count={value.note.length} max={1000}>
        {(p) => <textarea {...p} className="input min-h-[3.5rem] text-sm" maxLength={1000} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />}
      </Field>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden /> UniVerse keeps a private record of the AI help you use (not reading help like translation). Your teacher sees it only on what you attach.</p>
    </fieldset>
  );
}

/** A receipt as the teacher (or the student, afterwards) sees it. */
export function AiReceiptView({ receipt, policy, who = 'The student', what = 'assignment' }: { receipt: AiReceipt | null; policy?: string; who?: string; what?: ReceiptWhat }) {
  if (!receipt) {
    return isAiPolicy(policy) && policy !== 'FREE'
      ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{what === 'oral check' ? 'No AI receipt yet.' : `No AI receipt (handed in before the ${what} asked for one).`}</p>
      : <p className="text-sm text-zinc-600 dark:text-zinc-400">No AI receipt attached (AI is free to use here).</p>;
  }
  return (
    <div className="space-y-2">
      <AiPolicyNote policy={receipt.policy} />
      {receipt.offline ? <p className="text-sm text-zinc-700 dark:text-zinc-300">Handed in from a device that was offline, so no receipt was made.</p>
        : receipt.auto ? <p className="text-sm text-zinc-700 dark:text-zinc-300">Handed in by itself when the time ran out, before {who === 'You' ? 'you' : 'they'} said whether AI was used.</p>
        : receipt.declaredNone ? <p className="text-sm font-medium text-zinc-900 dark:text-white">{who} said they didn’t use AI for this.</p>
        : receipt.attached ? (
          <>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">{receipt.uses.length ? `${who} attached ${receipt.uses.length} use${receipt.uses.length === 1 ? '' : 's'} of AI help: ${usesSummary(receipt.uses)}` : `${who} attached a receipt: no AI help used in UniVerse.`}</p>
            {receipt.uses.length > 0 && <ReceiptUses uses={receipt.uses} />}
          </>
        ) : null}
      {receipt.note && <p className="text-sm rounded-xl border border-zinc-200 dark:border-white/[0.08] px-3 py-2 text-zinc-800 dark:text-zinc-200"><span className="font-semibold">In their words: </span>{receipt.note}</p>}
      {receipt.since && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {receipt.during ? `From UniVerse’s record of AI help during the ${what} (${when(receipt.since)} to ${time(receipt.at)}).` : `From UniVerse’s record of AI help since the ${what} was set (${new Date(receipt.since).toLocaleDateString()}).`} Help outside UniVerse isn’t recorded.
        </p>
      )}
    </div>
  );
}

/** The whole class's receipts at a glance (Stage 5 · Q22), above the answers. Nothing for a class with none. */
export function ReceiptSummary({ receipts, policy, className }: { receipts: (AiReceipt | null)[]; policy: string; className?: string }) {
  const s = receiptSummary(receipts);
  if (!s.total || (!isAiPolicy(policy) || policy === 'FREE') && !s.attached && !s.declaredNone && !s.notes) return null;
  const parts = [
    `${s.attached} of ${s.total} attached a receipt${s.attached ? ` (${s.withUses} with AI help)` : ''}`,
    ...(s.declaredNone ? [`${s.declaredNone} said they didn’t use AI`] : []),
    ...(policy !== 'FREE' && s.nothing ? [`${s.nothing} gave neither`] : []),
    ...(s.notes ? [`${s.notes} added a note`] : []),
  ];
  return (
    <div className={cn('rounded-xl border border-zinc-200 dark:border-white/[0.08] px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200', className)} role="note" aria-label="AI receipts in this class">
      <p className="flex items-start gap-2"><ReceiptText className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" aria-hidden /><span><span className="font-semibold">AI receipts: </span>{parts.join(' · ')}.</span></p>
      {s.uses > 0 && <p className="mt-1 ps-6 text-xs text-zinc-600 dark:text-zinc-400">{s.uses} use{s.uses === 1 ? '' : 's'} of AI help in all: {s.byKind}</p>}
    </div>
  );
}
