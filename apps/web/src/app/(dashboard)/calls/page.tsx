'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface CallRow {
  id: string; at: string; kind: 'audio' | 'video'; outgoing: boolean; answered: boolean; declined: boolean; durationSec: number | null;
  live: boolean; conversationId: string; title: string; avatar: string | null; isGroup: boolean;
}

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** Calls from the last 30 days, like a phone's call log: join live ones, call anyone back. */
export default function CallsPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, error } = useSWR<CallRow[]>('/api/calls', authedJson, { refreshInterval: 30_000 });
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const inbox = role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';

  const callBack = async (c: CallRow, kind: 'audio' | 'video') => {
    setBusy(c.id + kind);
    try {
      const msg = await authedJson<{ id: string }>(`/api/chat/conversations/${c.conversationId}/messages`, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind }) });
      router.push(`/call/${msg.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const rows = (data ?? []).filter((c) => filter === 'all' || (!c.outgoing && !c.answered && !c.live));
  return (
    <>
      <Topbar title="Calls" subtitle="Your voice and video calls from the last 30 days" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex gap-2" role="tablist">
            {(['all', 'missed'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('relative px-4 py-2 rounded-xl text-sm font-semibold transition-colors', filter === f ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05]')}>
                {filter === f && <motion.span layoutId="calls-filter" className="absolute inset-0 rounded-xl bg-indigo-600" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <span className="relative">{f === 'all' ? 'All' : 'Missed'}</span>
              </button>
            ))}
          </div>

          {error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}</div>
          ) : rows.length === 0 ? (
            <motion.div variants={fadeUp} initial="hidden" animate="show" className={`${card} p-10 text-center`}>
              <Phone className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
              <p className="font-semibold text-zinc-900 dark:text-white">{filter === 'missed' ? 'No missed calls' : 'No calls yet'}</p>
              <p className="text-sm text-zinc-500 mt-1">Start one from any chat with the phone or camera button.</p>
            </motion.div>
          ) : (
            <motion.ul variants={list} initial="hidden" animate="show" className={`${card} divide-y divide-zinc-200/80 dark:divide-white/[0.06] overflow-hidden`}>
              {rows.map((c) => {
                const missed = !c.outgoing && !c.answered && !c.live;
                const Icon = c.live ? (c.kind === 'video' ? Video : Phone) : missed ? PhoneMissed : c.outgoing ? PhoneOutgoing : PhoneIncoming;
                const detail = c.live ? 'Happening now' : c.answered && c.durationSec ? dur(c.durationSec) : c.declined ? 'Declined' : c.outgoing ? 'No answer' : 'Missed';
                return (
                  <motion.li key={c.id} variants={fadeUp} className="flex items-center gap-3 p-4">
                    <button type="button" onClick={() => router.push(`${inbox}?c=${c.conversationId}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className={cn('w-11 h-11 rounded-full flex items-center justify-center shrink-0', missed ? 'bg-rose-500/10 text-rose-500' : c.live ? 'bg-emerald-500/15 text-emerald-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-500')}><Icon className="w-5 h-5" /></span>
                      <span className="min-w-0">
                        <span className={cn('block font-semibold truncate', missed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{c.title}</span>
                        <span className="block text-xs text-zinc-500">{c.kind === 'video' ? 'Video' : 'Voice'} · {detail} · {formatDistanceToNowStrict(new Date(c.at), { addSuffix: true })}</span>
                      </span>
                    </button>
                    {c.live ? (
                      <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => router.push(`/call/${c.id}`)} className="px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/25">Join</motion.button>
                    ) : (
                      <div className="flex gap-1 shrink-0">
                        {(['audio', 'video'] as const).map((k) => (
                          <motion.button key={k} whileTap={{ scale: 0.88 }} type="button" disabled={!!busy} onClick={() => void callBack(c, k)} aria-label={`${k === 'video' ? 'Video' : 'Voice'} call ${c.title}`} className="w-10 h-10 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
                            {busy === c.id + k ? <Loader2 className="w-5 h-5 animate-spin" /> : k === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </div>
      </div>
    </>
  );
}
