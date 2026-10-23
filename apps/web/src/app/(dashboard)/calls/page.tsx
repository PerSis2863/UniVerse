'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { Activity, Clapperboard, Coffee, DoorOpen, GraduationCap, Headphones, Link2, Loader2, NotebookPen, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users, Video } from 'lucide-react';
import { isToday, isYesterday } from 'date-fns';
import { callInsights } from '@/lib/call-insights';
import { useNow } from '@/lib/use-now';
import { Topbar } from '@/components/layout/Topbar';
import { ScheduledCalls } from '@/components/call/ScheduledCalls';
import { Favorites } from '@/components/call/Favorites';
import { CommsDeck } from '@/components/chat/CommsDeck';
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
      <CommsDeck />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="space-y-5 min-w-0">
          <Favorites />
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
            // The log as a timeline (M17): a glowing line down the days, a node for each call.
            <div className="space-y-6">
            {byDay(rows).map(([day, dayRows]) => (
            <section key={day} aria-label={day}>
            <h3 className="mb-2 ps-14 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{day}</h3>
            <motion.ul variants={list} initial="hidden" animate="show" className="call-timeline relative space-y-2">
              {dayRows.map((c) => {
                const chat = c.type === 'chat';
                const Icon = chat ? (c.live ? (c.kind === 'video' ? Video : Phone) : c.missed ? PhoneMissed : c.outgoing ? PhoneOutgoing : PhoneIncoming) : TYPE_ICON[c.type];
                const detail = chat
                  ? (c.live ? 'Happening now' : c.answered && c.durationSec ? dur(c.durationSec) : c.declined ? 'Declined' : c.outgoing ? 'No answer' : 'Missed')
                  : c.durationSec ? dur(c.durationSec) : 'Joined';
                const who = withWho(c.people, c.more);
                return (
                  <motion.li key={c.key} variants={fadeUp} className="relative flex items-start gap-3">
                    <div className="relative flex items-start gap-3 flex-1 min-w-0 text-start">
                      <span className={cn('call-node relative z-10 w-11 h-11 rounded-full flex items-center justify-center shrink-0 ring-4 ring-[var(--surface,#fff)] dark:ring-[#0b1020]', c.missed ? 'bg-rose-500/10 text-rose-500' : c.live ? 'bg-emerald-500/15 text-emerald-500 animate-pulse' : 'bg-indigo-500/10 text-indigo-500')}><Icon className="w-5 h-5" /></span>
                      <span className="call-card relative min-w-0 flex-1 panel px-4 py-3">
                        {/* The whole card opens the chat; the note, recording and study links sit above it. */}
                        {c.conversationId
                          ? <button type="button" onClick={() => router.push(`${inbox}?c=${c.conversationId}`)} className={cn('block max-w-full font-semibold truncate text-start after:absolute after:inset-0', c.missed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{c.title}</button>
                          : <span className={cn('block font-semibold truncate', c.missed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{c.title}</span>}
                        <span className="block text-xs text-zinc-500">{chat ? (c.kind === 'video' ? 'Video' : 'Voice') : TYPE_LABEL[c.type]} · {detail} · {formatDistanceToNowStrict(new Date(c.at), { addSuffix: true })}</span>
                        {who && <span className="block text-xs text-zinc-500 truncate">{who}</span>}
                        {(c.noteId || c.recordingId || c.study) && (
                          <span className="relative z-10 mt-1.5 flex flex-wrap gap-1.5">
                            {c.noteId && <button type="button" onClick={() => router.push(`/calls?note=${c.noteId}`, { scroll: false })} className={chip}><NotebookPen className="w-3 h-3" />Notes</button>}
                            {c.recordingId && <button type="button" onClick={() => router.push(`/calls?recording=${c.recordingId}`, { scroll: false })} className={chip}><Clapperboard className="w-3 h-3" />Recording</button>}
                            {c.study && <button type="button" onClick={() => router.push(`${board}?course=${c.study!.courseId}&tab=sessions&session=${c.study!.sessionId}`)} className={chip}><GraduationCap className="w-3 h-3" />Study pack</button>}
                          </span>
                        )}
                      </span>
                    </div>
                    {c.live ? (
                      <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => router.push(`/call/${c.callId}`)} className="px-4 py-2 rounded-full bg-emerald-700 text-white text-sm font-bold shadow-lg shadow-emerald-500/25">Join</motion.button>
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
            </section>
            ))}
            </div>
          )}
          </TabPanel>
          </div>
          <aside className="space-y-5 min-w-0 lg:sticky lg:top-4">
            <Insights rows={data ?? []} />
            <OfficeHoursCard role={role} />
            <ScheduledCalls role={role} />
          </aside>
        </div>
      </div>
    </>
  );
}

/** Calls grouped by day, newest first: Today, Yesterday, then the date. */
function byDay(rows: CallRow[]): [string, CallRow[]][] {
  const out = new Map<string, CallRow[]>();
  for (const c of rows) {
    const d = new Date(c.at);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    out.set(key, [...(out.get(key) ?? []), c]);
  }
  return [...out];
}

/** This week on calls (M17, like a phone's Screen Time): minutes a day, totals, who you call most. */
function Insights({ rows }: { rows: CallRow[] }) {
  const now = useNow();
  if (!now || !rows.length) return null;
  const s = callInsights(rows, now);
  const max = Math.max(1, ...s.days.map((d) => d.minutes));
  return (
    <section className="panel p-5" aria-labelledby="ins-h">
      <h2 id="ins-h" className="text-sm font-bold text-zinc-900 dark:text-white inline-flex items-center gap-1.5"><Activity className="w-4 h-4 text-fuchsia-500" /> This week</h2>
      <p className="mt-2 text-3xl font-black text-zinc-900 dark:text-white tabular-nums">{s.minutes}<span className="text-base font-bold text-zinc-500 dark:text-zinc-400"> min on calls</span></p>
      <div className="mt-4 h-28 flex items-end gap-2" role="img" aria-label={`Minutes on calls each day this week: ${s.days.map((d) => `${d.label} ${d.minutes}`).join(', ')}`}>
        {s.days.map((d, i) => (
          <div key={d.label} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
            <span className="insight-bar w-full rounded-lg" style={{ height: `${Math.max(6, (d.minutes / max) * 100)}%`, ['--i' as string]: i, opacity: d.minutes ? 1 : 0.35 }} />
            <span className={cn('text-xs', i === s.days.length - 1 ? 'font-bold text-indigo-600 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400')}>{d.label}</span>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-zinc-100 dark:bg-white/[0.05] py-2"><dt className="text-xs text-zinc-500 dark:text-zinc-400">Calls</dt><dd className="text-lg font-black text-zinc-900 dark:text-white">{s.calls}</dd></div>
        <div className="rounded-2xl bg-zinc-100 dark:bg-white/[0.05] py-2"><dt className="text-xs text-zinc-500 dark:text-zinc-400">Missed</dt><dd className="text-lg font-black text-rose-600 dark:text-rose-400">{s.missed}</dd></div>
        <div className="rounded-2xl bg-zinc-100 dark:bg-white/[0.05] py-2"><dt className="text-xs text-zinc-500 dark:text-zinc-400">Longest</dt><dd className="text-lg font-black text-zinc-900 dark:text-white">{s.longest ? dur(s.longest) : '–'}</dd></div>
      </dl>
      {s.top && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">You talk most with <b className="text-zinc-900 dark:text-white" translate="no">{s.top.title}</b> ({s.top.count} call{s.top.count === 1 ? '' : 's'}).</p>}
    </section>
  );
}
