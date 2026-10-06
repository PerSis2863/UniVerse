'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, CheckCheck, Loader2, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from './MessageBubble';
import { type ChatMessage, type ConversationSummary, type Member, chatJson, previewText, timeLabel } from './chat-client';

const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500/40';

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="backdrop-in fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div data-sheet className="sheet-in w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-zinc-200/70 dark:border-white/[0.07]">
          <h3 className="font-bold text-zinc-900 dark:text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="p-4 border-t border-zinc-200/70 dark:border-white/[0.07] sheet-safe-bottom sm:pb-4">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Poll ─────────────────────────────────────────────────────────────────
export function PollDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (poll: { question: string; options: string[]; multiple: boolean }) => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const clean = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && new Set(clean).size >= 2;
  const create = async () => {
    setBusy(true);
    try { await onCreate({ question: question.trim(), options: clean, multiple }); onClose(); } catch { /* toast shown by caller */ } finally { setBusy(false); }
  };
  return (
    <Sheet title="Create poll" onClose={onClose} footer={
      <button onClick={create} aria-busy={busy || undefined} disabled={!valid || busy} className="btn-primary w-full">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send poll
      </button>
    }>
      <label className="text-xs font-semibold text-zinc-500">Question</label>
      <input autoFocus className={cn(input, 'mt-1.5')} placeholder="Ask a question" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <label className="block text-xs font-semibold text-zinc-500 mt-4">Options</label>
      <div className="space-y-2 mt-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input className={input} placeholder={`Option ${i + 1}`} maxLength={100} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Remove option" className="p-2 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
      </div>
      {options.length < 12 && <button onClick={() => setOptions([...options, ''])} className="mt-2 text-sm font-semibold text-indigo-500 inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Add option</button>}
      <label className="mt-5 flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-200 cursor-pointer">
        Allow multiple answers
        <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="w-5 h-5 accent-indigo-600" />
      </label>
    </Sheet>
  );
}

// ─── Contact picker ──────────────────────────────────────────────────────
export function ContactPicker({ onClose, onPick }: { onClose: () => void; onPick: (userId: string) => Promise<void> }) {
  const [q, setQ] = useState('');
  const { data: people, isLoading } = useSWR<{ id: string; name: string; avatar: string | null; role: string; online: boolean }[]>(`/api/chat/users?q=${encodeURIComponent(q)}`, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Sheet title="Share a contact" onClose={onClose}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input autoFocus className={cn(input, 'pl-9')} placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading && <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>}
      <div className="space-y-1">
        {people?.map((u) => (
          <button key={u.id} disabled={!!busy} onClick={async () => { setBusy(u.id); try { await onPick(u.id); onClose(); } finally { setBusy(null); } }} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-100 dark:hover:bg-white/[0.05] text-left">
            <Avatar name={u.name} src={u.avatar} online={u.online} size={38} />
            <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{u.name}</span><span className="block text-xs text-zinc-500 capitalize">{u.role.toLowerCase()}</span></span>
            {busy === u.id && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
          </button>
        ))}
        {people?.length === 0 && <p className="text-sm text-zinc-500 text-center py-6">No one found.</p>}
      </div>
    </Sheet>
  );
}

