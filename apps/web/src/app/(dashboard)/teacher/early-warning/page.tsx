'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_STUDENT_TABS } from '@/components/layout/SectionTabs';
import { EarlyWarningBoard } from '@/components/early-warning/EarlyWarningBoard';

export default function EarlyWarningPage() {
  return (
    <>
      <Topbar title="Early warning" subtitle="Students who may need support, with the reasons — you decide what to do" />
      <SectionTabs tabs={TEACHER_STUDENT_TABS} />
      <EarlyWarningBoard inboxBase="/teacher" />
    </>
  );
}
