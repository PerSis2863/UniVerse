'use client';

import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { TabPill } from '@/components/ui/Glide';
import { cn } from '@/lib/utils';
import type { Ask, Given, QuestionType } from '@/lib/question-types';

// Answering a quiz question of any type (Stage 5 · B4.1, src/lib/question-types.ts): the same box
// online, in an offline pack and from classroom codes. It never sees the answer key.

export interface AskedQuestion { id: string; question: string; options: string[]; type?: QuestionType; ask?: Ask }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Whether anything was given (for "n answered"). */
export const hasAnswer = (v: Given | undefined) => (Array.isArray(v) ? v.some((x) => x.trim() !== '') : !!v?.trim());

/** The answers to send: an order question left as shown counts as that order. */
export const withShownOrder = (questions: AskedQuestion[], answers: Record<string, Given>) => {
  const out = { ...answers };
  for (const q of questions) if (q.type === 'ORDER' && !out[q.id]) out[q.id] = q.options;
  return out;
};

/** What the type asks for, said once above the answer. */
export function answerHint(q: AskedQuestion): string | null {
  switch (q.type) {
    case 'MULTI': return 'Choose all that apply.';
    case 'BLANKS': return 'Fill in each blank (shown as _____).';
    case 'MATCH': return 'Match each one with its answer.';
    case 'ORDER': return 'Put these in the right order.';
    case 'NUMBER': return 'Type a number.';
    default: return null;
  }
}

const field = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';

export function AnswerInput({ q, value, onChange, label, compact = false }: { q: AskedQuestion; value: Given | undefined; onChange: (v: Given) => void; label: string; compact?: boolean }) {
  const type = q.type ?? 'CHOICE';
  const list = Array.isArray(value) ? value : [];
  const text = typeof value === 'string' ? value : '';
  const hint = answerHint(q);
  const box = cn('relative isolate w-full text-left rounded-xl border transition-colors text-sm font-medium', compact ? 'px-3 py-2' : 'p-4');
  const on = 'border-indigo-500 text-indigo-700 dark:text-indigo-300';
  const off = 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-indigo-500/40 hover:bg-zinc-50 dark:hover:bg-zinc-800';

  const body = (() => {
    switch (type) {
      case 'MULTI':
        return (
          <div role="group" aria-label={label} className={compact ? 'grid gap-1.5' : 'space-y-3'}>
            {q.options.map((o, i) => {
              const picked = list.includes(o);
              return (
                <button key={o} type="button" role="checkbox" aria-checked={picked} onClick={() => onChange(picked ? list.filter((x) => x !== o) : [...list, o])} className={cn(box, 'flex items-center gap-2', picked ? `${on} bg-indigo-500/[0.06]` : off)}>
                  <span className={cn('w-5 h-5 shrink-0 rounded-md border flex items-center justify-center', picked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-400 dark:border-zinc-500')}>{picked && <Check className="w-3.5 h-3.5" />}</span>
                  {!compact && <span className="font-bold">{LETTERS[i] ?? '*'}.</span>} {o}
                </button>
              );
            })}
          </div>
        );
      case 'SHORT':
        return <input type="text" value={text} maxLength={200} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="Your answer" className={field} />;
      case 'NUMBER':
        return (
          <div className="flex items-center gap-2">
            <input type="text" inputMode="decimal" value={text} maxLength={40} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder="A number" className={cn(field, 'max-w-[12rem]')} />
            {q.ask?.unit && <span className="text-sm text-zinc-700 dark:text-zinc-300">{q.ask.unit}</span>}
          </div>
        );
      case 'BLANKS':
        return (
          <div role="group" aria-label={label} className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: q.ask?.blanks ?? 0 }, (_, k) => (
              <label key={k} className="text-sm text-zinc-800 dark:text-zinc-200">Blank {k + 1}
                <input type="text" value={list[k] ?? ''} maxLength={200} onChange={(e) => { const next = [...list]; while (next.length <= k) next.push(''); next[k] = e.target.value; onChange(next); }} className={cn(field, 'mt-1')} />
              </label>
            ))}
          </div>
        );
      case 'MATCH':
        return (
          <div role="group" aria-label={label} className="space-y-2">
            {(q.ask?.lefts ?? []).map((left, k) => (
              <label key={left} className="grid gap-1 sm:grid-cols-[1fr_1fr] sm:items-center text-sm text-zinc-800 dark:text-zinc-200">
                <span className="font-medium">{left}</span>
                <select value={list[k] ?? ''} onChange={(e) => { const next = [...list]; while (next.length <= k) next.push(''); next[k] = e.target.value; onChange(next); }} className={field}>
                  <option value="">Choose…</option>
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
          </div>
        );
      case 'ORDER': {
        const items = list.length ? list : q.options;
        const move = (k: number, by: number) => { const next = [...items]; [next[k], next[k + by]] = [next[k + by], next[k]]; onChange(next); };
        return (
          <ol aria-label={label} className="space-y-2">
            {items.map((o, k) => (
              <li key={o} className={cn(box, 'flex items-center gap-2 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200')}>
                <span className="font-bold tabular-nums w-5 shrink-0">{k + 1}.</span>
                <span className="flex-1 min-w-0 break-words">{o}</span>
                <button type="button" onClick={() => move(k, -1)} disabled={k === 0} aria-label={`Move “${o}” up`} className="btn-ghost btn-icon"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(k, 1)} disabled={k === items.length - 1} aria-label={`Move “${o}” down`} className="btn-ghost btn-icon"><ArrowDown className="w-4 h-4" /></button>
              </li>
            ))}
          </ol>
        );
      }
      default:
        return (
          <div role="radiogroup" aria-label={label} className={compact ? 'grid gap-1.5' : 'space-y-3'}>
            {q.options.map((o, i) => (
              <button key={o} type="button" role="radio" aria-checked={text === o} onClick={() => onChange(o)} className={cn(box, text === o ? on : off)}>
                {text === o && <TabPill id={`quiz-answer-${q.id}`} variant="soft" />}
                {!compact && <span className="font-bold mr-2">{type === 'TRUE_FALSE' ? '' : `${LETTERS[i] ?? '*'}.`}</span>}{o}
              </button>
            ))}
          </div>
        );
    }
  })();
  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</p>}
      {body}
    </div>
  );
}
