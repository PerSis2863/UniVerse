'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Archive, ArchiveRestore, ArrowLeft, BadgeCheck, Bell, BellOff, Loader2, Lock, MailOpen, MessageSquarePlus, MoreHorizontal, Pin, PinOff, Search, Star, Users, Plus, Pencil, FolderPlus, FolderMinus, Clock } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from './MessageBubble';
import { type ConversationSummary, chatJson, plainText, previewText, timeLabel } from './chat-client';
import { pickDraft, useLocalDrafts } from '@/lib/chat-drafts';
import { useLiveInterval } from '@/lib/realtime-client';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import type { ChatFolder } from './ChatFolders';

/** A built-in filter, or one of my folders (folder:<id>). */
type Filter = 'all' | 'unread' | 'direct' | 'groups' | `folder:${string}`;

// The open chat (composer, calls, files, translations...) and the dialogs are most of Messages'
// code. Loading them separately lets the chat list show first; they're fetched in the background
// right after, so opening a chat doesn't wait either.
const loadChatWindow = () => import('./ChatWindow');
const ChatWindow = dynamic(() => loadChatWindow().then((m) => m.ChatWindow), {
  loading: () => <div className="flex-1 min-w-0"><ContentSkeleton variant="chat" /></div>,
});
const NewChatDialog = dynamic(() => import('./NewChatDialog').then((m) => m.NewChatDialog));
const FolderSheet = dynamic(() => import('./ChatFolders').then((m) => m.FolderSheet));
const MuteUntilSheet = dynamic(() => import('./ChatFolders').then((m) => m.MuteUntilSheet));
const StarredPanel = dynamic(() => import('./ChatDialogs').then((m) => m.StarredPanel));
const CommunitiesPanel = dynamic(() => import('./CommunitiesPanel').then((m) => m.CommunitiesPanel), { loading: () => <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div> });
const PresencePicker = dynamic(() => import('./PresencePicker').then((m) => m.PresencePicker));
const StatusBar = dynamic(() => import('./StatusBar').then((m) => m.StatusBar), { loading: () => <div className="h-[88px]" /> });

interface FoundMessage { id: string; conversationId: string; title: string; avatar: string | null; sender: string; snippet: string; createdAt: string }

