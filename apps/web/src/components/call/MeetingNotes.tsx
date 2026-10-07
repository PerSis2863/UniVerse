'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarCheck, Check, CheckCircle2, Clock, ListTodo, Loader2, NotebookPen, Plus, Sparkles, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Meeting notes for a call (Stage 4 · 2.8; src/server/meeting-notes.ts): the card in the chat they
// were posted to, and a sheet that opens them from Calls or a notification. Each action item can go
// into my tasks (which feed my study planner).

export interface ActionItem { text: string; who: string; due: string }
export interface NotesCardData { id: string; title: string; summary: string | null; decisions: string[]; actions: ActionItem[]; durationSec?: number }

const dueText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const minutes = (s?: number) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');

/** The decisions and action items, with "Add to my tasks" on each action. */
function NotesBody({ n, mine }: { n: NotesCardData; mine: boolean }) {
  const [added, setAdded] = useState<Record<number, 'busy' | 'done'>>({});
  const add = async (i: number) => {
    setAdded((a) => ({ ...a, [i]: 'busy' }));
    try {
      const r = await authedJson<{ already: boolean }>(`/api/meeting-notes/${n.id}/tasks`, { method: 'POST', body: JSON.stringify({ index: i }) });
      setAdded((a) => ({ ...a, [i]: 'done' }));
      toast.success(r.already ? 'Already in your tasks' : 'Added to your tasks (board “From meetings”)');
    } catch (e) {
      setAdded((a) => { const { [i]: _drop, ...rest } = a; void _drop; return rest; });
      toast.error((e as Error).message);
    }
  };
  const sub = mine ? 'text-white/75' : 'text-zinc-500';
  return (
    <>
      {n.summary && <p className="text-sm leading-relaxed">{n.summary}</p>}
      {n.decisions.length > 0 && (
        <div>
          <p className={cn('text-[11px] font-bold uppercase tracking-wide mb-1', sub)}>Decided</p>
          <ul className="space-y-1">
            {n.decisions.map((d, i) => <li key={i} className="text-sm flex gap-2"><CheckCircle2 className={cn('w-4 h-4 mt-0.5 shrink-0', mine ? 'text-white/80' : 'text-sky-600')} />{d}</li>)}
          </ul>
        </div>
      )}
      {n.actions.length > 0 && (
        <div>
          <p className={cn('text-[11px] font-bold uppercase tracking-wide mb-1', sub)}>To do</p>
          <ul className="space-y-1.5">
            {n.actions.map((a, i) => (
              <li key={i} className={cn('flex items-start gap-2 rounded-xl px-2.5 py-2', mine ? 'bg-white/10' : 'bg-zinc-100/80 dark:bg-white/[0.05]')}>
                <ListTodo className={cn('w-4 h-4 mt-0.5 shrink-0', mine ? 'text-white/80' : 'text-indigo-500')} />
                <span className="flex-1 min-w-0 text-sm">
                  {a.text}
                  {(a.who || a.due) && (
                    <span className={cn('flex flex-wrap gap-x-2 text-[11px] mt-0.5', sub)}>
                      {a.who && <span>{a.who}</span>}
                      {a.due && <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />{dueText(a.due)}</span>}
                    </span>
                  )}
                </span>
                <button type="button" onClick={() => void add(i)} disabled={!!added[i]} aria-label={`Add “${a.text}” to my tasks`} title="Add to my tasks"
                  className={cn('shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors', added[i] === 'done' ? (mine ? 'bg-white text-indigo-600' : 'bg-sky-600 text-white') : mine ? 'bg-white/20 hover:bg-white/30' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20')}>
                  {added[i] === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : added[i] === 'done' ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** In the chat: the notes as a card. */
export function MeetingNotesCard({ notes, mine }: { notes: NotesCardData; mine: boolean }) {
  return (
    <div className="p-3 w-80 max-w-full space-y-2.5">
      <p className="font-bold flex items-start gap-2"><NotebookPen className="w-4 h-4 mt-0.5 shrink-0" /><span className="min-w-0">{notes.title}</span></p>
      <p className={cn('text-[11px] -mt-1.5', mine ? 'text-white/70' : 'text-zinc-500')}>Meeting notes{notes.durationSec ? ` · ${minutes(notes.durationSec)} call` : ''}</p>
      <NotesBody n={notes} mine={mine} />
      <p className={cn('text-[10px] flex items-center gap-1', mine ? 'text-white/60' : 'text-zinc-400')}><Sparkles className="w-3 h-3" /> Made by AI from the call’s live captions. It can miss or mishear words.</p>
    </div>
  );
}

interface FullNote extends NotesCardData { callId: string; kind: string; startedAt: string; status: 'READY' | 'PENDING'; chapters: { t: number; title: string }[]; canRetry: boolean }

/** From Calls or a notification: one call's notes. */
export function MeetingNotesSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, mutate } = useSWR<FullNote>(`/api/meeting-notes/${id}`, (url: string) => authedJson<FullNote>(url));
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try { await authedJson(`/api/meeting-notes/${id}/retry`, { method: 'POST' }); toast.success('Notes made and shared.'); await mutate(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <motion.div role="dialog" aria-modal="true" aria-label="Meeting notes" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121830] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5 space-y-3 shadow-2xl text-zinc-900 dark:text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold flex items-center gap-2"><NotebookPen className="w-4 h-4 text-indigo-500 shrink-0" /><span className="truncate">{data?.title ?? 'Meeting notes'}</span></p>
            {data && <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1"><CalendarCheck className="w-3 h-3" />{new Date(data.startedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{data.durationSec ? ` · ${minutes(data.durationSec)}` : ''}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        {error ? <p className="text-sm text-zinc-500">{(error as Error).message}</p>
          : !data ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-2xl skeleton" />)}</div>
          : data.status === 'PENDING' ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm">
              The call’s words were saved, but AI wasn’t available when it ended.
              {data.canRetry && <button type="button" onClick={() => void retry()} disabled={busy} className="mt-3 btn-primary btn-sm rounded-full inline-flex">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Make notes</button>}
            </div>
          ) : (
            <div className="space-y-3">
              <NotesBody n={data} mine={false} />
              {data.chapters.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide mb-1 text-zinc-500">Parts of the call</p>
                  <ol className="space-y-1">{data.chapters.map((c) => <li key={c.t} className="text-sm flex gap-2"><span className="font-mono text-xs tabular-nums px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shrink-0">{Math.floor(c.t / 60)}:{String(c.t % 60).padStart(2, '0')}</span>{c.title}</li>)}</ol>
                </div>
              )}
              <p className="text-[11px] text-zinc-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Made by AI from the call’s live captions. It can miss or mishear words.</p>
            </div>
          )}
      </motion.div>
    </div>,
    document.body,
  );
}
