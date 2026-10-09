'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { addDays, format, isSameDay } from 'date-fns';
import { CalendarClock, CalendarPlus, ChevronRight, Loader2, MapPin, NotebookPen, Trash2, Video } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Segmented';
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

// Parent–teacher meetings for teachers (Stage 5 · B16.3; src/server/parent-meetings.ts): open
// meeting times (a day, from–to, how long each, video or in a room), see who booked what, join a
// video meeting, keep private notes and share a short summary with the parent, cancel.

interface Meeting {
  id: string; startAt: string; durationMin: number; mode: 'VIDEO' | 'IN_PERSON'; location: string | null; topic: string | null; bookedAt: string | null;
  parent: { id: string; name: string; avatar: string | null; relation: string | null } | null;
  student: { id: string; name: string } | null;
  notes: string | null; summary: string | null; summarySentAt: string | null;
}
interface Data { lengths: number[]; upcoming: Meeting[]; past: Meeting[] }

const KEY = '/api/teacher/meetings';
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const time = (iso: string) => format(new Date(iso), 'HH:mm');
const endTime = (m: Meeting) => format(new Date(new Date(m.startAt).getTime() + m.durationMin * 60_000), 'HH:mm');
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };
/** The teacher can join from 30 minutes before until 30 minutes after (the server checks too). */
const joinOpen = (m: Meeting, now: number) => now > 0 && !!m.parent && m.mode === 'VIDEO' && now >= new Date(m.startAt).getTime() - 30 * 60_000 && now <= new Date(m.startAt).getTime() + (m.durationMin + 30) * 60_000;
const firstName = (n: string) => n.split(/\s+/)[0];

/** ?m=<id> (from a notification) opens that meeting; the address follows the open one. */
function useMeetingParam() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setId(new URLSearchParams(window.location.search).get('m')), 0);
    return () => clearTimeout(t);
  }, []);
  const set = (next: string | null) => {
    setId(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('m', next); else url.searchParams.delete('m');
    window.history.replaceState(window.history.state, '', url);
  };
  return [id, set] as const;
}

