'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { Check, ChevronDown, Loader2, MessageSquareWarning, PauseCircle, PlayCircle, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '@/components/chat/MessageBubble';
import { Segmented } from '@/components/ui/Segmented';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Admin → Safety → Chat safety (Stage 4 · 4.10; src/server/safety.ts): messages the chat safety
// check flagged, most urgent first. Open one to see the messages around it, then mark it reviewed,
// dismiss it as a false alarm, or pause the sender's messages for a day.

type Status = 'OPEN' | 'REVIEWED' | 'DISMISSED';
interface Flag {
  id: string; kind: string; severity: 'low' | 'medium' | 'high'; reason: string | null; excerpt: string; source: 'ai' | 'words'; repeats: number; status: Status; note: string | null; createdAt: string; reviewedAt: string | null;
  sender: { id: string; name: string; role: string; avatar: string | null }; where: string; people: number; paused: boolean;
}
interface Line { id: string; name: string; role: string; at: string; flagged: boolean; text: string }

const KIND: Record<string, string> = { bullying: 'Bullying', threat: 'Threat', self_harm: 'May be at risk', sexual: 'Sexual or grooming', personal_info: 'Personal details', hate: 'Hate' };
const SEVERITY = { high: 'bg-rose-600 text-white', medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', low: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' } as const;
const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';

