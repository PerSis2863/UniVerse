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

const GOALS = [250, 500, 1000, 1500, 2000, 3000];
const goalKey = (docId: string) => `uv-doc-goal:${docId}`;

/**
 * Words, characters and roughly how long it takes to read; tapped, a writing goal for this
 * document (M17, kept on this device): a ring fills as you write and sparkles once it's reached.
 */
export function WordCount({ editor, docId }: { editor: Editor; docId?: string }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => { const st = e.storage as unknown as { characterCount?: { words: () => number; characters: () => number } }; return { words: st.characterCount?.words() ?? 0, chars: st.characterCount?.characters() ?? 0 }; } });
  const [goal, setGoalState] = useState<number>(() => { try { return docId ? Number(localStorage.getItem(goalKey(docId))) || 0 : 0; } catch { return 0; } });
  const [open, setOpen] = useState(false);
  const setGoal = (n: number) => { setGoalState(n); setOpen(false); try { if (docId) { if (n) localStorage.setItem(goalKey(docId), String(n)); else localStorage.removeItem(goalKey(docId)); } } catch { /* private mode */ } };
  if (!s) return null;
  const minutes = Math.max(1, Math.round(s.words / 220));
  const label = `${s.words.toLocaleString()} word${s.words === 1 ? '' : 's'}`;
  const title = `${s.chars.toLocaleString()} characters · about ${minutes} minute${minutes === 1 ? '' : 's'} to read`;
  if (!docId) return <span title={title}>· {label}</span>;
  const done = goal ? Math.min(1, s.words / goal) : 0, reached = !!goal && s.words >= goal;
  return (
    <span className="relative inline-flex items-center">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={`${title}. Set a writing goal`} className="inline-flex items-center gap-1 rounded-full hover:text-indigo-600 dark:hover:text-indigo-300">
        · {goal ? (
          <svg viewBox="0 0 20 20" className={cn('w-3.5 h-3.5 -rotate-90', reached && 'goal-reached')} aria-hidden>
            <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className="stroke-zinc-300 dark:stroke-white/15" />
            <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={50.3} strokeDashoffset={50.3 * (1 - done)} className={cn('transition-[stroke-dashoffset] duration-500 ease-out', reached ? 'stroke-emerald-500' : 'stroke-fuchsia-500')} />
          </svg>
        ) : null}
        {label}{goal ? ` of ${goal.toLocaleString()}` : ''}
      </button>
      {open && (
        <span role="dialog" aria-label="Writing goal" className="menu-pop absolute start-0 top-6 z-40 w-56 p-2 rounded-xl bg-white dark:bg-[#11212d] border border-zinc-200 dark:border-white/10 shadow-2xl text-xs text-zinc-700 dark:text-zinc-200">
          <span className="block px-1 pb-1.5 font-semibold">Writing goal for this document</span>
          <span className="grid grid-cols-3 gap-1">
            {GOALS.map((g) => <button key={g} type="button" onClick={() => setGoal(g)} aria-pressed={goal === g} className={cn('py-1.5 rounded-lg font-semibold', goal === g ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10')}>{g.toLocaleString()}</button>)}
          </span>
          {goal > 0 && <button type="button" onClick={() => setGoal(0)} className="mt-1.5 w-full py-1 rounded-lg text-zinc-500 hover:text-rose-500">No goal</button>}
          <span className="block px-1 pt-1.5 text-zinc-500">{goal ? (reached ? 'Goal reached. Well done!' : `${(goal - s.words).toLocaleString()} words to go`) : 'Pick a number of words to aim for.'}</span>
        </span>
      )}
    </span>
  );
}