export function TeacherMeetings() {
  const { data, error, isLoading, mutate } = useSWR<Data>(KEY, authedJson, { refreshInterval: 60_000 });
  const [opening, setOpening] = useState(false);
  const [openId, setOpenId] = useMeetingParam();
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const open = [...(data?.upcoming ?? []), ...(data?.past ?? [])].find((m) => m.id === openId) ?? null;
  const days = useMemo(() => {
    const out: { day: Date; items: Meeting[] }[] = [];
    for (const m of view === 'upcoming' ? data?.upcoming ?? [] : data?.past ?? []) {
      const d = new Date(m.startAt);
      const last = out.at(-1);
      if (last && isSameDay(last.day, d)) last.items.push(m); else out.push({ day: d, items: [m] });
    }
    return out;
  }, [data, view]);

  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (isLoading && !data) return <ContentSkeleton variant="list" />;
  if (!data) return null;
  const booked = data.upcoming.filter((m) => m.parent).length;
  const free = data.upcoming.length - booked;

  const remove = async (m: Meeting) => {
    const ok = await confirmDialog(m.parent
      ? { title: 'Cancel this meeting?', message: `${format(new Date(m.startAt), 'EEE d MMM, HH:mm')} with ${m.parent.name}. They’re told in the app and can book another time.`, confirmLabel: 'Cancel meeting', destructive: true }
      : { title: 'Remove this time?', message: `${format(new Date(m.startAt), 'EEE d MMM, HH:mm')} won’t be offered to parents any more.`, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    try {
      await authedJson(`${KEY}/${m.id}`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) });
      void mutate((d) => d && { ...d, upcoming: d.upcoming.filter((x) => x.id !== m.id) }, { revalidate: true });
      if (openId === m.id) setOpenId(null);
      toast.success(m.parent ? `Cancelled. ${firstName(m.parent.name)} was told.` : 'Time removed');
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xl">Open times for parents to book: a video call in the app or a room at school. You’re both reminded 15 minutes before.</p>
        <button type="button" onClick={() => setOpening(true)} className="btn-primary btn-sm shrink-0"><CalendarPlus className="w-4 h-4" /> Open times</button>
      </div>
      <Segmented<'upcoming' | 'past'> label="Show" value={view} onChange={setView} className="w-full sm:w-auto"
        segments={[{ value: 'upcoming', label: `Upcoming${data.upcoming.length ? ` · ${booked} booked, ${free} free` : ''}` }, { value: 'past', label: 'Past' }]} />
      {days.length === 0 ? (
        <motion.section key={view} variants={fadeUp} initial="hidden" animate="show" className={`${card} p-8 text-center`}>
          <CalendarClock className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
          <p className="font-semibold text-zinc-900 dark:text-white">{view === 'upcoming' ? 'No meeting times open' : 'No meetings in the last 60 days'}</p>
          {view === 'upcoming' && <p className="text-sm text-zinc-500 mt-1">Open some times. Parents of students in your classes can then book one.</p>}
        </motion.section>
      ) : (
        <motion.div key={view} variants={list} initial="hidden" animate="show" className="space-y-3">
          {days.map((d) => (
            <motion.section key={d.day.toISOString()} variants={fadeUp} className={`${card} p-2 sm:p-3`} aria-label={format(d.day, 'EEEE d MMMM')}>
              <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{format(d.day, 'EEEE d MMMM')}</p>
              <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                {d.items.map((m) => <MeetingRow key={m.id} m={m} onOpen={() => { haptic('tap'); setOpenId(m.id); }} onRemove={() => void remove(m)} />)}
              </ul>
            </motion.section>
          ))}
        </motion.div>
      )}
      {opening && <OpenTimesSheet lengths={data.lengths} onClose={() => setOpening(false)} onOpened={() => { setOpening(false); setView('upcoming'); void mutate(); }} />}
      {open?.parent && <MeetingSheet key={open.id} m={open} onClose={() => setOpenId(null)} onSaved={() => void mutate()} onRemove={() => void remove(open)} />}
    </div>
  );
}

function MeetingRow({ m, onOpen, onRemove }: { m: Meeting; onOpen: () => void; onRemove: () => void }) {
  const now = useNow();
  const live = joinOpen(m, now);
  if (!m.parent) {
    return (
      <li className="flex items-center gap-3 px-3 py-2.5">
        <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{time(m.startAt)}–{endTime(m)}</span>
        <span className="flex-1 min-w-0 text-sm text-zinc-500 flex items-center gap-1.5">
          {m.mode === 'VIDEO' ? <Video className="w-3.5 h-3.5 shrink-0" aria-hidden /> : <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />}
          <span className="truncate">Free · {m.mode === 'VIDEO' ? 'video' : m.location}</span>
        </span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${time(m.startAt)}`} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
      </li>
    );
  }
  return (
    <li>
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{time(m.startAt)}–{endTime(m)}</span>
          <Avatar name={m.parent.name} src={m.parent.avatar} size={36} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{m.parent.name}{m.parent.relation ? ` (${m.parent.relation.toLowerCase()})` : ''}</span>
            <span className="block text-xs text-zinc-500 truncate">About {m.student ? firstName(m.student.name) : 'their child'}{m.topic ? ` · ${m.topic}` : ''}</span>
            {(m.notes || m.summarySentAt) && <span className="block text-[11px] text-indigo-700 dark:text-indigo-300">{m.summarySentAt ? 'Summary shared' : 'Notes saved'}</span>}
          </span>
          {!live && <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />}
        </button>
        {live && <Link href={`/call/pm_${m.id}?kind=video`} className="btn-primary btn-sm shrink-0"><Video className="w-4 h-4" /> Join</Link>}
      </div>
    </li>
  );
}

function MeetingSheet({ m, onClose, onSaved, onRemove }: { m: Meeting; onClose: () => void; onSaved: () => void; onRemove: () => void }) {
  const now = useNow();
  const [notes, setNotes] = useState(m.notes ?? '');
  const [summary, setSummary] = useState(m.summary ?? '');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const parent = m.parent!;
  const ended = now > 0 && new Date(m.startAt).getTime() < now;
  const sharedAlready = !!m.summarySentAt && summary.trim() === (m.summary ?? '');

  const save = async () => {
    setBusy(true);
    try {
      const r = await authedJson<{ shared: boolean }>(`${KEY}/${m.id}`, { method: 'POST', body: JSON.stringify({ action: 'notes', notes, summary, share }) });
      haptic('success');
      toast.success(r.shared ? `Saved and shared with ${firstName(parent.name)}` : 'Saved');
      setShare(false);
      onSaved();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save.')); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title={`${parent.name}${m.student ? ` · ${firstName(m.student.name)}` : ''}`} onClose={onClose} footer={
      <button type="button" onClick={() => void save()} disabled={busy || (notes === (m.notes ?? '') && summary === (m.summary ?? '') && !share)} className="btn-primary w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <NotebookPen className="w-4 h-4" />} {share ? 'Save and share' : 'Save'}
      </button>
    }>
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{format(new Date(m.startAt), 'EEEE d MMMM, HH:mm')}–{endTime(m)}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
            {m.mode === 'VIDEO' ? <Video className="w-4 h-4 shrink-0" aria-hidden /> : <MapPin className="w-4 h-4 shrink-0" aria-hidden />}
            {m.mode === 'VIDEO' ? 'Video call in the app' : `In person · ${m.location}`}
          </p>
          <p className="text-xs text-zinc-500">{parent.relation ?? 'Parent or guardian'} of {m.student?.name ?? 'a student'}{m.bookedAt ? ` · booked ${format(new Date(m.bookedAt), 'd MMM')}` : ''}</p>
          {m.topic && <p className="text-sm text-zinc-700 dark:text-zinc-200 pt-1 break-words">“{m.topic}”</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {joinOpen(m, now) && <Link href={`/call/pm_${m.id}?kind=video`} className="btn-primary btn-sm"><Video className="w-4 h-4" /> Join</Link>}
            {!ended && <button type="button" onClick={onRemove} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Cancel meeting</button>}
          </div>
        </div>
        <Field label="Your notes (only you see these)" count={notes.length} max={5000}>
          {(p) => <textarea {...p} rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="What you talked about, what you agreed" />}
        </Field>
        <Field label={`Summary for ${firstName(parent.name)}`} count={summary.length} max={3000} hint={sharedAlready ? `Shared ${format(new Date(m.summarySentAt!), 'd MMM, HH:mm')}.` : 'Shared only when you choose to.'}>
          {(p) => <textarea {...p} rows={3} maxLength={3000} value={summary} onChange={(e) => setSummary(e.target.value)} className="input" placeholder="Next steps you agreed on" />}
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="meeting-share" className="text-sm text-zinc-700 dark:text-zinc-200">
            Share the summary with {firstName(parent.name)}
            <span className="block text-xs text-zinc-500">They get it in the parent app. Your notes stay private.</span>
          </label>
          <Switch id="meeting-share" checked={share} disabled={!summary.trim() || sharedAlready} onChange={setShare} />
        </div>
      </div>
    </Sheet>
  );
}

function OpenTimesSheet({ lengths, onClose, onOpened }: { lengths: number[]; onClose: () => void; onOpened: () => void }) {
  const [date, setDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [from, setFrom] = useState('16:00');
  const [to, setTo] = useState('18:00');
  const [length, setLength] = useState(15);
  const [gap, setGap] = useState(0);
  const [mode, setMode] = useState<'VIDEO' | 'IN_PERSON'>('VIDEO');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The times this makes (the server leaves out any that overlap meetings you already have).
  const preview = useMemo(() => {
    const start = new Date(`${date}T${from}`).getTime(), end = new Date(`${date}T${to}`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const out: number[] = [];
    for (let t = start; t + length * 60_000 <= end && out.length < 40; t += (length + gap) * 60_000) out.push(t);
    return out;
  }, [date, from, to, length, gap]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      const r = await authedJson<{ created: number; skipped: number }>(KEY, { method: 'POST', body: JSON.stringify({
        startAt: new Date(`${date}T${from}`).toISOString(), endAt: new Date(`${date}T${to}`).toISOString(),
        durationMin: length, gapMin: gap, mode, location, timeZone: zone(),
      }) });
      haptic('success');
      toast.success(`${r.created} time${r.created === 1 ? '' : 's'} open`, { description: r.skipped ? `${r.skipped} left out: you already have meetings then.` : 'Parents of your students can book them now.' });
      onOpened();
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t open those times.'));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Open meeting times" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Day">
          {(p) => <input {...p} type="date" required value={date} min={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDate(e.target.value)} className="input" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">{(p) => <input {...p} type="time" required value={from} onChange={(e) => setFrom(e.target.value)} className="input" />}</Field>
          <Field label="To">{(p) => <input {...p} type="time" required value={to} onChange={(e) => setTo(e.target.value)} className="input" />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Each meeting">
            {(p) => <select {...p} value={length} onChange={(e) => setLength(Number(e.target.value))} className="input">{lengths.map((l) => <option key={l} value={l}>{l} minutes</option>)}</select>}
          </Field>
          <Field label="Break between">
            {(p) => <select {...p} value={gap} onChange={(e) => setGap(Number(e.target.value))} className="input">{[0, 5, 10].map((g) => <option key={g} value={g}>{g ? `${g} minutes` : 'None'}</option>)}</select>}
          </Field>
        </div>
        <Segmented<'VIDEO' | 'IN_PERSON'> label="Where" value={mode} onChange={setMode} className="w-full" segments={[{ value: 'VIDEO', label: 'Video call' }, { value: 'IN_PERSON', label: 'In person' }]} />
        {mode === 'IN_PERSON' && (
          <Field label="Where parents come">
            {(p) => <input {...p} required maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} className="input" placeholder="Room 12, main building" />}
          </Field>
        )}
        <p className={cn('text-sm', preview.length ? 'text-zinc-600 dark:text-zinc-300' : 'text-rose-600 dark:text-rose-400')}>
          {preview.length ? `${preview.length} meeting${preview.length === 1 ? '' : 's'}: ${preview.slice(0, 6).map((t) => format(t, 'HH:mm')).join(', ')}${preview.length > 6 ? '…' : ''}` : 'Choose times long enough for one meeting.'}
        </p>
        {problem && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{problem}</p>}
        <button type="submit" disabled={busy || !preview.length || (mode === 'IN_PERSON' && !location.trim())} className="btn-primary w-full">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />} Open {preview.length || ''} time{preview.length === 1 ? '' : 's'}
        </button>
      </form>
    </Sheet>
  );
}
