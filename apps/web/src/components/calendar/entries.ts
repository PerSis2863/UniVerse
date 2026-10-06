import type { ClassData } from '@/components/dashboard/ClassDetailModal';
import { courseColor } from '@/lib/course-color';
import { EVENT_COLOR, type GridEntry } from './TimeGrid';

// /timetable/my and /calendar/my as blocks on the timetable (TimeGrid), for the student and teacher
// calendars. Each block carries the class's details for the detail sheet.

export interface Slot { id: string; courseId?: string; dayOfWeek: number; startTime: string; endTime: string; type?: string; course?: { id?: string; name?: string; code?: string; color?: string | null } | null; room?: { name?: string } | null }
export interface CalEvent { id: string; title: string; description?: string | null; startAt: string; endAt: string; type?: string; color?: string | null; courseId?: string | null; course?: { id?: string; color?: string | null } | null }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TYPE: Record<string, string> = { LECTURE: 'Lecture', LAB: 'Lab', TUTORIAL: 'Tutorial', SEMINAR: 'Seminar', EXAM: 'Exam', DEADLINE: 'Deadline', MEETING: 'Meeting', PERSONAL: 'Personal' };
const minutes = (t: string) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function toEntries(slots: Slot[], events: CalEvent[]): GridEntry<ClassData>[] {
  return [
    ...slots.map((slot) => {
      const color = courseColor(slot.course?.color, slot.course?.code ?? slot.course?.name ?? '');
      const start = minutes(slot.startTime), end = minutes(slot.endTime);
      const subject = slot.course?.name || 'Class';
      return {
        id: `slot-${slot.id}`,
        weekday: slot.dayOfWeek,
        start,
        end,
        title: slot.course?.code || subject,
        subtitle: slot.course?.code ? subject : undefined,
        location: slot.room?.name,
        color,
        data: { id: slot.id, courseId: slot.course?.id ?? slot.courseId, subject, time: slot.startTime, duration: (end - start) / 60, location: slot.room?.name || 'TBD', type: TYPE[slot.type ?? ''] ?? slot.type ?? 'Lecture', color, day: DAYS[slot.dayOfWeek] },
      };
    }),
    ...events.map((evt) => {
      const s = new Date(evt.startAt), f = new Date(evt.endAt);
      const start = s.getHours() * 60 + s.getMinutes();
      const long = f.getTime() - s.getTime() >= 20 * 3_600_000;
      // A day or longer: all day. Past midnight: to the end of its first day.
      const end = long ? 24 * 60 : s.toDateString() === f.toDateString() ? f.getHours() * 60 + f.getMinutes() : 24 * 60;
      const color = evt.color ? courseColor(evt.color, evt.title) : evt.course?.color ? courseColor(evt.course.color, evt.title) : EVENT_COLOR;
      return {
        id: `event-${evt.id}`,
        date: s,
        start: long ? 0 : start,
        end,
        title: evt.title,
        location: evt.description || undefined,
        color,
        event: true,
        data: { id: evt.id, courseId: evt.courseId ?? evt.course?.id ?? undefined, subject: evt.title, time: hhmm(start), duration: Math.max(0, f.getTime() - s.getTime()) / 3_600_000 || 1, location: evt.description || 'Virtual', type: TYPE[evt.type ?? ''] ?? evt.type ?? 'Event', color },
      };
    }),
  ];
}
