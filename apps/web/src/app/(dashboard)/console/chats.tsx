'use client';

import { AttachmentInline } from '@/components/chat/AttachmentInline';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Eye, Loader2, Megaphone, MessageSquare, Pencil, RotateCcw, Send, ShieldCheck, Trash2, UserMinus, Users, X } from 'lucide-react';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SearchBox, card, errorMessage, fetcher, field, refreshConsole, toastWithUndo, useDebounced } from './shared';
import { useActivePoll } from '@/lib/realtime-client';
import { TabPill } from '@/components/ui/Glide';

// The owner console's Chats and Announce tabs. Chats shows every conversation on UniVerse as it
// happens; the owner can step in as UniVerse (edit or remove a message, post a team notice, take
// someone out of a group). People always see that UniVerse did it. Server side:
// src/server/modules/owner-chats.ts.

interface ChatRow {
  id: string; name: string | null; isGroup: boolean; updatedAt: string;
  participants: { user: { id: string; name: string; role: string; lastSeenAt: string | null } }[];
  messages: { body: string; type: string; createdAt: string; deletedAt: string | null; sender: { name: string } | null }[];
  _count: { messages: number; participants: number };
}
interface Hit { id: string; body: string; type: string; createdAt: string; deletedAt: string | null; conversationId: string; sender: { id: string; name: string } | null; conversation: { name: string | null; isGroup: boolean } }
interface Msg {
  id: string; body: string; type: string; createdAt: string; editedAt: string | null; deletedAt: string | null; expiresAt: string | null; forwarded: boolean;
  metadata: { moderated?: string; team?: boolean; kind?: string } | null; attachmentUrl: string | null; attachmentName: string | null; attachmentMime: string | null;
  sender: { id: string; name: string } | null; reactions: { emoji: string }[];
}
interface ChatData {
  conversation: {
    id: string; name: string | null; isGroup: boolean; createdAt: string; disappearingSec: number | null; typing: string[];
    participants: { role: string; user: { id: string; name: string; role: string; email: string; lastSeenAt: string | null } }[];
  };
  messages: Msg[];
  hasMore: boolean;
}

const online = (at: string | null) => !!at && Date.now() - new Date(at).getTime() < 2 * 60_000;
const chatTitle = (c: { name: string | null; isGroup: boolean; participants: { user: { name: string } }[] }) =>
  c.isGroup ? c.name || 'Group chat' : c.participants.map((p) => p.user.name).join(' & ') || 'Chat';

// ─── Chats tab ─────────────────────────────────────────────────────────────────────────────────

