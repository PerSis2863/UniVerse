'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict, isToday } from 'date-fns';
import { Clock, Languages, Loader2, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { LANGUAGES } from '@/lib/languages';
import { fadeUp, list, spring } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// Parent–teacher messages in the parent app (Stage 5 · B16.2; src/server/parent-messages.ts):
// the child's teachers, each with our chat. Messages can be read in the parent's language; outside
// a teacher's hours for parents, the message waits for them (shown before sending).

interface Teacher {
  id: string; name: string; avatar: string | null; courses: string[]; conversationId: string | null;
  last: { body: string; at: string; mine: boolean } | null; unread: number; hours: { text: string; now: boolean };
}
interface Msg { id: string; mine: boolean; system: boolean; body: string; translated: string | null; at: string; edited: boolean; pending?: boolean; failed?: boolean }
interface Chat { id: string; teacher: { name: string; avatar: string | null } | null; child: string; hours: { text: string; now: boolean }; lang: string | null; seenAt: string | null; messages: Msg[] }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const when = (iso: string) => { const d = new Date(iso); return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM, HH:mm'); };

export function ParentMessages({ studentId, chatId, onChat }: { studentId: string; chatId: string | null; onChat: (id: string | null) => void }) {
  const key = `/api/parent/chats?studentId=${encodeURIComponent(studentId)}`;
  const { data, error, isLoading, mutate } = useSWR<{ allowed: boolean; child: string; teachers: Teacher[] }>(key, authedJson);
  const [fresh, setFresh] = useState<Teacher | null>(null);
  const open = data?.teachers.find((t) => t.conversationId && t.conversationId === chatId) ?? null;

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <div className="p-6"><ContentSkeleton variant="list" /></div>;
  if (!data) return null;
  if (!data.allowed) {
    return (
      <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-6 text-center`}>
        <MessageCircle className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
        <p className="font-semibold text-zinc-900 dark:text-white">Messages to teachers are off</p>
        <p className="text-sm text-zinc-500 mt-1">Your school hasn’t turned on parent messages. Ask the school office if you need to reach a teacher.</p>
      </motion.section>
    );
  }
  return (
    <>
      <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-label={`${data.child}’s teachers`}>
        <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{data.child}’s teachers</p>
        {data.teachers.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-zinc-500">{data.child} isn’t in any classes yet. Teachers show up here once they are.</p>
        ) : (
          <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.teachers.map((t) => (
              <motion.li key={t.id} variants={fadeUp}>
                <button type="button" onClick={() => { haptic('tap'); if (t.conversationId) onChat(t.conversationId); else setFresh(t); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
                  <Avatar name={t.name} src={t.avatar} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-white truncate">{t.name}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{t.courses.join(', ')}</span>
                    </span>
                    <span className="block text-sm text-zinc-500 truncate">
                      {t.last ? `${t.last.mine ? 'You: ' : ''}${t.last.body}` : 'Write to them about your child'}
                    </span>
                    <span className={cn('mt-0.5 inline-flex items-center gap-1 text-[11px]', t.hours.now ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>
                      <Clock className="w-3 h-3" />{t.hours.now ? 'Usually replies now' : `Replies ${t.hours.text}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    {t.last && <span className="text-[11px] text-zinc-400">{formatDistanceToNowStrict(new Date(t.last.at))}</span>}
                    {t.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center" aria-label={`${t.unread} unread`}>{t.unread}</span>}
                  </span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
        <p className="px-3 pt-1 pb-2 text-[11px] text-zinc-500 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Messages are checked for safety, and your school’s rules apply.</p>
      </motion.section>

      {(open || fresh) && (
        <ChatSheet
          key={open?.conversationId ?? `new-${fresh!.id}`}
          teacher={(open ?? fresh)!} studentId={studentId} child={data.child}
          chatId={open?.conversationId ?? null}
          onStarted={(id) => { setFresh(null); onChat(id); void mutate(); }}
          onClose={() => { setFresh(null); onChat(null); void mutate(); }}
        />
      )}
    </>
  );
}

function ChatSheet({ teacher, studentId, child, chatId, onStarted, onClose }: {
  teacher: Teacher; studentId: string; child: string; chatId: string | null; onStarted: (id: string) => void; onClose: () => void;
}) {
  const { data, mutate } = useSWR<Chat>(chatId ? `/api/parent/chats/${chatId}` : null, authedJson);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Msg[]>([]);
  const [lang, setLang] = useState<string | null>(null);
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const end = useRef<HTMLDivElement>(null);
  const hours = data?.hours ?? teacher.hours;
  const shownLang = lang ?? data?.lang ?? null;
  const messages = [...(data?.messages ?? []), ...pending];
  const lastMine = [...messages].reverse().find((m) => m.mine && !m.pending);
  const seen = !!(lastMine && data?.seenAt && new Date(data.seenAt) >= new Date(lastMine.at));

  // Newest at the bottom, scrolled into view as messages arrive.
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: messages.length > 1 ? 'smooth' : 'auto' }); }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    haptic('tap');
    const temp: Msg = { id: `p-${Date.now()}`, mine: true, system: false, body, translated: null, at: new Date().toISOString(), edited: false, pending: true };
    setPending((p) => [...p, temp]);
    setText('');
    try {
      if (chatId) {
        await authedJson(`/api/parent/chats/${chatId}`, { method: 'POST', body: JSON.stringify({ body }) });
        await mutate();
        setPending((p) => p.filter((m) => m.id !== temp.id));
      } else {
        const r = await authedJson<{ conversationId: string }>('/api/parent/chats', { method: 'POST', body: JSON.stringify({ studentId, teacherId: teacher.id, body, lang: shownLang }) });
        onStarted(r.conversationId);
      }
    } catch (e) {
      setPending((p) => p.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
      setText(body);
      toast.error(errorMessage(e, 'Couldn’t send the message.'));
    }
  };
  const pickLang = async (value: string) => {
    const next = value || null;
    setLang(next ?? '');
    if (!chatId) return;
    try { await authedJson(`/api/parent/chats/${chatId}`, { method: 'POST', body: JSON.stringify({ lang: next }) }); await mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t change the language.')); }
  };

  return (
    <Sheet title={teacher.name} onClose={onClose} footer={(
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} aria-label={`Message to ${teacher.name}`} placeholder={`Write to ${teacher.name.split(' ')[0]} about ${child}…`}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className="input flex-1 min-h-11 max-h-32 resize-none py-2.5" />
        <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={!text.trim()} aria-label="Send" className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center disabled:opacity-40 shrink-0">
          <Send className="w-4 h-4" />
        </motion.button>
      </form>
    )}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('inline-flex items-center gap-1.5 text-xs', hours.now ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>
            <Clock className="w-3.5 h-3.5" />{hours.now ? 'Usually replies now' : `Replies ${hours.text}. Your message will be waiting for them.`}
          </p>
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <Languages className="w-3.5 h-3.5" />
            <select value={shownLang ?? ''} onChange={(e) => void pickLang(e.target.value)} aria-label="Read messages in" className="bg-transparent text-xs font-medium text-zinc-700 dark:text-zinc-200 outline-none">
              <option value="">As written</option>
              {Object.entries(LANGUAGES).map(([code, l]) => <option key={code} value={code}>{l.native}</option>)}
            </select>
          </label>
        </div>
        <div className="min-h-[30vh] max-h-[50vh] overflow-y-auto space-y-1.5 pr-1" role="log" aria-live="polite" aria-label="Messages">
          {chatId && !data ? <ContentSkeleton variant="list" /> : messages.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">Say hello, and what you’d like to talk about.</p>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => m.system ? (
                <motion.p key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-zinc-500 text-center px-6 py-1">{m.body}</motion.p>
              ) : (
                <motion.div key={m.id} layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: m.pending ? 0.6 : 1, y: 0, scale: 1 }} transition={spring.bouncy} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white rounded-br-md' : 'bg-zinc-100 dark:bg-white/[0.07] text-zinc-900 dark:text-white rounded-bl-md')}>
                    <p className="whitespace-pre-wrap break-words">{m.translated && !original.has(m.id) ? m.translated : m.body}</p>
                    <p className={cn('mt-0.5 text-[10px] flex items-center gap-1.5', m.mine ? 'text-white/70 justify-end' : 'text-zinc-500')}>
                      {m.pending ? <><Loader2 className="w-3 h-3 animate-spin" />Sending</> : m.failed ? 'Not sent' : when(m.at)}{m.edited && ' · edited'}
                      {m.translated && (
                        <button type="button" onClick={() => setOriginal((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} className="underline underline-offset-2">
                          {original.has(m.id) ? 'Translate' : 'Show original'}
                        </button>
                      )}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {seen && <p className="text-[10px] text-zinc-400 text-right pr-1">Seen</p>}
          <div ref={end} />
        </div>
      </div>
    </Sheet>
  );
}
