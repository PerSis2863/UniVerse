'use client';
import { haptic } from '@/lib/haptics';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, BadgeCheck, FileText, Info, Loader2, LogOut, Pencil, Phone, UserPlus, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar, MessageBubble } from './MessageBubble';
import { Composer, type SendPayload } from './Composer';
import { type ChatMessage, type ThreadResponse, chatJson, dayLabel, formatBytes, lastSeenLabel, messageTypeFor, uploadChatFile } from './chat-client';

export function ChatWindow({ conversationId, onBack, onChanged }: { conversationId: string; onBack: () => void; onChanged: () => void }) {
  const key = `/api/chat/conversations/${conversationId}/messages`;
  const { data, error, isLoading, mutate } = useSWR<ThreadResponse>(key, authedJson, { refreshInterval: 2500, revalidateOnFocus: true });
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // Reset local state when switching conversations.
  useEffect(() => {
    setOlder([]); setHasMoreOlder(null); setPending([]); setReplyTo(null); setEditing(null); setInfoOpen(false); lastCount.current = 0;
  }, [conversationId]);

  const me = data?.me ?? '';
  const convo = data?.conversation;
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...(data?.messages ?? []), ...pending].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [older, data?.messages, pending]);
  const others = convo?.members.filter((m) => m.id !== me) ?? [];
  const other = !convo?.isGroup ? others[0] : undefined;
  const canModerate = convo?.isGroup && convo.myRole === 'ADMIN';

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

  const appendSent = (msg: ChatMessage, tempId: string) => {
    setPending((p) => p.filter((x) => x.id !== tempId));
    mutate((prev) => (prev ? { ...prev, messages: [...prev.messages.filter((x) => x.id !== msg.id), msg] } : prev), { revalidate: false });
    onChanged();
  };

  const send = async ({ text, file, voice }: SendPayload) => {
    haptic('tap');
    const tempId = `temp-${Date.now()}`;
    const base = { id: tempId, conversationId, senderId: me, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, reactions: {}, metadata: null, sender: { id: me, name: 'You', avatar: null }, pending: true, replyTo: replyTo ? { id: replyTo.id, body: replyTo.body, type: replyTo.type, sender: replyTo.sender } : null } as const;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      if (file || voice) {
        const upload = file ?? new File([voice!.blob], `voice-${Date.now()}.${voice!.blob.type.includes('mp4') ? 'm4a' : voice!.blob.type.includes('ogg') ? 'ogg' : 'webm'}`, { type: voice!.blob.type });
        const type = voice ? 'AUDIO' : messageTypeFor(upload.type);
        setPending((p) => [...p, { ...base, type, body: '', attachmentUrl: null, attachmentName: upload.name, attachmentSize: upload.size, attachmentMime: upload.type } as ChatMessage]);
        setUploadProgress(0);
        const url = await uploadChatFile(upload, me, setUploadProgress);
        setUploadProgress(null);
        const msg = await chatJson<ChatMessage>(key, {
          method: 'POST',
          body: JSON.stringify({ type, attachmentUrl: url, attachmentName: upload.name, attachmentSize: upload.size, attachmentMime: upload.type, durationSec: voice?.durationSec, replyToId }),
        });
        appendSent(msg, tempId);
        if (text) await send({ text });
      } else if (text) {
        setPending((p) => [...p, { ...base, type: 'TEXT', body: text, attachmentUrl: null, attachmentName: null, attachmentSize: null, attachmentMime: null } as ChatMessage]);
        const msg = await chatJson<ChatMessage>(key, { method: 'POST', body: JSON.stringify({ body: text, replyToId }) });
        appendSent(msg, tempId);
      }
    } catch (e: any) {
      setPending((p) => p.filter((x) => x.id !== tempId));
      setUploadProgress(null);
      toast.error(e.message || 'Message not sent.');
      throw e;
    }
  };

  const saveEdit = async (text: string) => {
    if (!editing) return;
    try {
      const msg = await chatJson<ChatMessage>(`/api/chat/messages/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ body: text }) });
      mutate((prev) => (prev ? { ...prev, messages: prev.messages.map((x) => (x.id === msg.id ? msg : x)) } : prev), { revalidate: false });
      setOlder((cur) => cur.map((x) => (x.id === msg.id ? msg : x)));
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

  const call = async (kind: 'audio' | 'video') => {
    // Open the tab synchronously so the browser doesn't block it as a pop-up.
    const win = window.open('', '_blank');
    try {
      const msg = await chatJson<ChatMessage>(key, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind }) });
      appendSent(msg, '');
      if (msg.metadata?.url) {
        if (win) win.location.href = msg.metadata.url;
        else toast('Call started', { description: 'Your browser blocked the new tab — use the Join button in the chat.' });
      }
    } catch (e: any) {
      win?.close();
      toast.error(e.message);
    }
  };

  const readState = (m: ChatMessage): 'sent' | 'read' | null => {
    if (m.senderId !== me || !convo) return null;
    const t = new Date(m.createdAt).getTime();
    const readers = others.filter((o) => o.lastReadAt && new Date(o.lastReadAt).getTime() >= t);
    return others.length > 0 && readers.length === others.length ? 'read' : 'sent';
  };

  const subtitle = data?.typing.length
    ? `${convo?.isGroup ? data.typing.join(', ') + ' ' : ''}typing…`
    : convo?.isOfficial
      ? 'Official account'
      : convo?.isGroup
        ? others.map((o) => o.name.split(' ')[0]).slice(0, 5).join(', ') + (others.length > 5 ? ` +${others.length - 5}` : '') + ', you'
        : other ? lastSeenLabel(other.online, other.lastSeenAt) : '';

  if (error) return <div className="flex-1 flex items-center justify-center text-sm text-rose-500 p-6 text-center">{(error as Error).message}</div>;
  if (isLoading || !convo) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>;

  return (
    <div className="flex-1 flex min-w-0 min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 md:px-5 h-16 shrink-0 border-b border-zinc-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl">
          <button onClick={onBack} aria-label="Back" className="md:hidden p-2 -ml-1 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
          <button onClick={() => setInfoOpen((v) => !v)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
            <Avatar name={convo.title} src={convo.avatarUrl} online={!convo.isGroup && other?.online} size={40} />
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1">
                {convo.title} {convo.isOfficial && <BadgeCheck className="w-4 h-4 text-indigo-500 shrink-0" />}
              </p>
              <p className={cn('text-xs truncate', data?.typing.length ? 'text-emerald-500 font-medium' : 'text-zinc-500')}>{subtitle}</p>
            </div>
          </button>
          {!convo.isOfficial && (
            <>
              <button onClick={() => call('audio')} aria-label="Voice call" title="Voice call" className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Phone className="w-5 h-5" /></button>
              <button onClick={() => call('video')} aria-label="Video call" title="Video call" className="p-2.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Video className="w-5 h-5" /></button>
            </>
          )}
          <button onClick={() => setInfoOpen((v) => !v)} aria-label="Chat info" className={cn('p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10', infoOpen ? 'text-indigo-500' : 'text-zinc-600 dark:text-zinc-300')}><Info className="w-5 h-5" /></button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={(e) => { const el = e.currentTarget; setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 400); }}
          className="relative flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1.5"
          style={{ backgroundImage: 'radial-gradient(rgba(99,102,241,0.08) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        >
          {(hasMoreOlder ?? data?.hasMore) && (
            <div className="flex justify-center pb-2">
              <button onClick={loadOlder} disabled={loadingOlder} className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5">
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
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const showSender = !!convo.isGroup && (newDay || prev?.senderId !== m.senderId || prev?.type === 'SYSTEM');
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="flex justify-center py-2 sticky top-0 z-10">
                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-white/90 dark:bg-[#161b2e]/90 backdrop-blur border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 shadow-sm">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={cn(!newDay && prev?.senderId !== m.senderId && 'pt-2')}>
                  <MessageBubble
                    m={m}
                    mine={m.senderId === me}
                    me={me}
                    showSender={showSender}
                    readState={readState(m)}
                    canModerate={!!canModerate}
                    onReply={() => { setEditing(null); setReplyTo(m); }}
                    onEdit={() => { setReplyTo(null); setEditing(m); }}
                    onDelete={() => remove(m)}
                    onReact={(e) => react(m, e)}
                    onOpenImage={setLightbox}
                  />
                </div>
              </Fragment>
            );
          })}
        </div>

        <AnimatePresence>
          {showJump && (
            <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="absolute bottom-28 right-6 md:right-10 z-20 w-10 h-10 rounded-full bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <ArrowDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        <Composer
          disabled={convo.isOfficial}
          replyTo={replyTo}
          editing={editing}
          uploadProgress={uploadProgress}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={send}
          onSaveEdit={saveEdit}
          onTyping={typing}
        />
      </div>

      <AnimatePresence>
        {infoOpen && (
          <InfoPanel
            data={data!}
            messages={messages}
            onClose={() => setInfoOpen(false)}
            onOpenImage={setLightbox}
            onChanged={() => { mutate(); onChanged(); }}
            onLeft={() => { onChanged(); onBack(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightbox(null)} className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-4">
            <button aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"><X className="w-6 h-6" /></button>
            <motion.img initial={{ scale: 0.95 }} animate={{ scale: 1 }} src={lightbox} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoPanel({ data, messages, onClose, onOpenImage, onChanged, onLeft }: {
  data: ThreadResponse; messages: ChatMessage[]; onClose: () => void; onOpenImage: (u: string) => void; onChanged: () => void; onLeft: () => void;
}) {
  const convo = data.conversation;
  const [adding, setAdding] = useState(false);
  const isAdmin = convo.isGroup && convo.myRole === 'ADMIN';
  const media = messages.filter((m) => m.type === 'IMAGE' && m.attachmentUrl).slice(-12).reverse();
  const files = messages.filter((m) => (m.type === 'FILE' || m.type === 'VIDEO' || m.type === 'AUDIO') && m.attachmentUrl).slice(-10).reverse();

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
      className="absolute md:relative inset-0 md:inset-auto z-30 md:z-auto w-full md:w-80 shrink-0 flex flex-col border-l border-zinc-200/80 dark:border-white/[0.06] bg-white dark:bg-[#0f1322] md:bg-white/60 md:dark:bg-white/[0.02] backdrop-blur-xl overflow-y-auto"
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

      {(media.length > 0 || files.length > 0) && (
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
            {files.map((f) => (
              <a key={f.id} href={f.attachmentUrl!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{f.attachmentName || 'File'}</span>
                <span className="text-[11px] text-zinc-400">{formatBytes(f.attachmentSize)}</span>
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
      <div className="sheet-in w-full max-w-sm max-h-[70vh] flex flex-col rounded-3xl bg-white dark:bg-[#11152a] border border-zinc-200 dark:border-white/10 shadow-2xl">
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
