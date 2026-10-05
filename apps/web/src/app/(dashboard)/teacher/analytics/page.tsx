'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_STUDENT_TABS } from '@/components/layout/SectionTabs';
import { CourseAnalyticsBoard } from '@/components/analytics/CourseAnalyticsBoard';

export default function CourseAnalyticsPage() {
  return (
    <>
      <Topbar title="Course analytics" subtitle="How each class is doing, and who could use a hand" />
      <SectionTabs tabs={TEACHER_STUDENT_TABS} />
      <CourseAnalyticsBoard base="/teacher" />
    </>
  );
}
