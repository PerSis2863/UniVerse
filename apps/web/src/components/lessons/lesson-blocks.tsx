'use client';

import { useId, useState } from 'react';
import { Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type Editor, type NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { m as motion } from 'framer-motion';
import { AlertTriangle, ChevronLeft, ChevronRight, CircleCheck, CircleHelp, CircleX, Info, Layers, Lightbulb, Plus, Shuffle, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import { CALLOUT_TONES, MAX_CARDS, MAX_OPTIONS, type CalloutTone } from '@/lib/lesson-page';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// The blocks lesson pages add to the document editor (Stage 5 · B2; saved as the editor's JSON and
// checked by src/lib/lesson-page.ts): a callout (note, tip, watch out, key idea) around any text, a
// quick check (a practice question with instant feedback, not marked or saved), and flashcards to
// flip through. While the teacher writes, each shows its form; students (and Preview) see it working.

const jsonAttr = <T,>(name: string, fallback: T) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => { try { return JSON.parse(el.getAttribute(`data-${name}`) ?? '') as T; } catch { return fallback; } },
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
});
const textAttr = (name: string) => ({
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? '',
  renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { [`data-${name}`]: String(attrs[name]) } : {}),
});
const useEditable = (editor: Editor) => useEditorState({ editor, selector: ({ editor: e }) => e.isEditable });

/** Puts a block at the cursor, or after the block that's selected rather than over it. */
export function insertBlock(editor: Editor, node: { type: string; attrs?: Record<string, unknown> }) {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) editor.chain().focus().insertContentAt(selection.to, node).run();
  else editor.chain().focus().insertContent(node).run();
}

// ── Callout ──────────────────────────────────────────────────────────────────────────────────

const TONE: Record<CalloutTone, { label: string; icon: LucideIcon; box: string; text: string }> = {
  note: { label: 'Note', icon: Info, box: 'border-sky-300/80 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-400/[0.07]', text: 'text-sky-800 dark:text-sky-200' },
  tip: { label: 'Tip', icon: Lightbulb, box: 'border-emerald-300/80 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/[0.07]', text: 'text-emerald-800 dark:text-emerald-200' },
  warning: { label: 'Watch out', icon: AlertTriangle, box: 'border-amber-300/80 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/[0.07]', text: 'text-amber-800 dark:text-amber-200' },
  key: { label: 'Key idea', icon: Sparkles, box: 'border-violet-300/80 bg-violet-50 dark:border-violet-400/30 dark:bg-violet-400/[0.07]', text: 'text-violet-800 dark:text-violet-200' },
};
const toneOf = (v: unknown): CalloutTone => ((CALLOUT_TONES as readonly unknown[]).includes(v) ? (v as CalloutTone) : 'note');

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { tone: { default: 'note', parseHTML: (el: HTMLElement) => toneOf(el.getAttribute('data-callout')), renderHTML: (a: Record<string, unknown>) => ({ 'data-callout': toneOf(a.tone) }) } };
  },
  parseHTML() { return [{ tag: 'div[data-callout]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, role: 'note' }, 0]; },
  addNodeView() { return ReactNodeViewRenderer(CalloutView); },
});

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const tone = toneOf(node.attrs.tone);
  const editable = useEditable(editor);
  const t = TONE[tone];
  return (
    <NodeViewWrapper role="note" aria-label={t.label} data-callout={tone} className={cn('my-4 rounded-2xl border px-4 py-3', t.box)}>
      <div contentEditable={false} className={cn('flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide select-none', t.text)}>
        <t.icon className="w-4 h-4 shrink-0" aria-hidden />
        {editable ? (
          <select aria-label="Kind of callout" value={tone} onChange={(e) => updateAttributes({ tone: e.target.value })} className="bg-transparent uppercase font-bold tracking-wide rounded-md -ml-1 px-1 min-h-[28px] hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            {CALLOUT_TONES.map((k) => <option key={k} value={k}>{TONE[k].label}</option>)}
          </select>
        ) : t.label}
      </div>
      <NodeViewContent className="mt-1 [&>*+*]:mt-2" />
    </NodeViewWrapper>
  );
}

