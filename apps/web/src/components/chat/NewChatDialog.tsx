'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, Loader2, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from './MessageBubble';
import { chatJson } from './chat-client';

type Person = { id: string; name: string; avatar: string | null; role: string; online: boolean };
const ROLE_LABEL: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin', INDUSTRY_MENTOR: 'Mentor' };

export function NewChatDialog({ initialMode = 'chat', onClose, onOpen }: { initialMode?: 'chat' | 'group'; onClose: () => void; onOpen: (id: string) => void }) {
  const [mode, setMode] = useState<'chat' | 'group'>(initialMode);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Person[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data: people, isLoading } = useSWR<Person[]>(`/api/chat/users?q=${encodeURIComponent(debounced)}`, authedJson);

  const startChat = async (p: Person) => {
    setBusy(true);
    try {
      const { id } = await chatJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: p.id }) });
      onOpen(id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    setBusy(true);
    try {
      const { id } = await chatJson<{ id: string }>('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ name: groupName.trim(), memberIds: selected.map((s) => s.id) }),
      });
      toast.success(`"${groupName.trim()}" created`);
      onOpen(id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (p: Person) =>
    setSelected((cur) => (cur.some((s) => s.id === p.id) ? cur.filter((s) => s.id !== p.id) : [...cur, p]));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="p-5 pb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white">{mode === 'chat' ? 'New chat' : 'New group'}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 flex gap-2 mb-3">
          {(['chat', 'group'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn('flex-1 py-2 rounded-xl text-sm font-semibold transition-colors', mode === m ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>
              {m === 'chat' ? 'Direct message' : 'Group chat'}
            </button>
          ))}
        </div>
        {mode === 'group' && (
          <div className="px-5 mb-3">
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} placeholder="Group name" className="w-full px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selected.map((s) => (
                  <button key={s.id} onClick={() => toggle(s)} className="inline-flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs font-medium">
                    {s.name.split(' ')[0]} <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="px-5 mb-2 relative">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name or email" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>}
          {!isLoading && people?.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No people found.</p>}
          {people?.map((p) => {
            const isSel = selected.some((s) => s.id === p.id);
            return (
              <button key={p.id} disabled={busy} onClick={() => (mode === 'chat' ? startChat(p) : toggle(p))} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.04] text-left disabled:opacity-60">
                <Avatar name={p.name} src={p.avatar} online={p.online} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-zinc-500">{ROLE_LABEL[p.role] ?? p.role}{p.online ? ' · online' : ''}</p>
                </div>
                {mode === 'group' && (
                  <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center', isSel ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-zinc-600')}>
                    {isSel && <Check className="w-3 h-3" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {mode === 'group' && (
          <div className="p-4 border-t border-zinc-200 dark:border-white/10">
            <button onClick={createGroup} disabled={busy || !groupName.trim() || selected.length === 0} className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Create group{selected.length ? ` (${selected.length + 1})` : ''}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
