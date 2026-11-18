'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarPlus, Loader2, Upload, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { authedJson } from '@/lib/authed-fetch';
import { parseIcs } from '@/lib/ics-parse';
import { useOnceParam } from '@/lib/use-once-param';
import { useAuthStore } from '@/store/auth';
import { TimeGrid, type GridEntry } from './TimeGrid';
import { EventSheet, clockString, dayString, newDraft, type EventDraft, type EventKind } from './EventSheet';
import { toEntries, type CalEvent, type Slot } from './entries';
import { weekClashes } from '@/lib/room-finder';
import type { ClassData } from '@/components/dashboard/ClassDetailModal';
import { FileDrop } from '@/components/ui/FileDrop';
import { useMyCourseColors } from '@/lib/my-course-colors';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The student's and teacher's calendar (Stage 5 · Q12): the timetable and events on TimeGrid, with
// your own events made, dragged to a new time, changed and deleted; "New event" (also from the
// phone's + menu, ?new=1) and events read from a calendar file (.ics from Google, Outlook or Apple).

const NO_SLOTS: Slot[] = [], NO_EVENTS: CalEvent[] = [];
const KINDS: EventKind[] = ['PERSONAL', 'FOCUS', 'MEETING', 'OFFICE_HOURS', 'DEADLINE'];

