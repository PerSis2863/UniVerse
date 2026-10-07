'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { Clapperboard, Coffee, DoorOpen, GraduationCap, Headphones, Link2, Loader2, NotebookPen, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users, Video } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { ScheduledCalls } from '@/components/call/ScheduledCalls';
import { Favorites } from '@/components/call/Favorites';
import { MessagesTabs } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { useAuthStore } from '@/store/auth';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { TabPill, TabPanel } from '@/components/ui/Glide';
import { MeetingNotesSheet } from '@/components/call/MeetingNotes';
import { CallRecordingSheet } from '@/components/call/CallRecordingSheet';
import { OfficeHoursCard } from '@/components/call/OfficeHours';

/** One call (src/server/calls.ts recentCalls, Stage 4 · 2.13). */
interface CallRow {
  key: string; callId: string; type: 'chat' | 'class' | 'group' | 'room' | 'link' | 'hall' | 'office'; at: string; kind: 'audio' | 'video' | null;
  title: string; avatar: string | null; isGroup: boolean;
  conversationId: string | null; outgoing: boolean; answered: boolean; declined: boolean; live: boolean; missed: boolean;
  durationSec: number | null; people: string[]; more: number;
  noteId: string | null; recordingId: string | null; study: { courseId: string; sessionId: string } | null;
}
const TYPE_LABEL: Record<CallRow['type'], string> = { chat: '', class: 'Class', group: 'Study group', room: 'Voice room', link: 'Call link', hall: 'Study Hall', office: 'Office hours' };
const TYPE_ICON = { class: GraduationCap, group: Users, room: Headphones, link: Link2, hall: Coffee, office: DoorOpen } as const;
const withWho = (names: string[], more: number) => (names.length ? `With ${names.join(', ')}${more ? ` and ${more} more` : ''}` : '');

const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** A call's meeting notes or recording opened from a chat or a notification (?note=, ?recording=; Stage 4 · 2.8, 2.9). */
function NoteFromLink() {
  const params = useSearchParams();
  const router = useRouter();
  const note = params.get('note'), recording = params.get('recording');
  if (recording) return <CallRecordingSheet id={recording} onClose={() => router.replace('/calls')} />;
  return note ? <MeetingNotesSheet id={note} onClose={() => router.replace('/calls')} /> : null;
}

/** Calls from the last 30 days, like a phone's call log: every call you were in, who joined, its notes
 *  and recording; join live ones again, call anyone back. */
