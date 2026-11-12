'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDownToLine, Check, ChevronLeft, Ellipsis, FilePlus2, Folder, FolderPlus, ListChecks, NotebookPen, Pencil, Pin, PinOff, RotateCcw, Search, SquarePen, Trash2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { Splitter, usePaneSizes } from '@/components/ui/Splitter';
import { checklistDone, dateGroup, daysLeft, joinNote, KEEP_DELETED, linesOf, notePreview, noteTitle, noteToHtml, parseNote, rowTime, tickedDown, type Line, type Note } from '@/lib/quick-notes';
import { useKept } from './kept';

// Collaborate → Create → Quick notes (M68; M90 after Apple Notes): folders, Recently deleted, notes
// grouped by date, a big title and lines with round tick boxes (Enter adds the next one, an empty one
// ends the list). Kept on this device through useKept, so Save, view links and live editing carry the
// notes too. "Make it a document" turns a note into a Doc with a real checklist.

const COLOURS = [
  { name: 'No colour', dot: 'ring-1 ring-inset ring-zinc-400/70' },
  { name: 'Yellow', dot: 'bg-amber-400' },
  { name: 'Blue', dot: 'bg-sky-400' },
  { name: 'Green', dot: 'bg-emerald-400' },
  { name: 'Pink', dot: 'bg-pink-400' },
];
// The two views that aren't folders (a folder's name is never empty and never holds a line break).
const ALL = '', BIN = '\n';
const inView = (n: Note, v: string) => (v === BIN ? !!n.deletedAt : !n.deletedAt && (v === ALL || n.folder === v));
const firstIn = (notes: Note[], v: string) => notes.filter((n) => inView(n, v)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at)[0]?.id ?? null;
const EMPTY: Line = { text: '', check: null };
// Lines grow with their text (field-sizing where the browser has it, else measured).
const GROWS = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

interface Focus { line: number; at: number } // line -1 is the title
const ICON = 'inline-grid place-items-center w-9 h-9 shrink-0 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] transition-colors duration-150 disabled:opacity-50';

/** The panes as they start: folders and list in px; height 0 means the usual (78% of the window, 760 at most). */
const PANES = { folders: 180, list: 270, height: 0 };

