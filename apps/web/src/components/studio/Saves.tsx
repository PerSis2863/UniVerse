'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Check, CloudUpload, FolderOpen, Link2, Link2Off, Loader2, Pencil, Trash2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { keptNow } from './kept';

// Saved work in Collaborate → Create (M75): a tool's work saved to the account (so it's on every
// device), opened again, renamed, shared read-only by link, or deleted. Server: /api/collab/saves.

export interface SaveRow { id: string; tool: string; title: string; updatedAt: string; shared: boolean }
export interface Current { id: string; tool: string; title: string }

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const linkFor = (token: string) => `${location.origin}/studio?shared=${token}`;
async function copyText(t: string) { try { await navigator.clipboard.writeText(t); return true; } catch { window.prompt('Copy this link:', t); return false; } }

/** The saves list, shared by the shelf and the tool bar; refreshed after every change. */
let cache: SaveRow[] | null = null;
const subs = new Set<(s: SaveRow[]) => void>();
async function refresh() {
  try { cache = (await authedJson<{ saves: SaveRow[] }>('/api/collab/saves')).saves; subs.forEach((f) => f(cache!)); } catch { /* signed out or offline: keep what we have */ }
}
export function useSaves() {
  const [list, setList] = useState<SaveRow[] | null>(cache);
  useEffect(() => { subs.add(setList); if (!cache) void refresh(); return () => { subs.delete(setList); }; }, []);
  return list;
}

/** Writes a save's data onto this device (the tool's own keys), ready for the tool to open it. */
export async function loadSave(id: string): Promise<Current | null> {
  try {
    const { save } = await authedJson<{ save: { id: string; tool: string; title: string; data: Record<string, string> } }>(`/api/collab/saves/${id}`);
    for (const [k, v] of Object.entries(save.data)) localStorage.setItem(k, v);
    return { id: save.id, tool: save.tool, title: save.title };
  } catch (e) { toast.error((e as Error).message || 'That save couldn’t be opened.'); return null; }
}

async function share(id: string) {
  const { token } = await authedJson<{ token: string }>(`/api/collab/saves/${id}/share`, json({}));
  const copied = await copyText(linkFor(token));
  toast.success(copied ? 'Link copied: anyone with it (signed in) can see this, read-only.' : 'Link made.');
  void refresh();
}

/** Save and Share in a tool's bar: the first save asks for a name; later ones save over it. */
export function SaveButtons({ tool, toolName, current, onSaved }: { tool: string; toolName: string; current: Current | null; onSaved: (c: Current) => void }) {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1500); return () => clearTimeout(t); }, [done]);
  const mine = current?.tool === tool ? current : null;
  const save = async (asNew = false) => {
    const data = keptNow();
    if (!Object.keys(data).length) { toast.error('This tool has nothing to save: it keeps no work.'); return null; }
    setBusy(true);
    try {
      if (mine && !asNew) {
        await authedJson(`/api/collab/saves/${mine.id}`, { method: 'PUT', body: JSON.stringify({ data }), headers: { 'Content-Type': 'application/json' } });
        setDone(true); void refresh(); return mine;
      }
      const title = window.prompt('Name this work', `${toolName} · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`);
      if (title === null) return null;
      const { save: row } = await authedJson<{ save: SaveRow }>('/api/collab/saves', json({ tool, title, data }));
      const c = { id: row.id, tool, title: row.title };
      onSaved(c); setDone(true); void refresh(); return c;
    } catch (e) { toast.error((e as Error).message || 'Not saved.'); return null; }
    finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={() => void save()} disabled={busy} title={mine ? `Save over “${mine.title}”` : 'Save to your account, to open it on any device'} className="btn-secondary btn-sm">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : done ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden /> : <CloudUpload className="w-3.5 h-3.5" aria-hidden />}
        <span aria-live="polite">{done ? 'Saved' : mine ? 'Save' : 'Save to account'}</span>
      </button>
      <button type="button" disabled={busy} onClick={async () => { const c = mine ?? (await save()); if (c) await share(c.id).catch((e) => toast.error((e as Error).message)); }} className="btn-secondary btn-sm"><Link2 className="w-3.5 h-3.5" aria-hidden />Share</button>
    </>
  );
}

