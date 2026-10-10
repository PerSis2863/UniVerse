'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { AlarmClock, Check, CheckCheck, Loader2, Plus, Search, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Segmented } from '@/components/ui/Segmented';
import { reminderChoices, snoozeChoices, validReminderTime } from '@/lib/reminder-times';
import { type ChatMessage, type ConversationSummary, type Member, chatJson, previewText, timeLabel } from './chat-client';


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
      <input autoFocus className={cn('input', 'mt-1.5')} placeholder="Ask a question" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <label className="block text-xs font-semibold text-zinc-500 mt-4">Options</label>
      <div className="space-y-2 mt-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" placeholder={`Option ${i + 1}`} maxLength={100} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
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
        <input autoFocus className={cn('input', 'pl-9')} placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
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
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
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
        <input className={cn('input', 'pl-9')} placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
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

// ─── Saved: the Later list and starred messages (Stage 5 · B7.1) ─────────
type StarredItem = ChatMessage & { chat: { id: string; title: string } };
interface LaterItem { id: string; text: string; dueAt: string; doneAt: string | null; chat: { id: string; title: string } | null; messageId: string | null }
export interface LaterData { due: LaterItem[]; upcoming: LaterItem[]; done: LaterItem[] }

const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export function SavedPanel({ initial = 'later', onClose, onOpen }: { initial?: 'later' | 'starred'; onClose: () => void; onOpen: (conversationId: string, messageId: string | null) => void }) {
  const [tab, setTab] = useState<'later' | 'starred'>(initial);
  const { data: later } = useSWR<LaterData>('/api/chat/reminders', authedJson);
  const due = later?.due.length ?? 0;
  return (
    <Sheet title="Saved" onClose={onClose}>
      <Segmented<'later' | 'starred'> label="Later or starred" className="mb-3" value={tab} onChange={setTab}
        segments={[{ value: 'later', label: due ? `Later · ${due}` : 'Later', icon: <AlarmClock className="w-3.5 h-3.5" /> }, { value: 'starred', label: 'Starred', icon: <Star className="w-3.5 h-3.5" /> }]} />
      {tab === 'later' ? <LaterList onOpen={onOpen} /> : <StarredList onOpen={(c, m) => onOpen(c, m)} />}
    </Sheet>
  );
}

