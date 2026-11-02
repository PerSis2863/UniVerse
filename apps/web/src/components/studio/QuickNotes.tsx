'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FilePlus2, Pin, Plus, Search, Trash2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

// Collaborate → Create → Quick notes (M68, after Apple Notes): jot things down fast. Notes are kept on
// this device (no account round trip, works offline); pin, colour and search them; a line starting
// "[ ]" is a box you can tick. "Make it a document" turns a note into a Doc to share and keep.

interface Note { id: string; text: string; pinned: boolean; colour: number; at: number }
const KEY = 'uv-quick-notes';
const COLOURS = ['', 'bg-amber-100 dark:bg-amber-400/15', 'bg-sky-100 dark:bg-sky-400/15', 'bg-emerald-100 dark:bg-emerald-400/15', 'bg-pink-100 dark:bg-pink-400/15'];
const load = (): Note[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Note[]; } catch { return []; } };
const title = (n: Note) => n.text.split('\n')[0].replace(/^\[[ x]\]\s*/, '').trim() || 'New note';

export function QuickNotes() {
  // Loaded in the browser only (the Create page opens this with ssr: false).
  const [notes, setNotes] = useState<Note[]>(load);
  const [open, setOpen] = useState<string | null>(() => notes[0]?.id ?? null);
  const [q, setQ] = useState('');
  const router = useRouter();
  const put = (next: Note[]) => { setNotes(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { toast.error('This browser didn’t keep the note (private window?).'); } };
  const edit = (id: string, patch: Partial<Note>) => put(notes.map((n) => (n.id === id ? { ...n, ...patch, at: Date.now() } : n)));
  const add = () => { const n: Note = { id: crypto.randomUUID(), text: '', pinned: false, colour: 0, at: Date.now() }; put([n, ...notes]); setOpen(n.id); };
  const shown = useMemo(() => notes.filter((n) => n.text.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at), [notes, q]);
  const cur = notes.find((n) => n.id === open) ?? null;
  const toDoc = async (n: Note) => {
    try {
      const d = await authedJson<{ id: string }>('/api/docs', { method: 'POST', body: JSON.stringify({ title: title(n), kind: 'doc' }) });
      try { await navigator.clipboard.writeText(n.text); } catch { /* the note stays here */ }
      toast.success('Document made. The note is copied: paste it in.', { action: { label: 'Open', onClick: () => router.push(`/docs/${d.id}`) } });
    } catch { toast.error('The document couldn’t be made.'); }
  };
  const lines = cur?.text.split('\n') ?? [];
  const toggle = (i: number) => cur && edit(cur.id, { text: lines.map((l, j) => (j === i ? (l.startsWith('[x]') ? l.replace('[x]', '[ ]') : l.replace('[ ]', '[x]')) : l)).join('\n') });

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr] min-h-[420px]">
      <div className="space-y-2 min-w-0">
        <div className="flex gap-2">
          <label className="relative flex-1"><span className="sr-only">Search notes</span><Search className="absolute start-2.5 top-2.5 w-4 h-4 text-zinc-400" aria-hidden /><input className="input ps-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></label>
          <button type="button" onClick={add} className="btn-primary px-3" aria-label="New note"><Plus className="w-4 h-4" aria-hidden /></button>
        </div>
        <ul className="space-y-1 max-h-[480px] overflow-y-auto">
          {shown.map((n) => (
            <li key={n.id}><button type="button" onClick={() => setOpen(n.id)} aria-current={n.id === open} className={cn('w-full rounded-xl px-3 py-2 text-start', COLOURS[n.colour], n.id === open ? 'ring-2 ring-pink-500' : 'hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05]')}>
              <span className="flex items-center gap-1 text-sm font-semibold text-zinc-900 dark:text-white truncate">{n.pinned && <Pin className="w-3 h-3 shrink-0" aria-label="Pinned" />}<span className="truncate" translate="no">{title(n)}</span></span>
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{new Date(n.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </button></li>
          ))}
          {!shown.length && <li className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{notes.length ? 'No note has that.' : 'No notes yet. Press + to write one.'}</li>}
        </ul>
      </div>
      {cur ? (
        <div className={cn('rounded-2xl p-3 space-y-2 min-w-0', COLOURS[cur.colour] || 'bg-zinc-50 dark:bg-white/[0.03]')}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={cur.pinned} onClick={() => edit(cur.id, { pinned: !cur.pinned })} className="btn-secondary btn-sm"><Pin className="w-3.5 h-3.5" aria-hidden />{cur.pinned ? 'Unpin' : 'Pin'}</button>
            <button type="button" onClick={() => edit(cur.id, { text: `${cur.text}${cur.text && !cur.text.endsWith('\n') ? '\n' : ''}[ ] ` })} className="btn-secondary btn-sm">Add a tick box</button>
            <div className="flex gap-1" role="radiogroup" aria-label="Colour">{COLOURS.map((c, i) => <button key={i} type="button" role="radio" aria-checked={cur.colour === i} aria-label={['No colour', 'Yellow', 'Blue', 'Green', 'Pink'][i]} onClick={() => edit(cur.id, { colour: i })} className={cn('w-6 h-6 rounded-full ring-1 ring-black/10', c || 'bg-white dark:bg-zinc-800', cur.colour === i && 'ring-2 ring-pink-500')} />)}</div>
            <button type="button" onClick={() => void toDoc(cur)} className="btn-secondary btn-sm ms-auto"><FilePlus2 className="w-3.5 h-3.5" aria-hidden />Make it a document</button>
            <button type="button" aria-label="Delete this note" onClick={() => { put(notes.filter((n) => n.id !== cur.id)); setOpen(null); }} className="btn-secondary btn-sm"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
          </div>
          <textarea aria-label="Note" autoFocus value={cur.text} onChange={(e) => edit(cur.id, { text: e.target.value })} placeholder="Start writing. A line beginning [ ] becomes a tick box." className="w-full min-h-[220px] resize-y bg-transparent text-[15px] leading-relaxed text-zinc-900 dark:text-white outline-none" translate="no" />
          {lines.some((l) => /^\[[ x]\]/.test(l)) && (
            <ul className="space-y-1 border-t border-black/5 dark:border-white/10 pt-2">
              {lines.map((l, i) => (/^\[[ x]\]/.test(l) ? <li key={i}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.startsWith('[x]')} onChange={() => toggle(i)} className="accent-pink-500" /><span className={cn(l.startsWith('[x]') && 'line-through text-zinc-500')} translate="no">{l.slice(3).trim() || '…'}</span></label></li> : null))}
            </ul>
          )}
        </div>
      ) : <div className="grid place-items-center text-sm text-zinc-500 dark:text-zinc-400">Pick a note, or press + for a new one.</div>}
    </div>
  );
}