export default function CallsPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  // Live updates refresh this when a call starts or ends; poll only without them.
  const poll = useLiveInterval(30_000, 0);
  const { data, isLoading, error } = useSWR<CallRow[]>('/api/calls', authedJson, { refreshInterval: poll });
  const [filter, setFilter] = useState<'all' | 'missed' | 'notes'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const inbox = role === 'ADMIN' ? '/admin/inbox' : role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';

  const callBack = async (c: CallRow, kind: 'audio' | 'video') => {
    if (!c.conversationId) return;
    setBusy(c.key + kind);
    try {
      const msg = await authedJson<{ id: string }>(`/api/chat/conversations/${c.conversationId}/messages`, { method: 'POST', body: JSON.stringify({ type: 'CALL', kind }) });
      router.push(`/call/${msg.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const rows = (data ?? []).filter((c) => filter === 'all' || (filter === 'missed' ? c.missed : !!(c.noteId || c.recordingId || c.study)));
  const board = role === 'TEACHER' || role === 'ADMIN' ? '/teacher/blackboard' : '/student/blackboard';
  const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/15 transition-colors';
  return (
    <>
      <Topbar title="Messages" subtitle="Scheduled calls, and every call you were in over the last 30 days" />
      <Suspense fallback={null}><NoteFromLink /></Suspense>
      <MessagesTabs />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-5">
          <OfficeHoursCard role={role} />
          <Favorites />
          <ScheduledCalls role={role} />
          <div className="flex gap-2" role="tablist">
            {(['all', 'missed', 'notes'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('relative isolate px-4 py-2 rounded-xl text-sm font-semibold transition-colors', filter === f ? 'text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05]')}>
                {filter === f && <TabPill id="calls-filter" />}
                <span className="relative">{f === 'all' ? 'All' : f === 'missed' ? 'Missed' : 'Notes & recordings'}</span>
              </button>
            ))}
          </div>

          <TabPanel k={filter}>
          {error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}</div>
          ) : rows.length === 0 ? (
            <motion.div variants={fadeUp} initial="hidden" animate="show" className={`panel p-10 text-center`}>
              <Phone className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
              <p className="font-semibold text-zinc-900 dark:text-white">{filter === 'missed' ? 'No missed calls' : filter === 'notes' ? 'No notes or recordings yet' : 'No calls yet'}</p>
              <p className="text-sm text-zinc-500 mt-1">Start one from any chat with the phone or camera button.</p>
            </motion.div>
          ) : (
            <motion.ul variants={list} initial="hidden" animate="show" className={`panel divide-y divide-zinc-200/80 dark:divide-white/[0.06] overflow-hidden`}>
              {rows.map((c) => {
                const chat = c.type === 'chat';
                const Icon = chat ? (c.live ? (c.kind === 'video' ? Video : Phone) : c.missed ? PhoneMissed : c.outgoing ? PhoneOutgoing : PhoneIncoming) : TYPE_ICON[c.type];
                const detail = chat
                  ? (c.live ? 'Happening now' : c.answered && c.durationSec ? dur(c.durationSec) : c.declined ? 'Declined' : c.outgoing ? 'No answer' : 'Missed')
                  : c.durationSec ? dur(c.durationSec) : 'Joined';
                const who = withWho(c.people, c.more);
                return (
                  <motion.li key={c.key} variants={fadeUp} className="flex items-start gap-3 p-4">
                    <button type="button" onClick={() => { if (c.conversationId) router.push(`${inbox}?c=${c.conversationId}`); }} disabled={!c.conversationId} className="flex items-start gap-3 flex-1 min-w-0 text-left disabled:cursor-default">
                      <span className={cn('w-11 h-11 rounded-full flex items-center justify-center shrink-0', c.missed ? 'bg-rose-500/10 text-rose-500' : c.live ? 'bg-emerald-500/15 text-emerald-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-500')}><Icon className="w-5 h-5" /></span>
                      <span className="min-w-0">
                        <span className={cn('block font-semibold truncate', c.missed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{c.title}</span>
                        <span className="block text-xs text-zinc-500">{chat ? (c.kind === 'video' ? 'Video' : 'Voice') : TYPE_LABEL[c.type]} · {detail} · {formatDistanceToNowStrict(new Date(c.at), { addSuffix: true })}</span>
                        {who && <span className="block text-xs text-zinc-500 truncate">{who}</span>}
                        {(c.noteId || c.recordingId || c.study) && (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {c.noteId && <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); router.push(`/calls?note=${c.noteId}`, { scroll: false }); }} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/calls?note=${c.noteId}`, { scroll: false }); }} className={chip}><NotebookPen className="w-3 h-3" />Notes</span>}
                            {c.recordingId && <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); router.push(`/calls?recording=${c.recordingId}`, { scroll: false }); }} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/calls?recording=${c.recordingId}`, { scroll: false }); }} className={chip}><Clapperboard className="w-3 h-3" />Recording</span>}
                            {c.study && <span role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); router.push(`${board}?course=${c.study!.courseId}&tab=sessions&session=${c.study!.sessionId}`); }} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`${board}?course=${c.study!.courseId}&tab=sessions&session=${c.study!.sessionId}`); }} className={chip}><GraduationCap className="w-3 h-3" />Study pack</span>}
                          </span>
                        )}
                      </span>
                    </button>
                    {c.live ? (
                      <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => router.push(`/call/${c.callId}`)} className="px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/25">Join</motion.button>
                    ) : chat ? (
                      <div className="flex gap-1 shrink-0">
                        {(['audio', 'video'] as const).map((k) => (
                          <motion.button key={k} whileTap={{ scale: 0.88 }} type="button" disabled={!!busy} onClick={() => void callBack(c, k)} aria-label={`${k === 'video' ? 'Video' : 'Voice'} call ${c.title}`} className="w-10 h-10 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
                            {busy === c.key + k ? <Loader2 className="w-5 h-5 animate-spin" /> : k === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                          </motion.button>
                        ))}
                      </div>
                    ) : (
                      <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => router.push(c.type === 'hall' ? `/hall/${c.callId}` : `/call/${c.callId}`)} className="shrink-0 px-3.5 py-2 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-500/15">Join again</motion.button>
                    )}
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
          </TabPanel>
        </div>
      </div>
    </>
  );
}
