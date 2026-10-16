'use client';

import { CheckCircle2, Plus, X } from 'lucide-react';
import { QUESTION_TYPES, TYPE_LABELS, metaOf, typeOf, type QuestionInput, type QuestionType, type StoredQuestion } from '@/lib/question-types';
import { cn } from '@/lib/utils';

// Writing a quiz question of any type (Stage 5 · B4.1): the quiz editor and the question bank. The
// server checks it with cleanQuestionInput (src/lib/question-types.ts).

export interface QDraft {
  type: QuestionType; question: string;
  options: string[]; correct: number; picks: boolean[]; partial: boolean; tf: 'True' | 'False';
  accepted: string; pairs: { left: string; right: string }[]; extra: string; items: string[];
  value: string; tolerance: string; unit: string;
}

export const emptyDraft = (type: QuestionType = 'CHOICE'): QDraft => ({
  type, question: '', options: ['', '', '', ''], correct: 0, picks: [false, false, false, false], partial: false, tf: 'True',
  accepted: '', pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }], extra: '', items: ['', '', '', ''],
  value: '', tolerance: '', unit: '',
});

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** The draft as the questions API takes it. */
export function toBody(d: QDraft): QuestionInput {
  const base = { type: d.type, question: d.question };
  switch (d.type) {
    case 'CHOICE': return { ...base, options: d.options.map((o) => o.trim()).filter(Boolean), correctAnswer: d.options[d.correct]?.trim() ?? '' };
    case 'TRUE_FALSE': return { ...base, correctAnswer: d.tf };
    case 'MULTI': {
      const kept = d.options.map((o, i) => ({ o: o.trim(), on: d.picks[i] })).filter((x) => x.o);
      return { ...base, options: kept.map((x) => x.o), correct: kept.filter((x) => x.on).map((x) => x.o), partial: d.partial };
    }
    case 'SHORT': return { ...base, accepted: lines(d.accepted) };
    case 'BLANKS': return base;
    case 'MATCH': return { ...base, pairs: d.pairs.filter((p) => p.left.trim() && p.right.trim()), extra: lines(d.extra) };
    case 'ORDER': return { ...base, items: d.items.map((x) => x.trim()).filter(Boolean) };
    case 'NUMBER': return { ...base, value: d.value, tolerance: d.tolerance, unit: d.unit };
  }
}

/** Whether there's enough to try saving it. */
export const draftReady = (d: QDraft) => d.question.trim().length > 0;

const input = 'input';
const small = 'text-[11px] text-zinc-600 dark:text-zinc-400';

