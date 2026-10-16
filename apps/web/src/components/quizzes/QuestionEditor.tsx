'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ImageUp, Loader2, Plus, X } from 'lucide-react';
import { QUESTION_TYPES, TYPE_LABELS, fillText, metaOf, readNumber, typeOf, valuesFor, variantAnswer, type Area, type Meta, type QuestionInput, type QuestionType, type StoredQuestion } from '@/lib/question-types';
import { cn } from '@/lib/utils';
import { uploadChatFile } from '@/components/chat/chat-client';
import { MathPreview, PictureTap } from './AnswerInput';

// Writing a quiz question of any type (Stage 5 · B4.1): the quiz editor and the question bank. The
// server checks it with cleanQuestionInput (src/lib/question-types.ts).

export interface QDraft {
  type: QuestionType; question: string;
  options: string[]; correct: number; picks: boolean[]; partial: boolean; tf: 'True' | 'False';
  accepted: string; pairs: { left: string; right: string }[]; extra: string; items: string[];
  value: string; tolerance: string; unit: string;
  image: string; areas: Area[];
  /** NUMBER: numbers that change for each student (B4.2). */
  varying: boolean; vars: { name: string; min: string; max: string; step: string }[]; formula: string;
}

export const emptyDraft = (type: QuestionType = 'CHOICE'): QDraft => ({
  type, question: '', options: ['', '', '', ''], correct: 0, picks: [false, false, false, false], partial: false, tf: 'True',
  accepted: '', pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }], extra: '', items: ['', '', '', ''],
  value: '', tolerance: '', unit: '', image: '', areas: [],
  varying: false, vars: [{ name: 'a', min: '1', max: '10', step: '1' }], formula: '',
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
    case 'NUMBER': return d.varying
      ? { ...base, formula: d.formula, vars: d.vars.map((v) => ({ name: v.name.trim(), min: v.min, max: v.max, step: v.step })), tolerance: d.tolerance, unit: d.unit }
      : { ...base, value: d.value, tolerance: d.tolerance, unit: d.unit };
    case 'MATH': return { ...base, accepted: lines(d.accepted) };
    case 'HOTSPOT': return { ...base, image: d.image, areas: d.areas };
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

      {draft.type === 'MATH' && <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">The answer, one way of writing it per line
        <textarea className={cn(input, 'mt-1 font-mono font-normal')} rows={2} value={draft.accepted} maxLength={1200} spellCheck={false} onChange={(e) => set({ accepted: e.target.value })} placeholder="x^2 + 2x + 1" />
        <span className="block mt-1 font-normal"><MathPreview text={draft.accepted.split('\n')[0] ?? ''} /></span>
        <span className={cn(small, 'font-normal block mt-1')}>Any answer equal to it is right: (x+1)^2 and x^2+2x+1 both count. ^ powers, / fractions, sqrt( ) roots; LaTeX works too.</span>
      </label>}

      {draft.type === 'HOTSPOT' && <PictureAreas draft={draft} set={set} />}

      {draft.type === 'NUMBER' && <>
        <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={draft.varying} onChange={(e) => set({ varying: e.target.checked })} className="accent-indigo-600 w-4 h-4" /> Numbers that change for each student</label>
        {draft.varying && <Varying draft={draft} set={set} />}
        <div className={cn('grid gap-2', draft.varying ? 'grid-cols-2' : 'grid-cols-3')}>
          {!draft.varying && <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Answer<input className={cn(input, 'mt-1')} inputMode="decimal" value={draft.value} maxLength={40} onChange={(e) => set({ value: e.target.value })} placeholder="9.81" /></label>}
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Give or take<input className={cn(input, 'mt-1')} inputMode="decimal" value={draft.tolerance} maxLength={40} onChange={(e) => set({ tolerance: e.target.value })} placeholder="0.1" /></label>
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Unit<input className={cn(input, 'mt-1')} value={draft.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} placeholder="m/s²" /></label>
        </div>
      </>}
    </div>
  );
}

