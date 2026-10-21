'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Check, FilePenLine, ListChecks, X } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { resolveSuggestions, suggestKey, suggestionsIn, type Suggestion } from '@/lib/suggest-mode';
import { cn } from '@/lib/utils';

// Suggestions mode (Stage 5 · B9.3; src/lib/suggest-mode.ts): the Suggest switch in the toolbar,
// and the list to accept or reject them (each, or all at once).

const listOf = (e: Editor | null) => (e ? suggestionsIn(e.state.doc) : []);
const same = (a: Suggestion[], b: Suggestion[]) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.kind === b[i].kind && x.text === b[i].text && x.ranges[0][0] === b[i].ranges[0][0]);

export function SuggestToggle({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const on = useEditorState({ editor, selector: ({ editor: e }) => !!(e && suggestKey.getState(e.state)?.on) });
  return (
    <button type="button" disabled={disabled || !editor} onMouseDown={(e) => e.preventDefault()} aria-pressed={!!on} title={on ? 'Suggesting: your changes show as suggestions' : 'Suggest changes instead of editing'}
      onClick={() => { if (!editor) return; editor.view.dispatch(editor.state.tr.setMeta(suggestKey, { on: !on })); editor.commands.focus(); haptic('tap'); }}
      style={on ? { background: '#047857' } : undefined}
      className={cn('h-8 px-2 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40', on ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}>
      <FilePenLine className="w-4 h-4" /><span className="max-sm:sr-only">{on ? 'Suggesting' : 'Suggest'}</span>
    </button>
  );
}

/** How many suggestions are waiting (for the header button). */
export function useSuggestionCount(editor: Editor | null) {
  return useEditorState({ editor, selector: ({ editor: e }) => listOf(e).length }) ?? 0;
}

export function SuggestionsPanel({ editor, canEdit, onClose }: { editor: Editor | null; canEdit: boolean; onClose: () => void }) {
  const list = useEditorState({ editor, selector: ({ editor: e }) => listOf(e), equalityFn: same }) ?? [];
  const resolve = (items: Suggestion[], accept: boolean) => {
    if (!editor || !items.length) return;
    editor.view.dispatch(resolveSuggestions(editor.state, items, accept));
    haptic('tap');
  };
  const show = (s: Suggestion) => {
    if (!editor) return;
    const [from] = s.ranges[0], to = s.ranges[s.ranges.length - 1][1];
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  };
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/70 dark:border-white/[0.06]">
        <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><ListChecks className="w-4 h-4 text-emerald-600" aria-hidden />Suggestions</h2>
        <button type="button" onClick={onClose} aria-label="Close suggestions" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      {canEdit && list.length > 1 && (
        <div className="flex gap-2 px-4 py-2 border-b border-zinc-200/70 dark:border-white/[0.06]">
          <button type="button" onClick={() => resolve(list, true)} className="btn-secondary btn-sm flex-1"><Check className="w-3.5 h-3.5" />Accept all</button>
          <button type="button" onClick={() => resolve(list, false)} className="btn-secondary btn-sm flex-1"><X className="w-3.5 h-3.5" />Reject all</button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {!list.length ? (
          <p className="text-sm text-zinc-500 px-1">No suggestions. Turn on <strong>Suggest</strong> in the toolbar to suggest changes: what you add is underlined in green and what you remove is struck through, until someone accepts or rejects it.</p>
        ) : list.map((s) => (
          <div key={`${s.kind}:${s.id}`} className="rounded-xl border border-zinc-200 dark:border-white/10 p-2.5 space-y-1.5">
            <button type="button" onClick={() => show(s)} className="block w-full text-start">
              <span className="block text-[11px] text-zinc-500">{s.name} · {s.kind === 'insert' ? 'added' : 'removed'}{s.at ? ` · ${formatDistanceToNowStrict(new Date(s.at), { addSuffix: true })}` : ''}</span>
              <span className={cn('block text-sm line-clamp-3', s.kind === 'insert' ? 'text-emerald-800 dark:text-emerald-300 underline decoration-emerald-600 underline-offset-2' : 'text-rose-800 dark:text-rose-300 line-through')}>{s.text.trim() || '(spaces)'}</span>
            </button>
            {canEdit && (
              <div className="flex gap-1.5">
                <button type="button" onClick={() => resolve([s], true)} aria-label={`Accept: ${s.kind === 'insert' ? 'add' : 'remove'} “${s.text.trim().slice(0, 40)}”`} className="btn-secondary btn-sm"><Check className="w-3.5 h-3.5" />Accept</button>
                <button type="button" onClick={() => resolve([s], false)} aria-label={`Reject: ${s.kind === 'insert' ? 'add' : 'remove'} “${s.text.trim().slice(0, 40)}”`} className="btn-secondary btn-sm"><X className="w-3.5 h-3.5" />Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