// ── Shared frame for the quick check and flashcards ──────────────────────────────────────────

function BlockFrame({ label, icon: Icon, note, editable, selected, onDelete, children }: {
  label: string; icon: LucideIcon; note?: string; editable: boolean; selected: boolean; onDelete: () => void; children: React.ReactNode;
}) {
  return (
    <NodeViewWrapper contentEditable={false} className={cn('my-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden not-prose', selected && editable && 'ring-2 ring-indigo-500')}>
      <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 border-b border-zinc-200/70 dark:border-white/[0.06]" data-drag-handle>
        <Icon className="w-4 h-4" aria-hidden />
        <span className="flex-1">{label}{note && <span className="ml-1.5 normal-case tracking-normal font-medium text-zinc-600 dark:text-zinc-400">{note}</span>}</span>
        {editable && <button type="button" onClick={onDelete} aria-label={`Remove this ${label.toLowerCase()}`} className="p-1.5 rounded-md text-zinc-500 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="p-4">{children}</div>
    </NodeViewWrapper>
  );
}

/** Edits kept here while typing and saved into the page when the block loses focus (or at once). */
function useDraft<T>(value: T, commit: (v: T) => void) {
  const key = JSON.stringify(value);
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(key);
  if (key !== seen) { setSeen(key); setDraft(value); }
  const save = (v: T = draft) => { if (JSON.stringify(v) !== key) commit(v); };
  return [draft, setDraft, save] as const;
}

// ── Quick check ──────────────────────────────────────────────────────────────────────────────

interface Check { question: string; options: string[]; answer: number; explain: string }

export const QuickCheck = Node.create({
  name: 'quickCheck',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { question: textAttr('question'), options: jsonAttr<string[]>('options', ['', '']), answer: jsonAttr<number>('answer', 0), explain: textAttr('explain') };
  },
  parseHTML() { return [{ tag: 'div[data-quick-check]' }]; },
  renderHTML({ node, HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-quick-check': '' }, String(node.attrs.question ?? '')]; },
  addNodeView() { return ReactNodeViewRenderer(QuickCheckView); },
});

function QuickCheckView({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const a = node.attrs as Check;
  const editable = useEditable(editor);
  return (
    <BlockFrame label="Quick check" icon={CircleHelp} note="practice, not marked" editable={editable} selected={selected} onDelete={deleteNode}>
      {editable ? <CheckForm a={a} update={updateAttributes} /> : <CheckTry a={a} />}
    </BlockFrame>
  );
}

function CheckForm({ a, update }: { a: Check; update: (x: Partial<Check>) => void }) {
  const [d, setD, save] = useDraft<Check>({ question: a.question, options: a.options?.length ? a.options : ['', ''], answer: a.answer ?? 0, explain: a.explain }, (v) => update(v));
  const name = useId();
  const set = (x: Partial<Check>) => setD({ ...d, ...x });
  return (
    <div className="space-y-3" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) save(); }}>
      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Question
        <input value={d.question} maxLength={500} onChange={(e) => set({ question: e.target.value })} placeholder="e.g. Which of these is a prime number?" className="input mt-1" />
      </label>
      <fieldset>
        <legend className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Answers (choose the right one)</legend>
        <ul className="mt-1 space-y-1.5">
          {d.options.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <input type="radio" name={name} checked={d.answer === i} onChange={() => { const v = { ...d, answer: i }; setD(v); save(v); }} aria-label={`Answer ${i + 1} is the right one`} className="w-6 h-6 accent-emerald-600 shrink-0" />
              <input value={o} maxLength={200} onChange={(e) => set({ options: d.options.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Answer ${i + 1}`} className="input py-1.5 text-sm" />
              {d.options.length > 2 && (
                <button type="button" aria-label={`Remove answer ${i + 1}`} onClick={() => { const options = d.options.filter((_, j) => j !== i); const v = { ...d, options, answer: d.answer === i ? 0 : d.answer > i ? d.answer - 1 : d.answer }; setD(v); save(v); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
        {d.options.length < MAX_OPTIONS && <button type="button" onClick={() => set({ options: [...d.options, ''] })} className="mt-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add an answer</button>}
      </fieldset>
      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Why (optional, shown after they answer)
        <textarea rows={2} value={d.explain} maxLength={1000} onChange={(e) => set({ explain: e.target.value })} className="input mt-1 text-sm" />
      </label>
    </div>
  );
}

function CheckTry({ a }: { a: Check }) {
  const name = useId();
  const [pick, setPick] = useState<number | null>(null);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const [shown, setShown] = useState(false);
  const options = (a.options ?? []).map((text, i) => ({ text, i })).filter((o) => o.text.trim());
  if (!a.question?.trim() || options.length < 2) return <p className="text-sm text-zinc-600 dark:text-zinc-400">This question isn’t finished yet.</p>;
  const reveal = result === 'right' || shown;
  return (
    <fieldset>
      <legend className="font-semibold text-zinc-900 dark:text-white">{a.question}</legend>
      <div className="mt-3 space-y-2">
        {options.map((o) => {
          const right = reveal && o.i === a.answer, wrong = result === 'wrong' && pick === o.i;
          return (
            <label key={o.i} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition-colors',
              right ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-100' : wrong ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-100' : pick === o.i ? 'border-indigo-500 bg-indigo-500/5 text-zinc-900 dark:text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.04]')}>
              <input type="radio" name={name} checked={pick === o.i} onChange={() => { setPick(o.i); if (result !== 'right') setResult(null); }} className="w-4 h-4 accent-indigo-600 shrink-0" />
              <span className="min-w-0 flex-1">{o.text}</span>
              {right && <CircleCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-label="The right answer" />}
              {wrong && <CircleX className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-label="Not this one" />}
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pick === null || result === 'right'} onClick={() => setResult(pick === a.answer ? 'right' : 'wrong')} className="btn-primary btn-sm">Check</button>
        {result === 'wrong' && !shown && <button type="button" onClick={() => setShown(true)} className="btn-ghost btn-sm">Show the answer</button>}
      </div>
      <div aria-live="polite" className="text-sm">
        {result && (
          <motion.div key={`${result}-${shown}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy} className="mt-3 space-y-1">
            <p className={cn('font-semibold', result === 'right' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
              {result === 'right' ? 'Right!' : shown ? `The answer: ${a.options[a.answer] ?? ''}` : 'Not quite. Have another go.'}
            </p>
            {reveal && a.explain?.trim() && <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{a.explain}</p>}
          </motion.div>
        )}
      </div>
    </fieldset>
  );
}

// ── Flashcards ───────────────────────────────────────────────────────────────────────────────

interface Card { front: string; back: string }
interface Deck { title: string; cards: Card[] }

export const Flashcards = Node.create({
  name: 'flashcards',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { title: textAttr('title'), cards: jsonAttr<Card[]>('cards', [{ front: '', back: '' }, { front: '', back: '' }]) };
  },
  parseHTML() { return [{ tag: 'div[data-flashcards]' }]; },
  renderHTML({ node, HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-flashcards': '' }, String(node.attrs.title || 'Flashcards')]; },
  addNodeView() { return ReactNodeViewRenderer(FlashcardsView); },
});

function FlashcardsView({ node, updateAttributes, deleteNode, editor, selected }: NodeViewProps) {
  const a = node.attrs as Deck;
  const editable = useEditable(editor);
  return (
    <BlockFrame label="Flashcards" icon={Layers} note={a.title?.trim() ? `· ${a.title}` : undefined} editable={editable} selected={selected} onDelete={deleteNode}>
      {editable ? <DeckForm a={a} update={updateAttributes} /> : <DeckStudy a={a} />}
    </BlockFrame>
  );
}

function DeckForm({ a, update }: { a: Deck; update: (x: Partial<Deck>) => void }) {
  const [d, setD, save] = useDraft<Deck>({ title: a.title ?? '', cards: a.cards?.length ? a.cards : [{ front: '', back: '' }] }, (v) => update(v));
  const setCard = (i: number, c: Partial<Card>) => setD({ ...d, cards: d.cards.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  return (
    <div className="space-y-3" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) save(); }}>
      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Title (optional)
        <input value={d.title} maxLength={120} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Key words" className="input mt-1 py-1.5" />
      </label>
      <ol className="space-y-2">
        {d.cards.map((c, i) => (
          <li key={i} className="rounded-xl border border-zinc-200 dark:border-white/10 p-2.5 flex gap-2 items-start">
            <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 w-5 pt-2 tabular-nums shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
              <textarea rows={2} value={c.front} maxLength={500} onChange={(e) => setCard(i, { front: e.target.value })} aria-label={`Card ${i + 1}, front`} placeholder="Front: a word or question" className="input text-sm" />
              <textarea rows={2} value={c.back} maxLength={500} onChange={(e) => setCard(i, { back: e.target.value })} aria-label={`Card ${i + 1}, back`} placeholder="Back: the meaning or answer" className="input text-sm" />
            </div>
            {d.cards.length > 1 && <button type="button" aria-label={`Remove card ${i + 1}`} onClick={() => { const v = { ...d, cards: d.cards.filter((_, j) => j !== i) }; setD(v); save(v); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>}
          </li>
        ))}
      </ol>
      {d.cards.length < MAX_CARDS && <button type="button" onClick={() => setD({ ...d, cards: [...d.cards, { front: '', back: '' }] })} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add a card</button>}
    </div>
  );
}

function DeckStudy({ a }: { a: Deck }) {
  const cards = (a.cards ?? []).filter((c) => c.front?.trim());
  const [order, setOrder] = useState<number[] | null>(null);
  const [at, setAt] = useState(0);
  const [back, setBack] = useState(false);
  if (!cards.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400">No cards yet.</p>;
  const seq = order && order.length === cards.length ? order : cards.map((_, i) => i);
  const i = Math.min(at, cards.length - 1);
  const card = cards[seq[i]];
  const go = (n: number) => { setAt((i + n + cards.length) % cards.length); setBack(false); };
  const shuffle = () => {
    const next = cards.map((_, k) => k);
    for (let k = next.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [next[k], next[j]] = [next[j], next[k]]; }
    setOrder(next); setAt(0); setBack(false);
  };
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setBack((b) => !b)}
        className="w-full min-h-[150px] rounded-2xl border border-indigo-200 dark:border-indigo-400/20 bg-indigo-50/60 dark:bg-indigo-400/[0.06] px-5 py-6 grid place-items-center text-center pressable">
        <motion.span key={`${seq[i]}-${back}`} initial={{ opacity: 0, rotateX: -60 }} animate={{ opacity: 1, rotateX: 0 }} transition={spring.snappy} className="block" aria-live="polite">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">{back ? 'Back' : 'Front'}</span>
          <span className="block mt-2 text-lg font-semibold text-zinc-900 dark:text-white whitespace-pre-wrap">{back ? card.back || '(empty)' : card.front}</span>
          <span className="block mt-3 text-xs text-zinc-600 dark:text-zinc-400">{back ? 'Tap to turn it back' : 'Tap to turn it over'}</span>
        </motion.span>
      </button>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => go(-1)} disabled={cards.length < 2} aria-label="Previous card" className="btn-secondary btn-icon"><ChevronLeft className="w-4 h-4" /></button>
        <span className="flex-1 text-center text-sm tabular-nums text-zinc-700 dark:text-zinc-300">{i + 1} of {cards.length}</span>
        <button type="button" onClick={shuffle} disabled={cards.length < 3} className="btn-ghost btn-sm"><Shuffle className="w-3.5 h-3.5" /> Shuffle</button>
        <button type="button" onClick={() => go(1)} disabled={cards.length < 2} aria-label="Next card" className="btn-secondary btn-icon"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
