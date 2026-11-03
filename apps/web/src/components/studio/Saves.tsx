'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { BookOpen, Check, CloudUpload, Eye, FolderOpen, Link2, Link2Off, Loader2, Pencil, Trash2, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/auth';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { keptNow, type KeptSync } from './kept';

const ToCourse = dynamic(() => import('./ToCourse').then((x) => x.ToCourse), { ssr: false });

// Saved work in Collaborate → Create (M75): a tool's work saved to the account (so it's on every
// device), opened again, renamed, shared read-only by link, or deleted. Server: /api/collab/saves.

export interface SaveRow { id: string; tool: string; title: string; updatedAt: string; shared: boolean; editing?: boolean }
export interface Current { id: string; tool: string; title: string; editToken?: string | null }

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
// M76: a view link opens for anyone (no sign-in) at /s/<token>; an edit link opens live editing in Create.
const linkFor = (token: string, mode: 'view' | 'edit') => (mode === 'edit' ? `${location.origin}/studio?edit=${token}` : `${location.origin}/s/${token}`);
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
    const { save } = await authedJson<{ save: { id: string; tool: string; title: string; data: Record<string, string>; editToken?: string | null } }>(`/api/collab/saves/${id}`);
    // Shared for editing: it opens live (everyone's changes), not as a copy on this device.
    if (!save.editToken) for (const [k, v] of Object.entries(save.data)) localStorage.setItem(k, v);
    return { id: save.id, tool: save.tool, title: save.title, editToken: save.editToken };
  } catch (e) { toast.error((e as Error).message || 'That save couldn’t be opened.'); return null; }
}

/** Makes (or reuses) a save's link; its full address. */
export async function linkOf(id: string, mode: 'view' | 'edit') {
  const { token } = await authedJson<{ token: string }>(`/api/collab/saves/${id}/share`, json({ mode }));
  void refresh();
  return linkFor(token, mode);
}

export async function share(id: string, mode: 'view' | 'edit') {
  const { token } = await authedJson<{ token: string }>(`/api/collab/saves/${id}/share`, json({ mode }));
  const copied = await copyText(linkFor(token, mode));
  toast.success(copied ? (mode === 'edit' ? 'Edit link copied: signed-in people with it edit this with you, live.' : 'View link copied: anyone with it can see this (no sign-in), read-only.') : 'Link made.');
  void refresh();
  return token;
}

/** Share: a small menu with the two kinds of link. */
function ShareMenu({ onPick, disabled, onCourse }: { onPick: (mode: 'view' | 'edit') => void; disabled?: boolean; onCourse?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="btn-secondary btn-sm"><Link2 className="w-3.5 h-3.5" aria-hidden />Share</button>
      <AnimatePresence>{open && (
        <motion.div role="menu" initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }} transition={spring.snappy} style={{ transformOrigin: 'top right' }}
          className="absolute end-0 top-full z-30 mt-1.5 w-72 rounded-2xl bg-white dark:bg-indigo-900 p-1.5 shadow-xl ring-1 ring-black/10 dark:ring-white/10">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick('view'); }} className="flex w-full items-start gap-2 rounded-xl p-2.5 text-start hover:bg-zinc-100 dark:hover:bg-white/10"><Eye className="mt-0.5 w-4 h-4 shrink-0 text-indigo-600 dark:text-aqua-300" aria-hidden /><span><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Copy a view link</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">Anyone can open it, no sign-in. Read-only, updates by itself.</span></span></button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick('edit'); }} className="flex w-full items-start gap-2 rounded-xl p-2.5 text-start hover:bg-zinc-100 dark:hover:bg-white/10"><Users className="mt-0.5 w-4 h-4 shrink-0 text-pink-600 dark:text-pink-300" aria-hidden /><span><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Copy an edit link</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">Signed-in people edit it with you, live.</span></span></button>
          {onCourse && <button type="button" role="menuitem" onClick={() => { setOpen(false); onCourse(); }} className="flex w-full items-start gap-2 rounded-xl p-2.5 text-start hover:bg-zinc-100 dark:hover:bg-white/10"><BookOpen className="mt-0.5 w-4 h-4 shrink-0 text-indigo-600 dark:text-aqua-300" aria-hidden /><span><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Add to a course</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">A read-only link in one of your course’s modules.</span></span></button>}
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}

