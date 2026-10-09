'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_STUDENT_TABS } from '@/components/layout/SectionTabs';
import { TeacherMeetings } from '@/components/guardian/TeacherMeetings';

export default function TeacherMeetingsPage() {
  return (
    <>
      <Topbar title="Parent meetings" subtitle="Times parents can book with you, by video or at school" />
      <SectionTabs tabs={TEACHER_STUDENT_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <TeacherMeetings />
      </div>
    </>
  );
}
