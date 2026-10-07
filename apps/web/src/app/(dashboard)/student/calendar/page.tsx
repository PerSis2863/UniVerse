'use client';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, HOME_TABS } from '@/components/layout/SectionTabs';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ClassDetailModal, ClassData } from '@/components/dashboard/ClassDetailModal';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { CalendarFeedCard } from '@/components/dashboard/CalendarFeedCard';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { toEntries, type Slot, type CalEvent } from '@/components/calendar/entries';

export default function CalendarPage() {
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [loading, setLoading] = useState(true);

  const [timetableSlots, setTimetableSlots] = useState<Slot[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([]);

  // Loads once, when the page opens.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/timetable/my'), api.get('/calendar/my')])
      .then(([slotsRes, eventsRes]) => {
        if (cancelled) return;
        setTimetableSlots(slotsRes.data || []);
        setCalendarEvents(eventsRes.data || []);
      })
      .catch(() => {
        if (cancelled) return;
        setTimetableSlots([]);
        setCalendarEvents([]);
        toast.error('Couldn’t load your timetable right now.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => toEntries(timetableSlots, calendarEvents), [timetableSlots, calendarEvents]);

  return (
    <>
      <Topbar title="My Timetable" subtitle="Your classes and events" />
      <SectionTabs tabs={HOME_TABS} />
      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <TimeGrid
            label="Your timetable"
            entries={entries}
            loading={loading}
            onOpen={(e, day) => setSelectedClass({ ...e.data, dateObj: day })}
          />
          <CalendarFeedCard who="student" />
          {/* Below the grid: shown once loading ends, so it never pushes the calendar down. */}
        {!loading && timetableSlots.length === 0 && calendarEvents.length === 0 && (
            <FeatureGuide
              className=""
              icon={CalendarIcon}
              title="Your weekly timetable lives here"
              description="Once you're enrolled in courses and your campus publishes the timetable, every lecture, lab and tutorial appears on this calendar automatically."
              steps={['Enroll in your courses', 'Your admin schedules classes in Timetable Management', 'Your week fills in here — tap a class for details']}
              example={<div><ExampleRow title="Operating Systems · Lecture" meta="Monday 09:00–10:30 · Room B-204" right="CS301" /><ExampleRow title="Data Science · Lab" meta="Wednesday 14:00–16:00 · Lab 3" right="DS220" accent="from-fuchsia-500 to-pink-500" /></div>}
            />
          )}
        </div>
      </div>
      {/* ─── Class Detail Panel ─────────────────────────────── */}
      <ClassDetailModal
        selectedClass={selectedClass}
        onClose={() => setSelectedClass(null)}
      />
    </>
  );
}
