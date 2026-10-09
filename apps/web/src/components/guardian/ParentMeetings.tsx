'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, isSameDay } from 'date-fns';
import { CalendarClock, CalendarPlus, ChevronRight, Loader2, MapPin, NotebookPen, Video, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// Parent–teacher meetings in the parent app (Stage 5 · B16.3; src/server/parent-meetings.ts): my
// booked meetings (join a video one from 10 minutes before, or cancel), the child's teachers with
// the times they've opened (book one, saying what it's about), and past meetings with any notes
// the teacher shared.

interface Meeting {
  id: string; startAt: string; durationMin: number; mode: 'VIDEO' | 'IN_PERSON'; location: string | null; topic: string | null;
  teacher: { id: string; name: string; avatar: string | null }; child: string | null; summary: string | null; canCancel: boolean;
}
interface Teacher { id: string; name: string; avatar: string | null; courses: string[]; free: number; next: string | null; booked: boolean }
interface Data { child: string; upcoming: Meeting[]; past: Meeting[]; teachers: Teacher[] }
interface Slot { id: string; startAt: string; durationMin: number; mode: 'VIDEO' | 'IN_PERSON'; location: string | null }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const when = (iso: string) => format(new Date(iso), 'EEE d MMM, HH:mm');
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };
/** Joinable from 10 minutes before until 30 minutes after it ends (the server checks too). */
const joinOpen = (m: Meeting, now: number) => now > 0 && now >= new Date(m.startAt).getTime() - 10 * 60_000 && now <= new Date(m.startAt).getTime() + (m.durationMin + 30) * 60_000;

