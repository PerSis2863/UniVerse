'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_TIME_TABS } from '@/components/layout/SectionTabs';
import { MyStaff } from '@/components/staff/MyStaff';

export default function TeacherStaffPage() {
  return (
    <>
      <Topbar title="Leave & cover" subtitle="Mark yourself in, ask for leave, see the classes you cover" />
      <SectionTabs tabs={TEACHER_TIME_TABS} />
      <div className="p-4 md:p-8 max-w-3xl mx-auto w-full">
        <MyStaff />
      </div>
    </>
  );
}
