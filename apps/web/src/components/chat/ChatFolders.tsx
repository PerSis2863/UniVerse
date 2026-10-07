'use client';

import { useState } from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from './MessageBubble';
import { Sheet } from './ChatDialogs';
import type { ConversationSummary } from './chat-client';

// Chat folders (Stage 4 · 1.6): your own groupings of chats, shown as chips above the chat list and
// kept on your account (src/app/api/chat/folders). And "Mute until…" a time you choose.

export interface ChatFolder { id: string; name: string; emoji: string; chatIds: string[] }

const EMOJI = ['📁', '📚', '🏫', '💼', '👨‍👩‍👧', '⭐', '🎮', '⚽', '🎨', '💬'];

/** Make or change a folder: a name, an emoji, and which chats are in it. */
export function FolderSheet({ folder, chats, onSave, onDelete, onClose }: {
  folder: ChatFolder | null; chats: ConversationSummary[];
  onSave: (f: ChatFolder) => Promise<void>; onDelete?: () => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [emoji, setEmoji] = useState(folder?.emoji || '📁');
  const [picked, setPicked] = useState<Set<string>>(new Set(folder?.chatIds ?? []));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await onSave({ id: folder?.id ?? crypto.randomUUID().slice(0, 8), name: name.trim(), emoji, chatIds: [...picked] }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Sheet title={folder ? 'Edit folder' : 'New folder'} onClose={onClose} footer={
      <div className="flex gap-2">
        {onDelete && <button type="button" onClick={async () => { setBusy(true); try { await onDelete(); onClose(); } finally { setBusy(false); } }} className="px-4 py-2.5 rounded-2xl text-sm font-semibold text-rose-600 bg-rose-500/10 hover:bg-rose-500/15 inline-flex items-center gap-1.5"><Trash2 className="w-4 h-4" />Delete</button>}
        <button type="button" onClick={() => void save()} disabled={!name.trim() || busy} className="flex-1 btn-primary py-2.5 rounded-2xl text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save · {picked.size} chat{picked.size === 1 ? '' : 's'}</button>
      </div>
    }>
      <div className="space-y-4">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus placeholder="Folder name, e.g. Classes"
          className="w-full px-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <div className="flex flex-wrap gap-1.5">
          {EMOJI.map((e) => (
            <button key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} className={cn('w-10 h-10 rounded-xl text-xl transition-colors', emoji === e ? 'bg-indigo-500/20 ring-2 ring-indigo-500' : 'bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10')}>{e}</button>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Chats in this folder</p>
        <div className="space-y-0.5">
          {chats.map((c) => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 p-2 rounded-2xl text-left hover:bg-zinc-100 dark:hover:bg-white/[0.04]">
              <Avatar name={c.title} src={c.avatarUrl} size={36} />
              <span className="flex-1 truncate text-sm text-zinc-900 dark:text-white">{c.title}</span>
              <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors', picked.has(c.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-white/20')}>{picked.has(c.id) && <Check className="w-3 h-3" />}</span>
            </button>
          ))}
          {!chats.length && <p className="text-sm text-zinc-500">No chats yet.</p>}
        </div>
      </div>
    </Sheet>
  );
}

/** "Mute until…": a day and time you choose (up to a year ahead). */
export function MuteUntilSheet({ title, onMute, onClose }: { title: string; onMute: (until: Date) => Promise<void>; onClose: () => void }) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const [value, setValue] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return local(d); });
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const until = new Date(value);
  const valid = !Number.isNaN(until.getTime()) && until.getTime() > openedAt;
  return (
    <Sheet title={`Mute ${title}`} onClose={onClose} footer={
      <button type="button" disabled={!valid || busy} onClick={async () => { setBusy(true); try { await onMute(until); onClose(); } finally { setBusy(false); } }} className="w-full btn-primary py-2.5 rounded-2xl text-sm font-semibold disabled:opacity-50">
        {valid ? `Mute until ${until.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Choose a time later than now'}
      </button>
    }>
      <p className="text-sm text-zinc-500 mb-3">No notifications from this chat until then. Messages still arrive.</p>
      <input type="datetime-local" value={value} min={local(new Date(openedAt))} onChange={(e) => setValue(e.target.value)}
        className="w-full px-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
    </Sheet>
  );
}
