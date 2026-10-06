'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Clapperboard, Loader2, Search, Trash2, X } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// A call's recording (Stage 4 · 2.9; src/server/call-recordings.ts), opened from Calls, a chat or a
// notification: the player, the parts of the call (from its meeting notes) and, for those who were
// in the call, the transcript to search and jump through.

interface Recording {
  id: string; url: string; mime: string; durationSec: number; createdAt: string; title: string; noteId: string | null;
  chapters: { t: number; title: string }[]; transcript: { t: number; who: string; text: string }[]; expiresAt: string; canDelete: boolean;
}

const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export function CallRecordingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useSWR<Recording>(`/api/call-recordings/${id}`, (url: string) => authedJson(url));
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState(false);
  const seek = (t: number) => { const m = media.current; if (m) { m.currentTime = t; void m.play().catch(() => {}); } };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this recording?', message: 'It’s removed for everyone, and its chat message says so.', confirmLabel: 'Delete', destructive: true }))) return;
    setDeleting(true);
    try { await authedJson(`/api/call-recordings/${id}`, { method: 'DELETE' }); toast.success('Recording deleted'); onClose(); } catch (e) { toast.error((e as Error).message); setDeleting(false); }
  };
  const needle = q.trim().toLowerCase();
  const lines = data ? (needle ? data.transcript.filter((l) => l.text.toLowerCase().includes(needle) || l.who.toLowerCase().includes(needle)) : data.transcript) : [];

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <motion.div role="dialog" aria-modal="true" aria-label="Call recording" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
        className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121830] p-4 sm:p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-5 space-y-3 shadow-2xl text-zinc-900 dark:text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold flex items-center gap-2"><Clapperboard className="w-4 h-4 text-fuchsia-500 shrink-0" /><span className="truncate">{data?.title ?? 'Call recording'}</span></p>
            {data && <p className="text-xs text-zinc-500 mt-0.5">{new Date(data.createdAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {clock(data.durationSec)} · kept until {new Date(data.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {data?.canDelete && <button type="button" onClick={() => void remove()} disabled={deleting} aria-label="Delete recording" title="Delete recording" className="p-1.5 rounded-full text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10">{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>}
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {error ? <p className="text-sm text-zinc-500">{(error as Error).message}</p>
          : !data ? <div className="aspect-video rounded-xl skeleton" />
          : (
            <>
              {data.mime.startsWith('audio/')
                ? <audio ref={media} src={data.url} controls preload="metadata" className="w-full" />
                : <video ref={media} src={data.url} controls preload="metadata" playsInline className="w-full aspect-video rounded-xl bg-black" />}
              {data.chapters.length > 0 && (
                <ol className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1" aria-label="Parts of the call">
                  {data.chapters.map((c) => (
                    <li key={c.t} className="shrink-0">
                      <button type="button" onClick={() => seek(c.t)} className="text-left w-40 rounded-xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] hover:border-indigo-300 px-3 py-2">
                        <span className="block font-mono text-[11px] tabular-nums text-indigo-600 dark:text-indigo-300">{clock(c.t)}</span>
                        <span className="block text-sm font-medium leading-snug line-clamp-2">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {data.transcript.length > 0 && (
                <section>
                  <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-zinc-100 dark:bg-white/[0.06]">
                    <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what was said" aria-label="Search the transcript" className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-zinc-500" />
                  </label>
                  <ol className="mt-2 max-h-64 overflow-y-auto space-y-0.5" aria-label="Transcript">
                    {lines.length === 0 && <li className="text-sm text-zinc-500 px-1">Nothing found.</li>}
                    {lines.slice(0, 300).map((l, i) => (
                      <li key={`${l.t}-${i}`}>
                        <button type="button" onClick={() => seek(l.t)} className={cn('w-full flex items-start gap-2.5 text-left text-sm rounded-lg p-1.5 hover:bg-indigo-500/[0.06]')}>
                          <span className="font-mono text-xs tabular-nums text-zinc-400 shrink-0 pt-0.5">{clock(l.t)}</span>
                          <span className="min-w-0"><span className="font-semibold text-zinc-700 dark:text-zinc-200">{l.who}: </span><span className="text-zinc-600 dark:text-zinc-300">{l.text}</span></span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-1 text-[11px] text-zinc-400">From the call’s live captions; only people who were in the call see it.</p>
                </section>
              )}
            </>
          )}
      </motion.div>
    </div>,
    document.body,
  );
}