export function QuickNotes() {
  const [notes, setNotes] = useKept<Note[]>('uv-quick-notes', []);
  // M165: the panes' widths and the whole thing's height, dragged by their dividers (computers; kept on this device).
  const [panes, setPanes] = usePaneSizes('uv-quick-notes-panes', PANES);
  const [folders, setFolders] = useKept<string[]>('uv-quick-folders', []);
  const [view, setView] = useState(ALL);
  const [open, setOpen] = useState<string | null>(() => firstIn(notes, ALL));
  const [reading, setReading] = useState(false); // phones: the note is open over the list
  const [q, setQ] = useState('');
  const [naming, setNaming] = useState<{ was: string | null; text: string } | null>(null);
  const [making, setMaking] = useState(false);
  const [titleCue, setTitleCue] = useState<{ id: string; n: number } | null>(null); // put the caret in that note's title
  const now = useNow();
  const router = useRouter();

  // Every change also drops notes that have waited 30 days in Recently deleted.
  const put = (fn: (list: Note[]) => Note[]) => setNotes((list) => { const t = Date.now(); return fn(list).filter((n) => !n.deletedAt || t - n.deletedAt < KEEP_DELETED); });
  const edit = (id: string, patch: Partial<Note>, touch = true) => put((list) => list.map((n) => (n.id === id ? { ...n, ...patch, ...(touch ? { at: Date.now() } : {}) } : n)));
  const cur = notes.find((n) => n.id === open) ?? null;
  const inBin = view === BIN;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    // A search looks through every note (or everything in Recently deleted), as Apple's does.
    const pool = notes.filter((n) => (inBin ? !!n.deletedAt && now - n.deletedAt < KEEP_DELETED : !n.deletedAt));
    const here = t ? pool.filter((n) => n.text.toLowerCase().includes(t)) : pool.filter((n) => inView(n, view));
    return here.sort((a, b) => (inBin ? (b.deletedAt ?? 0) - (a.deletedAt ?? 0) : Number(b.pinned) - Number(a.pinned) || b.at - a.at));
  }, [notes, q, view, inBin, now]);
  const groups = useMemo(() => {
    const out: { name: string; items: Note[] }[] = [];
    for (const n of shown) {
      const name = !inBin && n.pinned ? 'Pinned' : dateGroup(inBin ? n.deletedAt ?? n.at : n.at, now);
      const last = out[out.length - 1];
      if (last?.name === name) last.items.push(n); else out.push({ name, items: [n] });
    }
    return out;
  }, [shown, inBin, now]);

  // Leaving a note you never wrote in removes it, as Apple does.
  const dropIfEmpty = (keep: string | null) => { if (cur && cur.id !== keep && !cur.deletedAt && !cur.text.trim()) put((list) => list.filter((n) => n.id !== cur.id)); };
  const openNote = (id: string) => { dropIfEmpty(id); setOpen(id); setReading(true); };
  const choose = (v: string) => { dropIfEmpty(null); setView(v); setQ(''); setOpen(firstIn(notes, v)); setReading(false); };
  const add = () => {
    setQ('');
    const cue = (id: string) => setTitleCue((c) => ({ id, n: (c?.n ?? 0) + 1 }));
    if (cur && !cur.deletedAt && !cur.text.trim()) { cue(cur.id); setReading(true); return; }
    const folder = view !== ALL && view !== BIN ? view : undefined, id = crypto.randomUUID();
    if (inBin) setView(ALL);
    put((list) => [{ id, text: '', pinned: false, colour: 0, at: Date.now(), ...(folder ? { folder } : {}) }, ...list]);
    cue(id);
    setOpen(id); setReading(true);
  };
  const next = (id: string) => { const i = shown.findIndex((x) => x.id === id); return shown[i + 1]?.id ?? shown[i - 1]?.id ?? null; };
  const remove = (n: Note) => {
    setOpen(next(n.id)); setReading(false);
    if (!n.text.trim()) { put((list) => list.filter((x) => x.id !== n.id)); return; }
    put((list) => list.map((x) => (x.id === n.id ? { ...x, deletedAt: Date.now() } : x)));
    toast('Moved to Recently deleted', { action: { label: 'Undo', onClick: () => edit(n.id, { deletedAt: undefined }, false) } });
  };
  const recover = (n: Note) => {
    const folder = n.folder && folders.includes(n.folder) ? n.folder : undefined;
    setOpen(next(n.id)); setReading(false);
    edit(n.id, { deletedAt: undefined, folder }, false);
    toast.success(`Recovered to ${folder ?? 'All notes'}`);
  };
  const forget = (n: Note) => {
    setOpen(next(n.id)); setReading(false);
    put((list) => list.filter((x) => x.id !== n.id));
    toast('Deleted for good', { action: { label: 'Undo', onClick: () => put((list) => [n, ...list]) } });
  };
  const saveFolder = () => {
    if (!naming) return;
    const name = naming.text.replace(/\s+/g, ' ').trim().slice(0, 40), was = naming.was;
    if (!name || name === was) { setNaming(null); return; }
    if (folders.includes(name)) { toast.error('There’s already a folder with that name.'); return; }
    setNaming(null);
    if (was === null) { setFolders((f) => [...f, name]); dropIfEmpty(null); setView(name); setOpen(null); setReading(false); return; }
    setFolders((f) => f.map((x) => (x === was ? name : x)));
    put((list) => list.map((n) => (n.folder === was ? { ...n, folder: name } : n)));
    setView(name);
  };
  const dropFolder = (name: string) => {
    setFolders((f) => f.filter((x) => x !== name));
    put((list) => list.map((n) => (n.folder === name ? { ...n, folder: undefined } : n)));
    setView(ALL); setOpen(firstIn(notes, ALL));
    toast(`Folder “${name}” deleted. Its notes are in All notes.`);
  };
  const toDoc = async (n: Note) => {
    setMaking(true);
    try {
      const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title: noteTitle(n).slice(0, 80), kind: 'doc' }) });
      try { sessionStorage.setItem(`doc-import:${d.id}`, noteToHtml(n.text)); } catch { /* no storage: the doc starts empty */ }
      router.push(`/docs/${d.id}`);
    } catch { toast.error('The document couldn’t be made. Check your connection and try again.'); setMaking(false); }
  };

  const count = (v: string) => notes.filter((n) => inView(n, v)).length;
  const views = [{ v: ALL, name: 'All notes' }, ...folders.map((f) => ({ v: f, name: f })), { v: BIN, name: 'Recently deleted' }];
  const viewName = views.find((x) => x.v === view)?.name ?? 'All notes';
  const folderEdit = view !== ALL && view !== BIN && (
    <span className="inline-flex gap-0.5">
      <button type="button" onClick={() => setNaming({ was: view, text: view })} className={cn(ICON, 'h-8 w-8')} aria-label={`Rename folder ${view}`} title="Rename"><Pencil className="w-3.5 h-3.5" aria-hidden /></button>
      <button type="button" onClick={() => dropFolder(view)} className={cn(ICON, 'h-8 w-8')} aria-label={`Delete folder ${view}`} title="Delete folder (its notes stay)"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
    </span>
  );
  const nameField = naming && (
    <form onSubmit={(e) => { e.preventDefault(); saveFolder(); }} className="px-1.5 py-1">
      <label className="sr-only" htmlFor="qn-folder">{naming.was === null ? 'New folder name' : 'Folder name'}</label>
      <input id="qn-folder" autoFocus value={naming.text} maxLength={40} onChange={(e) => setNaming({ ...naming, text: e.target.value })} onBlur={saveFolder} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null); }}
        placeholder="Folder name" className="w-full h-9 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.08] px-2.5 text-[16px] md:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-white/40" />
    </form>
  );

  return (
    <div className="relative md:flex md:h-[var(--qn-h)] border-t border-zinc-900/[0.07] dark:border-white/[0.07]"
      style={{ '--qn-a': `${panes.folders}px`, '--qn-b': `${panes.list}px`, '--qn-h': panes.height ? `${panes.height}px` : 'min(78vh, 760px)' } as React.CSSProperties}>
      {/* Folders (a row of chips on phones) */}
      <nav aria-label="Folders" className={cn('relative min-h-0 md:w-[var(--qn-a)] md:shrink-0 md:border-e border-zinc-900/[0.07] dark:border-white/[0.07] md:bg-zinc-900/[0.025] md:dark:bg-white/[0.025]', reading && 'hidden md:block')}>
        <p className="hidden md:block px-4 pt-4 pb-2 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">On this device</p>
        <ul className="flex md:block gap-1.5 overflow-x-auto md:overflow-y-auto md:max-h-[calc(100%-3rem)] px-3 md:px-2 pt-3 md:pt-0 pb-1 md:pb-3 [scrollbar-width:none]">
          {views.map(({ v, name }) => (
            <li key={v || 'all'} className="shrink-0">
              <button type="button" onClick={() => choose(v)} aria-current={view === v ? 'page' : undefined}
                className={cn('flex w-full items-center gap-2 whitespace-nowrap rounded-full md:rounded-xl px-3 h-9 text-sm transition-colors duration-150',
                  view === v ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.07] max-md:ring-1 max-md:ring-inset max-md:ring-zinc-900/10 max-md:dark:ring-white/15')}>
                {v === BIN ? <Trash2 className="w-4 h-4 shrink-0 opacity-70" aria-hidden /> : <Folder className="w-4 h-4 shrink-0 opacity-70" aria-hidden />}
                <span className="truncate" translate={v === ALL || v === BIN ? undefined : 'no'}>{name}</span>
                <span className={cn('ms-auto ps-2 text-xs tabular-nums', view === v ? 'opacity-70' : 'text-zinc-500 dark:text-zinc-400')}>{count(v)}</span>
              </button>
            </li>
          ))}
          <li className="shrink-0">
            <button type="button" onClick={() => setNaming({ was: null, text: '' })} className="flex w-full items-center gap-2 whitespace-nowrap rounded-full md:rounded-xl px-3 h-9 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.07]">
              <FolderPlus className="w-4 h-4 shrink-0" aria-hidden />New folder
            </button>
          </li>
        </ul>
        {nameField}
        <Splitter className="hidden md:block" label="Folders width" value={panes.folders} min={140} max={360} initial={PANES.folders} onChange={(folders) => setPanes({ folders })} />
      </nav>

      {/* The list */}
      <section aria-label={viewName} className={cn('relative flex flex-col min-h-0 md:w-[var(--qn-b)] md:shrink-0 md:border-e border-zinc-900/[0.07] dark:border-white/[0.07]', reading && 'hidden md:flex')}>
        <div className="flex items-center gap-2 px-3 pt-3">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white truncate" translate={view === ALL || view === BIN ? undefined : 'no'}>{q.trim() ? 'Results' : viewName}</h2>
          {folderEdit}
          {!inBin && <button type="button" onClick={add} className="ms-auto inline-grid place-items-center w-9 h-9 shrink-0 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 transition-transform duration-150 active:scale-95" aria-label="New note" title="New note"><SquarePen className="w-[18px] h-[18px]" aria-hidden /></button>}
        </div>
        <div className="px-3 pt-2 pb-1">
          <label className="relative block">
            <span className="sr-only">Search notes</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
              className="w-full h-10 rounded-full bg-zinc-900/[0.05] dark:bg-white/[0.08] ps-9 pe-3 text-[16px] md:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-white/40" />
          </label>
        </div>
        <div className="flex-1 min-h-0 md:overflow-y-auto px-2 pb-2">
          {groups.map((g) => (
            <section key={g.name} aria-label={g.name} className="pt-3">
              <h3 className="px-2 pb-1 text-[13px] font-bold text-zinc-900 dark:text-white">{g.name}</h3>
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const done = checklistDone(n.text), on = n.id === open;
                  const row = (
                    <button type="button" onClick={() => openNote(n.id)} aria-current={on ? 'true' : undefined}
                      className={cn('w-full rounded-xl px-3 py-2 text-start transition-colors duration-150', on ? 'bg-zinc-900/[0.07] dark:bg-white/[0.1]' : 'hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05]')}>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white" translate="no">{noteTitle(n)}</span>
                        {n.pinned && !inBin && <Pin className="w-3 h-3 shrink-0 text-zinc-500" aria-label="Pinned" />}
                        {n.colour > 0 && <span className={cn('ms-auto w-2 h-2 shrink-0 rounded-full', COLOURS[n.colour]?.dot)} aria-label={COLOURS[n.colour]?.name} role="img" />}
                      </span>
                      <span className="mt-0.5 flex gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
                        <span className="shrink-0 tabular-nums">{inBin && n.deletedAt ? `${daysLeft(n.deletedAt, now)} days left` : rowTime(n.at, now)}</span>
                        <span className="truncate" translate="no">{notePreview(n) || 'No more text'}</span>
                        {done && <span className="ms-auto shrink-0 tabular-nums">{done}</span>}
                      </span>
                    </button>
                  );
                  return (
                    <li key={n.id}>
                      <SwipeRow className="bg-[var(--surface)]" start={inBin ? { label: 'Recover', icon: RotateCcw, tone: 'text-emerald-600 dark:text-emerald-400', run: () => recover(n) } : { label: n.pinned ? 'Unpin' : 'Pin', icon: n.pinned ? PinOff : Pin, tone: 'text-amber-600 dark:text-amber-400', run: () => edit(n.id, { pinned: !n.pinned }, false) }}
                        end={{ label: inBin ? 'Delete now' : 'Delete', icon: Trash2, tone: 'text-red-600 dark:text-red-400', run: () => (inBin ? forget(n) : remove(n)) }}>{row}</SwipeRow>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!shown.length && (
            <div className="px-6 py-14 text-center text-sm text-zinc-500 dark:text-zinc-400">
              <NotebookPen className="mx-auto mb-3 w-7 h-7 opacity-60" aria-hidden />
              <p>{q.trim() ? `No note has “${q.trim()}”.` : inBin ? 'Nothing deleted. Deleted notes wait here for 30 days.' : notes.some((n) => !n.deletedAt) ? 'No notes in this folder yet.' : 'No notes yet.'}</p>
              {!inBin && !q.trim() && <button type="button" onClick={add} className="btn-primary btn-sm mt-4 mx-auto"><SquarePen className="w-3.5 h-3.5" aria-hidden />Write a note</button>}
            </div>
          )}
        </div>
        <p className="px-4 py-2 text-center text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-900/[0.06] dark:border-white/[0.06]">{shown.length === 1 ? '1 note' : `${shown.length} notes`}</p>
        <Splitter className="hidden md:block" label="Notes list width" value={panes.list} min={200} max={560} initial={PANES.list} onChange={(list) => setPanes({ list })} />
      </section>

      {/* The note */}
      <div className={cn('min-h-[60vh] md:min-h-0 md:flex-1 md:min-w-0 flex-col', reading ? 'flex' : 'hidden md:flex')}>
        {cur ? (
          <NoteEditor key={cur.id} note={cur} readOnly={!!cur.deletedAt} titleCue={titleCue} folders={folders} making={making} now={now}
            onText={(text) => edit(cur.id, { text })} onBack={() => { dropIfEmpty(null); setReading(false); }}
            onPin={() => edit(cur.id, { pinned: !cur.pinned }, false)} onColour={(colour) => edit(cur.id, { colour }, false)}
            onFolder={(folder) => edit(cur.id, { folder: folder || undefined }, false)} onDoc={() => void toDoc(cur)}
            onDelete={() => remove(cur)} onRecover={() => recover(cur)} onForget={() => forget(cur)} />
        ) : (
          <div className="relative flex-1 grid place-items-center p-8 text-sm text-zinc-500 dark:text-zinc-400">
            <button type="button" onClick={() => setReading(false)} className={cn(ICON, 'md:hidden absolute start-3 top-3')} aria-label="Back to notes"><ChevronLeft className="w-5 h-5" aria-hidden /></button>
            {inBin ? 'Pick a deleted note to recover it.' : 'Pick a note, or start a new one.'}
          </div>
        )}
      </div>
      <Splitter axis="y" className="hidden md:block" label="Quick notes height" value={panes.height || 640} min={360} max={1600} initial={PANES.height} onChange={(height) => setPanes({ height })} />
    </div>
  );
}

function NoteEditor({ note, readOnly, titleCue, folders, making, now, onText, onBack, onPin, onColour, onFolder, onDoc, onDelete, onRecover, onForget }: {
  note: Note; readOnly: boolean; titleCue: { id: string; n: number } | null; folders: string[]; making: boolean; now: number;
  onText: (text: string) => void; onBack: () => void; onPin: () => void; onColour: (c: number) => void; onFolder: (f: string) => void;
  onDoc: () => void; onDelete: () => void; onRecover: () => void; onForget: () => void;
}) {
  const parsed = useMemo(() => parseNote(note.text), [note.text]);
  const title = parsed.title, lines = parsed.lines.length ? parsed.lines : [EMPTY];
  const titleRef = useRef<HTMLInputElement>(null);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const lastLine = useRef(-1); // where the caret last was, for the Checklist button
  const focus = useRef<Focus | null>(null);

  const save = (t: string, ls: Line[], next?: Focus) => { if (next) focus.current = next; onText(joinNote(t, ls)); };
  const setLine = (i: number, patch: Partial<Line>, next?: Focus) => save(title, lines.map((l, j) => (j === i ? { ...l, ...patch } : l)), next);
  const focusAt = (i: number, at: number | 'end') => {
    const el = i < 0 ? titleRef.current : refs.current[i];
    if (!el) return;
    const p = at === 'end' ? el.value.length : at;
    el.focus(); el.setSelectionRange(p, p);
  };
  // After a change that moves the caret (a new line, a merge, a paste), put it where it belongs.
  useLayoutEffect(() => {
    const f = focus.current;
    if (!f) return;
    focus.current = null;
    focusAt(f.line, f.at);
  });
  // A new note (or the compose button on an empty one) starts in the title.
  useLayoutEffect(() => { if (titleCue?.id === note.id) titleRef.current?.focus(); }, [titleCue, note.id]);
  useLayoutEffect(() => {
    if (GROWS) return;
    const fit = () => refs.current.forEach((el) => { if (el) { el.style.height = '0'; el.style.height = `${el.scrollHeight}px`; } });
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [note.text]);

  const onKey = (i: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || readOnly) return;
    const el = e.currentTarget, l = lines[i], a = el.selectionStart, b = el.selectionEnd;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setLine(i, { check: l.check === null ? false : null }, { line: i, at: a }); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (l.check !== null && !l.text) { setLine(i, { check: null }, { line: i, at: 0 }); return; } // an empty tick box ends the list
      const ls = lines.slice();
      ls.splice(i, 1, { ...l, text: l.text.slice(0, a) }, { text: l.text.slice(b), check: l.check === null ? null : false });
      save(title, ls, { line: i + 1, at: 0 });
      return;
    }
    if (a !== b) return;
    if (e.key === 'Backspace' && a === 0) {
      e.preventDefault();
      if (l.check !== null) { setLine(i, { check: null }, { line: i, at: 0 }); return; }
      const ls = lines.slice();
      ls.splice(i, 1);
      if (i === 0) { save(title + l.text, ls, { line: -1, at: title.length }); return; }
      const prev = ls[i - 1];
      ls[i - 1] = { ...prev, text: prev.text + l.text };
      save(title, ls, { line: i - 1, at: prev.text.length });
    } else if (e.key === 'ArrowUp' && a === 0) { e.preventDefault(); focusAt(i - 1, 'end'); }
    else if (e.key === 'ArrowDown' && a === l.text.length && i < lines.length - 1) { e.preventDefault(); focusAt(i + 1, 0); }
  };
  // Pasted text with line breaks becomes lines (tick boxes kept).
  const pasteAt = (before: string, after: string, pasted: string) => {
    const parts = linesOf(pasted.replace(/\r\n?/g, '\n')), rest = parts.slice(1), last = rest.length - 1, at = rest[last].text.length;
    rest[last] = { ...rest[last], text: rest[last].text + after };
    return { head: before + parts[0].text, rest, at };
  };
  const onPaste = (i: number) => (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const s = e.clipboardData.getData('text/plain');
    if (readOnly || !s.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget, l = lines[i], p = pasteAt(l.text.slice(0, el.selectionStart), l.text.slice(el.selectionEnd), s);
    const ls = lines.slice();
    ls.splice(i, 1, { ...l, text: p.head }, ...p.rest);
    save(title, ls, { line: i + p.rest.length, at: p.at });
  };
  const onTitleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || readOnly) return;
    const el = e.currentTarget, a = el.selectionStart ?? title.length, b = el.selectionEnd ?? a;
    if (e.key === 'Enter') { e.preventDefault(); save(title.slice(0, a), [{ text: title.slice(b), check: null }, ...parsed.lines], { line: 0, at: 0 }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(0, 0); }
  };
  const onTitlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const s = e.clipboardData.getData('text/plain');
    if (readOnly || !s.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget, p = pasteAt(title.slice(0, el.selectionStart ?? title.length), title.slice(el.selectionEnd ?? title.length), s);
    save(p.head, [...p.rest, ...parsed.lines], { line: p.rest.length - 1, at: p.at });
  };
  const checklist = () => {
    const i = lastLine.current;
    if (i >= 0 && i < lines.length) { setLine(i, { check: lines[i].check === null ? false : null }, { line: i, at: lines[i].text.length }); return; }
    const ls = lines.length && !lines[lines.length - 1].text && lines[lines.length - 1].check === null ? lines.slice(0, -1) : lines.slice();
    ls.push({ text: '', check: false });
    save(title, ls, { line: ls.length - 1, at: 0 });
  };
  const ticked = lines.some((l) => l.check);
  const more: MenuItem[] = [
    { heading: 'Colour' },
    ...COLOURS.map((c, i): MenuItem => ({ label: c.name, checked: note.colour === i, icon: <span className={cn('block w-3.5 h-3.5 rounded-full', c.dot)} />, onSelect: () => onColour(i) })),
    ...(folders.length ? ['sep', { heading: 'Folder' }, { label: 'No folder', checked: !note.folder || !folders.includes(note.folder), onSelect: () => onFolder('') },
      ...folders.map((f): MenuItem => ({ label: f, checked: note.folder === f, icon: <Folder className="w-4 h-4" aria-hidden />, onSelect: () => onFolder(f) }))] as MenuItem[] : []),
    'sep',
    ...(ticked ? [{ label: 'Move ticked items down', icon: <ArrowDownToLine className="w-4 h-4" aria-hidden />, onSelect: () => save(title, tickedDown(lines)) }] : []),
    { label: making ? 'Making the document…' : 'Make it a document', disabled: making, icon: <FilePlus2 className="w-4 h-4" aria-hidden />, onSelect: onDoc },
  ];
  const keep = (e: React.MouseEvent) => e.preventDefault(); // toolbar buttons leave the caret where it is

  return (
    <div className="flex flex-col min-h-0 flex-1 animate-[pop-in_180ms_var(--ease-out-soft)]">
      <div className="flex flex-wrap items-center gap-1 px-2 md:px-4 py-2 border-b border-zinc-900/[0.06] dark:border-white/[0.06]">
        <button type="button" onClick={onBack} className="md:hidden inline-flex items-center gap-0.5 h-9 pe-2 text-[15px] font-semibold text-zinc-900 dark:text-white"><ChevronLeft className="w-5 h-5" aria-hidden />Notes</button>
        {readOnly ? (
          <>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 px-2">{note.deletedAt ? `Deleted. It stays here ${daysLeft(note.deletedAt, now)} more days.` : ''}</p>
            <span className="ms-auto inline-flex gap-1.5">
              <button type="button" onClick={onRecover} className="btn-secondary btn-sm"><RotateCcw className="w-3.5 h-3.5" aria-hidden />Recover</button>
              <button type="button" onClick={onForget} className="btn-ghost btn-sm text-red-600 dark:text-red-400"><Trash2 className="w-3.5 h-3.5" aria-hidden />Delete now</button>
            </span>
          </>
        ) : (
          <>
            <span className="ms-auto inline-flex flex-wrap items-center gap-0.5">
              <button type="button" onMouseDown={keep} onClick={checklist} className={ICON} aria-label="Checklist" title="Checklist (Ctrl+Shift+L)"><ListChecks className="w-[18px] h-[18px]" aria-hidden /></button>
              <button type="button" onClick={onPin} aria-pressed={note.pinned} className={cn(ICON, note.pinned && 'text-zinc-900 dark:text-white')} aria-label={note.pinned ? 'Unpin' : 'Pin'} title={note.pinned ? 'Unpin' : 'Pin to the top'}>{note.pinned ? <PinOff className="w-[18px] h-[18px]" aria-hidden /> : <Pin className="w-[18px] h-[18px]" aria-hidden />}</button>
              <Menu label="More for this note" title="More" className={ICON} button={<Ellipsis className="w-[18px] h-[18px]" aria-hidden />} items={more} />
              <button type="button" onClick={onDelete} className={cn(ICON, 'hover:text-red-600 dark:hover:text-red-400')} aria-label="Delete note" title="Delete (kept 30 days in Recently deleted)"><Trash2 className="w-[18px] h-[18px]" aria-hidden /></button>
            </span>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget && !readOnly) focusAt(lines.length - 1, 'end'); }}>
        <div className="mx-auto max-w-[44rem] px-5 md:px-10 pt-4 pb-24" onClick={(e) => { if (e.target === e.currentTarget && !readOnly) focusAt(lines.length - 1, 'end'); }}>
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{new Date(note.at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</p>
          <input ref={titleRef} value={title} readOnly={readOnly} aria-label="Title" placeholder="Title" translate="no"
            onChange={(e) => save(e.target.value, parsed.lines)} onKeyDown={onTitleKey} onPaste={onTitlePaste} onFocus={() => { lastLine.current = -1; }}
            className="mt-3 w-full bg-transparent focus-visible:shadow-none! text-[26px] md:text-[28px] font-bold leading-tight tracking-[-0.01em] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none" />
          <div role="group" aria-label="Note" className="mt-2 space-y-0.5">
            {lines.map((l, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {l.check !== null && (
                  <button type="button" role="checkbox" aria-checked={l.check} aria-label={l.text ? `Done: ${l.text.slice(0, 60)}` : 'Done'} disabled={readOnly}
                    onMouseDown={keep} onClick={() => setLine(i, { check: !l.check })}
                    className={cn('mt-[4px] grid place-items-center w-5 h-5 shrink-0 rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-150 active:scale-90',
                      l.check ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900' : 'border-zinc-400 dark:border-zinc-500 hover:border-zinc-600 dark:hover:border-zinc-300')}>
                    {l.check && <Check className="w-3 h-3" strokeWidth={3} aria-hidden />}
                  </button>
                )}
                <textarea ref={(el) => { refs.current[i] = el; }} rows={1} value={l.text} readOnly={readOnly} translate="no"
                  aria-label={l.check === null ? `Line ${i + 1}` : `Checklist item ${i + 1}`} placeholder={lines.length === 1 && !l.text ? 'Start writing' : undefined}
                  onChange={(e) => setLine(i, { text: e.target.value.replace(/\n/g, ' ') })} onKeyDown={onKey(i)} onPaste={onPaste(i)} onFocus={() => { lastLine.current = i; }}
                  className={cn('flex-1 min-w-0 resize-none overflow-hidden bg-transparent outline-none focus-visible:shadow-none! [field-sizing:content] text-[16px] leading-[1.65] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600',
                    l.check && 'text-zinc-500 dark:text-zinc-400 line-through decoration-zinc-400/70')} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
