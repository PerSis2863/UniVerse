'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { FileText, Loader2, MessageSquare, Paperclip, SendHorizontal, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { chatJson, formatBytes, messageTypeFor, uploadChatFile, type ChatMessage, type ThreadResponse } from '@/components/chat/chat-client';

// Chat during a call. A call that belongs to a chat (started in a chat, a voice room) uses that
// chat, so what's said stays there afterwards. Other calls (classes, study groups, call links)
// chat in the call room itself, for as long as the call lasts (cloudflare/worker.ts CallRoom).
// Links stay links; files upload the way chat files do. A side panel on computers, a sheet on phones.

export interface FileRef { url: string; name: string; size: number; mime: string }
/** A message in the call room's own chat (mine: sent by me, from any of my devices). */
export interface RoomLine { id: string; name: string; text: string; at: number; mine?: boolean; file?: FileRef | null }
export interface Line { id: string; mine: boolean; name: string; text: string; at: number; file?: FileRef | null; note?: boolean }

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Text with its web addresses as links. */
function Linked({ text }: { text: string }) {
  return <>{text.split(URL_RE).map((p, i) => (i % 2 === 1 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-sky-300 break-all">{p}</a> : <span key={i}>{p}</span>))}</>;
}

function fromChat(m: ChatMessage, me: string): Line {
  const deleted = !!m.deletedAt || m.type === 'DELETED';
  const file = !deleted && m.attachmentUrl ? { url: m.attachmentUrl, name: m.attachmentName ?? 'File', size: m.attachmentSize ?? 0, mime: m.attachmentMime ?? '' } : null;
  const text = deleted ? 'Message deleted' : m.type === 'CALL' ? '📞 Call' : m.type === 'POLL' ? `📊 ${m.body}` : m.type === 'AUDIO' && !m.body ? '🎤 Voice message' : m.type === 'LOCATION' ? '📍 Location' : m.type === 'CONTACT' ? '👤 Contact' : m.body;
  return { id: m.id, mine: m.senderId === me, name: m.sender?.name ?? '', text, at: new Date(m.createdAt).getTime(), file, note: deleted || m.type === 'CALL' || m.type === 'SYSTEM' };
}

/** The call's messages, from its chat or its room, and how to send one. */
export function useCallChat({ chatId, room, sendRoom }: { chatId: string | null; room: RoomLine[]; sendRoom: (m: { text?: string; file?: FileRef }) => void }) {
  const key = chatId ? `/api/chat/conversations/${chatId}/messages` : null;
  // Live updates refresh the chat; it only polls without them.
  const refreshInterval = useLiveInterval(5000, 0);
  const { data, mutate } = useSWR<ThreadResponse>(key, authedJson, { refreshInterval, revalidateOnFocus: false });
  const lines = useMemo<Line[]>(
    () => (chatId ? (data?.messages ?? []).map((m) => fromChat(m, data?.me ?? '')) : room.map((l) => ({ id: l.id, mine: !!l.mine, name: l.name, text: l.text, at: l.at, file: l.file ?? null }))),
    [chatId, data, room],
  );
  const send = async (m: { text?: string; file?: FileRef }) => {
    if (!key) { sendRoom(m); return; }
    const body = m.file
      ? { type: messageTypeFor(m.file.mime), attachmentUrl: m.file.url, attachmentName: m.file.name, attachmentSize: m.file.size, attachmentMime: m.file.mime }
      : { body: m.text };
    await chatJson(key, { method: 'POST', body: JSON.stringify(body) });
    void mutate();
  };
  return { lines, send, linked: !!chatId };
}

export function CallChatPanel({ open, onClose, lines, onSend, linked, title }: {
  open: boolean; onClose: () => void; lines: Line[]; title: string;
  onSend: (m: { text?: string; file?: FileRef }) => Promise<void>;
  /** Uses the call's chat (messages stay there) rather than the call room's own. */ linked: boolean;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const near = useRef(true);

  // Stay at the newest message unless you scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && open && near.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines.length, open]);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    haptic('tap');
    setBusy(true);
    setText('');
    near.current = true;
    try { await onSend({ text: t }); } catch (e) { setText(t); toast.error((e as Error).message || 'Message not sent.'); } finally { setBusy(false); }
  };
  const attach = async (f: File | undefined) => {
    if (!f) return;
    setProgress(0);
    try {
      const url = await uploadChatFile(f, setProgress);
      near.current = true;
      await onSend({ file: { url, name: f.name, size: f.size, mime: f.type || 'application/octet-stream' } });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t share the file.');
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40 sm:hidden" aria-hidden />
          <motion.aside key="chat" role="dialog" aria-label="Chat in the call"
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 h-[78vh] rounded-t-3xl sm:inset-x-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:h-auto sm:w-[22rem] sm:rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
              <div className="min-w-0">
                <p className="font-semibold">Chat</p>
                <p className="text-[11px] text-zinc-400 truncate">{linked ? `Messages stay in ${title}` : 'Only for this call; gone when it ends'}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; near.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
              {lines.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-sm text-zinc-400 gap-2 px-6">
                  <MessageSquare className="w-8 h-8 text-zinc-600" />
                  Say hi, share a link or a file. Everyone in the call sees it.
                </div>
              )}
              {lines.map((l, i) => {
                const first = i === 0 || lines[i - 1].name !== l.name || lines[i - 1].mine !== l.mine || l.at - lines[i - 1].at > 5 * 60_000;
                if (l.note) return <p key={l.id} className="text-center text-[11px] text-zinc-500 py-1">{l.name ? `${l.name}: ` : ''}{l.text}</p>;
                return (
                  <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy} className={cn('flex flex-col', l.mine ? 'items-end' : 'items-start', first && i > 0 && 'pt-1.5')}>
                    {first && <span className="text-[11px] text-zinc-400 px-1 mb-0.5">{l.mine ? 'You' : l.name} · {new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                    <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug whitespace-pre-wrap break-words', l.mine ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-br-md' : 'bg-white/10 rounded-bl-md')}>
                      {l.file && (
                        l.file.mime.startsWith('image/') ? (
                          <a href={l.file.url} target="_blank" rel="noopener noreferrer" className="block -mx-1 -mt-0.5 mb-1">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a user's upload, any size */}
                            <img src={l.file.url} alt={l.file.name} className="max-h-48 rounded-xl" />
                          </a>
                        ) : (
                          <a href={l.file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 -mx-1 mb-1 px-2 py-1.5 rounded-xl bg-black/20 hover:bg-black/30">
                            <FileText className="w-4 h-4 shrink-0" /><span className="truncate">{l.file.name}</span><span className="text-[11px] opacity-70 shrink-0">{formatBytes(l.file.size)}</span>
                          </a>
                        )
                      )}
                      {l.text && <Linked text={l.text} />}
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <AnimatePresence>
              {progress !== null && (
                <motion.div key="up" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs text-zinc-300 py-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading… {progress}%</div>
                </motion.div>
              )}
            </AnimatePresence>
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="p-3 pt-2 flex items-end gap-2 border-t border-white/[0.06]">
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => void attach(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={progress !== null} aria-label="Share a file" className="w-10 h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50"><Paperclip className="w-4 h-4" /></button>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder="Message everyone"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}
                className="flex-1 min-w-0 resize-none max-h-28 rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 py-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400/60" />
              <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={!text.trim() || busy} aria-label="Send"
                className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center disabled:opacity-40"><SendHorizontal className="w-4 h-4" /></motion.button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
