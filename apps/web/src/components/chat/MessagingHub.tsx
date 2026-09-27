'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, MessageSquarePlus, Search, Users, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from './MessageBubble';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { type ConversationSummary, previewText, timeLabel } from './chat-client';

type Filter = 'all' | 'unread' | 'groups';

export function MessagingHub() {
  const { data, error, isLoading, mutate } = useSWR<{ conversations: ConversationSummary[]; me: string }>('/api/chat/conversations', authedJson, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<null | 'chat' | 'group'>(null);

  // Open a conversation from a link (?c=<id>), e.g. from a call notification.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setActiveId(c);
  }, []);

  const select = useCallback((id: string | null) => {
    setActiveId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('c', id); else url.searchParams.delete('c');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const conversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.conversations ?? []).filter((c) => {
      if (filter === 'unread' && c.unread === 0) return false;
      if (filter === 'groups' && !c.isGroup) return false;
      return !q || c.title.toLowerCase().includes(q) || (c.lastMessage?.body ?? '').toLowerCase().includes(q);
    });
  }, [data, search, filter]);
  const totalUnread = (data?.conversations ?? []).reduce((n, c) => n + c.unread, 0);

  return (
    <div className="flex-1 flex min-h-0 md:p-5 lg:p-6 md:gap-5">
      {/* Conversation list */}
      <section className={cn(
        'w-full md:w-[360px] lg:w-[380px] shrink-0 flex flex-col min-h-0 md:rounded-3xl md:border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl overflow-hidden',
        activeId ? 'hidden md:flex' : 'flex',
      )}>
        <div className="p-4 pb-3 space-y-3 border-b border-zinc-200/80 dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
              Chats {totalUnread > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">{totalUnread}</span>}
            </h2>
            <div className="flex gap-1">
              <button onClick={() => setDialog('group')} aria-label="New group" title="New group" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Users className="w-5 h-5" /></button>
              <button onClick={() => setDialog('chat')} aria-label="New chat" title="New chat" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><MessageSquarePlus className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </div>
          <div className="flex gap-2">
            {(['all', 'unread', 'groups'] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn('px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors', filter === f ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10')}>
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Groups'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>}
          {error && <p className="p-6 text-center text-sm text-rose-500">{(error as Error).message}</p>}
          {!isLoading && !error && conversations.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{search || filter !== 'all' ? 'No chats match' : 'No chats yet'}</p>
              <button onClick={() => setDialog('chat')} className="mt-3 text-sm font-semibold text-indigo-500">Start a new chat</button>
            </div>
          )}
          {conversations.map((c, i) => {
            const active = c.id === activeId;
            const typing = c.typing.length > 0;
            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
                onClick={() => select(c.id)}
                className={cn('w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors', active ? 'bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10' : 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]')}
              >
                <Avatar name={c.title} src={c.avatarUrl} online={c.online} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-zinc-900 dark:text-white truncate flex items-center gap-1">
                      {c.title} {c.isOfficial && <BadgeCheck className="w-4 h-4 text-indigo-500 shrink-0" />}
                    </p>
                    {c.lastMessage && <span className={cn('text-[11px] shrink-0', c.unread ? 'text-indigo-500 font-semibold' : 'text-zinc-400')}>{timeLabel(c.lastMessage.createdAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn('text-sm truncate', typing ? 'text-emerald-500 font-medium' : c.unread ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-500')}>
                      {typing ? `${c.isGroup ? c.typing[0] + ' is ' : ''}typing…` : `${c.lastMessage?.mine ? 'You: ' : ''}${previewText(c.lastMessage)}`}
                    </p>
                    {c.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{c.unread > 99 ? '99+' : c.unread}</span>}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Active chat */}
      <section className={cn(
        'relative flex-1 min-w-0 min-h-0 md:rounded-3xl md:border border-zinc-200/80 dark:border-white/[0.07] bg-white/50 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden',
        activeId ? 'flex' : 'hidden md:flex',
      )}>
        {activeId ? (
          <ChatWindow key={activeId} conversationId={activeId} onBack={() => select(null)} onChanged={() => mutate()} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-indigo-500/20 mb-5">
              <MessageSquarePlus className="w-9 h-9 text-white" />
            </div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white">UniVerse Messages</h3>
            <p className="text-sm text-zinc-500 mt-2 max-w-sm">Chat one-to-one or in groups, share photos, files and voice messages, and start voice or video calls with anyone on your campus.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDialog('chat')} className="px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-sm font-bold shadow-lg shadow-indigo-500/25">New chat</button>
              <button onClick={() => setDialog('group')} className="px-5 py-2.5 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200">New group</button>
            </div>
            <p className="mt-8 text-[11px] text-zinc-400 inline-flex items-center gap-1.5"><Lock className="w-3 h-3" /> Only people in a chat can see its messages</p>
          </div>
        )}
      </section>

      <AnimatePresence>
        {dialog && (
          <NewChatDialog
            initialMode={dialog}
            onClose={() => setDialog(null)}
            onOpen={(id) => { setDialog(null); mutate(); select(id); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