export function MessagingHub() {
  const refreshInterval = useLiveInterval(15_000, 0);
  const drafts = useLocalDrafts();
  const { data, error, isLoading, mutate } = useSWR<{ conversations: ConversationSummary[]; me: string }>('/api/chat/conversations', authedJson, {
    refreshInterval,
    revalidateOnFocus: true,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<null | 'chat' | 'group'>(null);
  const [view, setView] = useState<'chats' | 'archived'>('chats');
  // Chats, or Communities (Discord-style servers with channels).
  const [space, setSpace] = useState<'chats' | 'communities'>('chats');
  const [starredOpen, setStarredOpen] = useState(false);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // My folders (kept on my account), the one being made or changed, and "Mute until…".
  const { data: folderData, mutate: mutateFolders } = useSWR<{ folders: ChatFolder[] }>('/api/chat/folders', authedJson, { revalidateOnFocus: false });
  const folders = folderData?.folders ?? [];
  const [folderEdit, setFolderEdit] = useState<ChatFolder | 'new' | null>(null);
  const [muteFor, setMuteFor] = useState<ConversationSummary | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Searching also looks inside messages of every chat (after a short pause in typing).
  const [deepQ, setDeepQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDeepQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const { data: found, isLoading: searching } = useSWR<FoundMessage[]>(deepQ.length >= 2 ? `/api/chat/search?q=${encodeURIComponent(deepQ)}` : null, authedJson, { revalidateOnFocus: false });

  useEffect(() => {
    const t = window.setTimeout(() => { void loadChatWindow().catch(() => {}); }, 600);
    return () => window.clearTimeout(t);
  }, []);

  const setPref = async (c: ConversationSummary, body: Record<string, unknown>, ok?: string) => {
    setMenuFor(null);
    // Optimistic: reflect the change in the list right away.
    mutate((cur) => cur && {
      ...cur,
      conversations: cur.conversations.map((x) => x.id !== c.id ? x : {
        ...x,
        ...('pinned' in body ? { pinned: !!body.pinned } : {}),
        ...('muted' in body ? { muted: !!body.muted, mutedUntil: null } : {}),
        ...('archived' in body ? { archived: !!body.archived, pinned: body.archived ? false : x.pinned } : {}),
        ...('unread' in body ? { markedUnread: !!body.unread, unread: body.unread ? Math.max(1, x.unread) : 0 } : {}),
      }),
    }, { revalidate: false });
    try { await chatJson(`/api/chat/conversations/${c.id}/prefs`, { method: 'PATCH', body: JSON.stringify(body) }); if (ok) toast.success(ok); }
    catch (e: any) { toast.error(e.message); }
    finally { mutate(); }
  };

  const saveFolders = async (next: ChatFolder[]) => {
    mutateFolders({ folders: next }, { revalidate: false });
    try { await mutateFolders(chatJson<{ folders: ChatFolder[] }>('/api/chat/folders', { method: 'PUT', body: JSON.stringify({ folders: next }) }), { revalidate: false }); }
    catch (e) { toast.error((e as Error).message); void mutateFolders(); }
  };
  const toggleInFolder = (f: ChatFolder, chatId: string) => {
    setMenuFor(null);
    const has = f.chatIds.includes(chatId);
    void saveFolders(folders.map((x) => (x.id !== f.id ? x : { ...x, chatIds: has ? x.chatIds.filter((c) => c !== chatId) : [...x.chatIds, chatId] })));
    toast.success(has ? `Removed from ${f.name}` : `Added to ${f.name}`);
  };
  const activeFolder = filter.startsWith('folder:') ? folders.find((f) => `folder:${f.id}` === filter) ?? null : null;
  const mutedLabel = (c: ConversationSummary) => (!c.mutedUntil || new Date(c.mutedUntil).getFullYear() > 9000 ? 'Unmute' : `Unmute (muted until ${new Date(c.mutedUntil).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })})`);

  // Open a conversation from a link (?c=<id>), e.g. from a call notification; join a community
  // from its invite link (?join=<code>).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get('c');
    if (c) setActiveId(c);
    // A club's space (upgrade 7) opens on Communities.
    if (sp.get('space') === 'communities') setSpace('communities');
    const join = sp.get('join');
    if (join) {
      setSpace('communities');
      void chatJson<{ name: string }>('/api/chat/communities/join', { method: 'POST', body: JSON.stringify({ code: join }) })
        .then((r) => toast.success(`You joined ${r.name}`))
        .catch((e: Error) => toast.error(e.message))
        .finally(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('join');
          window.history.replaceState(null, '', url.toString());
        });
    }
  }, []);

  const select = useCallback((id: string | null) => {
    setJumpTo(null);
    setActiveId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('c', id); else url.searchParams.delete('c');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const conversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.conversations ?? []).filter((c) => {
      if ((view === 'archived') !== !!c.archived) return false;
      if (filter === 'unread' && c.unread === 0) return false;
      if (filter === 'groups' && !c.isGroup) return false;
      if (filter === 'direct' && c.isGroup) return false;
      if (filter.startsWith('folder:') && !activeFolder?.chatIds.includes(c.id)) return false;
      return !q || c.title.toLowerCase().includes(q) || (c.lastMessage?.body ?? '').toLowerCase().includes(q);
    });
  }, [data, search, filter, view, activeFolder]);
  const totalUnread = (data?.conversations ?? []).filter((c) => !c.muted && !c.archived).reduce((n, c) => n + c.unread, 0);
  const archivedCount = (data?.conversations ?? []).filter((c) => c.archived).length;
  const archivedUnread = (data?.conversations ?? []).filter((c) => c.archived && c.unread > 0).length;

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
              {view === 'archived' ? (
                <><button onClick={() => setView('chats')} aria-label="Back to chats" className="p-1 -ml-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button> Archived</>
              ) : (
                <>Chats {totalUnread > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">{totalUnread}</span>}</>
              )}
            </h2>
            <div className="flex gap-1 items-center">
              <PresencePicker />
              <button onClick={() => setStarredOpen(true)} aria-label="Starred messages" title="Starred messages" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Star className="w-5 h-5" /></button>
              <button onClick={() => setDialog('group')} aria-label="New group" title="New group" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Users className="w-5 h-5" /></button>
              <button onClick={() => setDialog('chat')} aria-label="New chat" title="New chat" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><MessageSquarePlus className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.05]" role="tablist" aria-label="Chats or communities">
            {(['chats', 'communities'] as const).map((sp) => (
              <button key={sp} role="tab" aria-selected={space === sp} onClick={() => setSpace(sp)} className={cn('relative flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors', space === sp ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}>
                {space === sp && <motion.span layoutId="hub-space" className="absolute inset-0 rounded-xl bg-white dark:bg-white/10 shadow-sm" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <span className="relative">{sp === 'chats' ? 'Chats' : 'Communities'}</span>
              </button>
            ))}
          </div>
          {space === 'chats' && <>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </div>
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-1 px-1 pb-0.5">
            {([['all', 'All'], ['unread', 'Unread'], ['direct', 'Direct'], ['groups', 'Groups'], ...folders.map((f) => [`folder:${f.id}`, `${f.emoji} ${f.name}`.trim()])] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={cn('relative isolate shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap', filter === f ? 'text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10')}>{filter === f && <TabPill id="components-chat-messaginghub-0" />}
                {label}
              </button>
            ))}
            {activeFolder ? (
              <button onClick={() => setFolderEdit(activeFolder)} aria-label={`Edit ${activeFolder.name}`} className="shrink-0 w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 hover:text-indigo-500 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
            ) : folders.length < 10 && (
              <button onClick={() => setFolderEdit('new')} title="New folder" className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-zinc-300 dark:border-white/15 text-zinc-500 hover:text-indigo-500 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Folder</button>
            )}
          </div>
          </>}
        </div>

        {space === 'communities' ? (
          <div className="flex-1 overflow-y-auto"><CommunitiesPanel activeId={activeId} onOpen={select} /></div>
        ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {view === 'chats' && !search && <div className="-mx-2 -mt-2 mb-1"><StatusBar /></div>}
          {isLoading && <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>}
          {error && <p className="p-6 text-center text-sm text-rose-500">{(error as Error).message}</p>}
          {view === 'chats' && archivedCount > 0 && !search && (
            <button onClick={() => setView('archived')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]">
              <span className="w-12 flex justify-center"><Archive className="w-5 h-5 text-zinc-500" /></span>
              <span className="flex-1 font-semibold text-sm text-zinc-800 dark:text-zinc-200">Archived</span>
              <span className="text-xs text-zinc-500">{archivedUnread > 0 ? <span className="text-indigo-500 font-semibold">{archivedUnread} unread</span> : archivedCount}</span>
            </button>
          )}
          {!isLoading && !error && conversations.length === 0 && !(found && found.length) && (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{view === 'archived' ? 'No archived chats' : search || filter !== 'all' ? 'No chats match' : 'No chats yet'}</p>
              <button onClick={() => setDialog('chat')} className="mt-3 text-sm font-semibold text-indigo-500">Start a new chat</button>
            </div>
          )}
          {conversations.map((c, i) => {
            const active = c.id === activeId;
            const typing = c.typing.length > 0;
            // What I was writing there (this device's or my account's, whichever is newer).
            const draft = active ? '' : pickDraft(drafts[c.id] ?? null, { text: c.draft, at: c.draftAt }).trim();
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="group relative">
              <button
                onClick={() => { if (menuFor) return setMenuFor(null); select(c.id); }}
                onContextMenu={(e) => { e.preventDefault(); setMenuFor(c.id); }}
                onPointerDown={(e) => { if (e.pointerType === 'touch') press.current = setTimeout(() => { haptic('tap'); setMenuFor(c.id); }, 480); }}
                onPointerUp={() => press.current && clearTimeout(press.current)}
                onPointerLeave={() => press.current && clearTimeout(press.current)}
                className={cn('relative isolate w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors', active ? '' : 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]')}
              >{active && <TabPill id="components-chat-messaginghub-1" variant="soft" />}
                <Avatar name={c.title} src={c.avatarUrl} online={c.online} size={48} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-zinc-900 dark:text-white truncate flex items-center gap-1">
                      {c.title} {c.isOfficial && <BadgeCheck className="w-4 h-4 text-indigo-500 shrink-0" />}{c.status?.statusEmoji && <span className="shrink-0 text-sm" title={c.status.statusText ?? undefined}>{c.status.statusEmoji}</span>}
                    </p>
                    {c.lastMessage && <span className={cn('text-[11px] shrink-0', c.unread && !c.muted ? 'text-indigo-500 font-semibold' : 'text-zinc-400')}>{timeLabel(c.lastMessage.createdAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn('text-sm truncate', typing ? 'text-emerald-500 font-medium' : c.unread && !draft ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-500')}>
                      {typing ? `${c.isGroup ? c.typing[0] + ' is ' : ''}typing…` : draft
                        ? <><span className="font-medium text-fuchsia-600 dark:text-fuchsia-400">Draft: </span>{plainText(draft)}</>
                        : `${c.lastMessage?.mine ? 'You: ' : ''}${previewText(c.lastMessage)}`}
                    </p>
                    <span className="flex items-center gap-1 shrink-0 text-zinc-400">
                      {c.muted && <BellOff className="w-3.5 h-3.5" />}
                      {c.pinned && <Pin className="w-3.5 h-3.5 rotate-45" />}
                      {c.unread > 0 && <span className={cn('min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center', c.muted ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-gradient-to-br from-indigo-600 to-fuchsia-600')}>{c.markedUnread && c.unread === 1 ? '' : c.unread > 99 ? '99+' : c.unread}</span>}
                    </span>
                  </div>
                </div>
              </button>
              {(
                <button onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }} aria-label="Chat options"
                  className={cn('absolute right-2 top-2 p-1 rounded-full bg-white/90 dark:bg-[#121830]/90 text-zinc-500 shadow-sm transition-opacity hidden md:block', menuFor === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              )}
              {menuFor === c.id && (
                <div className="absolute right-2 top-9 z-30 w-52 py-1 rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm" onMouseLeave={() => setMenuFor(null)}>
                  {!c.archived && <ListItem icon={c.pinned ? PinOff : Pin} label={c.pinned ? 'Unpin chat' : 'Pin chat'} onClick={() => setPref(c, { pinned: !c.pinned })} />}
                  {c.muted
                    ? <ListItem icon={Bell} label={mutedLabel(c)} onClick={() => setPref(c, { muted: false }, 'Unmuted')} />
                    : <>
                        <ListItem icon={BellOff} label="Mute for 1 hour" onClick={() => setPref(c, { muted: '1h' }, 'Muted for 1 hour')} />
                        <ListItem icon={BellOff} label="Mute for 8 hours" onClick={() => setPref(c, { muted: '8h' }, 'Muted for 8 hours')} />
                        <ListItem icon={BellOff} label="Mute for 1 week" onClick={() => setPref(c, { muted: '1w' }, 'Muted for 1 week')} />
                        <ListItem icon={Clock} label="Mute until…" onClick={() => { setMenuFor(null); setMuteFor(c); }} />
                        <ListItem icon={BellOff} label="Mute always" onClick={() => setPref(c, { muted: 'always' }, 'Muted')} />
                      </>}
                  {folders.map((f) => (
                    <ListItem key={f.id} icon={f.chatIds.includes(c.id) ? FolderMinus : FolderPlus} label={f.chatIds.includes(c.id) ? `Remove from ${f.name}` : `Add to ${f.name}`} onClick={() => toggleInFolder(f, c.id)} />
                  ))}
                  <ListItem icon={c.archived ? ArchiveRestore : Archive} label={c.archived ? 'Unarchive' : 'Archive chat'} onClick={() => setPref(c, { archived: !c.archived }, c.archived ? 'Moved back to Chats' : 'Chat archived')} />
                  <ListItem icon={MailOpen} label={c.unread > 0 ? 'Mark as read' : 'Mark as unread'} onClick={() => setPref(c, { unread: !(c.unread > 0) })} />
                </div>
              )}
              </motion.div>
            );
          })}
          {deepQ.length >= 2 && (
            <div className="mt-2">
              <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-2">Messages {searching && <Loader2 className="w-3 h-3 animate-spin" />}</p>
              {found && found.length === 0 && !searching && <p className="px-3 pb-3 text-sm text-zinc-500">No messages contain “{deepQ}”.</p>}
              {found?.map((m) => (
                <button key={m.id} onClick={() => { select(m.conversationId); setJumpTo(m.id); }} className="w-full flex items-start gap-3 p-3 rounded-2xl text-left hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]">
                  <Avatar name={m.title} src={m.avatar} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2"><span className="font-semibold text-sm text-zinc-900 dark:text-white truncate">{m.title}</span><span className="text-[11px] text-zinc-400 shrink-0">{timeLabel(m.createdAt)}</span></span>
                    <span className="block text-sm text-zinc-500 line-clamp-2"><span className="text-zinc-700 dark:text-zinc-300">{m.sender}: </span>{m.snippet}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </section>

      {/* Active chat */}
      <section className={cn(
        'relative flex-1 min-w-0 min-h-0 md:rounded-3xl md:border border-zinc-200/80 dark:border-white/[0.07] bg-white/50 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden',
        activeId ? 'flex' : 'hidden md:flex',
      )}>
        {activeId ? (
          <ChatWindow key={activeId} conversationId={activeId} jumpTo={jumpTo} onBack={() => select(null)} onChanged={() => mutate()} onOpenChat={(id) => { mutate(); select(id); }} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-indigo-500/20 mb-5">
              <MessageSquarePlus className="w-9 h-9 text-white" />
            </div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white">UniVerse Messages</h3>
            <p className="text-sm text-zinc-500 mt-2 max-w-sm">Chat one-to-one or in groups, share photos, files and voice messages, and start voice or video calls with anyone on your campus.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDialog('chat')} className="btn-primary rounded-full px-5">New chat</button>
              <button onClick={() => setDialog('group')} className="btn-secondary rounded-full px-5">New group</button>
            </div>
            <p className="mt-8 text-[11px] text-zinc-400 inline-flex items-center gap-1.5"><Lock className="w-3 h-3" /> Only people in a chat can see its messages</p>
          </div>
        )}
      </section>

      {folderEdit && (
        <FolderSheet folder={folderEdit === 'new' ? null : folderEdit} chats={(data?.conversations ?? []).filter((c) => !c.archived)} onClose={() => setFolderEdit(null)}
          onSave={async (f) => { await saveFolders(folderEdit === 'new' ? [...folders, f] : folders.map((x) => (x.id === f.id ? f : x))); setFilter(`folder:${f.id}`); }}
          onDelete={folderEdit === 'new' ? undefined : async () => { const id = folderEdit.id; await saveFolders(folders.filter((x) => x.id !== id)); setFilter('all'); }} />
      )}
      {muteFor && <MuteUntilSheet title={muteFor.title} onClose={() => setMuteFor(null)} onMute={(until) => setPref(muteFor, { muted: { until: until.toISOString() } }, `Muted until ${until.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`)} />}
      {starredOpen && <StarredPanel onClose={() => setStarredOpen(false)} onOpen={(cid, mid) => { setStarredOpen(false); select(cid); setJumpTo(mid); }} />}

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

function ListItem({ icon: Icon, label, onClick }: { icon: typeof Pin; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