function Context({ id }: { id: string }) {
  const { data } = useSWR<{ messages: Line[] }>(`/api/safety/flags/${id}`, authedJson);
  if (!data) return <p className="text-xs text-zinc-500 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading the messages around it…</p>;
  return (
    <ol className="space-y-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3" aria-label="Messages around it">
      {data.messages.map((m) => (
        <li key={m.id} className={cn('text-sm', m.flagged && 'rounded-lg bg-rose-500/10 -mx-1.5 px-1.5 py-1')}>
          <span className="text-xs text-zinc-500">{m.name}{m.role === 'STUDENT' ? '' : ` · ${m.role.toLowerCase()}`} · {formatDistanceToNowStrict(new Date(m.at), { addSuffix: true })}</span>
          <span className="block text-zinc-800 dark:text-zinc-100 whitespace-pre-line break-words">{m.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function ChatSafety() {
  const [status, setStatus] = useState<Status>('OPEN');
  const { data, error, mutate } = useSWR<{ open: number; flags: Flag[] }>(`/api/safety/flags?status=${status}`, authedJson);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const act = async (f: Flag, action: 'reviewed' | 'dismiss' | 'pause' | 'unpause') => {
    setBusy(f.id + action);
    try {
      await authedJson(`/api/safety/flags/${f.id}`, { method: 'POST', body: JSON.stringify({ action, note: notes[f.id] }) });
      if (action === 'pause' || action === 'unpause') {
        toast.success(action === 'pause' ? `${f.sender.name} can’t send messages for a day` : `${f.sender.name} can send messages again`);
        await mutate((d) => (d ? { ...d, flags: d.flags.map((x) => (x.sender.id === f.sender.id ? { ...x, paused: action === 'pause' } : x)) } : d), { revalidate: false });
      } else {
        toast.success(action === 'dismiss' ? 'Dismissed as a false alarm' : 'Marked as reviewed');
        await mutate((d) => (d ? { open: Math.max(0, d.open - 1), flags: d.flags.filter((x) => x.id !== f.id) } : d), { revalidate: false });
        setOpenId(null);
      }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500 max-w-md">Messages in chats with students that look like bullying, threats, someone at risk, grooming, risky personal details or hate. Nobody else sees these, and the sender isn’t told.</p>
          <Segmented label="Show" value={status} onChange={(v) => { setStatus(v); setOpenId(null); }}
            segments={[{ value: 'OPEN', label: data && status === 'OPEN' && data.open ? `To review · ${data.open}` : 'To review' }, { value: 'REVIEWED', label: 'Reviewed' }, { value: 'DISMISSED', label: 'Dismissed' }]} />
        </div>
        {error ? (
          <p className="text-sm text-rose-500">{(error as Error).message}</p>
        ) : !data ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>
        ) : data.flags.length === 0 ? (
          <motion.div variants={fadeUp} initial="hidden" animate="show" className={`${card} p-10 text-center`}>
            <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-zinc-900 dark:text-white">{status === 'OPEN' ? 'Nothing to review' : 'Nothing here'}</p>
            <p className="text-sm text-zinc-500 mt-1">{status === 'OPEN' ? 'When a chat message may need a look, it shows up here and every admin gets a notification.' : 'Flags you handle show up here.'}</p>
          </motion.div>
        ) : (
          <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2.5">
            {data.flags.map((f) => {
              const open = openId === f.id;
              return (
                <motion.li key={f.id} variants={fadeUp} layout className={cn(card, 'p-4', f.severity === 'high' && status === 'OPEN' && 'ring-1 ring-rose-500/40')}>
                  <button type="button" onClick={() => setOpenId(open ? null : f.id)} aria-expanded={open} className="w-full flex items-start gap-3 text-left">
                    <Avatar name={f.sender.name} src={f.sender.avatar} size={40} />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('text-[10px] font-bold uppercase rounded-full px-2 py-0.5', SEVERITY[f.severity])}>{f.severity === 'high' ? 'Urgent' : f.severity}</span>
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{KIND[f.kind] ?? f.kind}</span>
                        {f.repeats > 0 && <span className="text-[11px] text-zinc-500">· {f.repeats + 1} messages</span>}
                        {f.paused && <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">· paused</span>}
                      </span>
                      <span className="block mt-1 text-sm text-zinc-900 dark:text-white line-clamp-2 break-words">“{f.excerpt}”</span>
                      <span className="block mt-0.5 text-xs text-zinc-500 truncate">{f.sender.name} · {f.sender.role.toLowerCase()} · {f.where}{f.people > 2 ? ` (${f.people} people)` : ''} · {formatDistanceToNowStrict(new Date(f.createdAt), { addSuffix: true })}</span>
                    </span>
                    <ChevronDown className={cn('w-4 h-4 text-zinc-400 shrink-0 mt-1 transition-transform', open && 'rotate-180')} />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
                        <div className="pt-3 space-y-3">
                          {f.reason && <p className="text-xs text-zinc-600 dark:text-zinc-300 flex gap-1.5"><MessageSquareWarning className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />{f.reason}{f.source === 'words' ? '' : ' (AI)'}</p>}
                          <Context id={f.id} />
                          {status === 'OPEN' ? (
                            <>
                              <textarea value={notes[f.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} rows={2} maxLength={500} placeholder="A note for other admins (optional): what you did, who you spoke to…" aria-label="Note"
                                className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none" />
                              <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={!!busy} onClick={() => void act(f, 'reviewed')} className="h-9 px-3.5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                                  {busy === f.id + 'reviewed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Reviewed
                                </button>
                                <button type="button" disabled={!!busy} onClick={() => void act(f, 'dismiss')} className="h-9 px-3.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-xs font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1.5 disabled:opacity-50">
                                  {busy === f.id + 'dismiss' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}False alarm
                                </button>
                                <button type="button" disabled={!!busy} onClick={() => void act(f, f.paused ? 'unpause' : 'pause')} className="h-9 px-3.5 rounded-full text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5 disabled:opacity-50">
                                  {f.paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}{f.paused ? 'Let them send again' : 'Pause their messages for a day'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-zinc-500">{status === 'DISMISSED' ? 'Dismissed' : 'Reviewed'}{f.reviewedAt ? ` ${formatDistanceToNowStrict(new Date(f.reviewedAt), { addSuffix: true })}` : ''}{f.note ? ` · “${f.note}”` : ''}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </div>
  );
}
