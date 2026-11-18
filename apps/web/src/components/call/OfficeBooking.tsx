'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarClock, Clock, Loader2, MapPin, Plus, Trash2, Users, Video } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { confirmDialog } from '@/components/ui/Dialogs';
import Link from '@/components/ui/Link';
import { api, fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

// Office hours you can book (M295; API /office-slots, src/server/office-slots.ts). Teachers open times;
// students book one with their teachers or wait for a taken one, and move up when someone cancels.

type TeacherSlot = { id: string; startAt: string; durationMin: number; mode: string; location: string | null; topic: string | null; student: string | null; waiting: number };
type StudentSlot = { id: string; startAt: string; durationMin: number; mode: string; location: string | null; mine: boolean; taken: boolean; topic: string | null; waiting: number; place: number | null; callId: string | null };
type Data =
  | { role: 'teacher'; lengths: number[]; slots: TeacherSlot[] }
  | { role: 'student'; teachers: { id: string; name: string; courses: string[]; slots: StudentSlot[] }[] };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export function OfficeBooking() {
  const { data, mutate } = useSWR<Data>('/office-slots', fetcher);
  if (!data) return null;
  return data.role === 'teacher' ? <TeacherTimes data={data} refresh={() => void mutate()} /> : <StudentTimes data={data} refresh={() => void mutate()} />;
}

function TeacherTimes({ data, refresh }: { data: Extract<Data, { role: 'teacher' }>; refresh: () => void }) {
  const [opening, setOpening] = useState(false);
  const remove = async (s: TeacherSlot) => {
    if (s.student && !(await confirmDialog({ title: 'Cancel this time?', message: `${s.student} booked it${s.waiting ? ` and ${s.waiting} are waiting` : ''}. They’ll be told.`, destructive: true }))) return;
    try { await api.delete(`/office-slots/${s.id}`); refresh(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove that time.')); }
  };
  const booked = data.slots.filter((s) => s.student).length;
  return (
    <section className="panel p-4" aria-labelledby="oh-book-title">
      <div className="flex items-center gap-2">
        <h2 id="oh-book-title" className="me-auto font-semibold text-zinc-900 dark:text-white">Bookable office hours</h2>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpening(true)}><Plus className="w-4 h-4" aria-hidden />Open times</button>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{data.slots.length ? `${booked} of ${data.slots.length} coming times booked` : 'Open times your students can book ahead, with a waiting list when they’re taken.'}</p>
      {data.slots.length > 0 && (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {data.slots.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
              {s.mode === 'VIDEO' ? <Video className="w-4 h-4 shrink-0 text-zinc-500" aria-label="Video" /> : <MapPin className="w-4 h-4 shrink-0 text-zinc-500" aria-label="In person" />}
              <span className="w-36 shrink-0 tabular-nums text-zinc-800 dark:text-zinc-100">{when(s.startAt)}</span>
              <span className={cn('min-w-0 flex-1 truncate', s.student ? 'text-zinc-900 dark:text-white' : 'text-zinc-500')} translate={s.student ? 'no' : undefined}>{s.student ? `${s.student}${s.topic ? ` · ${s.topic}` : ''}` : 'Free'}</span>
              {s.waiting > 0 && <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300"><Users className="w-3 h-3" aria-hidden />{s.waiting} waiting</span>}
              <button type="button" className="btn-ghost btn-sm" aria-label={`Remove the time ${when(s.startAt)}`} onClick={() => void remove(s)}><Trash2 className="w-4 h-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      {opening && <OpenTimes lengths={data.lengths} onClose={() => setOpening(false)} onDone={() => { setOpening(false); refresh(); }} />}
    </section>
  );
}

function OpenTimes({ lengths, onClose, onDone }: { lengths: number[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(() => ({ day: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), from: '14:00', to: '16:00', length: '15', gap: '0', mode: 'VIDEO' as 'VIDEO' | 'IN_PERSON', location: '' }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ opened: number }>('/office-slots', { startAt: new Date(`${f.day}T${f.from}:00`).toISOString(), endAt: new Date(`${f.day}T${f.to}:00`).toISOString(), length: Number(f.length), gap: Number(f.gap), mode: f.mode, location: f.location });
      toast.success(`${r.data.opened} times open`, { description: 'Your students can book them in Calls.' });
      onDone();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t open those times.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Open office-hours times" onClose={onClose} footer={
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Open the times</button></div>
    }>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Day">{(p) => <input {...p} type="date" className="input" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />}</Field>
          <Field label="From">{(p) => <input {...p} type="time" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />}</Field>
          <Field label="To">{(p) => <input {...p} type="time" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Each meeting">{(p) => <select {...p} className="input" value={f.length} onChange={(e) => setF({ ...f, length: e.target.value })}>{lengths.map((l) => <option key={l} value={l}>{l} minutes</option>)}</select>}</Field>
          <Field label="Break between">{(p) => <select {...p} className="input" value={f.gap} onChange={(e) => setF({ ...f, gap: e.target.value })}>{[0, 5, 10, 15].map((g) => <option key={g} value={g}>{g ? `${g} minutes` : 'None'}</option>)}</select>}</Field>
        </div>
        <Segmented<'VIDEO' | 'IN_PERSON'> label="Where" value={f.mode} onChange={(mode) => setF({ ...f, mode })} segments={[{ value: 'VIDEO', label: 'Video (your office-hours room)' }, { value: 'IN_PERSON', label: 'In person' }]} />
        {f.mode === 'IN_PERSON' && <Field label="Place">{(p) => <input {...p} className="input" maxLength={120} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Room B204" />}</Field>}
      </div>
    </Sheet>
  );
}

function StudentTimes({ data, refresh }: { data: Extract<Data, { role: 'student' }>; refresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const act = async (s: StudentSlot, what: 'book' | 'wait' | 'leave' | 'cancel') => {
    setBusy(s.id);
    try {
      if (what === 'cancel') { const r = await api.post<{ movedUp: boolean }>(`/office-slots/${s.id}/cancel`, {}); toast.success('Booking cancelled', { description: r.data.movedUp ? 'The next one waiting has the time now.' : undefined }); }
      else if (what === 'book') { await api.post(`/office-slots/${s.id}/book`, { topic }); toast.success(`Booked for ${when(s.startAt)}`); }
      else if (what === 'wait') { const r = await api.post<{ place: number }>(`/office-slots/${s.id}/wait`, { topic }); toast.success(`You’re number ${r.data.place} on the waiting list`, { description: 'If the time opens up, it’s booked for you and you’re told.' }); }
      else { await api.post(`/office-slots/${s.id}/wait`, { leave: true }); toast.success('Left the waiting list'); }
      refresh();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); refresh(); }
    finally { setBusy(null); }
  };
  if (!data.teachers.length) return null;
  return (
    <section className="panel p-4" aria-labelledby="oh-student-title">
      <h2 id="oh-student-title" className="font-semibold text-zinc-900 dark:text-white">Book office hours</h2>
      <label className="mt-2 block text-sm"><span className="label">What you’d like to talk about (optional)</span><input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Question 3 of the problem set" /></label>
      <div className="mt-3 space-y-4">
        {data.teachers.map((t) => (
          <div key={t.id}>
            <p className="text-sm font-medium text-zinc-900 dark:text-white" translate="no">{t.name} <span className="font-normal text-zinc-500">· {t.courses.join(', ')}</span></p>
            <ul className="mt-1 space-y-1">
              {t.slots.map((s, i) => {
                const newDay = i === 0 || dayOf(t.slots[i - 1].startAt) !== dayOf(s.startAt);
                return (
                  <li key={s.id}>
                    {newDay && <p className="mt-2 text-xs font-medium text-zinc-500">{dayOf(s.startAt)}</p>}
                    <div className={cn('flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm', s.mine && 'bg-emerald-500/10')}>
                      <Clock className="w-4 h-4 shrink-0 text-zinc-500" aria-hidden />
                      <span className="tabular-nums text-zinc-800 dark:text-zinc-100">{new Date(s.startAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {s.durationMin} min</span>
                      <span className="me-auto text-xs text-zinc-500">{s.mode === 'VIDEO' ? 'Video' : s.location}</span>
                      {s.mine ? (
                        <>
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Yours</span>
                          {s.callId && <Link href={`/call/${s.callId}`} className="btn-ghost btn-sm">Join</Link>}
                          <button type="button" className="btn-ghost btn-sm" disabled={busy === s.id} onClick={() => void act(s, 'cancel')}>Cancel</button>
                        </>
                      ) : s.place ? (
                        <>
                          <span className="text-xs text-zinc-600 dark:text-zinc-300">Waiting: number {s.place}</span>
                          <button type="button" className="btn-ghost btn-sm" disabled={busy === s.id} onClick={() => void act(s, 'leave')}>Leave the list</button>
                        </>
                      ) : s.taken ? (
                        <button type="button" className="btn-secondary btn-sm" disabled={busy === s.id} onClick={() => void act(s, 'wait')}><CalendarClock className="w-4 h-4" aria-hidden />Join the waiting list{s.waiting ? ` (${s.waiting})` : ''}</button>
                      ) : (
                        <button type="button" className="btn-primary btn-sm" disabled={busy === s.id} onClick={() => void act(s, 'book')}>{busy === s.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Book</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
