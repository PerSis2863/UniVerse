'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

// Making or changing your own event (Stage 5 · Q12): a title, what kind (personal, study time, a
// meeting, office hours, a deadline), the day and times or all day, repeat weekly, a colour, where,
// and for teachers a class to show it to. Dragging on the calendar moves it too; this is the way
// to do the same with a keyboard or a screen reader.

export type EventKind = 'PERSONAL' | 'FOCUS' | 'MEETING' | 'OFFICE_HOURS' | 'DEADLINE';
export interface EventDraft {
  id?: string;
  title: string;
  /** "YYYY-MM-DD" and "HH:MM", in the viewer's own time. */
  day: string;
  start: string;
  end: string;
  allDay: boolean;
  type: EventKind;
  color: string | null;
  courseId: string;
  description: string;
  weeks: number;
  batch?: string | null;
}

const KINDS: { value: EventKind; label: string; teacher?: boolean }[] = [
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'FOCUS', label: 'Study or focus time' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'OFFICE_HOURS', label: 'Office hours', teacher: true },
  { value: 'DEADLINE', label: 'Deadline' },
];
const COLOURS: { value: string; name: string }[] = [
  { value: '#4f46e5', name: 'Indigo' },
  { value: '#0f766e', name: 'Teal' },
  { value: '#be123c', name: 'Red' },
  { value: '#b45309', name: 'Amber' },
  { value: '#0369a1', name: 'Blue' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#27325a', name: 'Navy' },
  { value: '#52525b', name: 'Grey' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const clockString = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
/** A local day and "HH:MM" as a moment; "24:00" is midnight at the end of the day. */
export function localMoment(day: string, hhmm: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0);
}

/** A blank event on a day, from `start` to `end` minutes. */
export function newDraft(day: Date, start = 9 * 60, end = start + 60, extra: Partial<EventDraft> = {}): EventDraft {
  return { title: '', day: dayString(day), start: clockString(start), end: clockString(Math.min(end, 23 * 60 + 59)), allDay: false, type: 'PERSONAL', color: null, courseId: '', description: '', weeks: 1, ...extra };
}

export function EventSheet({ draft, teacher, courses, onClose, onSaved }: {
  draft: EventDraft;
  teacher?: boolean;
  courses?: { id: string; code?: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(draft);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const editing = !!f.id;
  const set = (patch: Partial<EventDraft>) => setF((v) => ({ ...v, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = localMoment(f.day, f.allDay ? '00:00' : f.start);
    const end = f.allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) : localMoment(f.day, f.end);
    if (end <= start) return void toast.error('The event has to end after it starts.');
    setBusy('save');
    try {
      const body = { title: f.title.trim(), description: f.description.trim(), startAt: start.toISOString(), endAt: end.toISOString(), type: f.type, color: f.color, ...(teacher ? { courseId: f.courseId || null } : {}) };
      if (editing) await api.patch(`/calendar/${f.id}`, body);
      else await api.post('/calendar', { ...body, weeks: f.weeks });
      toast.success(editing ? 'Event saved' : f.weeks > 1 ? `Added for ${f.weeks} weeks` : 'Event added');
      onSaved();
      onClose();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t save the event.')); }
    finally { setBusy(null); }
  };
  const remove = async (series: boolean) => {
    if (series && !(await confirmDialog({ title: 'Delete every event in this series?', message: f.batch?.startsWith('ics:') ? 'Everything imported from the same calendar file goes.' : 'Every week of this repeating event goes.', confirmLabel: 'Delete all', destructive: true }))) return;
    setBusy('delete');
    try {
      await api.delete(`/calendar/${f.id}${series ? '?series=1' : ''}`);
      toast.success(series ? 'Series deleted' : 'Event deleted');
      onSaved();
      onClose();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t delete the event.')); }
    finally { setBusy(null); }
  };

  return (
    <Sheet title={editing ? 'Edit event' : 'New event'} onClose={onClose} footer={
      <div className="flex flex-wrap items-center gap-2">
        {editing && <button type="button" onClick={() => void remove(false)} disabled={!!busy} className="btn-secondary btn-sm text-rose-700 dark:text-rose-300">{busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete</button>}
        {editing && f.batch && <button type="button" onClick={() => void remove(true)} disabled={!!busy} className="btn-ghost btn-sm text-rose-700 dark:text-rose-300">Delete series</button>}
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button type="submit" form="event-form" disabled={!!busy || !f.title.trim()} className="btn-primary btn-sm">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
      </div>
    }>
      <form id="event-form" onSubmit={save} className="space-y-3">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Title
          <input required maxLength={200} value={f.title} onChange={(e) => set({ title: e.target.value })} className="input mt-1" placeholder={f.type === 'FOCUS' ? 'Revise chapter 4' : 'Football practice'} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Kind
            <select value={f.type} onChange={(e) => set({ type: e.target.value as EventKind })} className="input mt-1">
              {KINDS.filter((k) => teacher || !k.teacher).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Day
            <input type="date" required value={f.day} onChange={(e) => e.target.value && set({ day: e.target.value })} className="input mt-1" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} className="w-4 h-4 accent-indigo-600" />All day
        </label>
        {!f.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Starts
              <input type="time" required step={300} value={f.start} onChange={(e) => e.target.value && set({ start: e.target.value })} className="input mt-1" />
            </label>
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Ends
              <input type="time" required step={300} value={f.end} onChange={(e) => e.target.value && set({ end: e.target.value })} className="input mt-1" />
            </label>
          </div>
        )}
        {!editing && (
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Repeat
            <select value={f.weeks} onChange={(e) => set({ weeks: Number(e.target.value) })} className="input mt-1">
              <option value={1}>Doesn’t repeat</option>
              {[4, 8, 12, 16].map((n) => <option key={n} value={n}>Every week, for {n} weeks</option>)}
            </select>
          </label>
        )}
        {teacher && !!courses?.length && (
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Show to
            <select value={f.courseId} onChange={(e) => set({ courseId: e.target.value })} className="input mt-1">
              <option value="">Just me</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name} (its students see it)</option>)}
            </select>
          </label>
        )}
        <fieldset>
          <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1.5">Colour</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!f.color} onClick={() => set({ color: null })} className={cn('h-8 px-3 rounded-full border text-xs font-medium', !f.color ? 'border-indigo-600 ring-2 ring-indigo-500/40 text-zinc-900 dark:text-white' : 'border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300')}>Automatic</button>
            {COLOURS.map((c) => (
              <button key={c.value} type="button" aria-pressed={f.color === c.value} onClick={() => set({ color: c.value })} className={cn('w-8 h-8 rounded-full ring-offset-2 ring-offset-[var(--surface)]', f.color === c.value && 'ring-2 ring-zinc-900 dark:ring-white')} style={{ background: c.value }}>
                <span className="sr-only">{c.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Where or notes
          <textarea maxLength={2000} rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} className="input mt-1" placeholder="Room 301, or a link" />
        </label>
      </form>
    </Sheet>
  );
}