// ─── Forward ─────────────────────────────────────────────────────────────
export function ForwardDialog({ message, onClose, onDone }: { message: ChatMessage; onClose: () => void; onDone: () => void }) {
  const { data } = useSWR<{ conversations: ConversationSummary[] }>('/api/chat/conversations', authedJson);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const chats = (data?.conversations ?? []).filter((c) => !c.isOfficial && c.title.toLowerCase().includes(q.toLowerCase()));
  const send = async () => {
    setBusy(true);
    try {
      await Promise.all(picked.map((id) => chatJson(`/api/chat/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ forwardOf: message.id }) })));
      toast.success(picked.length === 1 ? 'Message forwarded' : `Forwarded to ${picked.length} chats`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Forward to…" onClose={onClose} footer={
      <button onClick={send} aria-busy={busy || undefined} disabled={!picked.length || busy} className="btn-primary w-full">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Forward{picked.length > 1 ? ` to ${picked.length} chats` : ''}
      </button>
    }>
      <p className="text-xs text-zinc-500 mb-3 truncate">“{previewText(message)}”</p>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input className={cn(input, 'pl-9')} placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="space-y-1">
        {chats.map((c) => {
          const on = picked.includes(c.id);
          return (
            <button key={c.id} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : picked.length >= 5 ? picked : [...picked, c.id])} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-100 dark:hover:bg-white/[0.05] text-left">
              <Avatar name={c.title} src={c.avatarUrl} size={38} />
              <span className="flex-1 min-w-0 text-sm font-medium text-zinc-900 dark:text-white truncate">{c.title}</span>
              <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center', on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-white/30')}>{on && <Check className="w-3 h-3" />}</span>
            </button>
          );
        })}
      </div>
      {picked.length >= 5 && <p className="text-xs text-zinc-500 mt-2">You can forward to up to 5 chats at once.</p>}
    </Sheet>
  );
}

// ─── Message info ─────────────────────────────────────────────────────────
export function MessageInfo({ message, members, me, onClose }: { message: ChatMessage; members: Member[]; me: string; onClose: () => void }) {
  const sentAt = new Date(message.createdAt).getTime();
  const others = members.filter((m) => m.id !== me);
  const read = others.filter((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= sentAt);
  const notYet = others.filter((m) => !read.includes(m));
  // Delivered: online, or opened UniVerse since it was sent; the rest haven't had it yet.
  const delivered = notYet.filter((m) => m.online || (m.lastSeenAt && new Date(m.lastSeenAt).getTime() >= sentAt));
  const waiting = notYet.filter((m) => !delivered.includes(m));
  const when = (iso: string) => `${timeLabel(iso)}${timeLabel(iso).includes(':') ? '' : ', ' + new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return (
    <Sheet title="Message info" onClose={onClose}>
      <p className="text-sm text-zinc-700 dark:text-zinc-200 p-3 rounded-2xl bg-indigo-500/10 mb-4 line-clamp-4">{previewText(message)}</p>
      <p className="text-xs text-zinc-500 mb-4">Sent {when(message.createdAt)}</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-500 flex items-center gap-1 mb-2"><CheckCheck className="w-4 h-4" /> Read by {read.length}</p>
      <div className="space-y-1 mb-5">
        {read.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-2">
            <Avatar name={m.name} src={m.avatar} size={34} />
            <span className="flex-1 text-sm text-zinc-900 dark:text-white truncate">{m.name}</span>
            <span className="text-[11px] text-zinc-500">{m.lastReadAt ? when(m.lastReadAt) : ''}</span>
          </div>
        ))}
        {!read.length && <p className="text-sm text-zinc-500 px-2">No one yet.</p>}
      </div>
      {([['Delivered', delivered, CheckCheck], ['Not delivered yet', waiting, Check]] as const).map(([label, list, Icon]) => list.length > 0 && (
        <div key={label} className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-2"><Icon className="w-4 h-4" /> {label}</p>
          <div className="space-y-1">
            {list.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2">
                <Avatar name={m.name} src={m.avatar} size={34} />
                <span className="flex-1 text-sm text-zinc-900 dark:text-white truncate">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// ─── Starred messages ────────────────────────────────────────────────────
type StarredItem = ChatMessage & { chat: { id: string; title: string } };
export function StarredPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (conversationId: string, messageId: string) => void }) {
  const { data, isLoading, mutate } = useSWR<StarredItem[]>('/api/chat/starred', authedJson);
  const unstar = async (m: StarredItem) => {
    mutate((cur) => cur?.filter((x) => x.id !== m.id), { revalidate: false });
    await chatJson(`/api/chat/messages/${m.id}/state`, { method: 'POST', body: JSON.stringify({ starred: false }) }).catch(() => mutate());
  };
  return (
    <Sheet title="Starred messages" onClose={onClose}>
      {isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>}
      {!isLoading && !data?.length && (
        <div className="py-10 text-center">
          <Star className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="font-semibold text-zinc-900 dark:text-white">No starred messages</p>
          <p className="text-sm text-zinc-500 mt-1">Tap and hold (or use ⋮) on any message and choose Star to save it here.</p>
        </div>
      )}
      <div className="space-y-2">
        {data?.map((m) => (
          <div key={m.id} className="p-3 rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
            <button onClick={() => onOpen(m.chat.id, m.id)} className="w-full text-left">
              <p className="text-[11px] text-zinc-500 mb-1">{m.sender.name} · {m.chat.title} · {timeLabel(m.createdAt)}</p>
              <p className="text-sm text-zinc-900 dark:text-white line-clamp-3">{previewText(m)}</p>
            </button>
            <button onClick={() => unstar(m)} className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-current" /> Unstar</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