export function ChatsPanel({ onPerson, initialChat }: { onPerson: (id: string) => void; initialChat?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  // A watch-word alert links to /console?tab=chats&chat=<id>; the console search opens one directly.
  const [open, setOpen] = useState<{ id: string; highlight?: string } | null>(() => {
    const id = initialChat ?? (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('chat'));
    return id ? { id } : null;
  });
  const { data, isLoading } = useSWR<{ chats: ChatRow[]; hits: Hit[]; activeNow: number }>(`/owner/chats${dq ? `?q=${encodeURIComponent(dq)}` : ''}`, fetcher, { refreshInterval: useActivePoll(5000) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p className="text-sm text-zinc-500 inline-flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" /><span className="relative w-2.5 h-2.5 rounded-full bg-emerald-500" /></span>
          Live · {data?.activeNow ?? 0} message{data?.activeNow === 1 ? '' : 's'} in the last 5 minutes
        </p>
        <p className="text-xs text-zinc-400">Anything you change shows as done by UniVerse.</p>
      </div>
      <WatchWords onOpen={(id, highlight) => setOpen({ id, highlight })} />
      <SearchBox value={q} onChange={setQ} placeholder="Search people, group names and every message" />
      <div className={cn(card, 'grid md:grid-cols-[300px_1fr] h-[75vh] min-h-[420px] overflow-hidden')}>
        <div className={cn('overflow-y-auto border-r border-zinc-100 dark:border-white/[0.06]', open && 'hidden md:block')}>
          {isLoading ? <div className="p-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div> : (
            <>
              {!!data?.hits.length && (
                <div className="border-b border-zinc-100 dark:border-white/[0.06]">
                  <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Messages</p>
                  <ul>{data.hits.map((h) => (
                    <li key={h.id}>
                      <button onClick={() => setOpen({ id: h.conversationId, highlight: h.id })} className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                        <p className="text-xs text-zinc-500 truncate"><span className="font-semibold text-zinc-700 dark:text-zinc-300">{h.sender?.name ?? 'UniVerse'}</span> · {h.conversation.isGroup ? h.conversation.name ?? 'Group' : 'private chat'} · {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}</p>
                        <p className={cn('text-sm text-zinc-800 dark:text-zinc-200 line-clamp-2', h.deletedAt && 'line-through opacity-60')}>{h.body}</p>
                      </button>
                    </li>
                  ))}</ul>
                  <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Chats</p>
                </div>
              )}
              {!data?.chats.length ? <p className="p-6 text-sm text-zinc-500">{dq ? 'No chats match.' : 'No chats yet.'}</p> : (
                <ul>{data.chats.map((c) => {
                  const last = c.messages[0];
                  const live = c.participants.some((p) => online(p.user.lastSeenAt));
                  return (
                    <li key={c.id}>
                      <button onClick={() => setOpen({ id: c.id })} className={cn('relative isolate w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03]', open?.id === c.id && '')}>{open?.id === c.id && <TabPill id="app-dashboard-console-chats-1" variant="soft" />}
                        <div className="flex items-center gap-2">
                          {c.isGroup ? <Users className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> : <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate flex-1">{chatTitle(c)}</p>
                          {live && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Someone here is online" />}
                        </div>
                        {last && <p className="text-xs text-zinc-500 truncate mt-0.5">{last.sender?.name && last.type !== 'SYSTEM' ? `${last.sender.name.split(' ')[0]}: ` : ''}{last.deletedAt ? 'deleted message' : last.body || last.type.toLowerCase()}</p>}
                        <p className="text-[11px] text-zinc-400 mt-0.5">{c._count.messages} messages · {c._count.participants} people · {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}</p>
                      </button>
                    </li>
                  );
                })}</ul>
              )}
            </>
          )}
        </div>
        <div className={cn('min-h-0', !open && 'hidden md:block')}>
          {open ? <LiveChat key={open.id} id={open.id} highlight={open.highlight} onBack={() => setOpen(null)} onPerson={onPerson} /> : (
            <div className="h-full flex flex-col items-center justify-center p-10 text-center text-sm text-zinc-500 gap-2">
              <Eye className="w-6 h-6 text-zinc-300" />
              Choose a chat to watch it live.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Watch words ───────────────────────────────────────────────────────────────────────────────

/** Words that alert the owner (the bell) when someone writes them, and where they were written. */
function WatchWords({ onOpen }: { onOpen: (conversationId: string, messageId: string) => void }) {
  const { data, mutate } = useSWR<{ words: string[]; flagged: Hit[] }>('/owner/watch-words', fetcher, { refreshInterval: useActivePoll(30_000) });
  const [show, setShow] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = text ?? data?.words.join(', ') ?? '';
  const save = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/watch-words', { words: value });
      toastWithUndo(res.words.length ? `Watching ${res.words.length} word${res.words.length === 1 ? '' : 's'}` : 'Watch words cleared', res.changeId);
      setText(null);
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const flagged = data?.flagged ?? [];
  return (
    <div className={cn(card, flagged.length > 0 && 'border-amber-500/40')}>
      <button onClick={() => setShow(!show)} aria-expanded={show} className="w-full flex items-center gap-2 p-4 text-left">
        <AlertTriangle className={cn('w-4 h-4 shrink-0', flagged.length ? 'text-amber-500' : 'text-zinc-400')} />
        <span className="font-semibold text-zinc-900 dark:text-white flex-1">Watch words</span>
        <span className="text-xs text-zinc-500">{data ? `${data.words.length} words · ${flagged.length} flagged in 14 days` : ''}</span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', show && 'rotate-180')} />
      </button>
      {show && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 dark:border-white/[0.05] pt-3">
          <p className="text-xs text-zinc-500">When someone writes one of these in any chat, you get an alert in your notifications. Separate words with commas, for example: bully, cheat, phone number.</p>
          <textarea value={value} onChange={(e) => setText(e.target.value)} rows={2} maxLength={3000} aria-label="Watch words" placeholder="bully, cheat, kill" className={field} />
          <div className="flex justify-end">
            <button onClick={() => void save()} disabled={busy || text === null} aria-busy={busy || undefined} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save words</button>
          </div>
          {flagged.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-xl border border-zinc-100 dark:border-white/[0.05] max-h-72 overflow-y-auto">
              {flagged.map((h) => (
                <li key={h.id}>
                  <button onClick={() => onOpen(h.conversationId, h.id)} className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                    <p className="text-xs text-zinc-500 truncate"><span className="font-semibold text-zinc-700 dark:text-zinc-300">{h.sender?.name ?? 'UniVerse'}</span> · {h.conversation.isGroup ? h.conversation.name ?? 'Group' : 'private chat'} · {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}{h.deletedAt ? ' · removed' : ''}</p>
                    <p className={cn('text-sm text-zinc-800 dark:text-zinc-200 line-clamp-2', h.deletedAt && 'line-through opacity-60')}>{h.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── One chat, live ────────────────────────────────────────────────────────────────────────────

/** A chat as it happens (refreshes every few seconds), with UniVerse's moderation tools. */
export function LiveChat({ id, onBack, onPerson, highlight }: { id: string; onBack: () => void; onPerson?: (id: string) => void; highlight?: string }) {
  const { data, mutate, isLoading } = useSWR<ChatData>(`/owner/chats/${id}`, fetcher, { refreshInterval: useActivePoll(3000) });
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [post, setPost] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const last = data?.messages[data.messages.length - 1]?.id;

  // Stay at the newest message unless the owner scrolled up to read.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (highlight && !stick.current) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [last, highlight]);
  useEffect(() => {
    if (!highlight || !data) return;
    document.getElementById(`m-${highlight}`)?.scrollIntoView({ block: 'center' });
    stick.current = false;
  }, [highlight, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, run: () => Promise<{ data: { changeId?: string } }>, done: string) => {
    setBusy(key);
    try {
      const { data: res } = await run();
      toastWithUndo(done, res.changeId);
      await mutate();
      void refreshConsole();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) return <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;
  const c = data.conversation;

  const remove = async (m: Msg) => {
    if (!(await confirmDialog({ title: 'Remove this message?', message: 'It disappears for everyone in the chat and shows “Removed by UniVerse”. You can restore it.', confirmLabel: 'Remove', destructive: true }))) return;
    await act(m.id, () => api.post(`/owner/messages/${m.id}/remove`), 'Message removed');
  };
  const save = async (m: Msg) => {
    if (await act(m.id, () => api.patch(`/owner/messages/${m.id}`, { body: draft }), 'Message changed. Everyone sees “edited by UniVerse”.')) setEditing(null);
  };
  const kick = async (u: { id: string; name: string }) => {
    if (!(await confirmDialog({ title: `Take ${u.name} out of this group?`, message: 'The group sees “UniVerse removed them”. They can be added back by a group admin.', confirmLabel: 'Take out', destructive: true }))) return;
    await act(`k-${u.id}`, () => api.delete(`/owner/chats/${c.id}/members/${u.id}`), `${u.name} was taken out of the group`);
  };
  const send = async () => {
    if (!post.trim()) return;
    if (await act('post', () => api.post(`/owner/chats/${c.id}/post`, { body: post }), 'Posted as UniVerse Team')) {
      setPost('');
      stick.current = true;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-zinc-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="md:hidden text-zinc-500" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate flex-1">{chatTitle(c)}</p>
          <span className="text-[11px] text-zinc-400 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.participants.map(({ user: u, role }) => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] pl-2 pr-1 py-0.5 text-xs text-zinc-700 dark:text-zinc-300">
              <span className={cn('w-1.5 h-1.5 rounded-full', online(u.lastSeenAt) ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600')} />
              <button onClick={() => onPerson?.(u.id)} disabled={!onPerson} className="hover:underline disabled:no-underline" title={u.email}>{u.name}</button>
              {role === 'ADMIN' && c.isGroup && <span className="text-[10px] text-zinc-400">admin</span>}
              {c.isGroup && (
                <button onClick={() => void kick(u)} disabled={busy === `k-${u.id}`} aria-label={`Take ${u.name} out of the group`} className="p-0.5 rounded-full text-zinc-400 hover:text-rose-500">
                  {busy === `k-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      <ol ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
        {data.hasMore && <li className="text-center text-[11px] text-zinc-400">Showing the latest 150 messages</li>}
        {data.messages.length === 0 && <li className="text-sm text-zinc-500">No messages yet.</li>}
        {data.messages.map((m) => {
          const removedByUs = m.metadata?.moderated === 'removed';
          const flags = [
            m.editedAt && (m.metadata?.moderated === 'edited' ? 'edited by UniVerse' : 'edited'),
            m.deletedAt && (removedByUs ? 'removed by UniVerse' : 'deleted by them'),
            m.expiresAt && 'disappearing',
            m.forwarded && 'forwarded',
          ].filter(Boolean);
          if (m.type === 'SYSTEM') {
            return (
              <li key={m.id} id={`m-${m.id}`} className="group flex justify-center items-center gap-2">
                <span className={cn('text-xs px-3 py-1 rounded-full text-center max-w-[85%]', m.metadata?.team ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-200' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-500', m.deletedAt && 'line-through opacity-60')}>{m.body}</span>
                {!m.deletedAt && <button onClick={() => void remove(m)} aria-label="Remove" className="sm:opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}
              </li>
            );
          }
          return (
            <li key={m.id} id={`m-${m.id}`} className={cn('group rounded-xl p-2.5 sm:p-3 bg-zinc-50 dark:bg-white/[0.03]', m.id === highlight && 'ring-2 ring-amber-400/70', m.deletedAt && 'bg-rose-500/[0.04] dark:bg-rose-500/[0.06]')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-zinc-500 min-w-0">
                  <button onClick={() => m.sender && onPerson?.(m.sender.id)} disabled={!onPerson} className="font-semibold text-indigo-600 dark:text-indigo-300 hover:underline disabled:no-underline">{m.sender?.name ?? 'UniVerse'}</button>
                  {' · '}{format(new Date(m.createdAt), 'd MMM, HH:mm')}{flags.length ? ` · ${flags.join(' · ')}` : ''}
                </p>
                <span className="flex gap-2.5 shrink-0 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                  {busy === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" /> : (
                    <>
                      {m.type === 'TEXT' && !m.deletedAt && <button onClick={() => { setEditing(m.id); setDraft(m.body); }} aria-label="Edit message" title="Edit (shows “edited by UniVerse”)" className="text-zinc-400 hover:text-indigo-500"><Pencil className="w-3.5 h-3.5" /></button>}
                      {!m.deletedAt && <button onClick={() => void remove(m)} aria-label="Remove message" title="Remove for everyone" className="text-zinc-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                      {removedByUs && <button onClick={() => void act(m.id, () => api.post(`/owner/messages/${m.id}/restore`), 'Message restored')} aria-label="Restore message" title="Restore" className="text-zinc-400 hover:text-emerald-500"><RotateCcw className="w-3.5 h-3.5" /></button>}
                    </>
                  )}
                </span>
              </div>
              {editing === m.id ? (
                <div className="mt-1.5 space-y-2">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className={field} autoFocus aria-label="New text" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500"><X className="w-3.5 h-3.5" /> Cancel</button>
                    <button onClick={() => void save(m)} disabled={!draft.trim()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Save</button>
                  </div>
                </div>
              ) : (
                <p className={cn('mt-0.5 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words', m.deletedAt && 'line-through decoration-rose-400/60 opacity-70')}>
                  {m.type === 'CALL' ? `📞 ${m.body}` : m.type === 'TEXT' ? m.body : m.body || m.type.toLowerCase()}
                </p>
              )}
              {!!m.attachmentUrl && <div className="mt-1.5"><AttachmentInline url={m.attachmentUrl} name={m.attachmentName} mime={m.attachmentMime} type={m.type} /></div>}
              {m.reactions.length > 0 && <p className="mt-1 text-xs">{m.reactions.map((r) => r.emoji).join(' ')}</p>}
            </li>
          );
        })}
        {c.typing.length > 0 && <li className="text-xs text-zinc-400 italic">{c.typing.join(', ')} {c.typing.length === 1 ? 'is' : 'are'} typing…</li>}
      </ol>

      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="p-3 border-t border-zinc-100 dark:border-white/[0.06]">
        <div className="flex gap-2 items-end">
          <textarea value={post} onChange={(e) => setPost(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={1} maxLength={1000}
            placeholder="Post in this chat as UniVerse Team" aria-label="Post as UniVerse Team" className={cn(field, 'resize-none')} />
          <button type="submit" disabled={!post.trim() || busy === 'post'} aria-busy={busy === 'post' || undefined} className="btn-primary shrink-0" aria-label="Post">
            {busy === 'post' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400 inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Shows in the chat as a notice from the UniVerse Team.</p>
      </form>
    </div>
  );
}

// ─── Write something (a message or a notification) ─────────────────────────────────────────────

export function ComposeDialog({ title, hint, withTitle, withEmail, confirm, onSend, onClose }: {
  title: string; hint: string; withTitle?: boolean; withEmail?: boolean; confirm: string;
  onSend: (v: { title: string; body: string; link: string; email: boolean }) => Promise<boolean>; onClose: () => void;
}) {
  const [v, setV] = useState({ title: '', body: '', link: '', email: false });
  const [busy, setBusy] = useState(false);
  const ready = v.body.trim() && (!withTitle || v.title.trim());
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={async (e) => { e.preventDefault(); if (!ready) return; setBusy(true); const ok = await onSend(v); setBusy(false); if (ok) onClose(); }}
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-zinc-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-400"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-zinc-500">{hint}</p>
        {withTitle && <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={200} placeholder="Title" aria-label="Title" className={field} />}
        <textarea value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} rows={5} maxLength={withTitle ? 1000 : 4000} placeholder="Message" aria-label="Message" className={field} autoFocus={!withTitle} />
        {withTitle && <input value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })} maxLength={300} placeholder="Link when tapped (optional), e.g. /events" aria-label="Link" className={field} />}
        {withEmail && (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={v.email} onChange={(e) => setV({ ...v, email: e.target.checked })} /> Also email them (if they get emails)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-500">Cancel</button>
          <button type="submit" disabled={!ready || busy} aria-busy={busy || undefined} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {confirm}</button>
        </div>
      </form>
    </div>
  );
}

// ─── Announce tab ──────────────────────────────────────────────────────────────────────────────

const AUDIENCES = [
  { id: '', label: 'Everyone' }, { id: 'STUDENT', label: 'Students' }, { id: 'TEACHER', label: 'Teachers' },
  { id: 'ADMIN', label: 'Admins' }, { id: 'INDUSTRY_MENTOR', label: 'Mentors' },
];

export function AnnouncePanel() {
  const { data, mutate } = useSWR<{ counts: Record<string, number>; recent: { id: string; summary: string; createdAt: string; after: { body?: string } | null }[] }>('/owner/announcements', fetcher);
  const [v, setV] = useState({ role: '', title: '', body: '', link: '' });
  const [busy, setBusy] = useState(false);
  const total = Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0);
  const reach = v.role ? data?.counts[v.role] ?? 0 : total;
  const send = async () => {
    const who = AUDIENCES.find((a) => a.id === v.role)!.label.toLowerCase();
    if (!(await confirmDialog({ title: `Send to ${who}?`, message: `${reach} ${reach === 1 ? 'person gets' : 'people get'} this in their notifications. People using UniVerse right now see it straight away.`, confirmLabel: 'Send' }))) return;
    setBusy(true);
    try {
      const { data: res } = await api.post('/owner/announcements', v);
      toast.success(`Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}`);
      setV({ ...v, title: '', body: '', link: '' });
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className={cn(card, 'p-5 space-y-3')}>
        <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-indigo-500" /> Send an announcement</h2>
        <p className="text-xs text-zinc-500">It lands in everyone’s notifications (the bell), from UniVerse. Banned people don’t get it.</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Who gets it">
          {AUDIENCES.map((a) => (
            <button key={a.id || 'all'} type="button" role="radio" aria-checked={v.role === a.id} onClick={() => setV({ ...v, role: a.id })}
              className={cn('relative isolate px-3 py-1.5 rounded-full text-sm font-semibold border', v.role === a.id ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'border-zinc-200 dark:border-white/10 text-zinc-500')}>{v.role === a.id && <TabPill id="app-dashboard-console-chats-0" variant="soft" />}
              {a.label} <span className="font-normal opacity-70">{a.id ? data?.counts[a.id] ?? 0 : total}</span>
            </button>
          ))}
        </div>
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={200} placeholder="Title, e.g. New feature: study groups" aria-label="Title" className={field} />
        <textarea value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} rows={5} maxLength={1000} placeholder="What do you want to tell them?" aria-label="Message" className={field} />
        <input value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })} maxLength={300} placeholder="Link when tapped (optional), e.g. /events" aria-label="Link" className={field} />
        <div className="flex justify-end">
          <button type="submit" disabled={busy || !v.title.trim() || !v.body.trim()} aria-busy={busy || undefined} className="btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to {reach}
          </button>
        </div>
      </form>
      <div className={cn(card, 'p-5')}>
        <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Sent before</h2>
        {!data ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400" /> : data.recent.length === 0 ? <p className="text-sm text-zinc-500">Nothing sent yet.</p> : (
          <ul className="space-y-3">{data.recent.map((a) => (
            <li key={a.id} className="text-sm">
              <p className="text-zinc-800 dark:text-zinc-200">{a.summary}</p>
              {a.after?.body && <p className="text-xs text-zinc-500 line-clamp-2">{a.after.body}</p>}
              <p className="text-[11px] text-zinc-400">{format(new Date(a.createdAt), 'd MMM yyyy, HH:mm')}</p>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
