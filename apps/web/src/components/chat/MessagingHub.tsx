'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { useChatLock, watchRelock } from '@/lib/chat-lock';
import { Archive, ArchiveRestore, ArrowLeft, BadgeCheck, Bell, BellOff, Loader2, Lock, MailOpen, MessageSquarePlus, MoreHorizontal, Pin, PinOff, Search, Star, Users, Plus, Pencil, FolderPlus, FolderMinus, Clock, Hash, Sparkles, MessagesSquare, UserRound, Share2, ImageIcon, type LucideIcon } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from '@/components/ui/Avatar';
import { type ConversationSummary, auraOf, chatJson, plainText, previewText, timeLabel } from './chat-client';
import { keepDraft, pickDraft, useLocalDrafts } from '@/lib/chat-drafts';
import { clearPhotos, clearShare, givePhotos, pendingShare } from '@/lib/share-in';
import { useLiveInterval } from '@/lib/realtime-client';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import type { ChatFolder } from './ChatFolders';
import type { LaterData } from './ChatDialogs';
import { useOnceParam } from '@/lib/use-once-param';

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
const SavedPanel = dynamic(() => import('./ChatDialogs').then((m) => m.SavedPanel));
const CommunitiesPanel = dynamic(() => import('./CommunitiesPanel').then((m) => m.CommunitiesPanel), { loading: () => <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div> });
const PresencePicker = dynamic(() => import('./PresencePicker').then((m) => m.PresencePicker));
const StatusBar = dynamic(() => import('./StatusBar').then((m) => m.StatusBar), { loading: () => <div className="h-[88px]" /> });

interface FoundMessage { id: string; conversationId: string; title: string; avatar: string | null; sender: string; snippet: string; createdAt: string }

const SEARCH_CHIPS: [string, string][] = [['from:me', 'From me'], ['has:file', 'Files'], ['has:link', 'Links'], ['has:photo', 'Photos'], ['has:voice', 'Voice'], ['after:', 'Last 7 days']];