/** Save and Share in a tool's bar: the first save asks for a name; later ones save over it. */
export function SaveButtons({ tool, toolName, current, onSaved }: { tool: string; toolName: string; current: Current | null; onSaved: (c: Current) => void }) {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const [toCourse, setToCourse] = useState<Current | null>(null);
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
      <ShareMenu disabled={busy} onPick={async (mode) => { const c = mine ?? (await save()); if (c) await share(c.id, mode).catch((e) => toast.error((e as Error).message)); }}
        onCourse={role === 'TEACHER' || role === 'ADMIN' ? async () => { const c = mine ?? (await save()); if (c) setToCourse(c); } : undefined} />
      {toCourse && <ToCourse title={toCourse.title} onClose={() => setToCourse(null)} viewLink={() => linkOf(toCourse.id, 'view').catch((e) => { toast.error((e as Error).message); return null; })} />}
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
                <span className="block text-xs text-zinc-600 dark:text-zinc-300">{names[s.tool] ?? s.tool} · {new Date(s.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{s.editing ? ' · editing together' : s.shared ? ' · view link on' : ''}</span>
              </button>
              <button type="button" onClick={() => onOpen(s.id)} className="btn-ghost btn-icon" title="Open"><FolderOpen className="w-4 h-4" aria-hidden /><span className="sr-only">Open {s.title}</span></button>
              <button type="button" onClick={() => { const t = window.prompt('New name', s.title); if (t?.trim()) void act(() => authedJson(`/api/collab/saves/${s.id}`, { method: 'PUT', body: JSON.stringify({ title: t }), headers: { 'Content-Type': 'application/json' } })); }} className="btn-ghost btn-icon" title="Rename"><Pencil className="w-4 h-4" aria-hidden /><span className="sr-only">Rename {s.title}</span></button>
              <button type="button" onClick={() => void act(() => share(s.id, 'view'))} className="btn-ghost btn-icon" title="Copy a view link (anyone, no sign-in)"><Eye className="w-4 h-4" aria-hidden /><span className="sr-only">View link for {s.title}</span></button>
              <button type="button" onClick={() => void act(() => share(s.id, 'edit'))} className="btn-ghost btn-icon" title="Copy an edit link (live, signed in)"><Users className="w-4 h-4" aria-hidden /><span className="sr-only">Edit link for {s.title}</span></button>
              {(s.shared || s.editing) && <button type="button" onClick={() => void act(async () => { await authedJson(`/api/collab/saves/${s.id}/share`, { method: 'DELETE' }); toast.success('Sharing stopped: the links no longer work.'); })} className="btn-ghost btn-icon text-pink-600 dark:text-pink-300" title="Stop sharing"><Link2Off className="w-4 h-4" aria-hidden /><span className="sr-only">Stop sharing {s.title}</span></button>}
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

export interface Live { tool: string; title: string; data: Record<string, string>; version: number; by: string; mine: boolean; with: string[] }
/**
 * Live editing (M76): the work behind an edit link, kept in step. Other people's changes arrive by the
 * realtime refresh (or every few seconds without it) and are handed to the open tool's useKept parts;
 * this person's changes are sent part by part. A part changed here in the last two seconds isn't
 * overwritten by an older copy coming back.
 */
export function useLive(token: string | null) {
  const scope = token ? `live:${token}:` : '';
  const [ready, setReady] = useState(false);
  const subs = useRef(new Map<string, Set<(json: string) => void>>());
  const localAt = useRef(new Map<string, number>());
  const interval = useLiveInterval(3000, 60_000);
  const { data, error } = useSWR<{ live: Live }>(token ? `/api/collab/live/${token}` : null, (u: string) => authedJson<{ live: Live }>(u), {
    refreshInterval: interval,
    revalidateOnFocus: true,
    onSuccess: ({ live }) => {
      const now = Date.now();
      for (const [k, v] of Object.entries(live.data)) {
        if (now - (localAt.current.get(k) ?? 0) < 2000) continue;
        if (localStorage.getItem(scope + k) !== v) { try { localStorage.setItem(scope + k, v); } catch { /* full */ } subs.current.get(k)?.forEach((f) => f(v)); }
      }
      setReady(true);
    },
  });
  const sync = useMemo<KeptSync | null>(() => (token ? {
    push(key, value) {
      localAt.current.set(key, Date.now());
      void authedFetch(`/api/collab/live/${token}`, { method: 'PUT', body: JSON.stringify({ key, value }), headers: { 'Content-Type': 'application/json' } })
        .then(async (r) => { if (!r.ok) toast.error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'That change wasn’t saved.'); })
        .catch(() => toast.error('Offline: that change wasn’t saved.'));
    },
    sub(key, cb) {
      const set = subs.current.get(key) ?? new Set();
      set.add(cb); subs.current.set(key, set);
      return () => { set.delete(cb); };
    },
  } : null), [token]);
  return { live: data?.live ?? null, ready, sync, scope, error: error ? (error as Error).message || 'This edit link doesn’t open.' : null };
}
