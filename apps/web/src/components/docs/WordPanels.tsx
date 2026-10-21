'use client';

import { useEffect, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import type * as Y from 'yjs';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { cleanPage, DEFAULT_PAGE, type PageSetup } from '@/lib/page-setup';
import { cn } from '@/lib/utils';
import { findState, findStep, replaceAll, replaceCurrent, setFind } from './word-ext';

// The document's find-and-replace bar, its page setup (kept in the live document, so everyone
// prints the same) and the word count (Office suite · O3).

export function FindBar({ editor, canEdit, onClose }: { editor: Editor; canEdit: boolean; onClose: () => void }) {
  const [query, setQuery] = useState(() => findState(editor).query);
  const [repl, setRepl] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const s = useEditorState({ editor, selector: ({ editor: e }) => { const f = findState(e); return { n: f.matches.length, at: f.current }; } });
  useEffect(() => () => setFind(editor, { query: '' }), [editor]);
  const run = (q: string, cs = caseSensitive) => setFind(editor, { query: q, caseSensitive: cs, current: 0 });
  return (
    <div role="search" aria-label="Find and replace" className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-200/70 dark:border-white/[0.06] bg-amber-50/70 dark:bg-amber-500/[0.06] text-sm">
      <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); run(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findStep(editor, e.shiftKey ? -1 : 1); } if (e.key === 'Escape') onClose(); }}
        placeholder="Find" aria-label="Find" className="input py-1.5 w-40 sm:w-52" />
      <span className="text-xs text-zinc-700 dark:text-zinc-300 tabular-nums w-16" aria-live="polite">{query ? (s?.n ? `${(s.at ?? 0) + 1} of ${s.n}` : 'None') : ''}</span>
      <button type="button" aria-label="Previous match" onClick={() => findStep(editor, -1)} disabled={!s?.n} className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 disabled:opacity-40"><ChevronUp className="w-4 h-4" /></button>
      <button type="button" aria-label="Next match" onClick={() => findStep(editor, 1)} disabled={!s?.n} className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 disabled:opacity-40"><ChevronDown className="w-4 h-4" /></button>
      <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={caseSensitive} onChange={(e) => { setCase(e.target.checked); run(query, e.target.checked); }} className="w-4 h-4 accent-indigo-600" />Match capitals</label>
      {canEdit && <>
        <input value={repl} onChange={(e) => setRepl(e.target.value)} placeholder="Replace with" aria-label="Replace with" className="input py-1.5 w-40 sm:w-52" />
        <button type="button" disabled={!s?.n} onClick={() => replaceCurrent(editor, repl)} className="btn-secondary btn-sm disabled:opacity-40">Replace</button>
        <button type="button" disabled={!s?.n} onClick={() => { const n = replaceAll(editor, repl); toast.success(`Replaced ${n}`); }} className="btn-secondary btn-sm disabled:opacity-40">Replace all</button>
      </>}
      <button type="button" aria-label="Close find" onClick={onClose} className="ms-auto p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
    </div>
  );
}

/** The page setup kept in the live document (its "page" map), following everyone's changes. */
export function usePageSetup(ydoc: Y.Doc | null): [PageSetup, (p: Partial<PageSetup>) => void] {
  const [page, setPage] = useState<PageSetup>(DEFAULT_PAGE);
  useEffect(() => {
    if (!ydoc) return;
    const m = ydoc.getMap('page');
    const read = () => setPage(cleanPage(Object.fromEntries(m.entries())));
    read();
    m.observe(read);
    return () => m.unobserve(read);
  }, [ydoc]);
  const update = (p: Partial<PageSetup>) => { if (!ydoc) return; const m = ydoc.getMap('page'); ydoc.transact(() => { for (const [k, v] of Object.entries(p)) m.set(k, v); }); };
  return [page, update];
}

export function PageSetupSheet({ page, canEdit, onChange, onClose }: { page: PageSetup; canEdit: boolean; onChange: (p: Partial<PageSetup>) => void; onClose: () => void }) {
  const choice = <K extends keyof PageSetup>(k: K, options: [PageSetup[K], string][], label: string) => (
    <fieldset>
      <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <label key={String(v)} className={cn('px-3 py-1.5 rounded-lg text-sm border cursor-pointer', page[k] === v ? 'bg-indigo-600 text-white border-transparent' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200')}>
            <input type="radio" name={`page-${k}`} disabled={!canEdit} checked={page[k] === v} onChange={() => onChange({ [k]: v } as Partial<PageSetup>)} className="sr-only" />{l}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <Sheet title="Page setup" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">For printing, PDF and Word copies. Everyone working on this document gets the same pages.</p>
        {choice('size', [['A4', 'A4'], ['Letter', 'Letter'], ['Legal', 'Legal'], ['A5', 'A5']], 'Paper')}
        {choice('orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], 'Orientation')}
        {choice('margins', [['normal', 'Normal (2.54 cm)'], ['narrow', 'Narrow (1.27 cm)'], ['wide', 'Wide (3.81 cm)']], 'Margins')}
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Header (top of every page)<input value={page.header} readOnly={!canEdit} maxLength={200} onChange={(e) => onChange({ header: e.target.value })} className="input mt-1" placeholder="e.g. Lab report · Year 9" /></label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Footer (bottom of every page)<input value={page.footer} readOnly={!canEdit} maxLength={200} onChange={(e) => onChange({ footer: e.target.value })} className="input mt-1" placeholder="e.g. Your name" /></label>
        <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200"><input type="checkbox" disabled={!canEdit} checked={page.numbers} onChange={(e) => onChange({ numbers: e.target.checked })} className="w-4 h-4 accent-indigo-600" />Page numbers (“Page 2 of 5”)</label>
      </div>
    </Sheet>
  );
}

/** Words, characters and roughly how long it takes to read. */
export function WordCount({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => { const st = e.storage as unknown as { characterCount?: { words: () => number; characters: () => number } }; return { words: st.characterCount?.words() ?? 0, chars: st.characterCount?.characters() ?? 0 }; } });
  if (!s) return null;
  const minutes = Math.max(1, Math.round(s.words / 220));
  return <span title={`${s.chars.toLocaleString()} characters · about ${minutes} minute${minutes === 1 ? '' : 's'} to read`}>· {s.words.toLocaleString()} word{s.words === 1 ? '' : 's'}</span>;
}
