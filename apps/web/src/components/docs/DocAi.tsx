'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Editor } from '@tiptap/react';
import { Check, Copy, CornerDownLeft, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { DOC_AI_ACTIONS, wordDiff, type DocAiAction } from '@/lib/doc-ai';
import { LANGUAGES } from '@/lib/languages';
import { cn } from '@/lib/utils';

// The AI writing helper (Stage 5 · B9.4; src/server/doc-ai.ts): select text, pick what to do, and
// see the answer next to the original (word by word, what goes and what comes) before anything
// changes. Replace puts it in place of the selection, Put below adds it after; nothing is changed
// without a click. Continue writing uses the text before the cursor.

interface Ask { action: DocAiAction; from: number; to: number; original: string; lang: string }
interface Answer extends Ask { text: string; left?: number | null }

type Node = { type: string; text?: string; content?: Node[] };
const paragraphs = (text: string): Node[] => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.replace(/\n/g, ' ') }] }));

export function DocAiButton({ editor, canEdit, docId }: { editor: Editor | null; canEdit: boolean; docId: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('fr');
  const [busy, setBusy] = useState<DocAiAction | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (action: DocAiAction, again?: Ask) => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const req: Ask = again ?? (action === 'continue'
      ? { action, from: to, to, original: editor.state.doc.textBetween(Math.max(0, to - 3000), to, '\n\n', ' '), lang }
      : { action, from, to, original: empty ? '' : editor.state.doc.textBetween(from, to, '\n\n', ' '), lang });
    if (req.original.trim().length < 2) { setError(action === 'continue' ? 'Write something first, then put the cursor where it should go on.' : 'Select some text first.'); return; }
    setBusy(action); setError(null); setAnswer(null);
    try {
      const r = await authedJson<{ text: string; left?: number | null }>(`/api/docs/${docId}/ai`, { method: 'POST', body: JSON.stringify({ action, text: req.original, lang: req.lang }) });
      setAnswer({ ...req, text: r.text, left: r.left });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  /** Whether the text the answer was made from is still there, unchanged. */
  const stillThere = (a: Answer) => a.to <= editor!.state.doc.content.size && editor!.state.doc.textBetween(a.from, a.to, '\n\n', ' ') === a.original;
  const replace = (a: Answer) => {
    if (!editor) return;
    if (!stillThere(a)) { toast.message('That text changed meanwhile, so the answer went below it instead.'); below(a); return; }
    const nodes = paragraphs(a.text);
    editor.chain().focus().insertContentAt({ from: a.from, to: a.to }, nodes.length > 1 ? nodes : [{ type: 'text', text: a.text.replace(/\s*\n+\s*/g, ' ') }]).run();
    done();
  };
  const below = (a: Answer) => {
    if (!editor) return;
    const doc = editor.state.doc, at = Math.min(a.to, doc.content.size);
    const $at = doc.resolve(at);
    const pos = $at.depth > 0 ? $at.after(1) : at;
    editor.chain().focus().insertContentAt(pos, paragraphs(a.text)).run();
    done();
  };
  const addHere = (a: Answer) => {
    if (!editor) return;
    const before = editor.state.doc.textBetween(Math.max(0, a.from - 1), a.from, '', ' ');
    editor.chain().focus().insertContentAt(Math.min(a.from, editor.state.doc.content.size), [{ type: 'text', text: `${before && !/\s$/.test(before) ? ' ' : ''}${a.text.replace(/\s*\n+\s*/g, ' ')}` }]).run();
    done();
  };
  const done = () => { setAnswer(null); setOpen(false); };
  const use = answer ? DOC_AI_ACTIONS.find((x) => x.id === answer.action)!.use : null;

  return (
    <div className="relative shrink-0">
      <button type="button" disabled={!editor} onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen((o) => !o); setError(null); }} aria-expanded={open} title="Write with AI" aria-label="Write with AI"
        className={cn('h-8 px-2 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40', open ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}>
        <Sparkles className="w-4 h-4" /><span className="max-sm:sr-only">AI</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Write with AI" className="absolute end-0 top-10 z-40 w-[22rem] max-sm:fixed max-sm:inset-x-4 max-sm:top-28 max-sm:w-auto rounded-2xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 shadow-2xl p-2" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          {!answer ? (
            <>
              <p className="px-2 pt-1 pb-2 text-xs text-zinc-500">Select text in the document, then choose. You’ll see the answer before anything changes. Each one uses an AI request.</p>
              <ul>
                {DOC_AI_ACTIONS.map((a) => {
                  const allowed = canEdit || a.id === 'explain';
                  return (
                    <li key={a.id} className="flex items-center gap-1">
                      <button type="button" disabled={!allowed || !!busy} onMouseDown={(e) => e.preventDefault()} onClick={() => void ask(a.id)} title={allowed ? a.hint : 'You can only read this document'}
                        className="flex-1 text-start px-2 py-1.5 rounded-lg text-sm hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent">
                        <span className="flex items-center gap-2 text-zinc-800 dark:text-zinc-100">{busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-500" aria-hidden />}{a.label}</span>
                        <span className="block text-[11px] text-zinc-500 ps-[1.375rem]">{a.hint}</span>
                      </button>
                      {a.id === 'translate' && (
                        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Translate into" className="input py-1 text-xs w-auto shrink-0">
                          {Object.entries(LANGUAGES).map(([code, l]) => <option key={code} value={code}>{l.name}</option>)}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>
              {error && <p role="alert" className="px-2 pt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            </>
          ) : (
            <div className="space-y-2 p-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{DOC_AI_ACTIONS.find((x) => x.id === answer.action)!.label}{answer.action === 'translate' ? ` · ${LANGUAGES[answer.lang]?.name ?? ''}` : ''}</p>
                <button type="button" onClick={() => setAnswer(null)} aria-label="Back" className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div aria-live="polite" className="max-h-72 overflow-y-auto rounded-xl border border-zinc-200 dark:border-white/10 p-2.5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap">
                {use === 'replace' && answer.action !== 'translate'
                  ? wordDiff(answer.original, answer.text).map((p, i) => p.kind === 'same' ? <span key={i}>{p.text}</span>
                    : p.kind === 'del' ? <del key={i} className="bg-rose-500/10 text-rose-700 dark:text-rose-300">{p.text}</del>
                    : <ins key={i} className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 no-underline">{p.text}</ins>)
                  : answer.text}
              </div>
              {use === 'replace' && answer.action !== 'translate' && <p className="text-[11px] text-zinc-500"><del className="text-rose-700 dark:text-rose-300">Struck out</del> goes, <ins className="no-underline text-emerald-800 dark:text-emerald-300">highlighted</ins> comes in.</p>}
              <div className="flex flex-wrap gap-1.5">
                {use === 'replace' && <button type="button" onClick={() => replace(answer)} className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" />Replace</button>}
                {use === 'add' && <button type="button" onClick={() => addHere(answer)} className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" />Add it</button>}
                {use !== 'add' && canEdit && <button type="button" onClick={() => below(answer)} className={use === 'note' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}><CornerDownLeft className="w-3.5 h-3.5" />Put below</button>}
                <button type="button" onClick={() => void navigator.clipboard.writeText(answer.text).then(() => toast.success('Copied'), () => {})} className="btn-secondary btn-sm"><Copy className="w-3.5 h-3.5" />Copy</button>
                <button type="button" onClick={() => void ask(answer.action, answer)} disabled={!!busy} className="btn-secondary btn-sm">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}Try again</button>
              </div>
              {typeof answer.left === 'number' && <p className="text-[11px] text-zinc-500">{answer.left} AI request{answer.left === 1 ? '' : 's'} left today.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
