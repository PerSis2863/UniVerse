'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { Check, Edit2, Hash, ImageIcon, Loader2, Paperclip, Send, Trash2, X } from 'lucide-react';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';

interface Post {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatar: string | null };
}
interface PostsResponse {
  posts: Post[];
  isMember: boolean;
  myId: string;
}

const URL_RE = /(https:\/\/[^\s]+)/g;
const IMAGE_RE = /\.(png|jpe?g|gif|webp)(\?|$)/i;

/** Plain-text message with https links made clickable. */
function MessageText({ text, mine }: { text: string; mine: boolean }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        /^https:\/\/\S+$/.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`underline break-all ${mine ? 'text-white' : 'text-indigo-500'}`}>
            {decodeURIComponent(part.split('/').pop()?.split('?')[0] ?? part).replace(/-[A-Za-z0-9]{20,}(\.\w+)$/, '$1')}
          </a>
        ) : (
          <span key={i} className="whitespace-pre-wrap break-words">{part}</span>
        ),
      )}
    </>
  );
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function GroupChat({ group, onClose }: { group: { id: string | number; name: string; members: number }; onClose: () => void }) {
  const key = `/api/groups/${group.id}/posts`;
  const refreshInterval = useLiveInterval(10_000, 10_000);
  const { data, error, isLoading, mutate } = useSWR<PostsResponse>(key, authedJson, {
    refreshInterval,
    revalidateOnFocus: true,
  });
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const lastCount = useRef(0);

  const posts = data?.posts ?? [];
  const myId = data?.myId;

  // Keep the newest message in view when new ones arrive.
  useEffect(() => {
    if (posts.length !== lastCount.current) {
      lastCount.current = posts.length;
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [posts.length]);

  const post = async (body: { text?: string; imageUrl?: string }) => {
    const res = await authedFetch(key, { method: 'POST', body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Message not sent. Please try again.');
    mutate((prev) => (prev ? { ...prev, posts: [...prev.posts, json] } : prev), { revalidate: false });
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      if (editingId) {
        const res = await authedFetch(`/api/groups/posts/${editingId}`, { method: 'PATCH', body: JSON.stringify({ text: value }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not edit the message.');
        mutate((prev) => (prev ? { ...prev, posts: prev.posts.map((p) => (p.id === editingId ? json : p)) } : prev), { revalidate: false });
        setEditingId(null);
      } else {
        await post({ text: value });
      }
      setText('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    const previous = data;
    mutate((prev) => (prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== id) } : prev), { revalidate: false });
    const res = await authedFetch(`/api/groups/posts/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      mutate(previous, { revalidate: false });
      toast.error('Could not delete the message.');
    }
  };

  const upload = async (file: File, asImage: boolean) => {
    if (file.size > 4 * 1024 * 1024) return void toast.error('Files must be 4 MB or smaller.');
    setUploading(true);
    try {
      const res = await authedFetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed.');
      const url = json.url.startsWith('/') ? `${window.location.origin}${json.url}` : json.url;
      await post(asImage || IMAGE_RE.test(file.name) ? { imageUrl: json.url } : { text: `📎 ${url}` });
    } catch (e: any) {
      toast.error(e.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const notMember = data && !data.isMember;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-0 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 sm:rounded-2xl w-full max-w-2xl h-full sm:h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 sm:rounded-t-2xl">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Hash className="w-4 h-4 text-indigo-500" /> {group.name}</h3>
            <p className="text-xs text-zinc-500">{group.members} member{group.members === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} aria-label="Close chat" className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
          {isLoading && <div className="h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>}
          {error && <p className="text-sm text-rose-500 text-center">{(error as Error).message}</p>}
          {!isLoading && !error && posts.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
              <Hash className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs">Start the conversation with your group.</p>
            </div>
          )}
          {posts.map((p) => {
            const mine = p.author.id === myId;
            const edited = new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime() > 1000;
            return (
              <div key={p.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''} group/message`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${mine ? 'bg-indigo-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'}`}>
                  {initials(p.author.name)}
                </div>
                <div className={`max-w-[75%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2 mb-1 px-1">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{mine ? 'You' : p.author.name}</span>
                    <span className="text-[10px] text-zinc-400">
                      {formatDistanceToNowStrict(new Date(p.createdAt), { addSuffix: true })}{edited ? ' · edited' : ''}
                    </span>
                  </div>
                  <div className={`flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    {mine && (
                      <div className="opacity-0 group-hover/message:opacity-100 focus-within:opacity-100 flex items-center gap-1 transition-opacity">
                        {p.body && !p.body.startsWith('📎 ') && (
                          <button onClick={() => { setEditingId(p.id); setText(p.body); }} aria-label="Edit message" className="p-1.5 text-zinc-400 hover:text-indigo-500 rounded">
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={() => remove(p.id)} aria-label="Delete message" className="p-1.5 text-zinc-400 hover:text-red-500 rounded">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className={`rounded-2xl text-sm overflow-hidden ${mine ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 rounded-tl-sm'}`}>
                      {p.imageUrl && (
                        <a href={p.imageUrl} target="_blank" rel="noopener noreferrer">
                          <img src={p.imageUrl} alt="Shared image" loading="lazy" className="max-h-64 w-auto object-cover" />
                        </a>
                      )}
                      {p.body && <div className="p-3"><MessageText text={p.body} mine={mine} /></div>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sm:rounded-b-2xl">
          {notMember ? (
            <p className="text-sm text-center text-zinc-500">Join this group to send messages.</p>
          ) : (
            <>
              {editingId && (
                <div className="flex justify-between items-center mb-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-300">
                  <span>Editing message</span>
                  <button onClick={() => { setEditingId(null); setText(''); }} aria-label="Cancel edit"><X className="w-3 h-3" /></button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => imageRef.current?.click()} disabled={uploading} aria-label="Share a photo" className="p-2 text-zinc-400 hover:text-indigo-500 bg-zinc-100 dark:bg-zinc-800 rounded-full shrink-0 disabled:opacity-50">
                  <ImageIcon className="w-5 h-5" />
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Share a file" className="p-2 text-zinc-400 hover:text-indigo-500 bg-zinc-100 dark:bg-zinc-800 rounded-full shrink-0 disabled:opacity-50">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>
                <input
                  value={text}
                  maxLength={4000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
                  placeholder={editingId ? 'Edit your message…' : 'Type a message…'}
                  className="flex-1 min-w-0 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-4 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button onClick={submit} disabled={sending || !text.trim()} aria-label={editingId ? 'Save edit' : 'Send'} className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors disabled:opacity-50">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}
          <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f, true); }} />
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp,.gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f, false); }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
