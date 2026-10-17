'use client';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, HOME_TABS } from '@/components/layout/SectionTabs';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { ClassDetailModal, ClassData } from '@/components/dashboard/ClassDetailModal';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { CalendarFeedCard } from '@/components/dashboard/CalendarFeedCard';
import { CalendarBoard, useCalendar } from '@/components/calendar/CalendarBoard';

export default function CalendarPage() {
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const cal = useCalendar();

  return (
    <>
      <Topbar title="My Timetable" subtitle="Your classes, exams and your own events" />
      <SectionTabs tabs={HOME_TABS} />
      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <CalendarBoard cal={cal} label="Your timetable" onOpenOther={(e, day) => setSelectedClass({ ...e.data, dateObj: day })} />
          <CalendarFeedCard who="student" />
          {/* Below the grid: shown once loading ends, so it never pushes the calendar down. */}
          {!cal.loading && cal.slots.length === 0 && cal.events.length === 0 && (
            <FeatureGuide
              className=""
              icon={CalendarIcon}
              title="Your weekly timetable lives here"
              description="Once you're enrolled in courses and your campus publishes the timetable, every lecture, lab and tutorial appears on this calendar automatically. Add your own events with New event, or bring in your Google or Outlook calendar with Import."
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