export function QuestionEditor({ draft, onChange, idPrefix }: { draft: QDraft; onChange: (d: QDraft) => void; idPrefix: string }) {
  const set = (p: Partial<QDraft>) => onChange({ ...draft, ...p });
  const listEditor = (key: 'options' | 'items', label: (i: number) => string, max: number, mark?: (i: number) => React.ReactNode) => (
    <div className="space-y-2">
      {draft[key].map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          {mark?.(i)}
          <input className={input} aria-label={label(i)} placeholder={label(i)} value={o} maxLength={300} onChange={(e) => set({ [key]: draft[key].map((x, j) => (j === i ? e.target.value : x)) } as Partial<QDraft>)} />
          {draft[key].length > 2 && <button type="button" onClick={() => set({ [key]: draft[key].filter((_, j) => j !== i), ...(key === 'options' ? { picks: draft.picks.filter((_, j) => j !== i), correct: draft.correct === i ? 0 : draft.correct > i ? draft.correct - 1 : draft.correct } : {}) } as Partial<QDraft>)} aria-label={`Remove ${label(i).toLowerCase()}`} className="btn-ghost btn-icon"><X className="w-4 h-4" /></button>}
        </div>
      ))}
      {draft[key].length < max && <button type="button" onClick={() => set({ [key]: [...draft[key], ''], ...(key === 'options' ? { picks: [...draft.picks, false] } : {}) } as Partial<QDraft>)} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add {key === 'options' ? 'an option' : 'an item'}</button>}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Question type
        <select value={draft.type} onChange={(e) => set({ type: e.target.value as QuestionType })} className={cn(input, 'mt-1')}>
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">{draft.type === 'TRUE_FALSE' ? 'Statement' : 'Question'}
        <textarea className={cn(input, 'mt-1 min-h-[70px] font-normal')} value={draft.question} maxLength={1000} onChange={(e) => set({ question: e.target.value })}
          placeholder={draft.type === 'BLANKS' ? 'Water boils at [[100]] °C at [[sea level|sea-level]].' : draft.type === 'TRUE_FALSE' ? 'The sun is a star.' : 'Write a question…'} />
      </label>
      {draft.type === 'BLANKS' && <p className={small}>Put each blank’s answer in double brackets: [[Paris]]. Several accepted answers: [[colour|color]]. Students see a gap for each.</p>}

      {draft.type === 'CHOICE' && <>
        {listEditor('options', (i) => `Option ${i + 1}`, 6, (i) => <input type="radio" name={`${idPrefix}-correct`} checked={draft.correct === i} onChange={() => set({ correct: i })} aria-label={`Option ${i + 1} is correct`} className="accent-indigo-600 w-5 h-5 shrink-0" />)}
        <p className={small}>Select the circle next to the correct answer.</p>
      </>}

      {draft.type === 'TRUE_FALSE' && (
        <div role="radiogroup" aria-label="The statement is" className="flex gap-4 text-sm text-zinc-800 dark:text-zinc-200">
          {(['True', 'False'] as const).map((v) => <label key={v} className="inline-flex items-center gap-2"><input type="radio" name={`${idPrefix}-tf`} checked={draft.tf === v} onChange={() => set({ tf: v })} className="accent-indigo-600 w-5 h-5" /> {v}</label>)}
        </div>
      )}

      {draft.type === 'MULTI' && <>
        {listEditor('options', (i) => `Option ${i + 1}`, 8, (i) => <input type="checkbox" checked={!!draft.picks[i]} onChange={(e) => set({ picks: draft.options.map((_, j) => (j === i ? e.target.checked : !!draft.picks[j])) })} aria-label={`Option ${i + 1} is right`} className="accent-indigo-600 w-5 h-5 shrink-0" />)}
        <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={draft.partial} onChange={(e) => set({ partial: e.target.checked })} className="accent-indigo-600 w-4 h-4" /> Part marks: points for each right option, less each wrong one</label>
        <p className={small}>Tick every right option. Without part marks, it’s right only with exactly those.</p>
      </>}

      {draft.type === 'SHORT' && <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Accepted answers, one per line
        <textarea className={cn(input, 'mt-1 font-normal')} rows={3} value={draft.accepted} maxLength={2000} onChange={(e) => set({ accepted: e.target.value })} placeholder={'Paris\nparis, France'} />
        <span className={cn(small, 'font-normal block mt-1')}>Capitals, accents, spaces and a full stop at the end don’t matter.</span>
      </label>}

      {draft.type === 'MATCH' && <>
        <div className="space-y-2">
          {draft.pairs.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <input className={input} aria-label={`Prompt ${i + 1}`} placeholder={`Prompt ${i + 1}`} value={p.left} maxLength={300} onChange={(e) => set({ pairs: draft.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} />
              <input className={input} aria-label={`Its match ${i + 1}`} placeholder="Its match" value={p.right} maxLength={300} onChange={(e) => set({ pairs: draft.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} />
              {draft.pairs.length > 2 ? <button type="button" onClick={() => set({ pairs: draft.pairs.filter((_, j) => j !== i) })} aria-label={`Remove pair ${i + 1}`} className="btn-ghost btn-icon"><X className="w-4 h-4" /></button> : <span className="w-10" />}
            </div>
          ))}
          {draft.pairs.length < 8 && <button type="button" onClick={() => set({ pairs: [...draft.pairs, { left: '', right: '' }] })} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a pair</button>}
        </div>
        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Extra wrong matches (optional), one per line
          <textarea className={cn(input, 'mt-1 font-normal')} rows={2} value={draft.extra} maxLength={1200} onChange={(e) => set({ extra: e.target.value })} />
        </label>
      </>}

      {draft.type === 'ORDER' && <>
        {listEditor('items', (i) => `Item ${i + 1}`, 8)}
        <p className={small}>Write them in the right order; each student sees them mixed up.</p>
      </>}

      {draft.type === 'NUMBER' && (
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Answer<input className={cn(input, 'mt-1')} inputMode="decimal" value={draft.value} maxLength={40} onChange={(e) => set({ value: e.target.value })} placeholder="9.81" /></label>
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Give or take<input className={cn(input, 'mt-1')} inputMode="decimal" value={draft.tolerance} maxLength={40} onChange={(e) => set({ tolerance: e.target.value })} placeholder="0.1" /></label>
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Unit<input className={cn(input, 'mt-1')} value={draft.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} placeholder="m/s²" /></label>
        </div>
      )}
    </div>
  );
}

/** A saved question's answer for the teacher: the options with the right ones marked, or the answer in words. */
export function QuestionKey({ q }: { q: StoredQuestion & { options: string[] } }) {
  const type = typeOf(q);
  if (type === 'CHOICE' || type === 'TRUE_FALSE' || type === 'MULTI') {
    const right = type === 'MULTI' ? metaOf(q).correct ?? [] : [q.correctAnswer];
    return (
      <ul className="mt-2 grid sm:grid-cols-2 gap-1.5">
        {q.options.map((o) => (
          <li key={o} className={cn('text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5', right.includes(o) ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold' : 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400')}>
            {right.includes(o) && <CheckCircle2 className="w-3.5 h-3.5" />} {o}
          </li>
        ))}
      </ul>
    );
  }
  return <p className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><span className="font-semibold">Answer: </span>{q.correctAnswer}</p>;
}