export function useCalendar() {
  const me = useAuthStore((s) => s.user?.id);
  const slots = useSWR<Slot[]>('/timetable/my', fetcher);
  const events = useSWR<CalEvent[]>('/calendar/my', fetcher);
  const slotList = Array.isArray(slots.data) ? slots.data : NO_SLOTS;
  const eventList = Array.isArray(events.data) ? events.data : NO_EVENTS;
  // A student's own course colours (this device) on their classes.
  const mine = useMyCourseColors();
  // M200: events from a connected Google or Outlook calendar, read live, shown in grey (not movable here).
  const outside = useOutsideEvents();
  // M325: booked office-hours times (a student's own, a teacher's with who booked), not movable here.
  const office = useOfficeEvents();
  const entries = useMemo(() => toEntries(slotList.map((s) => (s.course?.code && mine[s.course.code] ? { ...s, course: { ...s.course, color: mine[s.course.code] } } : s)), [...eventList, ...outside, ...office], me), [slotList, eventList, outside, office, me, mine]);
  /** Moves one of your events: shown at once, put back if the server says no. */
  const move = (id: string, startAt: Date, endAt: Date) => {
    const times = { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
    const moved = (list?: CalEvent[]) => (Array.isArray(list) ? list : []).map((e) => (e.id === id ? { ...e, ...times } : e));
    return events.mutate(async (current) => { await api.patch(`/calendar/${id}`, times); return moved(current); }, { optimisticData: (current) => moved(current), rollbackOnError: true, revalidate: false });
  };
  return { slots: slotList, events: eventList, entries, loading: slots.isLoading || events.isLoading, failed: !!(slots.error && events.error), refresh: () => events.mutate(), move };
}
export type CalendarData = ReturnType<typeof useCalendar>;

const NO_OUTSIDE: CalEvent[] = [];

type OfficeAnswer =
  | { role: 'teacher'; slots: { id: string; startAt: string; durationMin: number; student: string | null; topic: string | null }[] }
  | { role: 'student'; teachers: { name: string; slots: { id: string; startAt: string; durationMin: number; mine: boolean; topic: string | null }[] }[] };
const NO_OFFICE: CalEvent[] = [];
/** M325: office-hours times that are booked, as calendar events (src/server/office-slots.ts). */
function useOfficeEvents(): CalEvent[] {
  const { data } = useSWR<OfficeAnswer>('/office-slots', fetcher);
  return useMemo(() => {
    if (!data) return NO_OFFICE;
    const end = (s: { startAt: string; durationMin: number }) => new Date(Date.parse(s.startAt) + s.durationMin * 60_000).toISOString();
    if (data.role === 'teacher') return data.slots.filter((s) => s.student).map((s) => ({ id: `oh-${s.id}`, userId: '', title: `Office hours: ${s.student}`, description: s.topic, startAt: s.startAt, endAt: end(s), type: 'OFFICE_HOURS' }));
    return data.teachers.flatMap((t) => t.slots.filter((s) => s.mine).map((s) => ({ id: `oh-${s.id}`, userId: '', title: `Office hours with ${t.name}`, description: s.topic, startAt: s.startAt, endAt: end(s), type: 'OFFICE_HOURS' })));
  }, [data]);
}
/** Events of the calendars I connected (Settings → Connected accounts), from a week ago to two months ahead. */
function useOutsideEvents(): CalEvent[] {
  const { data: list } = useSWR<{ services: { id: string; kind: string; connected: unknown }[] }>('/api/connections', authedJson, { revalidateOnFocus: false });
  const ids = (list?.services ?? []).filter((x) => x.kind === 'calendar' && x.connected).map((x) => x.id);
  const [range] = useState(() => { const n = Date.now(); return `from=${encodeURIComponent(new Date(n - 7 * 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(n + 60 * 86_400_000).toISOString())}`; });
  const { data } = useSWR(ids.length ? ['outside-events', ...ids] : null, () => Promise.all(ids.map((id) => authedJson<{ events?: { id: string; title: string; start: string; end: string; where: string | null }[] }>(`/api/connections/${id}/items?${range}`).then((r) => (r.events ?? []).map((e) => toOutside(id, e)), () => []))).then((all) => all.flat()), { revalidateOnFocus: false });
  return data ?? NO_OUTSIDE;
}
const toOutside = (service: string, e: { id: string; title: string; start: string; end: string; where: string | null }): CalEvent => ({
  id: `ext-${service}-${e.id}`, title: e.title, startAt: e.start, endAt: e.end, type: 'MEETING', color: '#64748b',
  description: `${service === 'google-calendar' ? 'Google Calendar' : 'Outlook'}${e.where ? ` · ${e.where}` : ''}`,
});

/** An event of yours as the form's draft. */
function draftOf(e: CalEvent): EventDraft {
  const s = new Date(e.startAt), f = new Date(e.endAt);
  const allDay = s.getHours() === 0 && s.getMinutes() === 0 && f.getTime() - s.getTime() >= 20 * 3_600_000;
  return {
    id: e.id, title: e.title, day: dayString(s), start: clockString(s.getHours() * 60 + s.getMinutes()), end: clockString(f.getHours() * 60 + f.getMinutes()),
    allDay, type: KINDS.includes(e.type as EventKind) ? (e.type as EventKind) : 'PERSONAL', color: e.color ?? null, courseId: e.courseId ?? '', description: e.description ?? '', weeks: 1, batch: e.batch,
  };
}

/** The next half hour from now, for a new event. */
function nextSlot(): { day: Date; start: number } {
  const n = new Date();
  const m = Math.ceil((n.getHours() * 60 + n.getMinutes() + 1) / 30) * 30;
  return m >= 23 * 60 ? { day: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), start: 9 * 60 } : { day: n, start: m };
}

