'use client';
import { useRouter } from 'next/navigation';
import { AttachmentInline } from './AttachmentInline';
import { haptic } from '@/lib/haptics';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, CheckCheck, BadgeCheck, BellOff, Hash, Headphones, Megaphone, Sparkles, ChevronDown, ChevronUp, FileText, Info, Loader2, LogOut, Pencil, Phone, Search, Star, Timer, Upload, UserPlus, Video, X, Pin, PinOff, Link2, Languages, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar, MessageBubble } from './MessageBubble';
import { ImageViewer } from './ImageViewer';
import { Composer, type ComposerExtra, type SendPayload } from './Composer';
import { ContactPicker, ForwardDialog, MessageInfo, PollDialog } from './ChatDialogs';
import { ScheduledBar, ScheduleSheet } from './ScheduledMessages';
import { type ChatMessage, type ScheduledItem, type ThreadResponse, chatJson, scheduleLabel, statusLine, dayLabel, disappearingLabel, DISAPPEARING_OPTIONS, formatBytes, getWallpaper, lastSeenLabel, messageTypeFor, setWallpaper, uploadChatFile, WALLPAPERS } from './chat-client';
import { useLiveInterval, useLiveTyping, useRealtimeConnected } from '@/lib/realtime-client';
import { useLanguageStore } from '@/store/language';
import { cachedChat, cacheChat, enqueue, isOfflineError, listOutbox, newClientId, onOutbox, type OutboxItem } from '@/lib/outbox';
import { LANGUAGES, languageName } from '@/lib/languages';
import { LanguagePicker } from './LanguagePicker';
import { useChatTranslations } from './useChatTranslations';
import dynamic from 'next/dynamic';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

const ThreadPanel = dynamic(() => import('./ThreadPanel').then((m) => m.ThreadPanel));

/** Messages grouped by calendar day, each with its index in the whole list. */
function byDay<T extends { createdAt: string }>(list: T[]) {
  const days: { m: T; i: number }[][] = [];
  list.forEach((m, i) => {
    const prev = list[i - 1];
    if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) days.push([]);
    days[days.length - 1].push({ m, i });
  });
  return days;
}

