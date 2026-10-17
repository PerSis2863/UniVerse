'use client';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_TIME_TABS } from '@/components/layout/SectionTabs';
import { Clock, Download } from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { downloadIcs } from '@/lib/ics';
import { fetcher } from '@/lib/fetcher';
import { CalendarFeedCard } from '@/components/dashboard/CalendarFeedCard';
import { timeRange, type GridEntry } from '@/components/calendar/TimeGrid';
import { CalendarBoard, useCalendar } from '@/components/calendar/CalendarBoard';
import { newDraft } from '@/components/calendar/EventSheet';
import type { ClassData } from '@/components/dashboard/ClassDetailModal';

// The teacher's timetable: their classes, their courses' exams and their own events (drag one to
// move it). Office hours open the event form as weekly office hours; Export downloads it all.

/** Next Wednesday (or today, if it is one), for new office hours. */
const nextWednesday = () => { const d = new Date(); d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7)); return d; };

export default function TeacherCalendarPage() {
  const cal = useCalendar();
  const { data: courses } = useSWR<{ id: string; name: string; code?: string }[]>('/courses/my', fetcher);
  const router = useRouter();

  // Weekly classes repeat for the next 16 weeks; one-off events (office hours etc.) are exported as-is.
  const exportIcs = () => {
    const { slots: timetableSlots, events: calendarEvents } = cal;
    if (!timetableSlots.length && !calendarEvents.length) return void toast.info('Nothing to export yet — your classes and events will appear here first.');
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (v: string) => v.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Teaching Timetable//EN', 'CALSCALE:GREGORIAN'];
    const today = new Date();
    for (const slot of timetableSlots) {
      const first = new Date(today);
      const jsDay = (slot.dayOfWeek + 1) % 7; // 0=Mon in our data, 0=Sun in JS
      first.setDate(today.getDate() + ((jsDay - today.getDay() + 7) % 7));
      const [sh, sm] = String(slot.startTime).split(':').map(Number);
      const [eh, em] = String(slot.endTime).split(':').map(Number);
      const start = new Date(first); start.setHours(sh, sm, 0, 0);
      const end = new Date(first); end.setHours(eh, em, 0, 0);
      lines.push('BEGIN:VEVENT', `UID:slot-${slot.id}@universe`, `DTSTAMP:${utc(today)}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`, 'RRULE:FREQ=WEEKLY;COUNT=16',
        `SUMMARY:${esc(`${slot.course?.code ?? ''} ${slot.course?.name ?? 'Class'}`.trim())}`, ...(slot.room?.name ? [`LOCATION:${esc(slot.room.name)}`] : []), 'END:VEVENT');
    }
    for (const e of calendarEvents) {
      lines.push('BEGIN:VEVENT', `UID:event-${e.id}@universe`, `DTSTAMP:${utc(today)}`, `DTSTART:${utc(new Date(e.startAt))}`, `DTEND:${utc(new Date(e.endAt))}`,
        `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    downloadIcs(lines.join('\r\n'), 'teaching-timetable.ics');
    toast.success('Calendar file downloaded', { description: 'Open it to add your classes to Google, Apple or Outlook Calendar.' });
  };

  // A class opens its course on Blackboard; an event that isn't yours shows its details.
  const openOther = (e: GridEntry<ClassData>) => {
    if (e.data.courseId && !e.event) return router.push(`/teacher/blackboard?course=${e.data.courseId}`);
    toast(e.title, { description: `${timeRange(e.start, e.end)}${e.location ? ` · ${e.location}` : ''}` });
  };

  return (
    <>
      <Topbar
        title="Teaching Timetable"
        subtitle="Your classes, office hours and events"
        rightNode={
          <button className="btn-primary" onClick={exportIcs}>
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />
      <SectionTabs tabs={TEACHER_TIME_TABS} />

      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <CalendarBoard
            cal={cal}
            teacher
            label="Your teaching timetable"
            courses={Array.isArray(courses) ? courses : []}
            presets={[{ label: 'Office hours', icon: Clock, draft: () => newDraft(nextWednesday(), 14 * 60, 15 * 60, { title: 'Office hours', type: 'OFFICE_HOURS', weeks: 12, description: 'Room 301' }) }]}
            onOpenOther={openOther}
          />
          <CalendarFeedCard who="teacher" />
        </div>
      </div>
    </>
  );
}