/** Saved work on Create's list: open, rename, share or stop sharing, delete. */
export function SavedShelf({ onOpen, names }: { onOpen: (id: string) => void; names: Record<string, string> }) {
  const list = useSaves();
  const [all, setAll] = useState(false);
  if (!list?.length) return null;
  const shown = all ? list : list.slice(0, 6);
  const act = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { toast.error((e as Error).message); } void refresh(); };
  return (
    <section aria-labelledby="saved-h">
      <h2 id="saved-h" className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">Saved to your account <span className="font-normal text-zinc-600 dark:text-zinc-300 tabular-nums">· {list.length}</span></h2>
      <ul className="divide-y divide-zinc-200 dark:divide-white/10 rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 overflow-hidden">
        <AnimatePresence initial={false}>
          {shown.map((s) => (
            <motion.li key={s.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={spring.smooth} className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => onOpen(s.id)} className="flex-1 min-w-0 text-start py-1">
                <span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.title}</span>
                <span className="block text-xs text-zinc-600 dark:text-zinc-300">{names[s.tool] ?? s.tool} · {new Date(s.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{s.shared ? ' · shared by link' : ''}</span>
              </button>
              <button type="button" onClick={() => onOpen(s.id)} className="btn-ghost btn-icon" title="Open"><FolderOpen className="w-4 h-4" aria-hidden /><span className="sr-only">Open {s.title}</span></button>
              <button type="button" onClick={() => { const t = window.prompt('New name', s.title); if (t?.trim()) void act(() => authedJson(`/api/collab/saves/${s.id}`, { method: 'PUT', body: JSON.stringify({ title: t }), headers: { 'Content-Type': 'application/json' } })); }} className="btn-ghost btn-icon" title="Rename"><Pencil className="w-4 h-4" aria-hidden /><span className="sr-only">Rename {s.title}</span></button>
              {s.shared
                ? <button type="button" onClick={() => void act(async () => { await authedJson(`/api/collab/saves/${s.id}/share`, { method: 'DELETE' }); toast.success('Sharing stopped: the link no longer works.'); })} className="btn-ghost btn-icon text-pink-600 dark:text-pink-300" title="Stop sharing"><Link2Off className="w-4 h-4" aria-hidden /><span className="sr-only">Stop sharing {s.title}</span></button>
                : <button type="button" onClick={() => void act(() => share(s.id))} className="btn-ghost btn-icon" title="Share by link"><Link2 className="w-4 h-4" aria-hidden /><span className="sr-only">Share {s.title}</span></button>}
              <button type="button" onClick={() => { if (window.confirm(`Delete “${s.title}”? It can’t be brought back.`)) void act(() => authedJson(`/api/collab/saves/${s.id}`, { method: 'DELETE' })); }} className="btn-ghost btn-icon" title="Delete"><Trash2 className="w-4 h-4" aria-hidden /><span className="sr-only">Delete {s.title}</span></button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {list.length > 6 && <button type="button" onClick={() => setAll(!all)} className={cn('mt-2 text-sm font-semibold text-indigo-700 dark:text-aqua-300 hover:underline')}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
    </section>
  );
}

export interface Shared { tool: string; title: string; data: Record<string, string>; by: string; updatedAt: string }
/** Reads a shared link and writes its data into its own scope on this device ("shared:<token>:"). */
export async function loadShared(token: string): Promise<Shared> {
  const { shared } = await authedJson<{ shared: Shared }>(`/api/collab/shared/${encodeURIComponent(token)}`);
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('shared:') && !k.startsWith(`shared:${token}:`)) localStorage.removeItem(k); }
  for (const [k, v] of Object.entries(shared.data)) localStorage.setItem(`shared:${token}:${k}`, v);
  return shared;
}
/** Makes the shared copy (with any changes made to it here) this person's own, on this device. */
export function keepShared(token: string) {
  const now = keptNow();
  for (const [k, v] of Object.entries(now)) localStorage.setItem(k, v);
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(`shared:${token}:`)) localStorage.removeItem(k); }
}
