'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Avatar } from './MessageBubble';
import { type ChatMessage, chatJson, timeLabel } from './chat-client';

// A thread (Discord-style): replies to one message, beside the chat, so the main conversation
// stays clean. Live updates refresh it with the chat (same key prefix).

const PREVIEW: Record<string, string> = { IMAGE: '📷 Photo', FILE: '📎 File', AUDIO: '🎤 Voice message', VIDEO: '🎬 Video', POLL: '📊 Poll', LOCATION: '📍 Location', CONTACT: '👤 Contact', DELETED: 'Deleted message' };
const text = (m: ChatMessage) => (m.type === 'TEXT' ? m.body : m.type === 'POLL' ? `📊 ${m.body}` : PREVIEW[m.type] ?? m.body);

export function ThreadPanel({ conversationId, rootId, me, onClose }: { conversationId: string; rootId: string; me: string; onClose: () => void }) {
  const key = `/api/chat/conversations/${conversationId}/messages?thread=${rootId}`;
  const { data, error, mutate } = useSWR<{ root: ChatMessage; messages: ChatMessage[] }>(key, authedJson);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [data?.messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const msg = await chatJson<ChatMessage>(`/api/chat/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body, threadId: rootId }) });
      setDraft('');
      await mutate((d) => (d ? { ...d, messages: [...d.messages, msg] } : d), { revalidate: false });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };


  return (
    <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={spring.smooth}
      className="absolute inset-0 md:static md:w-[360px] shrink-0 z-30 flex flex-col min-h-0 border-l border-zinc-200/80 dark:border-white/[0.06] bg-white dark:bg-[#0f1322]" aria-label="Thread">
      <div className="flex items-center justify-between h-16 px-4 border-b border-zinc-200/80 dark:border-white/[0.06] shrink-0">
        <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><MessageCircle className="w-4 h-4 text-indigo-500" /> Thread</p>
        <button type="button" onClick={onClose} aria-label="Close thread" className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error ? <p className="text-sm text-rose-500">{(error as Error).message}</p> : !data ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div> : (
          <>
            <Row m={data.root} me={me} root />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{data.messages.length} {data.messages.length === 1 ? 'reply' : 'replies'}</p>
            {data.messages.map((m) => <Row key={m.id} m={m} me={me} />)}
            <div ref={endRef} />
          </>
        )}
      </div>
      <div className="p-3 border-t border-zinc-200/80 dark:border-white/[0.06] flex items-end gap-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={4000} placeholder="Reply in thread"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className="flex-1 resize-none max-h-32 px-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40" />
        <button type="button" onClick={() => void send()} disabled={busy || !draft.trim()} aria-label="Send reply" className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}

function Row({ m, me, root }: { m: ChatMessage; me: string; root?: boolean }) {
  return (
    <div className={cn('flex gap-2.5', root && 'pb-3 border-b border-zinc-200/80 dark:border-white/[0.06]')}>
      <Avatar name={m.sender.name} src={m.sender.avatar} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-xs"><span className="font-semibold text-zinc-900 dark:text-white">{m.senderId === me ? 'You' : m.sender.name}</span> <span className="text-zinc-400">{timeLabel(m.createdAt)}</span></p>
        <p className={cn('text-sm whitespace-pre-wrap break-words', m.type === 'DELETED' ? 'italic text-zinc-400' : 'text-zinc-800 dark:text-zinc-200')}>{text(m)}</p>
      </div>
    </div>
  );
}