/** The changing numbers of a number question: each letter's range, the answer's formula, an example. */
function Varying({ draft, set }: { draft: QDraft; set: (p: Partial<QDraft>) => void }) {
  const row = (i: number, k: 'name' | 'min' | 'max' | 'step', label: string) => (
    <label className="text-[11px] text-zinc-700 dark:text-zinc-300">{label}
      <input value={draft.vars[i][k]} maxLength={k === 'name' ? 1 : 20} inputMode={k === 'name' ? 'text' : 'decimal'} onChange={(e) => set({ vars: draft.vars.map((v, j) => (j === i ? { ...v, [k]: e.target.value } : v)) })} className="input py-1 mt-0.5" />
    </label>
  );
  // An example with made-up numbers, as a student would see it.
  const meta: Meta = { formula: draft.formula, vars: Object.fromEntries(draft.vars.flatMap((v) => { const min = readNumber(v.min), max = readNumber(v.max), step = readNumber(v.step); return v.name && min != null && max != null && step && step > 0 && max >= min ? [[v.name.toLowerCase(), { min, max, step }]] : []; })) };
  const values = valuesFor(meta, 'example', 'preview');
  const answer = draft.formula ? variantAnswer(meta, 'example', 'preview') : null;
  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-white/10 p-2.5">
      <p className={small}>Write each number in the question as a letter in braces, like “A car drives {'{d}'} km in {'{t}'} hours”. Each student gets their own numbers.</p>
      {draft.vars.map((_, i) => (
        <div key={i} className="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))_auto] gap-1.5 items-end">
          {row(i, 'name', 'Letter')}{row(i, 'min', 'From')}{row(i, 'max', 'To')}{row(i, 'step', 'Step')}
          {draft.vars.length > 1 ? <button type="button" onClick={() => set({ vars: draft.vars.filter((__, j) => j !== i) })} aria-label={`Remove ${draft.vars[i].name || 'this number'}`} className="btn-ghost btn-icon"><X className="w-4 h-4" /></button> : <span className="w-10" />}
        </div>
      ))}
      {draft.vars.length < 5 && <button type="button" onClick={() => set({ vars: [...draft.vars, { name: 'bcdfgh'[draft.vars.length] ?? '', min: '1', max: '10', step: '1' }] })} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a number</button>}
      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">The answer’s formula
        <input value={draft.formula} maxLength={200} spellCheck={false} onChange={(e) => set({ formula: e.target.value })} placeholder="d/t" className={cn(input, 'mt-1 font-mono font-normal')} />
      </label>
      {draft.question && draft.formula && (
        <p className="text-xs text-zinc-700 dark:text-zinc-300" aria-live="polite"><span className="font-semibold">For example: </span>{fillText(draft.question, values)} <span className="font-semibold">→ {answer ?? 'the formula can’t be worked out'}</span></p>
      )}
    </div>
  );
}

/** The picture of a tap-on-the-picture question, and the areas that count: drag on it to mark one. */
function PictureAreas({ draft, set }: { draft: QDraft; set: (p: Partial<QDraft>) => void }) {
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState<Area | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const at = (e: PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) }; };
  const box = (a: { x: number; y: number }, b: { x: number; y: number }): Area => {
    const r = (n: number) => Math.round(n * 10) / 10;
    return { x: r(Math.min(a.x, b.x)), y: r(Math.min(a.y, b.y)), w: r(Math.abs(a.x - b.x)), h: r(Math.abs(a.y - b.y)) };
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Choose a picture (JPEG, PNG or WebP).'); return; }
    setBusy(true);
    try { set({ image: await uploadChatFile(f), areas: [] }); }
    catch (e) { toast.error((e as Error).message || 'The picture couldn’t be uploaded.'); }
    finally { setBusy(false); }
  };
  const field = (i: number, k: keyof Area, label: string) => (
    <label className="text-[11px] text-zinc-700 dark:text-zinc-300">{label}
      <input type="number" min={0} max={100} step={0.5} value={draft.areas[i][k]} onChange={(e) => set({ areas: draft.areas.map((a, j) => (j === i ? { ...a, [k]: Number(e.target.value) } : a)) })} className="input py-1 mt-0.5" />
    </label>
  );
  return (
    <div className="space-y-2">
      <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" onClick={() => file.current?.click()} disabled={busy} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4" />} {draft.image ? 'Change the picture' : 'Upload the picture'}</button>
      {draft.image && <>
        <p className={small}>Drag on the picture to mark where a right tap goes (up to 6 areas), or set an area’s position below.</p>
        <div
          className="relative inline-block max-w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 cursor-crosshair touch-none select-none"
          onPointerDown={(e) => { if (draft.areas.length >= 6) return; e.currentTarget.setPointerCapture(e.pointerId); start.current = at(e); setDrawing(box(start.current, start.current)); }}
          onPointerMove={(e) => { if (start.current) setDrawing(box(start.current, at(e))); }}
          onPointerUp={(e) => { if (!start.current) return; const a = box(start.current, at(e)); start.current = null; setDrawing(null); if (a.w >= 1 && a.h >= 1) set({ areas: [...draft.areas, a] }); }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the teacher's uploaded picture, any size */}
          <img src={draft.image} alt="The question’s picture" draggable={false} className="block max-h-[22rem] w-auto" />
          {[...draft.areas, ...(drawing ? [drawing] : [])].map((a, i) => <span key={i} aria-hidden className="absolute border-2 border-emerald-500 bg-emerald-500/20 rounded-md text-[10px] font-bold text-emerald-900 dark:text-emerald-100 px-1" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}>{i < draft.areas.length ? i + 1 : ''}</span>)}
        </div>
        {draft.areas.length === 0 && <button type="button" onClick={() => set({ areas: [{ x: 40, y: 40, w: 20, h: 20 }] })} className="btn-ghost btn-sm block"><Plus className="w-4 h-4" /> Add an area in the middle</button>}
        <ul className="space-y-1.5">
          {draft.areas.map((_, i) => (
            <li key={i} className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))_auto] gap-1.5 items-end">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 pb-2">Area {i + 1}</span>
              {field(i, 'x', 'From left %')}{field(i, 'y', 'From top %')}{field(i, 'w', 'Width %')}{field(i, 'h', 'Height %')}
              <button type="button" onClick={() => set({ areas: draft.areas.filter((__, j) => j !== i) })} aria-label={`Remove area ${i + 1}`} className="btn-ghost btn-icon"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      </>}
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
  const m = metaOf(q);
  if (type === 'HOTSPOT' && m.image) return <div className="mt-2"><PictureTap image={m.image} areas={m.areas} value="" readOnly label="The picture, with the areas that count" /></div>;
  return <p className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><span className="font-semibold">Answer: </span>{q.correctAnswer}</p>;
}