export function CalendarBoard({ cal, label, teacher, courses, presets = [], onOpenOther }: {
  cal: CalendarData;
  label: string;
  teacher?: boolean;
  courses?: { id: string; code?: string; name: string }[];
  /** Extra buttons that open the form filled in (a teacher's office hours). */
  presets?: { label: string; icon: LucideIcon; draft: () => EventDraft }[];
  /** Classes and events that aren't yours (a course's exam, a scheduled class call). */
  onOpenOther: (e: GridEntry<ClassData>, day: Date) => void;
}) {
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = () => { const { day, start } = nextSlot(); setDraft(newDraft(day, start)); };
  useOnceParam('new', create);

  const open = (e: GridEntry<ClassData>, day: Date) => {
    const mine = e.movable ? cal.events.find((x) => x.id === e.data.id) : undefined;
    if (mine) setDraft(draftOf(mine)); else onOpenOther(e, day);
  };
  const moveTo = (e: GridEntry<ClassData>, day: Date, start: number, end: number) => {
    const evt = cal.events.find((x) => x.id === e.data.id);
    if (!evt) return;
    const at = (min: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min);
    const was = { start: new Date(evt.startAt), end: new Date(evt.endAt) };
    const length = was.end.getTime() - was.start.getTime();
    // Moved (the same length on the grid): it keeps its real length, past midnight too. Resized: the new end.
    const startAt = at(start), endAt = end - start === e.end - e.start ? new Date(startAt.getTime() + length) : at(end);
    cal.move(evt.id, startAt, endAt).then(
      () => toast.success(`${evt.title}: ${format(startAt, 'EEE d MMM, h:mm a')}`, { action: { label: 'Undo', onClick: () => void cal.move(evt.id, was.start, was.end) } }),
      (err) => toast.error(errorMessage(err, 'Couldn’t move the event.')),
    );
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const events = parseIcs(await file.text(), { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, from: Date.now() - 30 * 86_400_000, limit: 300 });
      if (!events.length) { toast.error('No events from the last month on in that file.'); return; }
      const name = file.name.replace(/\.ics$/i, '').slice(0, 80) || 'Calendar';
      const res = await api.post<{ imported: number; replaced: number }>('/calendar/import', { name, events });
      toast.success(`Added ${res.data.imported} events from “${name}”`, { description: res.data.replaced ? `Replacing the ${res.data.replaced} from the last time you imported it.` : 'Delete them all from any of them: Delete series.' });
      void cal.refresh();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t read that calendar file.')); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  // M298: the person's own classes that overlap each week (two courses at the same time).
  const clashes = weekClashes(cal.slots);
  return (
    <>
      {clashes.length > 0 && (
        <div role="status" className="mb-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-semibold">{clashes.length === 1 ? 'Two of your classes overlap' : `${clashes.length} pairs of your classes overlap`}</p>
          <ul className="mt-1 space-y-0.5">
            {clashes.slice(0, 4).map(([a, b]) => <li key={`${a.id}-${b.id}`}>{DAY_NAMES[a.dayOfWeek]}: {a.course?.code ?? 'a class'} {a.startTime}–{a.endTime} and {b.course?.code ?? 'a class'} {b.startTime}–{b.endTime}</li>)}
          </ul>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">{teacher ? 'Ask the timetable office to move one.' : 'Tell your teachers or the timetable office so one can move.'}</p>
        </div>
      )}
      <TimeGrid
        label={label}
        entries={cal.entries}
        loading={cal.loading}
        onOpen={open}
        onMove={moveTo}
        onCreate={(day, start, end) => setDraft(newDraft(day, start, end))}
        toolbarEnd={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ms-auto">
            {presets.map((p) => <button key={p.label} type="button" onClick={() => setDraft(p.draft())} className="btn-secondary flex-1 sm:flex-none"><p.icon className="w-4 h-4" />{p.label}</button>)}
            <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
            <FileDrop hint={false} onFiles={(f) => void importFile(f[0])} accept=".ics,text/calendar" disabled={importing} className="flex flex-1 sm:flex-none">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} title="Add events from a Google, Outlook or Apple calendar file (.ics); or drop the file here" className="btn-secondary flex-1 sm:flex-none">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Import
            </button>
            </FileDrop>
            <button type="button" onClick={create} className="btn-primary flex-1 sm:flex-none"><CalendarPlus className="w-4 h-4" />New event</button>
          </div>
        }
      />
      {cal.failed && <p className="text-sm text-rose-700 dark:text-rose-300">Couldn’t load your calendar right now. <button type="button" onClick={() => void cal.refresh()} className="underline">Try again</button></p>}
      {draft && <EventSheet draft={draft} teacher={teacher} courses={courses} onClose={() => setDraft(null)} onSaved={() => void cal.refresh()} />}
    </>
  );
}