export function ChatWindow({ conversationId, onBack, onChanged, onOpenChat, jumpTo }: { conversationId: string; onBack: () => void; onChanged: () => void; onOpenChat?: (id: string) => void; jumpTo?: string | null }) {
  const router = useRouter();
  const key = `/api/chat/conversations/${conversationId}/messages`;
  // Live updates refresh the thread on every change, so it only polls without them.
  const refreshInterval = useLiveInterval(5000, 0);
  const { data: fresh, error, isLoading, mutate } = useSWR<ThreadResponse>(key, authedJson, { refreshInterval, revalidateOnFocus: true });
  // Offline-first (upgrade 4): the last ~50 messages of recent chats are kept on this device and
  // shown with an "Offline" note when the chat can't load.
  const [saved, setSaved] = useState<{ id: string; data: ThreadResponse } | null>(null);
  useEffect(() => {
    if (fresh) { void cacheChat(conversationId, fresh).catch(() => {}); return; }
    if (error) cachedChat<ThreadResponse>(conversationId).then((c) => { if (c) setSaved({ id: conversationId, data: c.data }); }).catch(() => {});
  }, [fresh, error, conversationId]);
  const offlineCopy = !fresh && saved?.id === conversationId ? saved.data : undefined;
  const data = fresh ?? offlineCopy;
  // "typing…": from live updates when connected, else from the last load (polling).
  const live = useRealtimeConnected();
  const liveTyping = useLiveTyping(conversationId);
  const typingNames = live ? liveTyping : data?.typing ?? [];
  // "typing…" lasts 6 seconds on the server; check again once it would have run out.
  useEffect(() => {
    if (live || !data?.typing.length) return;
    const t = setTimeout(() => void mutate(), 7000);
    return () => clearTimeout(t);
  }, [data, mutate, live]);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [threadFor, setThreadFor] = useState<string | null>(null);
  const [catchup, setCatchup] = useState<{ busy: boolean; text: string | null } | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [infoMsg, setInfoMsg] = useState<ChatMessage | null>(null);
  const [extra, setExtra] = useState<'poll' | 'contact' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<{ id: string; body: string; createdAt: string; sender: { name: string } }[] | null>(null);
  const [resultIdx, setResultIdx] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [wallpaper, setWallpaperId] = useState('dots');
  const [translateOpen, setTranslateOpen] = useState(false);
  const [editScheduled, setEditScheduled] = useState<{ item: ScheduledItem; at: number } | null>(null);
  const appLanguage = useLanguageStore((s) => s.language);
  useEffect(() => {
    const sync = () => setWallpaperId(getWallpaper());
    sync();
    window.addEventListener('universe:wallpaper', sync);
    return () => window.removeEventListener('universe:wallpaper', sync);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // Reset local state when switching conversations.
  useEffect(() => {
    setOlder([]); setHasMoreOlder(null); setPending([]); setReplyTo(null); setEditing(null); setInfoOpen(false); lastCount.current = 0;
  }, [conversationId]);

  // Messages written offline wait in the outbox (src/lib/outbox.ts) as pending bubbles, and turn
  // into real messages when they're sent.
  useEffect(() => {
    const bubble = (i: OutboxItem): ChatMessage => ({
      id: `outbox-${i.id}`, conversationId, senderId: data?.me ?? '', createdAt: new Date(i.createdAt).toISOString(), editedAt: null, deletedAt: null, reactions: {}, metadata: null,
      sender: { id: data?.me ?? '', name: 'You', avatar: null }, pending: true, replyTo: null, type: 'TEXT', body: String(i.body.body ?? ''),
      attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null,
    } as unknown as ChatMessage);
    const load = () => listOutbox().then((all) => {
      const mine = all.filter((i) => i.kind === 'message' && i.ref === conversationId && !i.error);
      setPending((p) => [...p.filter((x) => !x.id.startsWith('outbox-')), ...mine.map(bubble)]);
    }).catch(() => {});
    void load();
    return onOutbox((e) => {
      if (e.item?.kind !== 'message' || e.item.ref !== conversationId) return;
      if (e.type === 'sent' && e.result && typeof e.result === 'object' && 'id' in e.result) {
        const msg = e.result as ChatMessage;
        setPending((p) => p.filter((x) => x.id !== `outbox-${e.item!.id}`));
        mutate((prev) => (prev ? { ...prev, messages: [...prev.messages.filter((x) => x.id !== msg.id), msg] } : prev), { revalidate: false });
      } else void load();
    });
  }, [conversationId, data?.me, mutate]);

  const me = data?.me ?? '';
  const convo = data?.conversation;
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...(data?.messages ?? []), ...pending].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [older, data?.messages, pending]);
  const others = convo?.members.filter((m) => m.id !== me) ?? [];
  const other = !convo?.isGroup ? others[0] : undefined;
  const canModerate = convo?.isGroup && convo.myRole === 'ADMIN';
  const canPin = !!convo && !convo.isOfficial && (!convo.isGroup || convo.myRole === 'ADMIN');
  const pins = data?.pinned ?? [];
  const tr = useChatTranslations({ conversationId, messages, me, fromServer: data?.translations, autoTo: convo?.translateTo ?? null, appLanguage });

  // Auto-translate for this chat (my own setting). Shown straight away, saved in the background.
  const setAutoTranslate = async (lang: string | null) => {
    setTranslateOpen(false);
    mutate((prev) => (prev ? { ...prev, conversation: { ...prev.conversation, translateTo: lang } } : prev), { revalidate: false });
    try {
      await chatJson(`/api/chat/conversations/${conversationId}/prefs`, { method: 'PATCH', body: JSON.stringify({ translateTo: lang }) });
      toast.success(lang ? `Messages in this chat will be translated into ${languageName(lang)}` : 'Auto-translate turned off');
      mutate();
    } catch (e) { toast.error((e as Error).message); mutate(); }
  };

  // Keep the newest message in view (unless the user scrolled up to read history).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > lastCount.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const last = messages[messages.length - 1];
    if (lastCount.current === 0 || (grew && (nearBottom || last?.senderId === me))) {
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: lastCount.current === 0 ? 'auto' : 'smooth' }));
    }
    lastCount.current = messages.length;
  }, [messages, me]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await authedJson<ThreadResponse>(`${key}?before=${encodeURIComponent(first.createdAt)}`);
      setOlder((cur) => [...res.messages, ...cur]);
      setHasMoreOlder(res.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const patchMsg = (id: string, fn: (x: ChatMessage) => ChatMessage) => {
    mutate((prev) => (prev ? { ...prev, messages: prev.messages.map((x) => (x.id === id ? fn(x) : x)) } : prev), { revalidate: false });
    setOlder((cur) => cur.map((x) => (x.id === id ? fn(x) : x)));
  };

  const star = async (m: ChatMessage) => {
    const next = !m.starred;
    patchMsg(m.id, (x) => ({ ...x, starred: next }));
    try { await chatJson(`/api/chat/messages/${m.id}/state`, { method: 'POST', body: JSON.stringify({ starred: next }) }); if (next) toast('Starred', { description: 'Find it under Starred messages.' }); }
    catch (e: any) { toast.error(e.message); patchMsg(m.id, (x) => ({ ...x, starred: !next })); }
  };

  const [pinIndex, setPinIndex] = useState(0);
  const pin = async (m: ChatMessage) => {
    const next = !m.pinnedAt;
    patchMsg(m.id, (x) => ({ ...x, pinnedAt: next ? new Date().toISOString() : null }));
    try {
      await chatJson(`/api/chat/messages/${m.id}/pin`, { method: 'POST', body: JSON.stringify({ pinned: next }) });
      toast(next ? 'Pinned to the top of the chat' : 'Unpinned');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
      patchMsg(m.id, (x) => ({ ...x, pinnedAt: next ? null : m.pinnedAt ?? null }));
    }
  };

  const deleteForMe = async (m: ChatMessage) => {
    mutate((prev) => (prev ? { ...prev, messages: prev.messages.filter((x) => x.id !== m.id) } : prev), { revalidate: false });
    setOlder((cur) => cur.filter((x) => x.id !== m.id));
    let undone = false;
    toast('Message deleted for you', {
      action: { label: 'Undo', onClick: () => { undone = true; mutate(); } },
      onAutoClose: () => { if (!undone) chatJson(`/api/chat/messages/${m.id}/state`, { method: 'POST', body: JSON.stringify({ hidden: true }) }).then(() => onChanged()).catch((e) => { toast.error(e.message); mutate(); }); },
      onDismiss: () => { if (!undone) chatJson(`/api/chat/messages/${m.id}/state`, { method: 'POST', body: JSON.stringify({ hidden: true }) }).then(() => onChanged()).catch(() => mutate()); },
    });
  };

  const vote = async (m: ChatMessage, option: number) => {
    const multiple = !!m.metadata?.multiple;
    patchMsg(m.id, (x) => {
      const mine = x.poll?.mine ?? [];
      const counts = [...(x.poll?.counts ?? (x.metadata?.options ?? []).map(() => 0))];
      let nextMine: number[];
      if (mine.includes(option)) { nextMine = mine.filter((o) => o !== option); counts[option]--; }
      else { if (!multiple) mine.forEach((o) => counts[o]--); nextMine = multiple ? [...mine, option] : [option]; counts[option]++; }
      return { ...x, poll: { counts, mine: nextMine, voters: Math.max(x.poll?.voters ?? 0, nextMine.length ? 1 : 0) } };
    });
    try { await chatJson(`/api/chat/messages/${m.id}/vote`, { method: 'POST', body: JSON.stringify({ option }) }); mutate(); }
    catch (e: any) { toast.error(e.message); mutate(); }
  };

  const openContact = async (userId: string) => {
    try {
      const { id } = await chatJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId }) });
      onOpenChat?.(id);
    } catch (e: any) { toast.error(e.message); }
  };

  const sendSpecial = async (body: Record<string, unknown>) => {
    try {
      const msg = await chatJson<ChatMessage>(key, { method: 'POST', body: JSON.stringify(body) });
      appendSent(msg, '');
      haptic('success');
    } catch (e: any) { toast.error(e.message); throw e; }
  };

  const onExtra = (kind: ComposerExtra) => {
    if (kind !== 'location') return setExtra(kind);
    if (!navigator.geolocation) return void toast.error('Location isn’t available in this browser.');
    const t = toast.loading('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        toast.dismiss(t);
        if (!(await confirmDialog({ title: 'Send your current location?', message: `Everyone in this chat will see where you are (±${Math.round(pos.coords.accuracy)} m).`, confirmLabel: 'Send location' }))) return;
        sendSpecial({ type: 'LOCATION', location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }).catch(() => {});
      },
      () => { toast.dismiss(t); toast.error('Location permission was denied. Allow it in your browser settings to share where you are.'); },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  // Search in this chat, then jump to a result (loading older history if needed).
  const runSearch = async (q: string) => {
    if (!q.trim()) { setResults(null); return; }
    try {
      const r = await chatJson<{ results: { id: string; body: string; createdAt: string; sender: { name: string } }[] }>(`${key}?q=${encodeURIComponent(q.trim())}`);
      setResults(r.results); setResultIdx(0);
      if (r.results[0]) jump(r.results[0].id);
    } catch (e: any) { toast.error(e.message); }
  };
  const jump = async (messageId: string) => {
    let guard = 0;
    let list = messages;
    while (!list.some((m) => m.id === messageId) && guard++ < 10) {
      const first = list[0];
      if (!first) break;
      const res = await authedJson<ThreadResponse>(`${key}?before=${encodeURIComponent(first.createdAt)}`).catch(() => null);
      if (!res || !res.messages.length) break;
      list = [...res.messages, ...list];
      setOlder((cur) => [...res.messages, ...cur]);
      setHasMoreOlder(res.hasMore);
      if (!res.hasMore) break;
    }
    setHighlight(messageId);
    setTimeout(() => document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    setTimeout(() => setHighlight((h) => (h === messageId ? null : h)), 2200);
  };
  useEffect(() => { if (jumpTo && data) jump(jumpTo); }, [jumpTo, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const appendSent = (msg: ChatMessage, tempId: string) => {
    setPending((p) => p.filter((x) => x.id !== tempId));
    mutate((prev) => (prev ? { ...prev, messages: [...prev.messages.filter((x) => x.id !== msg.id), msg] } : prev), { revalidate: false });
    onChanged();
  };

  const send = async ({ text, file: picked, voice, viewOnce, album, videoNote }: SendPayload) => {
    const file = picked ?? videoNote?.file;
    haptic('tap');
    const tempId = `temp-${Date.now()}`;
    const base = { id: tempId, conversationId, senderId: me, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, reactions: {}, metadata: null, sender: { id: me, name: 'You', avatar: null }, pending: true, replyTo: replyTo ? { id: replyTo.id, body: replyTo.body, type: replyTo.type, sender: replyTo.sender } : null } as const;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      if (album?.length) {
        // An album: every photo uploads, then one message holds them all.
        setPending((p) => [...p, { ...base, type: 'IMAGE', body: '', attachmentUrl: null, attachmentName: album[0].name, attachmentSize: album[0].size, attachmentMime: album[0].type, metadata: null } as ChatMessage]);
        setUploadProgress(0);
        const items: { url: string; name: string; size: number; mime: string }[] = [];
        for (const [i, f] of album.entries()) {
          const url = await uploadChatFile(f, (pct) => setUploadProgress(Math.round(((i + pct / 100) / album.length) * 100)));
          items.push({ url, name: f.name, size: f.size, mime: f.type });
        }
        setUploadProgress(null);
        const msg = await chatJson<ChatMessage>(key, {
          method: 'POST',
          body: JSON.stringify({ type: 'IMAGE', attachmentUrl: items[0].url, attachmentName: items[0].name, attachmentSize: items[0].size, attachmentMime: items[0].mime, album: items, replyToId }),
        });
        appendSent(msg, tempId);
        if (text) await send({ text });
      } else if (file || voice) {
        const upload = file ?? new File([voice!.blob], `voice-${Date.now()}.${voice!.blob.type.includes('mp4') ? 'm4a' : voice!.blob.type.includes('ogg') ? 'ogg' : 'webm'}`, { type: voice!.blob.type });
        const type = voice ? 'AUDIO' : messageTypeFor(upload.type);
        setPending((p) => [...p, { ...base, type, body: '', attachmentUrl: null, attachmentName: upload.name, attachmentSize: upload.size, attachmentMime: upload.type, metadata: viewOnce ? { viewOnce: true } : null } as ChatMessage]);
        setUploadProgress(0);
        const url = await uploadChatFile(upload, setUploadProgress);
        setUploadProgress(null);
        const msg = await chatJson<ChatMessage>(key, {
          method: 'POST',
          body: JSON.stringify({ type, attachmentUrl: url, attachmentName: upload.name, attachmentSize: upload.size, attachmentMime: upload.type, durationSec: voice?.durationSec ?? videoNote?.durationSec, waveform: voice?.waveform, videoNote: videoNote ? true : undefined, replyToId, viewOnce: viewOnce || undefined }),
        });
        appendSent(msg, tempId);
        if (text) await send({ text });
      } else if (text) {
        setPending((p) => [...p, { ...base, type: 'TEXT', body: text, attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null } as ChatMessage]);
        const clientId = newClientId();
        try {
          const msg = await chatJson<ChatMessage>(key, { method: 'POST', body: JSON.stringify({ body: text, replyToId, clientId }) });
          appendSent(msg, tempId);
        } catch (err) {
          if (!isOfflineError(err)) throw err;
          // No connection: it waits in the outbox and is sent when the connection is back.
          setPending((p) => p.filter((x) => x.id !== tempId));
          await enqueue({ id: clientId, kind: 'message', method: 'POST', url: key, ref: conversationId, label: `Message: ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`, body: { body: text, replyToId, clientId } });
        }
      }
    } catch (e: any) {
      setPending((p) => p.filter((x) => x.id !== tempId));
      setUploadProgress(null);
      toast.error(e.message || 'Message not sent.');
      throw e;
    }
  };

  // Scheduled messages (Stage 4 · 1.4): sent by the server at their time, even with UniVerse closed.
  const schedule = async (body: string, sendAt: string) => {
    await chatJson(`/api/chat/conversations/${conversationId}/scheduled`, { method: 'POST', body: JSON.stringify({ body, sendAt, replyToId: replyTo?.id }) });
    setReplyTo(null);
    void mutate();
    toast.success(`Scheduled for ${scheduleLabel(sendAt)}`);
  };
  const sendScheduledNow = async (s: ScheduledItem) => {
    try {
      const msg = await chatJson<ChatMessage>(`/api/chat/scheduled/${s.id}`, { method: 'POST' });
      mutate((prev) => (prev ? { ...prev, scheduled: prev.scheduled?.filter((x) => x.id !== s.id), messages: [...prev.messages.filter((x) => x.id !== msg.id), msg] } : prev), { revalidate: false });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
      void mutate();
    }
  };
  const deleteScheduled = async (s: ScheduledItem) => {
    if (!(await confirmDialog({ title: 'Delete scheduled message?', message: 'It won’t be sent.', destructive: true }))) return;
    try {
      await chatJson(`/api/chat/scheduled/${s.id}`, { method: 'DELETE' });
    } catch (e) {
      toast.error((e as Error).message);
    }
    void mutate();
  };

  const saveEdit = async (text: string) => {
    if (!editing) return;
    try {
      const msg = await chatJson<ChatMessage>(`/api/chat/messages/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ body: text }) });
      patchMsg(msg.id, (x) => ({ ...x, ...msg, starred: x.starred, poll: x.poll }));
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const remove = async (m: ChatMessage) => {
    try {
      await chatJson(`/api/chat/messages/${m.id}`, { method: 'DELETE' });
      mutate();
      setOlder((cur) => cur.map((x) => (x.id === m.id ? { ...x, type: 'DELETED', body: '', attachmentUrl: null } : x)));
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const react = async (m: ChatMessage, emoji: string) => {
    const toggle = (x: ChatMessage) => {
      if (x.id !== m.id) return x;
      const users = x.reactions[emoji] ?? [];
      const next = users.includes(me) ? users.filter((u) => u !== me) : [...users, me];
      return { ...x, reactions: { ...x.reactions, [emoji]: next } };
    };
    mutate((prev) => (prev ? { ...prev, messages: prev.messages.map(toggle) } : prev), { revalidate: false });
    setOlder((cur) => cur.map(toggle));
    try {
      await chatJson(`/api/chat/messages/${m.id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) });
    } catch (e: any) {
      toast.error(e.message);
      mutate();
    }
  };

  const typing = () => { chatJson(`/api/chat/conversations/${conversationId}/typing`, { method: 'POST' }).catch(() => {}); };

  // AI catch-up: what you missed since you last read this chat (only you see it).
  const runCatchup = async () => {
    setCatchup({ busy: true, text: null });
    try {
      const r = await chatJson<{ summary: string | null; count: number }>(`/api/chat/conversations/${conversationId}/ai`, { method: 'POST', body: JSON.stringify({ action: 'catchup' }) });
      setCatchup({ busy: false, text: r.summary ?? 'Nothing much to catch up on: just a few new messages.' });
    } catch (e) {
      setCatchup(null);
      toast.error((e as Error).message);
    }
  };

  // "/" commands from the message box.
  const command = async (name: string, arg: string): Promise<boolean> => {
    try {
      if (name === 'ask') {
        if (!arg) { toast.error('Type a question after /ask'); return false; }
        await chatJson(`/api/chat/conversations/${conversationId}/ai`, { method: 'POST', body: JSON.stringify({ action: 'ask', question: arg }) });
        void mutate();
        return true;
      }
      if (name === 'catchup') { void runCatchup(); return true; }
      if (name === 'poll') { onExtra('poll'); return true; }
      if (name === 'call' || name === 'video') { void call(name === 'video' ? 'video' : 'audio'); return true; }
      if (name === 'remind') {
        const m = /^(\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)\s+(.+)$/i.exec(arg);
        if (!m) { toast.error('Try: /remind 30m hand in the essay  (m, h or d)'); return false; }
        const unit = m[2][0].toLowerCase();
        const minutes = Number(m[1]) * (unit === 'h' ? 60 : unit === 'd' ? 1440 : 1);
        const r = await chatJson<{ dueAt: string }>('/api/chat/reminders', { method: 'POST', body: JSON.stringify({ text: m[3], minutes, conversationId }) });
        toast.success(`I'll remind you ${new Date(r.dueAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`);
        return true;
      }
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
    return false;
  };
  const suggestReplies = async () => {
    try {
      const r = await chatJson<{ replies: string[] }>(`/api/chat/conversations/${conversationId}/ai`, { method: 'POST', body: JSON.stringify({ action: 'replies' }) });
      if (!r.replies.length) toast('No suggestions right now.');
      return r.replies;
    } catch (e) {
      toast.error((e as Error).message);
      return [];
    }
  };

  const call = async (kind: 'audio' | 'video') => {
    try {
      const msg = await chatJson<ChatMessage>(key, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind }) });
      appendSent(msg, '');
      // UniVerse's own call screen; everyone in the chat gets a ringing card with Join.
      router.push(`/call/${msg.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Ticks, worked out from what's already known (nothing stored per message): read = everyone's
  // last read is after it; delivered = someone has read it, is online, or opened UniVerse since it
  // was sent (people who hide their last seen only count once they read it); else sent.
  const readersOf = (m: ChatMessage) => { const t = new Date(m.createdAt).getTime(); return others.filter((o) => o.lastReadAt && new Date(o.lastReadAt).getTime() >= t); };
  const readState = (m: ChatMessage): 'sent' | 'delivered' | 'read' | null => {
    if (m.senderId !== me || !convo) return null;
    const t = new Date(m.createdAt).getTime();
    const readers = readersOf(m);
    if (others.length > 0 && readers.length === others.length) return 'read';
    const reached = readers.length > 0 || others.some((o) => o.online || (o.lastSeenAt && new Date(o.lastSeenAt).getTime() >= t));
    return reached ? 'delivered' : 'sent';
  };
  // Groups: "Seen by N" under my latest message (tap for who and when).
  const lastMine = convo?.isGroup ? [...messages].reverse().find((m) => m.senderId === me && !m.pending && m.type !== 'SYSTEM' && m.type !== 'DELETED') : undefined;
  const seenBy = lastMine ? readersOf(lastMine).length : 0;

  const subtitleBase = typingNames.length
    ? `${convo?.isGroup ? typingNames.join(', ') + ' ' : ''}typing…`
    : convo?.isOfficial
      ? 'Official account'
      : convo?.isGroup
        ? others.map((o) => o.name.split(' ')[0]).slice(0, 5).join(', ') + (others.length > 5 ? ` +${others.length - 5}` : '') + ', you'
        : other ? statusLine(other.status) ?? lastSeenLabel(other.online, other.lastSeenAt) : '';
  const channel = convo?.channel ?? null;
  // A community channel's own emoji (:name:), for messages, reactions and the picker.
  const emojiMap: Record<string, string> | undefined = channel?.emoji?.length ? Object.fromEntries(channel.emoji.map((e) => [e.name, e.url])) : undefined;
  const subtitle = channel && !typingNames.length
    ? `${channel.communityName} · ${convo!.members.length} member${convo!.members.length === 1 ? '' : 's'}${channel.slowModeSec ? ' · slow mode' : ''}`
    : convo?.disappearingSec && !typingNames.length ? `⏱ ${disappearingLabel(convo.disappearingSec)} · ${subtitleBase}` : subtitleBase;

  // A failed refresh keeps the chat on screen (it retries by itself); only a chat that never loaded shows this.
  if (error && !data) {
    const status = (error as { status?: number }).status;
    return (
      <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{status === 404 ? 'This chat isn’t available' : 'Couldn’t open this chat'}</p>
        <p className="text-sm text-zinc-500 max-w-xs">{status === 404 ? 'It may have been deleted, or you’re no longer in it.' : 'Something went wrong on our side. It’s been reported automatically.'}</p>
        {status !== 404 && <button type="button" onClick={() => void mutate()} className="btn-secondary btn-sm">Try again</button>}
      </div>
    );
  }
  if (isLoading || !convo) return <div className="flex-1 min-w-0"><ContentSkeleton variant="chat" /></div>;

  return (
    <div className="flex-1 flex min-w-0 min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className="relative z-20 flex items-center gap-3 px-3 md:px-5 h-16 shrink-0 border-b border-zinc-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl">
          <button onClick={onBack} aria-label="Back" className="md:hidden p-2 -ml-1 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
          <button onClick={() => setInfoOpen((v) => !v)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
            {channel
              ? <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: channel.color ?? '#4f46e5' }}>{channel.kind === 'ANNOUNCE' ? <Megaphone className="w-5 h-5" /> : <Hash className="w-5 h-5" />}</span>
              : <Avatar name={convo.title} src={convo.avatarUrl} online={!convo.isGroup && other?.online} size={40} />}
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1">
                {convo.title} {convo.isOfficial && <BadgeCheck className="w-4 h-4 text-indigo-500 shrink-0" />} {convo.muted && <BellOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
              </p>
              <p className={cn('text-xs truncate', typingNames.length ? 'text-emerald-500 font-medium' : 'text-zinc-500')}>{subtitle}</p>
            </div>
          </button>
          {convo.isGroup && !convo.isOfficial && (
            <button onClick={() => void runCatchup()} aria-label="Catch up with AI" title="Catch up: what you missed (AI)" className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-fuchsia-500 hover:bg-zinc-100 dark:hover:bg-white/10 hidden sm:block"><Sparkles className="w-5 h-5" /></button>
          )}
          {convo.isGroup && !channel && !convo.isOfficial && (
            <button onClick={() => router.push(`/call/r_${conversationId}?kind=audio`)} aria-label="Join the voice room" title="Voice room: drop in, nobody is rung" className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Headphones className="w-5 h-5" /></button>
          )}
          {!convo.isOfficial && !channel && (
            <>
              <button onClick={() => call('audio')} aria-label="Voice call" title="Voice call" className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Phone className="w-5 h-5" /></button>
              <button onClick={() => call('video')} aria-label="Video call" title="Video call" className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Video className="w-5 h-5" /></button>
            </>
          )}
          <div className="relative hidden sm:block">
            <button onClick={() => setTranslateOpen((v) => !v)} aria-label="Translate messages" title={convo.translateTo ? `Auto-translating into ${languageName(convo.translateTo)}` : 'Translate messages'} aria-expanded={translateOpen} className={cn('relative p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10', convo.translateTo || translateOpen ? 'text-indigo-500' : 'text-zinc-600 dark:text-zinc-300')}>
              <Languages className="w-5 h-5" />
              {convo.translateTo && <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-black uppercase px-1 rounded bg-indigo-500 text-white">{convo.translateTo}</span>}
            </button>
            {translateOpen && (
              <LanguagePicker title="Auto-translate messages into" offLabel="Off — show originals" value={convo.translateTo ?? null} suggested={[appLanguage]} onPick={setAutoTranslate} onClose={() => setTranslateOpen(false)} />
            )}
          </div>
          <button onClick={() => { setSearchOpen((v) => !v); setResults(null); setSearchQ(''); }} aria-label="Search in chat" className={cn('p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10', searchOpen ? 'text-indigo-500' : 'text-zinc-600 dark:text-zinc-300')}><Search className="w-5 h-5" /></button>
          <button onClick={() => setInfoOpen((v) => !v)} aria-label="Chat info" className={cn('p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10', infoOpen ? 'text-indigo-500' : 'text-zinc-600 dark:text-zinc-300')}><Info className="w-5 h-5" /></button>
        </div>
        {offlineCopy && (
          <p role="status" className="shrink-0 px-4 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> Offline: showing the messages saved on this device. New messages are sent when you&apos;re back online.</p>
        )}

        {convo.translateTo && (
          <div className="flex items-center gap-2 px-3 md:px-5 py-1.5 border-b border-zinc-200/80 dark:border-white/[0.06] bg-sky-50/80 dark:bg-sky-500/[0.07] text-xs text-sky-800 dark:text-sky-200">
            <Languages className="w-3.5 h-3.5 shrink-0" />
            {tr.autoError
              ? <span className="flex-1 min-w-0 truncate">Couldn’t translate new messages: {tr.autoError} <button onClick={tr.retryAuto} className="font-semibold underline">Try again</button></span>
              : <span className="flex-1 min-w-0 truncate">Translating messages into <b>{languageName(convo.translateTo)}</b> — tap “Show original” on any message to see what was sent.</span>}
            <button onClick={() => setAutoTranslate(null)} className="shrink-0 font-semibold text-sky-700 dark:text-sky-300 hover:underline">Turn off</button>
          </div>
        )}

        <AnimatePresence>
          {catchup && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-zinc-200/80 dark:border-white/[0.06] bg-fuchsia-50/70 dark:bg-fuchsia-500/[0.07]">
              <div className="flex items-start gap-2 px-3 md:px-5 py-2.5">
                <Sparkles className="w-4 h-4 text-fuchsia-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-600 dark:text-fuchsia-300 mb-1">Catch up · only you see this</p>
                  {catchup.busy ? <p className="flex items-center gap-2 text-zinc-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading what you missed…</p> : <p className="whitespace-pre-wrap">{catchup.text}</p>}
                </div>
                <button onClick={() => setCatchup(null)} aria-label="Close summary" className="p-1 rounded-full text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {pins.length > 0 && (() => {
          const current = pins[pinIndex % pins.length];
          const preview = current.type === 'TEXT' ? current.body : current.attachmentName || current.body || current.type.toLowerCase();
          return (
            <div className="flex items-center gap-2 px-3 md:px-5 py-2 border-b border-zinc-200/80 dark:border-white/[0.06] bg-indigo-50/70 dark:bg-indigo-500/[0.07]">
              <button
                onClick={() => {
                  document.getElementById(`msg-${current.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  setPinIndex((i) => i + 1);
                }}
                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                aria-label="Go to pinned message"
              >
                <Pin className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">Pinned{pins.length > 1 ? ` · ${(pinIndex % pins.length) + 1} of ${pins.length}` : ''}{current.sender ? ` · ${current.sender.name}` : ''}</span>
                  <span className="block text-sm text-zinc-700 dark:text-zinc-200 truncate">{preview}</span>
                </span>
              </button>
              {canPin && (
                <button
                  aria-label="Unpin"
                  onClick={() => { const m = messages.find((x) => x.id === current.id); if (m) void pin(m); else void chatJson(`/api/chat/messages/${current.id}/pin`, { method: 'POST', body: JSON.stringify({ pinned: false }) }).then(() => mutate()); }}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-rose-500 hover:bg-white/60 dark:hover:bg-white/10"
                >
                  <PinOff className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })()}

        {searchOpen && (
          <div className="flex items-center gap-2 px-3 md:px-5 py-2 border-b border-zinc-200/80 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.02]">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(searchQ); if (e.key === 'Escape') setSearchOpen(false); }}
              placeholder="Search messages and files, press Enter"
              className="flex-1 min-w-0 bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none"
            />
            {results && <span className="text-xs text-zinc-500 tabular-nums shrink-0">{results.length ? `${resultIdx + 1} of ${results.length}` : 'No results'}</span>}
            <button disabled={!results?.length} onClick={() => { const i = Math.min(resultIdx + 1, (results?.length ?? 1) - 1); setResultIdx(i); jump(results![i].id); }} aria-label="Older result" className="p-1.5 rounded-lg text-zinc-500 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronUp className="w-4 h-4" /></button>
            <button disabled={!results?.length} onClick={() => { const i = Math.max(resultIdx - 1, 0); setResultIdx(i); jump(results![i].id); }} aria-label="Newer result" className="p-1.5 rounded-lg text-zinc-500 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronDown className="w-4 h-4" /></button>
            <button onClick={() => { setSearchOpen(false); setResults(null); }} aria-label="Close search" className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Messages */}
        <div
          onDragOver={(e) => { if (!convo.isOfficial && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f && !convo.isOfficial) send({ file: f }).catch(() => {}); }}
          ref={scrollRef}
          onScroll={(e) => { const el = e.currentTarget; setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 400); }}
          className="relative flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1.5"
          style={WALLPAPERS.find((w) => w.id === wallpaper)?.style}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-3 z-30 rounded-3xl border-2 border-dashed border-indigo-400 bg-indigo-500/10 backdrop-blur-sm flex flex-col items-center justify-center text-indigo-600 dark:text-indigo-300">
              <Upload className="w-8 h-8 mb-2" /><p className="font-semibold">Drop to send</p>
            </div>
          )}
          {(hasMoreOlder ?? data?.hasMore) && (
            <div className="flex justify-center pb-2">
              <button onClick={loadOlder} aria-busy={loadingOlder || undefined} disabled={loadingOlder} className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5">
                {loadingOlder && <Loader2 className="w-3 h-3 animate-spin" />} Load earlier messages
              </button>
            </div>
          )}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 gap-2">
              <Avatar name={convo.title} src={convo.avatarUrl} size={64} />
              <p className="font-semibold text-zinc-800 dark:text-zinc-200 mt-2">Say hello to {convo.title.split(' ')[0]} 👋</p>
              <p className="text-xs">Messages, photos, files and calls all live here.</p>
            </div>
          )}
          {/* One section per day, so each day's label sticks only while its own messages are on
              screen (all labels in one list piled up on top of each other). */}
          {byDay(messages).map((day) => (
            <section key={day[0].m.id}>
              <div className="flex justify-center py-2 sticky top-0 z-10">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-white/90 dark:bg-[#121830]/90 backdrop-blur border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 shadow-sm">{dayLabel(day[0].m.createdAt)}</span>
              </div>
              {day.map(({ m, i }, n) => {
                const prev = messages[i - 1];
                const newDay = n === 0;
                const showSender = !!convo.isGroup && (newDay || prev?.senderId !== m.senderId || prev?.type === 'SYSTEM');
                return (
                  <div key={m.id} id={`msg-${m.id}`} className={cn(!newDay && prev?.senderId !== m.senderId && 'pt-2')}>
                    <MessageBubble
                      onCallBack={(kind) => void call(kind)}
                      customEmoji={emojiMap}
                      m={m}
                      mine={m.senderId === me}
                      me={me}
                      showSender={showSender}
                      readState={readState(m)}
                      canModerate={!!canModerate}
                      highlight={highlight === m.id}
                      onReply={() => { setEditing(null); setReplyTo(m); }}
                      onEdit={() => { setReplyTo(null); setEditing(m); }}
                      onDelete={async () => { if (await confirmDialog({ title: 'Delete for everyone?', message: 'The message will be removed for everyone in this chat.', destructive: true })) remove(m); }}
                      onDeleteForMe={() => deleteForMe(m)}
                      onStar={() => star(m)}
                      onPin={canPin && m.type !== 'DELETED' && m.type !== 'SYSTEM' && !m.pending ? () => pin(m) : undefined}
                      onForward={() => setForwarding(m)}
                      onInfo={() => setInfoMsg(m)}
                      onVote={(o) => vote(m, o)}
                      onOpenContact={openContact}
                      onReact={(e) => react(m, e)}
                      onOpenImage={setLightbox}
                      onThread={convo.isGroup && !convo.isOfficial && !m.pending && m.type !== 'SYSTEM' && m.type !== 'DELETED' ? () => setThreadFor(m.id) : undefined}
                      {...(m.senderId !== me && m.type === 'TEXT' && !m.pending && m.body?.trim()
                        ? { translation: tr.get(m.id), showOriginal: tr.showingOriginal(m.id), onTranslate: () => tr.translate(m.id), onToggleOriginal: () => tr.toggleOriginal(m.id) }
                        : {})}
                    />
                    {lastMine?.id === m.id && seenBy > 0 && (
                      <motion.button type="button" onClick={() => setInfoMsg(m)} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="ml-auto mr-2 mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-sky-500">
                        <CheckCheck className="w-3.5 h-3.5 text-sky-500" />{seenBy === others.length ? 'Seen by everyone' : `Seen by ${seenBy}`}
                      </motion.button>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <AnimatePresence>
          {showJump && (
            <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="absolute bottom-28 right-6 md:right-10 z-20 w-10 h-10 rounded-full bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <ArrowDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {!convo.isOfficial && (
          <ScheduledBar items={data?.scheduled ?? []} onSendNow={sendScheduledNow} onDelete={deleteScheduled} onEdit={(item) => setEditScheduled({ item, at: Date.now() })} />
        )}
        {editScheduled && (
          <ScheduleSheet now={editScheduled.at} title="Edit scheduled message" initialText={editScheduled.item.body} initialAt={editScheduled.item.sendAt}
            onSave={async (body, sendAt) => {
              await chatJson(`/api/chat/scheduled/${editScheduled.item.id}`, { method: 'PATCH', body: JSON.stringify({ body, sendAt }) });
              void mutate();
              toast.success(`Will send ${scheduleLabel(sendAt).replace(/^Today/, 'today').replace(/^Tomorrow/, 'tomorrow')}`);
            }}
            onClose={() => setEditScheduled(null)} />
        )}
        <Composer
          draftKey={conversationId}
          serverDraft={{ text: convo.draft, at: convo.draftAt }}
          onSchedule={convo.isOfficial ? undefined : schedule}
          disabled={convo.isOfficial}
          replyTo={replyTo}
          editing={editing}
          uploadProgress={uploadProgress}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={send}
          onSaveEdit={saveEdit}
          onTyping={typing}
          onExtra={onExtra}
          mentionables={convo.isGroup ? others.map((o) => ({ id: o.id, name: o.name })) : []}
          canMentionAll={convo.isGroup && (convo.members.length <= 50 || convo.myRole === 'ADMIN' || channel?.role === 'OWNER' || channel?.role === 'MOD')}
          draftLanguages={[...tr.detected, appLanguage]}
          disabledReason={channel?.kind === 'ANNOUNCE' && channel.role === 'MEMBER' ? 'Only moderators can post in announcements. You can still react and reply in threads.' : undefined}
          slowModeSec={channel?.slowModeSec}
          customEmoji={channel?.emoji}
          onCommand={convo.isOfficial ? undefined : command}
          onSuggest={convo.isOfficial ? undefined : suggestReplies}
        />
      </div>

      <AnimatePresence>
        {threadFor && <ThreadPanel key={threadFor} conversationId={conversationId} rootId={threadFor} me={me} onClose={() => setThreadFor(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {infoOpen && (
          <InfoPanel
            data={data!}
            messages={messages}
            onClose={() => setInfoOpen(false)}
            onOpenImage={setLightbox}
            onChanged={() => { mutate(); onChanged(); }}
            onLeft={() => { onChanged(); onBack(); }}
            onAutoTranslate={setAutoTranslate}
          />
        )}
      </AnimatePresence>

      {forwarding && <ForwardDialog message={forwarding} onClose={() => setForwarding(null)} onDone={() => { setForwarding(null); onChanged(); }} />}
      {infoMsg && <MessageInfo message={infoMsg} members={convo.members} me={me} onClose={() => setInfoMsg(null)} />}
      {extra === 'poll' && <PollDialog onClose={() => setExtra(null)} onCreate={(poll) => sendSpecial({ type: 'POLL', poll })} />}
      {extra === 'contact' && <ContactPicker onClose={() => setExtra(null)} onPick={(contactId) => sendSpecial({ type: 'CONTACT', contactId })} />}

      <AnimatePresence>
        {lightbox && (() => {
          // Every photo in the chat (albums too), so the viewer can go through them (1.8).
          const photos = messages.flatMap((m) => (m.type !== 'IMAGE' || m.deletedAt || m.metadata?.viewOnce ? []
            : m.metadata?.album?.length ? m.metadata.album.map((x) => ({ url: x.url, name: x.name }))
            : m.attachmentUrl ? [{ url: m.attachmentUrl, name: m.attachmentName }] : []));
          const at = photos.findIndex((x) => x.url === lightbox);
          return <ImageViewer key="viewer" images={at < 0 ? [{ url: lightbox }] : photos} start={Math.max(0, at)} onClose={() => setLightbox(null)} />;
        })()}
      </AnimatePresence>
    </div>
  );
}

function InfoPanel({ data, messages, onClose, onOpenImage, onChanged, onLeft, onAutoTranslate }: {
  data: ThreadResponse; messages: ChatMessage[]; onClose: () => void; onOpenImage: (u: string) => void; onChanged: () => void; onLeft: () => void;
  onAutoTranslate: (lang: string | null) => void;
}) {
  const convo = data.conversation;
  const [adding, setAdding] = useState(false);
  const isAdmin = convo.isGroup && convo.myRole === 'ADMIN';
  const media = messages.filter((m) => m.type === 'IMAGE' && m.attachmentUrl).slice(-12).reverse();
  const starredHere = messages.filter((m) => m.starred);
  const [wp, setWp] = useState(getWallpaper());
  const canSetTimer = !convo.isOfficial && (!convo.isGroup || isAdmin);

  const setPref = async (body: Record<string, unknown>, ok: string) => {
    try { await chatJson(`/api/chat/conversations/${convo.id}/prefs`, { method: 'PATCH', body: JSON.stringify(body) }); toast.success(ok); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };
  const setTimer = async (sec: number) => {
    try { await chatJson(`/api/chat/conversations/${convo.id}/settings`, { method: 'PATCH', body: JSON.stringify({ disappearingSec: sec }) }); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };
  const files = messages.filter((m) => (m.type === 'FILE' || m.type === 'VIDEO' || m.type === 'AUDIO') && m.attachmentUrl).slice(-10).reverse();
  const links = messages
    .flatMap((m) => (m.type === 'TEXT' && m.body ? [...new Set(m.body.match(/https?:\/\/[^\s<>"')]+/g) ?? [])].map((url) => ({ id: `${m.id}-${url}`, url })) : []))
    .slice(-10).reverse();

  const rename = async () => {
    const name = (await promptDialog({ title: 'Rename group', defaultValue: convo.title, placeholder: 'Group name', confirmLabel: 'Rename', maxLength: 80 }))?.trim();
    if (!name || name === convo.title) return;
    try {
      await chatJson(`/api/chat/conversations/${convo.id}/members`, { method: 'PATCH', body: JSON.stringify({ name }) });
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  const leave = async () => {
    if (!(await confirmDialog({ title: `Leave "${convo.title}"?`, message: 'You won’t get new messages from this group.', confirmLabel: 'Leave', destructive: true }))) return;
    try {
      await chatJson(`/api/chat/conversations/${convo.id}/members`, { method: 'DELETE' });
      toast.success(`You left ${convo.title}`);
      onLeft();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
      className="absolute md:relative inset-0 md:inset-auto z-30 md:z-auto w-full md:w-80 shrink-0 flex flex-col border-l border-zinc-200/80 dark:border-white/[0.06] bg-white dark:bg-[#121830] md:bg-white/60 md:dark:bg-white/[0.02] backdrop-blur-xl overflow-y-auto"
    >
      <div className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-zinc-200/80 dark:border-white/[0.06]">
        <h3 className="font-bold text-zinc-900 dark:text-white">{convo.isGroup ? 'Group info' : 'Contact info'}</h3>
        <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 flex flex-col items-center text-center border-b border-zinc-200/80 dark:border-white/[0.06]">
        <Avatar name={convo.title} src={convo.avatarUrl} size={80} />
        <p className="mt-3 text-lg font-black text-zinc-900 dark:text-white flex items-center gap-1">{convo.title} {convo.isOfficial && <BadgeCheck className="w-5 h-5 text-indigo-500" />}</p>
        <p className="text-xs text-zinc-500">{convo.isGroup ? `${convo.members.length} members` : convo.isOfficial ? 'Official UniVerse Impact account' : convo.members.find((m) => m.id !== data.me)?.role.toLowerCase()}</p>
        {isAdmin && (
          <button onClick={rename} className="mt-3 text-xs font-semibold text-indigo-500 inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Rename group</button>
        )}
      </div>

      {!convo.isOfficial && (
        <div className="p-5 border-b border-zinc-200/80 dark:border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-800 dark:text-zinc-200 flex items-center gap-2"><BellOff className="w-4 h-4 text-zinc-500" /> Mute notifications</span>
            {convo.muted
              ? <button onClick={() => setPref({ muted: false }, 'Unmuted')} className="text-xs font-semibold text-indigo-500">Unmute</button>
              : (
                <select aria-label="Mute for" defaultValue="" onChange={(e) => e.target.value && setPref({ muted: e.target.value }, 'Chat muted')} className="text-xs rounded-lg bg-zinc-100 dark:bg-white/10 px-2 py-1.5 text-zinc-700 dark:text-zinc-200">
                  <option value="" disabled>Mute for…</option><option value="8h">8 hours</option><option value="1w">1 week</option><option value="always">Always</option>
                </select>
              )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-800 dark:text-zinc-200 flex items-center gap-2"><Timer className="w-4 h-4 text-zinc-500" /> Disappearing messages</span>
            {canSetTimer ? (
              <select aria-label="Disappearing messages" value={convo.disappearingSec ?? 0} onChange={(e) => setTimer(Number(e.target.value))} className="text-xs rounded-lg bg-zinc-100 dark:bg-white/10 px-2 py-1.5 text-zinc-700 dark:text-zinc-200">
                {DISAPPEARING_OPTIONS.map((o) => <option key={o.sec} value={o.sec}>{o.label}</option>)}
              </select>
            ) : <span className="text-xs text-zinc-500">{disappearingLabel(convo.disappearingSec)}</span>}
          </div>
          <div>
            <p className="text-sm text-zinc-800 dark:text-zinc-200 mb-2">Chat wallpaper</p>
            <div className="grid grid-cols-6 gap-1.5">
              {WALLPAPERS.map((w) => (
                <button key={w.id} onClick={() => { setWallpaper(w.id); setWp(w.id); }} aria-label={w.label} title={w.label}
                  className={cn('aspect-square rounded-lg border-2 bg-white dark:bg-[#121830]', wp === w.id ? 'border-indigo-500' : 'border-zinc-200 dark:border-white/10')}
                  style={w.style} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-5 border-b border-zinc-200/80 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-800 dark:text-zinc-200 flex items-center gap-2"><Languages className="w-4 h-4 text-zinc-500" /> Auto-translate</span>
          <select aria-label="Auto-translate messages into" value={convo.translateTo ?? ''} onChange={(e) => onAutoTranslate(e.target.value || null)} className="text-xs rounded-lg bg-zinc-100 dark:bg-white/10 px-2 py-1.5 text-zinc-700 dark:text-zinc-200 max-w-[9rem]">
            <option value="">Off</option>
            {Object.entries(LANGUAGES).map(([code, l]) => <option key={code} value={code}>{l.name}</option>)}
          </select>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">Messages from others appear in the language you choose. Only you see this setting. Messages are translated by AI (Google Gemini) and can contain mistakes — “Show original” shows what was sent.</p>
      </div>

      {starredHere.length > 0 && (
        <div className="p-5 border-b border-zinc-200/80 dark:border-white/[0.06]">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500" /> Starred in this chat</p>
          <div className="space-y-1.5">
            {starredHere.slice(-5).reverse().map((m) => (
              <button key={m.id} onClick={() => document.getElementById(`msg-${m.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })} className="w-full text-left text-sm text-zinc-700 dark:text-zinc-300 truncate p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                {m.body || m.attachmentName || 'Attachment'}
              </button>
            ))}
          </div>
        </div>
      )}

      {(media.length > 0 || files.length > 0 || links.length > 0) && (
        <div className="p-5 border-b border-zinc-200/80 dark:border-white/[0.06]">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Media, files & links</p>
          {media.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {media.map((m) => (
                <button key={m.id} onClick={() => onOpenImage(m.attachmentUrl!)} className="aspect-square rounded-lg overflow-hidden bg-zinc-100 dark:bg-white/5">
                  <img src={m.attachmentUrl!} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            {files.filter((f) => f.type === 'AUDIO' || f.type === 'VIDEO').map((f) => (
              <div key={f.id} className="p-1"><AttachmentInline url={f.attachmentUrl!} name={f.attachmentName} mime={f.attachmentMime} type={f.type} durationSec={f.metadata?.durationSec} /></div>
            ))}
            {files.filter((f) => f.type !== 'AUDIO' && f.type !== 'VIDEO').map((f) => (
              <a key={f.id} href={f.attachmentUrl!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{f.attachmentName || 'File'}</span>
                <span className="text-[11px] text-zinc-400">{formatBytes(f.attachmentSize)}</span>
              </a>
            ))}
            {links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                <Link2 className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{l.url.replace(/^https?:\/\//, '')}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {convo.isGroup && (
        <div className="p-5 flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{convo.members.length} members</p>
            {isAdmin && <button onClick={() => setAdding(true)} className="text-xs font-semibold text-indigo-500 inline-flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Add</button>}
          </div>
          <div className="space-y-1">
            {convo.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl">
                <Avatar name={m.name} src={m.avatar} online={m.online} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{m.id === data.me ? 'You' : m.name}</p>
                  <p className="text-[11px] text-zinc-500">{lastSeenLabel(m.online, m.lastSeenAt)}</p>
                </div>
                {m.groupRole === 'ADMIN' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500">Admin</span>}
              </div>
            ))}
          </div>
          <button onClick={leave} className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> Leave group</button>
        </div>
      )}

      {adding && (
        <AddMembers conversationId={convo.id} existing={convo.members.map((m) => m.id)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChanged(); }} />
      )}
    </motion.aside>
  );
}

function AddMembers({ conversationId, existing, onClose, onDone }: { conversationId: string; existing: string[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const { data: people } = useSWR<{ id: string; name: string; avatar: string | null; online: boolean }[]>(`/api/chat/users?q=${encodeURIComponent(q)}`, authedJson);
  const [busy, setBusy] = useState(false);
  const add = async (id: string) => {
    setBusy(true);
    try {
      await chatJson(`/api/chat/conversations/${conversationId}/members`, { method: 'POST', body: JSON.stringify({ userIds: [id] }) });
      toast.success('Member added');
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-in w-full max-w-sm max-h-[70vh] flex flex-col rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="p-4 flex items-center gap-2 border-b border-zinc-200 dark:border-white/10">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people to add" className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none" />
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-zinc-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-2">
          {people?.filter((p) => !existing.includes(p.id)).map((p) => (
            <button key={p.id} disabled={busy} onClick={() => add(p.id)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/[0.04] text-left">
              <Avatar name={p.name} src={p.avatar} online={p.online} size={36} />
              <span className="text-sm font-medium text-zinc-900 dark:text-white">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
