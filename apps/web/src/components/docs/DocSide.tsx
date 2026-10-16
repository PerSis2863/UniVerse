'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Loader2, MessageSquarePlus, RotateCcw, Send, UserMinus, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { MentionInput } from '@/components/ui/MentionInput';
import { Translatable } from '@/components/shared/Translatable';
import { cn } from '@/lib/utils';

// The side parts of a document, spreadsheet or presentation page: comments and sharing.

export interface DocComment { id: string; userId: string; quote: string | null; body: string; resolvedAt: string | null; createdAt: string; user: { id: string; name: string; avatar: string | null } }

const call = (url: string, method: string, body?: unknown) => authedJson(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Comments on a document, spreadsheet or presentation (Stage 4 · 3.2): each may be about a quoted
 *  bit (selected text, cells like "Marks!B3", or a slide); `pick` gives the current selection's quote
 *  and `go` shows where a quote is. */
export function Comments({ docId, me, canEdit, onClose, pick, go, aboutLabel = 'About the text I selected', empty = 'No open comments. Select some text and comment on it, or comment on the whole document.' }: {
  docId: string; me: string; canEdit: boolean; onClose: () => void;
  pick: () => string | null; go: (quote: string) => void; aboutLabel?: string; empty?: string;
}) {
  const key = `/api/docs/${docId}/comments`;
  const { data, mutate } = useSWR<DocComment[]>(key, authedJson);
  const [body, setBody] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const pickSelection = () => { const q = pick(); if (q) setQuote(q.slice(0, 500)); };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = body.trim();
    if (!t) return;
    setBody('');
    try { await call(key, 'POST', { body: t, quote }); setQuote(null); void mutate(); } catch (err) { setBody(t); toast.error((err as Error).message); }
  };
  const open = (data ?? []).filter((c) => !c.resolvedAt), done = (data ?? []).filter((c) => c.resolvedAt);
  const item = (c: DocComment) => (
    <div key={c.id} className={cn('rounded-2xl p-3 border', c.resolvedAt ? 'border-zinc-200/60 dark:border-white/[0.05] opacity-70' : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.03]')}>
      <div className="flex items-center gap-2">
        <Avatar name={c.user.name} src={c.user.avatar} size={24} />
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex-1 truncate">{c.user.name}</span>
        <span className="text-[10px] text-zinc-400">{new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </div>
      {c.quote && <button type="button" onClick={() => go(c.quote!)} className="mt-2 block w-full text-left text-xs italic text-zinc-500 border-l-2 border-amber-400 pl-2 line-clamp-2 hover:text-indigo-500">“{c.quote}”</button>}
      <Translatable kind="doc-comment" id={c.id} text={c.body} hide={c.userId === me} className="mt-1.5 text-sm text-zinc-900 dark:text-white whitespace-pre-wrap break-words" />
      <div className="mt-2 flex gap-3 text-[11px] font-semibold">
        {(canEdit || c.userId === me) && <button type="button" onClick={async () => { await call(`${key}/${c.id}`, 'PATCH', { resolved: !c.resolvedAt }).catch((e) => toast.error((e as Error).message)); void mutate(); }} className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">{c.resolvedAt ? <><RotateCcw className="w-3 h-3" />Reopen</> : <><Check className="w-3 h-3" />Resolve</>}</button>}
        {c.userId === me && <button type="button" onClick={async () => { await call(`${key}/${c.id}`, 'PATCH', { delete: true }).catch((e) => toast.error((e as Error).message)); void mutate(); }} className="text-zinc-400 hover:text-rose-500">Delete</button>}
      </div>
    </div>
  );
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="font-semibold text-zinc-900 dark:text-white">Comments {open.length > 0 && <span className="text-zinc-400 font-normal">· {open.length}</span>}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-3">
        {!data ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mx-auto mt-6" /> : open.length === 0 && <p className="text-sm text-zinc-500 px-1">{empty}</p>}
        {open.map(item)}
        {done.length > 0 && <button type="button" onClick={() => setShowResolved((s) => !s)} className="text-xs text-zinc-500 px-1">{showResolved ? 'Hide' : 'Show'} {done.length} resolved</button>}
        {showResolved && done.map(item)}
      </div>
      <form onSubmit={send} className="p-3 border-t border-zinc-200/70 dark:border-white/[0.06] space-y-2">
        {quote ? (
          <p className="text-xs italic text-zinc-500 border-l-2 border-amber-400 pl-2 flex gap-2"><span className="flex-1 line-clamp-2">“{quote}”</span><button type="button" onClick={() => setQuote(null)} aria-label="Not about this text"><X className="w-3 h-3" /></button></p>
        ) : (
          <button type="button" onClick={pickSelection} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><MessageSquarePlus className="w-3.5 h-3.5" />{aboutLabel}</button>
        )}
        <div className="flex gap-2">
          <MentionInput kind="doc" id={docId} value={body} onChange={setBody} maxLength={2000} placeholder="Write a comment (@name to notify someone)" aria-label="Comment" className="input" />
          <button type="submit" aria-label="Send" className="w-10 shrink-0 rounded-xl btn-primary flex items-center justify-center"><Send className="w-4 h-4" /></button>
        </div>
      </form>
    </>
  );
}

/** Sharing with people by email, to edit or to read. */
export function ShareSheet({ doc, onClose, onChanged, what = 'document' }: { doc: { id: string; members: { userId: string; role: string; name: string }[] }; onClose: () => void; onChanged: () => void; what?: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={`Share ${what}`} onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await call(`/api/docs/${doc.id}/members`, 'POST', { email, role }); setEmail(''); toast.success('Shared'); onChanged(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); } }} className="flex gap-2 mb-4">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" className="input" />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')} className={cn('input', 'w-28')}><option value="EDITOR">Can edit</option><option value="VIEWER">Can read</option></select>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}</button>
      </form>
      <div className="space-y-1">
        {doc.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 p-2">
            <span className="flex-1 text-sm text-zinc-900 dark:text-white">{m.name} <span className="text-xs text-zinc-500">· {m.role === 'VIEWER' ? 'can read' : 'can edit'}</span></span>
            <button type="button" onClick={async () => { await call(`/api/docs/${doc.id}/members`, 'POST', { userId: m.userId, remove: true }).catch((e) => toast.error((e as Error).message)); onChanged(); }} aria-label="Stop sharing" className="p-1.5 text-zinc-400 hover:text-rose-500"><UserMinus className="w-4 h-4" /></button>
          </div>
        ))}
        {!doc.members.length && <p className="text-sm text-zinc-500">Only you so far.</p>}
      </div>
    </Sheet>
  );
}