export function MessagingHub() {
  const [weekAgo] = useState(() => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  // Locked chats (1.10): no preview in the list until unlocked on this device.
  const lockedChats = useChatLock((s) => s.chats);
  const lockOpen = useChatLock((s) => s.unlocked);
  useEffect(() => watchRelock(), []);
  const refreshInterval = useLiveInterval(15_000, 0);
  const drafts = useLocalDrafts();
  const { data, error, isLoading, mutate } = useSWR<{ conversations: ConversationSummary[]; me: string }>('/api/chat/conversations', authedJson, {
    refreshInterval,
    revalidateOnFocus: true,
  });
  // A link can open a conversation (?c=<id>), e.g. from a call notification. (Dashboard pages
  // render only in the browser, so the URL can be read straight away.)
  const [activeId, setActiveId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('c'));
  // Arriving from another page in the app (router.push('…/inbox?c=…')), the address changes just
  // after the first render, so ?c= is read once more then; otherwise the chat didn't open.
  useEffect(() => {
    const t = setTimeout(() => {
      const c = new URLSearchParams(window.location.search).get('c');
      if (c) setActiveId((cur) => cur ?? c);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<null | 'chat' | 'group'>(null);
  useOnceParam('new', (v) => setDialog(v === 'group' ? 'group' : 'chat')); // ?new=chat from the phone's "+" menu
  const [view, setView] = useState<'chats' | 'archived'>('chats');
  // Chats, or Communities (Discord-style servers with channels).
  // A club's space (upgrade 7) and community invite links (?join=) open on Communities.
  const [space, setSpace] = useState<'chats' | 'communities'>(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('space') === 'communities' || sp.get('join') ? 'communities' : 'chats';
  });
  const [savedOpen, setSavedOpen] = useState(false);
  // Reminders that came up and aren't done (Stage 5 · B7.1): a badge on Saved.
  const { data: later } = useSWR<LaterData>('/api/chat/reminders', authedJson, { revalidateOnFocus: false });
  const dueCount = later?.due.length ?? 0;
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  // A reminder opens its message (?c=…&m=…) or the Later list (?later=1) (Stage 5 · B7.1).
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      const m = sp.get('m');
      if (sp.get('c') && m) setJumpTo((cur) => cur ?? m);
      if (sp.get('later')) setSavedOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
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
    try {
      await chatJson(`/api/chat/conversations/${c.id}/prefs`, { method: 'PATCH', body: JSON.stringify(body) });
      // Archiving (or taking out of the archive) can be undone from the message.
      if (ok) toast.success(ok, 'archived' in body ? { action: { label: 'Undo', onClick: () => void setPref(c, { archived: !body.archived }) } } : undefined);
    }
    catch (e) { toast.error((e as Error).message); }
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

  // Join a community from its invite link (?join=<code>).
  useEffect(() => {
    const join = new URLSearchParams(window.location.search).get('join');
    if (join) {
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

  // Something shared from another app (src/lib/share-in.ts): the chat picked next gets the text as
  // its draft and the photos waiting above its box.
  const [shared, setShared] = useState(() => pendingShare());
  const select = useCallback((id: string | null) => {
    const pending = pendingShare();
    if (id && pending.text) { keepDraft(id, pending.text); clearShare(); }
    if (id && pending.photos) givePhotos(id);
    if (id && (pending.text || pending.photos)) setShared({ text: null, photos: 0 });
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
      return !q || c.title.toLowerCase().includes(q) || (!lockedChats.includes(c.id) && (c.lastMessage?.body ?? '').toLowerCase().includes(q));
    });
  }, [data, search, filter, view, activeFolder, lockedChats]);
  const totalUnread = (data?.conversations ?? []).filter((c) => !c.muted && !c.archived).reduce((n, c) => n + c.unread, 0);
  const archivedCount = (data?.conversations ?? []).filter((c) => c.archived).length;
  const archivedUnread = (data?.conversations ?? []).filter((c) => c.archived && c.unread > 0).length;
  // Chat streaks (M17, Snapchat): days in a row we've both written, on one-to-one chats.
  const { data: streakData } = useSWR<{ streaks: Record<string, number> }>('/api/chat/streaks', authedJson, { revalidateOnFocus: false });
  const streaks = streakData?.streaks ?? {};
  // Pinned chats float as big pictures at the top (iMessage) when the whole list is showing.
  const showPins = space === 'chats' && view === 'chats' && filter === 'all' && !search.trim();
  const pinnedChats = showPins ? conversations.filter((c) => c.pinned).slice(0, 8) : [];
  const listed = pinnedChats.length ? conversations.filter((c) => !pinnedChats.includes(c)) : conversations;
  // Where the chosen row was, so the chat opens out from it (the portal, M17).
  const chatSide = useRef<HTMLElement>(null);
  const [portalY, setPortalY] = useState(50);
  const openFrom = (id: string, e: React.MouseEvent) => {
    const top = chatSide.current?.getBoundingClientRect().top ?? 0;
    setPortalY(Math.max(0, e.clientY - top));
    select(id);
  };
  // The folder rail (Telegram desktop): the built-in views, then my folders.
  const go = (to: { space?: 'chats' | 'communities'; view?: 'chats' | 'archived'; filter?: Filter }) => { setSpace(to.space ?? 'chats'); setView(to.view ?? 'chats'); setFilter(to.filter ?? 'all'); };
  const rail: { id: string; label: string; icon: LucideIcon | string; on: boolean; count?: number; run: () => void }[] = [
    { id: 'all', label: 'All chats', icon: MessagesSquare, on: space === 'chats' && view === 'chats' && filter === 'all', count: totalUnread, run: () => go({}) },
    { id: 'unread', label: 'Unread', icon: MailOpen, on: space === 'chats' && view === 'chats' && filter === 'unread', run: () => go({ filter: 'unread' }) },
    { id: 'direct', label: 'Direct', icon: UserRound, on: space === 'chats' && view === 'chats' && filter === 'direct', run: () => go({ filter: 'direct' }) },
    { id: 'groups', label: 'Groups', icon: Users, on: space === 'chats' && view === 'chats' && filter === 'groups', run: () => go({ filter: 'groups' }) },
    { id: 'communities', label: 'Communities', icon: Hash, on: space === 'communities', run: () => go({ space: 'communities' }) },
    { id: 'archived', label: 'Archived', icon: Archive, on: space === 'chats' && view === 'archived', count: archivedUnread, run: () => go({ view: 'archived' }) },
    ...folders.map((f) => ({ id: `folder:${f.id}`, label: f.name, icon: f.emoji || '📁', on: space === 'chats' && view === 'chats' && filter === `folder:${f.id}`, run: () => go({ filter: `folder:${f.id}` as Filter }) })),
  ];

  // The empty chat side offers the latest few chats to jump back into.
  const recent = useMemo(() => (data?.conversations ?? []).filter((c) => !c.archived && c.lastMessage).slice(0, 4), [data]);

  return (
    <div className="flex-1 flex min-h-0 md:p-5 lg:p-6 md:gap-4">
      {/* The folder rail (wide screens). */}
      <nav aria-label="Chat folders" className="msg-panel hidden md:flex flex-col items-center gap-1 w-16 shrink-0 py-3 rounded-3xl bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl overflow-y-auto [scrollbar-width:none]">
        {rail.map((r, i) => (
          <div key={r.id} className="contents">
            {i === 6 && <span aria-hidden className="my-1 h-px w-7 shrink-0 bg-zinc-200 dark:bg-white/10" />}
            <button type="button" onClick={r.run} aria-label={r.count ? `${r.label}, ${r.count} unread` : r.label} aria-current={r.on ? 'true' : undefined} title={r.label}
              className={cn('group relative isolate shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-colors duration-200', r.on ? 'text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
              {r.on && <>
                <motion.span layoutId="rail-pill" transition={spring.snappy} className="rail-pill absolute inset-0 -z-10 rounded-2xl" aria-hidden />
                <motion.span layoutId="rail-edge" transition={spring.smooth} className="rail-edge absolute -start-[10px] top-2 bottom-2 w-1 rounded-full" aria-hidden />
              </>}
              {typeof r.icon === 'string' ? <span className="text-lg leading-none" aria-hidden>{r.icon}</span> : <r.icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" aria-hidden />}
              {!!r.count && <span key={r.count} className="badge-bump absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white text-[10px] font-bold leading-[18px] text-center ring-2 ring-white dark:ring-[#0b0b0c]">{r.count > 99 ? '99+' : r.count}</span>}
            </button>
          </div>
        ))}
        {folders.length < 10 && (
          <button type="button" onClick={() => setFolderEdit('new')} aria-label="New folder" title="New folder" className="shrink-0 w-11 h-11 rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 text-zinc-400 hover:text-indigo-500 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
        )}
        {activeFolder && <button type="button" onClick={() => setFolderEdit(activeFolder)} aria-label={`Edit ${activeFolder.name}`} title={`Edit ${activeFolder.name}`} className="shrink-0 w-11 h-11 rounded-2xl text-zinc-400 hover:text-indigo-500 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>}
        <button type="button" onClick={() => setSavedOpen(true)} aria-label={dueCount ? `Saved: ${dueCount} reminder${dueCount === 1 ? '' : 's'} due` : 'Saved: later and starred'} title="Saved" className="relative mt-auto shrink-0 w-11 h-11 rounded-2xl text-zinc-500 dark:text-zinc-400 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center justify-center">
          <Star className="w-5 h-5" />
          {dueCount > 0 && <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-[18px] text-center">{dueCount > 9 ? '9+' : dueCount}</span>}
        </button>
      </nav>
      {/* Conversation list */}
      <section className={cn(
        'msg-panel w-full md:w-[340px] lg:w-[360px] shrink-0 flex flex-col min-h-0 md:rounded-3xl bg-white/70 dark:bg-white/[0.035] max-md:dark:bg-[#141416]/85 backdrop-blur-xl overflow-hidden md:shadow-[0_24px_60px_-30px_rgb(79_70_229/0.45)]',
        activeId ? 'hidden md:flex' : 'flex',
      )}>
        <div className="p-4 pb-3 space-y-3 border-b border-zinc-200/80 dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              {view === 'archived' ? (
                <><button onClick={() => setView('chats')} aria-label="Back to chats" className="p-1 -ms-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button> Archived</>
              ) : (
                <>{space === 'communities' ? 'Communities' : filter === 'all' ? 'Chats' : rail.find((r) => r.on)?.label ?? 'Chats'} {totalUnread > 0 && <span key={totalUnread} className="badge-bump text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white shadow-[0_0_14px_-2px_rgb(217_70_239/0.7)]">{totalUnread}</span>}</>
              )}
            </h2>
            <div className="flex gap-1 items-center">
              <PresencePicker />
              <button onClick={() => setSavedOpen(true)} aria-label={dueCount ? `Saved: ${dueCount} reminder${dueCount === 1 ? '' : 's'} due` : 'Saved: later and starred'} title="Later and starred" className="md:hidden relative p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-amber-500 hover:bg-zinc-100 dark:hover:bg-white/10">
                <Star className="w-5 h-5" />
                {dueCount > 0 && <span className="absolute top-0.5 end-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-4 text-center">{dueCount > 9 ? '9+' : dueCount}</span>}
              </button>
              <button onClick={() => setDialog('group')} aria-label="New group" title="New group" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Users className="w-5 h-5" /></button>
              <button onClick={() => setDialog('chat')} aria-label="New chat" title="New chat" className="p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><MessageSquarePlus className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="md:hidden flex p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.05]" role="tablist" aria-label="Chats or communities">
            {(['chats', 'communities'] as const).map((sp) => (
              <button key={sp} role="tab" aria-selected={space === sp} onClick={() => setSpace(sp)} className={cn('relative flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors', space === sp ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}>
                {space === sp && <motion.span layoutId="hub-space" className="absolute inset-0 rounded-xl bg-white dark:bg-white/10 shadow-sm" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <span className="relative">{sp === 'chats' ? 'Chats' : 'Communities'}</span>
              </button>
            ))}
          </div>
          {space === 'chats' && <>
          {(shared.text || shared.photos > 0) && (
            <div role="status" className="rise-in flex items-center gap-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/[0.07] px-3.5 py-2.5">
              {shared.photos ? <ImageIcon className="w-4 h-4 shrink-0 text-fuchsia-500 dark:text-fuchsia-300" aria-hidden /> : <Share2 className="w-4 h-4 shrink-0 text-fuchsia-500 dark:text-fuchsia-300" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Pick a chat to send {shared.photos ? (shared.photos === 1 ? 'the photo' : `${shared.photos} photos`) : 'it'} to</p>
                {shared.text && <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate" translate="no">{shared.text}</p>}
              </div>
              <button type="button" onClick={() => { clearShare(); clearPhotos(); setShared({ text: null, photos: 0 }); }} className="btn-ghost btn-sm shrink-0">Cancel</button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats and messages" aria-label="Search chats and messages" title="Filters: from:name, in:chat, has:file, has:link, has:photo, has:voice, before:2026-10-01, after:2026-09-01" className="msg-search w-full ps-10 pe-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none transition-shadow duration-200" />
          </div>
          {/* Message search filters (1.14): each chip adds or removes its filter in the search box. */}
          <AnimatePresence initial={false}>
            {search.trim() && (
              <motion.div key="search-filters" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
                {SEARCH_CHIPS.map(([token, label]) => {
                  const tok = token === 'after:' ? `after:${weekAgo}` : token;
                  const on = token === 'after:' ? /(^|\s)after:\S+/.test(search) : search.split(/\s+/).includes(tok);
                  return (
                    <button key={token} type="button" aria-pressed={on} onClick={() => setSearch((cur) => {
                      const rest = cur.split(/\s+/).filter((w) => w && (token === 'after:' ? !w.startsWith('after:') : w !== tok));
                      return (on ? rest : [...rest, tok]).join(' ') + ' ';
                    })} className={cn('shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors', on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300')}>{label}</button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="md:hidden flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-1 px-1 pb-0.5">
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
          {/* Shaped like the chats coming (a picture, a name and a line), not a spinner. */}
          {isLoading && (
            <div role="status" aria-label="Loading" className="space-y-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="skeleton w-12 h-12 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="skeleton h-3.5 rounded-md" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
                    <div className="skeleton h-3 rounded-md" style={{ width: `${55 + ((i * 23) % 35)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <p className="p-6 text-center text-sm text-rose-500">{(error as Error).message}</p>}
          {view === 'chats' && archivedCount > 0 && !search && (
            <button onClick={() => setView('archived')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-start hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]">
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
          {/* The CSS cascade, not a JS animation per row (that restyled every row each frame while
              the tab drew on a slow phone). */}
          {pinnedChats.length > 0 && (
            <div className="px-1 pt-1 pb-2 grid grid-cols-4 gap-1" aria-label="Pinned chats" role="list">
              {pinnedChats.map((c, i) => (
                <button key={c.id} role="listitem" type="button" onClick={(e) => openFrom(c.id, e)} aria-label={`${c.title}${c.unread ? `, ${c.unread} unread` : ''}${c.typing.length ? ', typing' : ''}`}
                  className={cn('group relative flex flex-col items-center gap-1.5 pt-3 pb-2 rounded-2xl transition-colors', c.id === activeId ? 'bg-indigo-500/10' : 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]')}>
                  {c.typing.length > 0 && <span className="pin-typing absolute top-0 end-2 z-10 px-1.5 py-1 rounded-full bg-white dark:bg-[#2a2927] shadow-md text-emerald-500"><span className="typing-dots" aria-hidden><i /><i /><i /></span></span>}
                  <span className="pin-float row-aura on" style={{ ['--i' as string]: i, ['--aura' as string]: auraOf(c.otherUserId ?? c.id) }}>
                    <span className={cn('block rounded-full', c.unread > 0 && !c.muted && 'msg-ring')}><Avatar name={c.title} src={c.avatarUrl} online={c.online} size={52} /></span>
                  </span>
                  {c.unread > 0 && <span key={c.unread} className="badge-bump absolute top-1.5 start-2 min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#0b0b0c]">{c.unread > 99 ? '99+' : c.unread}</span>}
                  <span className="max-w-full px-1 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100" translate="no">{c.isGroup ? c.title : c.title.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="stagger">
          {listed.map((c) => {
            const active = c.id === activeId;
            const typing = c.typing.length > 0;
            // What I was writing there (this device's or my account's, whichever is newer).
            const draft = active ? '' : pickDraft(drafts[c.id] ?? null, { text: c.draft, at: c.draftAt }).trim();
            return (
              <div key={c.id} className="group relative">
              <button
                onClick={(e) => { if (menuFor) return setMenuFor(null); openFrom(c.id, e); }}
                onContextMenu={(e) => { e.preventDefault(); setMenuFor(c.id); }}
                onPointerDown={(e) => { if (e.pointerType === 'touch') press.current = setTimeout(() => { haptic('tap'); setMenuFor(c.id); }, 480); }}
                onPointerUp={() => press.current && clearTimeout(press.current)}
                // Only the finger: a "mouse left" right after a touch starts would cancel the press.
                onPointerLeave={(e) => e.pointerType === 'touch' && press.current && clearTimeout(press.current)}
                className={cn('relative isolate w-full flex items-center gap-3 p-3 rounded-2xl text-start transition-colors', active ? '' : 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.045]', c.unread > 0 && !c.muted && !active && 'msg-unread-edge')}
              >{active && <TabPill id="components-chat-messaginghub-1" variant="soft" />}
                <span className={cn('row-aura shrink-0', c.unread > 0 && !c.muted && 'on')} style={{ ['--aura' as string]: auraOf(c.otherUserId ?? c.id) }}>
                {c.unread > 0 && !c.muted
                  ? <span key={`${c.id}:ring`} className="msg-ring msg-ring-new block"><Avatar name={c.title} src={c.avatarUrl} online={c.online} size={44} /></span>
                  : <Avatar name={c.title} src={c.avatarUrl} online={c.online} size={48} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-zinc-900 dark:text-white truncate flex items-center gap-1">
                      {c.private && <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-label="Private chat" />}{c.title} {c.isOfficial && <BadgeCheck className="w-4 h-4 text-indigo-500 shrink-0" />}{c.status?.statusEmoji && <span className="shrink-0 text-sm" title={c.status.statusText ?? undefined}>{c.status.statusEmoji}</span>}
                    </p>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {!c.isGroup && streaks[c.id] && <span className="streak" title={`${streaks[c.id]}-day streak: you've both written every day`} aria-label={`${streaks[c.id]}-day streak`}><i aria-hidden>🔥</i>{streaks[c.id]}</span>}
                      {c.lastMessage && <span className={cn('text-[11px]', c.unread && !c.muted ? 'text-indigo-500 font-semibold' : 'text-zinc-400')}>{timeLabel(c.lastMessage.createdAt)}</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn('text-sm truncate', typing ? 'text-emerald-500 font-medium' : c.unread && !draft ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-500')}>
                      {!lockOpen && lockedChats.includes(c.id) ? <span className="inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" />Locked chat</span> : typing ? <span className="inline-flex items-center gap-1.5"><span className="typing-dots" aria-hidden><i /><i /><i /></span>{`${c.isGroup ? c.typing[0] + ' is ' : ''}typing`}</span> : draft
                        ? <><span className="font-medium text-fuchsia-600 dark:text-fuchsia-400">Draft: </span>{plainText(draft)}</>
                        : `${c.lastMessage?.mine ? 'You: ' : ''}${previewText(c.lastMessage)}`}
                    </p>
                    <span className="flex items-center gap-1 shrink-0 text-zinc-400">
                      {c.muted && <BellOff className="w-3.5 h-3.5" />}
                      {c.pinned && <Pin className="w-3.5 h-3.5 rotate-45" />}
                      {c.unread > 0 && <span key={c.unread} className={cn('badge-bump min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center', c.muted ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 shadow-[0_0_12px_-2px_rgb(217_70_239/0.8)]')}>{c.markedUnread && c.unread === 1 ? '' : c.unread > 99 ? '99+' : c.unread}</span>}
                    </span>
                  </div>
                </div>
              </button>
              {(
                <button onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }} aria-label="Chat options"
                  className={cn('absolute end-2 top-2 p-1 rounded-full bg-white/90 dark:bg-[#141416]/90 text-zinc-500 shadow-sm transition-opacity hidden md:block', menuFor === c.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              )}
              {menuFor === c.id && (
                <div className="menu-pop absolute end-2 top-9 z-30 w-52 py-1 rounded-xl bg-white/95 dark:bg-[#141416]/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-indigo-950/40 text-sm" onMouseLeave={() => setMenuFor(null)}>
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
              </div>
            );
          })}
          </div>
          {deepQ.length >= 2 && (
            <div className="mt-2">
              <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-2">Messages {searching && <Loader2 className="w-3 h-3 animate-spin" />}</p>
              {found && found.length === 0 && !searching && <p className="px-3 pb-3 text-sm text-zinc-500">No messages contain “{deepQ}”.</p>}
              {found?.map((m) => (
                <button key={m.id} onClick={() => { select(m.conversationId); setJumpTo(m.id); }} className="w-full flex items-start gap-3 p-3 rounded-2xl text-start hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]">
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
      <section ref={chatSide} className={cn(
        'msg-panel relative flex-1 min-w-0 min-h-0 md:rounded-3xl bg-white/50 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden md:shadow-[0_24px_60px_-30px_rgb(192_38_211/0.35)]',
        activeId ? 'flex' : 'hidden md:flex',
      )}>
        {activeId ? (
          <div key={activeId} className="chat-glide flex-1 flex min-w-0 min-h-0" style={{ ['--py' as string]: `${portalY}px` }}>
            <ChatWindow conversationId={activeId} jumpTo={jumpTo} onBack={() => select(null)} onChanged={() => mutate()} onOpenChat={(id) => { mutate(); select(id); }} />
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col items-center justify-center text-center p-8 overflow-hidden">
            {/* A slow orbit of light round the mark (CSS: transform only, still with Reduce Motion). */}
            <div aria-hidden className="relative w-52 h-52 flex items-center justify-center">
              <div className="msg-halo absolute inset-0 rounded-full" />
              <div className="msg-orbit inset-1"><i /></div>
              <div className="msg-orbit msg-orbit-2 inset-9"><i /></div>
              <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-fuchsia-500/30">
                <MessageSquarePlus className="w-9 h-9 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white">UniVerse <span className="font-serif italic font-normal bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500 dark:from-indigo-200 dark:via-fuchsia-200 dark:to-pink-200 bg-clip-text text-transparent pe-1">Messages</span></h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-sm">Chat one-to-one or in groups, share photos, files and voice messages, and start voice or video calls with anyone on your campus.</p>
            <div className="stagger grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 w-full max-w-lg">
              {([
                [MessageSquarePlus, 'New chat', () => setDialog('chat')],
                [Users, 'New group', () => setDialog('group')],
                [Hash, 'Communities', () => setSpace('communities')],
                [Star, 'Saved', () => setSavedOpen(true)],
              ] as const).map(([Icon, label, go]) => (
                <button key={label} type="button" onClick={go} className="group flex flex-col items-center gap-2 py-4 rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.07] text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-fuchsia-400/40 hover:bg-white dark:hover:bg-white/[0.07] active:scale-[0.97]">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-600 dark:text-fuchsia-200 flex items-center justify-center transition-transform duration-200 group-hover:scale-110"><Icon className="w-5 h-5" /></span>
                  {label}
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <div className="mt-6 w-full max-w-lg">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-fuchsia-500" /> Jump back in</p>
                <div className="stagger flex flex-wrap justify-center gap-2">
                  {recent.map((c) => (
                    <button key={c.id} type="button" onClick={() => select(c.id)} className="inline-flex items-center gap-2 ps-1 pe-3 py-1 rounded-full bg-white/70 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] text-sm text-zinc-800 dark:text-zinc-100 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/[0.09]">
                      <Avatar name={c.title} src={c.avatarUrl} size={26} />
                      <span className="max-w-[9rem] truncate">{c.title}</span>
                      {c.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white text-[11px] font-bold flex items-center justify-center">{c.unread > 99 ? '99+' : c.unread}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5"><Lock className="w-3 h-3" /> Only people in a chat can see its messages</p>
          </div>
        )}
      </section>

      {folderEdit && (
        <FolderSheet folder={folderEdit === 'new' ? null : folderEdit} chats={(data?.conversations ?? []).filter((c) => !c.archived)} onClose={() => setFolderEdit(null)}
          onSave={async (f) => { await saveFolders(folderEdit === 'new' ? [...folders, f] : folders.map((x) => (x.id === f.id ? f : x))); setFilter(`folder:${f.id}`); }}
          onDelete={folderEdit === 'new' ? undefined : async () => { const id = folderEdit.id; await saveFolders(folders.filter((x) => x.id !== id)); setFilter('all'); }} />
      )}
      {muteFor && <MuteUntilSheet title={muteFor.title} onClose={() => setMuteFor(null)} onMute={(until) => setPref(muteFor, { muted: { until: until.toISOString() } }, `Muted until ${until.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`)} />}
      {savedOpen && <SavedPanel onClose={() => setSavedOpen(false)} onOpen={(cid, mid) => { setSavedOpen(false); select(cid); setJumpTo(mid); }} />}

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