function LaterList({ onOpen }: { onOpen: (conversationId: string, messageId: string | null) => void }) {
  const { data, isLoading, mutate } = useSWR<LaterData>('/api/chat/reminders', authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (r: LaterItem, body: Record<string, unknown> | null, done?: string) => {
    setBusy(r.id);
    try {
      await chatJson(`/api/chat/reminders/${r.id}`, body ? { method: 'PATCH', body: JSON.stringify(body) } : { method: 'DELETE' });
      if (done) toast.success(done);
      await mutate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const row = (r: LaterItem, kind: 'due' | 'upcoming' | 'done') => (
    <div key={r.id} className={cn('p-3 rounded-2xl border', kind === 'due' ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-200/70 dark:border-white/[0.07]', kind === 'done' && 'opacity-70')}>
      <button type="button" onClick={() => r.chat && onOpen(r.chat.id, r.messageId)} disabled={!r.chat} className="w-full text-left disabled:cursor-default">
        <p className="text-[11px] text-zinc-500 mb-1 flex items-center gap-1">
          <AlarmClock className="w-3 h-3" aria-hidden />{kind === 'done' ? 'Done' : kind === 'due' ? `Came up ${whenLabel(r.dueAt)}` : whenLabel(r.dueAt)}{r.chat ? ` · ${r.chat.title}` : ''}
        </p>
        <p className={cn('text-sm text-zinc-900 dark:text-white line-clamp-3', kind === 'done' && 'line-through')}>{r.text}</p>
      </button>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
        {kind === 'done'
          ? <button type="button" disabled={busy === r.id} onClick={() => void act(r, { action: 'undo' })} className="text-indigo-600 dark:text-indigo-400">Not done</button>
          : <button type="button" disabled={busy === r.id} onClick={() => void act(r, { action: 'done' }, 'Done')} className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />Done</button>}
        {kind !== 'done' && snoozeChoices(new Date()).map((c) => (
          <button key={c.id} type="button" disabled={busy === r.id} onClick={() => void act(r, { action: 'snooze', at: c.at.toISOString() }, `Moved to ${whenLabel(c.at.toISOString())}`)} className="text-zinc-600 dark:text-zinc-300">{kind === 'due' ? `Snooze: ${c.label.toLowerCase()}` : c.label}</button>
        ))}
        <button type="button" disabled={busy === r.id} onClick={() => void act(r, null)} className="text-zinc-500 inline-flex items-center gap-1 ml-auto" aria-label="Delete reminder"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
  if (isLoading) return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>;
  if (!data || (!data.due.length && !data.upcoming.length && !data.done.length)) {
    return (
      <div className="py-10 text-center">
        <AlarmClock className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <p className="font-semibold text-zinc-900 dark:text-white">Nothing for later</p>
        <p className="text-sm text-zinc-500 mt-1">Tap and hold (or use ⋮) on any message and choose Remind me. It comes back here, and as a notification, when it’s time.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {data.due.length > 0 && <section aria-label="Due"><h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-2">Due</h3><div className="space-y-2">{data.due.map((r) => row(r, 'due'))}</div></section>}
      {data.upcoming.length > 0 && <section aria-label="Coming up"><h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Coming up</h3><div className="space-y-2">{data.upcoming.map((r) => row(r, 'upcoming'))}</div></section>}
      {data.done.length > 0 && <section aria-label="Done this week"><h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Done this week</h3><div className="space-y-2">{data.done.map((r) => row(r, 'done'))}</div></section>}
      <p className="text-[11px] text-zinc-500">Reminders arrive as a notification within 15 minutes of their time.</p>
    </div>
  );
}

function StarredList({ onOpen }: { onOpen: (conversationId: string, messageId: string) => void }) {
  const { data, isLoading, mutate } = useSWR<StarredItem[]>('/api/chat/starred', authedJson);
  const unstar = async (m: StarredItem) => {
    mutate((cur) => cur?.filter((x) => x.id !== m.id), { revalidate: false });
    await chatJson(`/api/chat/messages/${m.id}/state`, { method: 'POST', body: JSON.stringify({ starred: false }) }).catch(() => mutate());
  };
  return (
    <>
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
    </>
  );
}

/** "Remind me" on a message: quick times, or a date and time. */
export function RemindSheet({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [choices] = useState(() => reminderChoices(new Date()));
  const save = async (id: string, at: Date) => {
    if (!validReminderTime(at, new Date())) { toast.error('Pick a time from 1 minute to 60 days ahead.'); return; }
    setBusy(id);
    try {
      await chatJson('/api/chat/reminders', { method: 'POST', body: JSON.stringify({ messageId: message.id, at: at.toISOString() }) });
      toast.success(`I’ll remind you ${whenLabel(at.toISOString())}`, { description: 'It’ll be on your Later list, under Saved.' });
      void mutate('/api/chat/reminders');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <Sheet title="Remind me about this" onClose={onClose}>
      <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2 mb-3">{message.sender?.name ? `${message.sender.name}: ` : ''}{previewText(message)}</p>
      <div className="space-y-1.5">
        {choices.map((c) => (
          <button key={c.id} type="button" disabled={!!busy} onClick={() => void save(c.id, c.at)} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.04] text-sm">
            <span className="font-medium text-zinc-900 dark:text-white">{c.label}</span>
            <span className="text-xs text-zinc-500 tabular-nums">{busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : whenLabel(c.at.toISOString())}</span>
          </button>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (custom) void save('custom', new Date(custom)); }}>
        <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Pick a date and time" className="input flex-1 min-w-0" />
        <button type="submit" disabled={!custom || !!busy} className="btn-primary shrink-0">{busy === 'custom' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set'}</button>
      </form>
      <p className="text-[11px] text-zinc-500 mt-2">It comes as a notification within 15 minutes of the time.</p>
    </Sheet>
  );
}