export function ParentMeetings({ studentId }: { studentId: string }) {
  const key = `/api/parent/meetings?studentId=${encodeURIComponent(studentId)}`;
  const { data, error, isLoading, mutate } = useSWR<Data>(key, authedJson, { refreshInterval: 60_000 });
  const [booking, setBooking] = useState<Teacher | null>(null);
  const [notes, setNotes] = useState<Meeting | null>(null);

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <div className="p-6"><ContentSkeleton variant="list" /></div>;
  if (!data) return null;

  const cancel = async (m: Meeting) => {
    if (!(await confirmDialog({ title: 'Cancel this meeting?', message: `${when(m.startAt)} with ${m.teacher.name}. The time is given back and the teacher is told.`, confirmLabel: 'Cancel meeting', destructive: true }))) return;
    try {
      await authedJson(`/api/parent/meetings/${m.id}`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) });
      toast.success('Meeting cancelled');
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t cancel the meeting.')); }
  };

  return (
    <div className="space-y-4">
      {data.upcoming.length > 0 && (
        <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-label="Your meetings">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your meetings</p>
          <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.upcoming.map((m) => <UpcomingRow key={m.id} m={m} onCancel={() => void cancel(m)} />)}
          </motion.ul>
        </motion.section>
      )}

      <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-label={`Book a meeting about ${data.child}`}>
        <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Book a meeting about {data.child}</p>
        {data.teachers.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-zinc-500">{data.child} isn’t in any classes yet. Teachers show up here once they are.</p>
        ) : (
          <motion.ul variants={list} initial="hidden" animate="show" className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.teachers.map((t) => (
              <motion.li key={t.id} variants={fadeUp}>
                <button type="button" disabled={!t.free || t.booked} onClick={() => { haptic('tap'); setBooking(t); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors disabled:hover:bg-transparent disabled:cursor-default">
                  <Avatar name={t.name} src={t.avatar} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-white truncate">{t.name}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{t.courses.join(', ')}</span>
                    </span>
                    <span className={cn('block text-sm', t.free && !t.booked ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500')}>
                      {t.booked ? 'You have a meeting booked' : t.free ? `${t.free} time${t.free === 1 ? '' : 's'} open · next ${when(t.next!)}` : 'No times open yet. Message them to ask.'}
                    </span>
                  </span>
                  {t.free > 0 && !t.booked && <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </motion.section>

      {data.past.length > 0 && (
        <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-label="Past meetings">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Past meetings</p>
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {data.past.map((m) => (
              <li key={m.id}>
                <button type="button" disabled={!m.summary} onClick={() => setNotes(m)} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] disabled:hover:bg-transparent disabled:cursor-default">
                  <Avatar name={m.teacher.name} src={m.teacher.avatar} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{m.teacher.name}{m.child ? ` · ${m.child}` : ''}</span>
                    <span className="block text-xs text-zinc-500">{when(m.startAt)}{m.summary ? ' · notes from the teacher' : ''}</span>
                  </span>
                  {m.summary && <NotebookPen className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {booking && <BookSheet key={booking.id} teacher={booking} studentId={studentId} child={data.child} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); void mutate(); }} />}
      {notes && (
        <Sheet title={`Notes from ${notes.teacher.name}`} onClose={() => setNotes(null)}>
          <p className="text-xs text-zinc-500">{when(notes.startAt)}{notes.child ? ` · about ${notes.child}` : ''}</p>
          <p className="mt-3 text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">{notes.summary}</p>
        </Sheet>
      )}
    </div>
  );
}

function UpcomingRow({ m, onCancel }: { m: Meeting; onCancel: () => void }) {
  const now = useNow();
  const open = m.mode === 'VIDEO' && joinOpen(m, now);
  return (
    <motion.li variants={fadeUp} className="px-3 py-3 flex items-start gap-3">
      <span className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', m.mode === 'VIDEO' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'bg-teal-500/10 text-teal-700 dark:text-teal-300')}>
        {m.mode === 'VIDEO' ? <Video className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-zinc-900 dark:text-white">{when(m.startAt)} <span className="font-normal text-zinc-500">· {m.durationMin} min</span></span>
        <span className="block text-sm text-zinc-600 dark:text-zinc-300 truncate">{m.teacher.name}{m.child ? ` · about ${m.child}` : ''}</span>
        <span className="block text-xs text-zinc-500">{m.mode === 'VIDEO' ? (open ? 'Video call: you can join now' : 'Video call in the app · join opens 10 min before') : `In person · ${m.location ?? 'at school'}`}</span>
        {m.topic && <span className="block text-xs text-zinc-500 mt-0.5 break-words">“{m.topic}”</span>}
        <span className="mt-2 flex flex-wrap gap-2">
          {open && <Link href={`/call/pm_${m.id}?kind=video`} className="btn-primary btn-sm"><Video className="w-4 h-4" /> Join</Link>}
          {m.canCancel && <button type="button" onClick={onCancel} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><X className="w-4 h-4" /> Cancel</button>}
        </span>
      </span>
    </motion.li>
  );
}

function BookSheet({ teacher, studentId, child, onClose, onBooked }: { teacher: Teacher; studentId: string; child: string; onClose: () => void; onBooked: () => void }) {
  const { data, error, mutate } = useSWR<{ free: Slot[] }>(`/api/parent/meetings?studentId=${encodeURIComponent(studentId)}&teacherId=${encodeURIComponent(teacher.id)}`, authedJson);
  const [picked, setPicked] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  // Free times by day, on this device's clock.
  const days = useMemo(() => {
    const out: { day: Date; slots: Slot[] }[] = [];
    for (const s of data?.free ?? []) {
      const d = new Date(s.startAt);
      const last = out.at(-1);
      if (last && isSameDay(last.day, d)) last.slots.push(s); else out.push({ day: d, slots: [s] });
    }
    return out;
  }, [data]);
  const slot = data?.free.find((s) => s.id === picked) ?? null;

  const book = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      await authedJson('/api/parent/meetings', { method: 'POST', body: JSON.stringify({ meetingId: slot.id, studentId, topic, timeZone: zone() }) });
      haptic('success');
      toast.success('Meeting booked', { description: `${when(slot.startAt)} with ${teacher.name}` });
      onBooked();
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t book that time.'));
      setPicked(null);
      void mutate();
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={`Meet ${teacher.name}`} onClose={onClose} footer={slot ? (
      <button type="button" onClick={() => void book()} disabled={busy} className="btn-primary w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />} Book {when(slot.startAt)}
      </button>
    ) : undefined}>
      {error && !data ? <LoadError onRetry={() => mutate()} />
        : !data ? <ContentSkeleton variant="list" />
        : days.length === 0 ? (
          <div className="text-center py-6">
            <CalendarClock className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="font-semibold text-zinc-900 dark:text-white">No free times left</p>
            <p className="text-sm text-zinc-500 mt-1">They were just booked. Message the teacher to ask for another time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Choose a time to talk about {child}. Times are shown on your device’s clock.</p>
            {days.map((d) => (
              <div key={d.day.toISOString()}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">{format(d.day, 'EEEE d MMMM')}</p>
                <div role="group" aria-label={format(d.day, 'EEEE d MMMM')} className="flex flex-wrap gap-2">
                  {d.slots.map((s) => {
                    const on = s.id === picked;
                    return (
                      <button key={s.id} type="button" aria-pressed={on} onClick={() => { haptic('tap'); setPicked(s.id); }}
                        className={cn('min-h-11 px-3 rounded-xl border text-sm font-semibold tabular-nums transition-colors', on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]')}>
                        {format(new Date(s.startAt), 'HH:mm')}
                        {s.mode === 'IN_PERSON' && <><MapPin className="inline w-3.5 h-3.5 ml-1 -mt-0.5" aria-hidden /><span className="sr-only">, in person</span></>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {slot && (
              <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-3 rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
                  {slot.mode === 'VIDEO' ? <Video className="w-4 h-4 shrink-0" /> : <MapPin className="w-4 h-4 shrink-0" />}
                  {slot.durationMin} min · {slot.mode === 'VIDEO' ? 'video call in the app' : `in person · ${slot.location ?? 'at school'}`}
                </p>
                <Field label="What would you like to talk about? (optional)" count={topic.length} max={500}>
                  {(p) => <textarea {...p} rows={3} maxLength={500} value={topic} onChange={(e) => setTopic(e.target.value)} className="input" placeholder="Homework, a worry, how they’re settling in…" />}
                </Field>
              </motion.div>
            )}
          </div>
        )}
    </Sheet>
  );
}
