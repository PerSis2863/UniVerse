'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { Check, Crosshair, History, Loader2, MessageSquarePlus, RotateCcw, Save, Send, Trash2, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { Sheet } from '@/components/chat/ChatDialogs';
import { Avatar } from '@/components/chat/MessageBubble';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { BoardControls } from './BoardCanvas';

// Boards (Stage 4 · 3.4, part 3; src/server/board-extras.ts): comments on shapes, and versions.

interface Comment { id: string; elementId: string; body: string; resolvedAt: string | null; createdAt: string; canResolve: boolean; user: { id: string; name: string; avatar: string | null } }
/** What the panels need from the board (functions read it when called). */
export interface BoardApi {
  selected(): string | null;
  labelOf(elementId: string): string | null;
  focus(elementId: string): void;
  elements(): ReturnType<BoardControls['elements']>;
  restore(elements: Parameters<BoardControls['restore']>[0]): void;
}

const ago = (d: string) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });

export function useBoardComments(boardId: string) {
  return useSWR<{ comments: Comment[] }>(`/api/boards/${boardId}/comments`, authedJson, { revalidateOnFocus: false });
}

/** Comment threads, one per shape: comment on the selected shape, reply, resolve, jump to it. */
export function BoardComments({ boardId, controls, onClose, meId }: { boardId: string; controls: BoardApi; onClose: () => void; meId: string | null }) {
  const { data, mutate } = useBoardComments(boardId);
  // What's selected on the board when the panel opens (again on "use the selection").
  const [selected, setSelected] = useState<string | null>(() => controls.selected());
  const [text, setText] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const threads = new Map<string, Comment[]>();
  for (const c of data?.comments ?? []) threads.set(c.elementId, [...(threads.get(c.elementId) ?? []), c]);
  const list = [...threads.entries()]
    .filter(([, cs]) => showResolved || cs.some((c) => !c.resolvedAt))
    .sort((a, b) => +new Date(b[1][b[1].length - 1].createdAt) - +new Date(a[1][a[1].length - 1].createdAt));

  const post = async (elementId: string) => {
    const body = (text[elementId] ?? '').trim();
    if (!body) return;
    setBusy(elementId);
    try {
      await authedJson(`/api/boards/${boardId}/comments`, { method: 'POST', body: JSON.stringify({ elementId, body }) });
      setText((t) => ({ ...t, [elementId]: '' }));
      await mutate();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const change = async (c: Comment, body: Record<string, unknown> | null) => {
    try { await authedJson(`/api/boards/comments/${c.id}`, body ? { method: 'PATCH', body: JSON.stringify(body) } : { method: 'DELETE' }); await mutate(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const composer = (elementId: string, placeholder: string) => (
    <div className="flex gap-2 mt-2">
      <input value={text[elementId] ?? ''} onChange={(e) => setText((t) => ({ ...t, [elementId]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && void post(elementId)} maxLength={1000} placeholder={placeholder} aria-label="Comment"
        className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
      <button type="button" aria-label="Send" disabled={busy === elementId || !(text[elementId] ?? '').trim()} onClick={() => void post(elementId)} className="btn-primary btn-sm">{busy === elementId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}</button>
    </div>
  );

  return (
    <motion.aside initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={spring.smooth}
      className="absolute right-3 top-3 bottom-3 z-30 w-[min(22rem,calc(100%-1.5rem))] flex flex-col rounded-2xl bg-white/95 dark:bg-[#121830]/95 border border-zinc-200 dark:border-white/10 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-zinc-200/70 dark:border-white/[0.07]">
        <p className="font-semibold text-sm text-zinc-900 dark:text-white flex-1">Comments</p>
        <button type="button" onClick={() => setShowResolved((v) => !v)} className="text-xs text-zinc-500 hover:text-indigo-500">{showResolved ? 'Hide resolved' : 'Show resolved'}</button>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-xl bg-indigo-500/[0.06] p-3">
          {selected && !threads.has(selected) ? (
            <>
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5"><MessageSquarePlus className="w-3.5 h-3.5" />On “{controls.labelOf(selected) ?? 'the selected shape'}”</p>
              {composer(selected, 'Comment… (@name to notify)')}
            </>
          ) : (
            <p className="text-xs text-zinc-500">Select a shape on the board, then <button type="button" onClick={() => setSelected(controls.selected() ?? null)} className="font-semibold text-indigo-600 dark:text-indigo-300">use the selection</button> to comment on it.</p>
          )}
        </div>
        {!data ? <div className="h-20 rounded-xl skeleton" /> : list.length === 0 ? <p className="text-sm text-zinc-500 px-1">No comments yet.</p> : (
          <AnimatePresence initial={false}>
            {list.map(([elementId, cs]) => {
              const open = cs.some((c) => !c.resolvedAt);
              return (
                <motion.div key={elementId} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className={cn('rounded-xl border p-3', open ? 'border-zinc-200 dark:border-white/10' : 'border-dashed border-zinc-200 dark:border-white/10 opacity-70')}>
                  <button type="button" onClick={() => controls.focus(elementId)} className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:text-indigo-500"><Crosshair className="w-3.5 h-3.5" />{controls.labelOf(elementId) ?? 'A deleted shape'}</button>
                  <ul className="mt-2 space-y-2">
                    {cs.map((c) => (
                      <li key={c.id} className="flex gap-2">
                        <Avatar name={c.user.name} src={c.user.avatar} size={24} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-zinc-500"><span className="font-semibold text-zinc-800 dark:text-zinc-100">{c.user.name.split(' ')[0]}</span> · {ago(c.createdAt)}</p>
                          <p className="text-sm text-zinc-700 dark:text-zinc-200 break-words whitespace-pre-line">{c.body}</p>
                        </div>
                        {c.user.id === meId && <button type="button" aria-label="Delete comment" onClick={() => void (async () => { if (await confirmDialog({ title: 'Delete this comment?', destructive: true, confirmLabel: 'Delete' })) await change(c, null); })()} className="p-1 text-zinc-300 hover:text-rose-500 self-start"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </li>
                    ))}
                  </ul>
                  {open && composer(elementId, 'Reply…')}
                  {cs[cs.length - 1].canResolve && (
                    <button type="button" onClick={() => void Promise.all(cs.filter((c) => (open ? !c.resolvedAt : true)).map((c) => change(c, { resolved: open })))} className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />{open ? 'Resolve' : 'Reopen'}</button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.aside>
  );
}

/** Saved versions: save now (named), the list, restore. */
export function BoardVersions({ boardId, controls, canEdit, onClose }: { boardId: string; controls: BoardApi; canEdit: boolean; onClose: () => void }) {
  const { data, mutate } = useSWR<{ versions: { id: string; name: string | null; count: number; at: string; by: string }[] }>(`/api/boards/${boardId}/versions`, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const save = async () => {
    const name = (await promptDialog({ title: 'Save this version', placeholder: 'e.g. Before the workshop', confirmLabel: 'Save', maxLength: 80 }))?.trim();
    if (name === undefined) return;
    setBusy('save');
    try { await authedJson(`/api/boards/${boardId}/versions`, { method: 'POST', body: JSON.stringify({ elements: controls.elements(), name: name || 'Saved version' }) }); await mutate(); toast.success('Version saved'); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const restore = async (id: string) => {
    if (!(await confirmDialog({ title: 'Restore this version?', message: 'The board goes back to how it was, for everyone. The current board is saved as a version first.', confirmLabel: 'Restore' }))) return;
    setBusy(id);
    try {
      await authedJson(`/api/boards/${boardId}/versions`, { method: 'POST', body: JSON.stringify({ elements: controls.elements(), name: 'Before restoring' }) });
      const v = await authedJson<{ elements: Parameters<BoardControls['restore']>[0] }>(`/api/boards/versions/${id}`);
      controls.restore(v.elements);
      await mutate();
      toast.success('Restored');
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Sheet title="Versions" onClose={onClose} footer={canEdit ? <button type="button" onClick={() => void save()} disabled={!!busy} className="btn-primary w-full">{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save this version</button> : undefined}>
      {!data ? <div className="h-24 rounded-xl skeleton" /> : data.versions.length === 0 ? (
        <p className="text-sm text-zinc-500">No versions yet. While people draw, the board is saved every 10 minutes.</p>
      ) : (
        <ul className="space-y-2">
          {data.versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3">
              <History className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{v.name ?? 'Automatic save'}</span>
                <span className="block text-xs text-zinc-500">{ago(v.at)} · {v.by} · {v.count} {v.count === 1 ? 'shape' : 'shapes'}</span>
              </span>
              {canEdit && <button type="button" onClick={() => void restore(v.id)} disabled={!!busy} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">{busy === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}Restore</button>}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
