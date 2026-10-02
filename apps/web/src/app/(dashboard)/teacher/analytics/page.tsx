'use client';

import { Topbar } from '@/components/layout/Topbar';
import { CourseAnalyticsBoard } from '@/components/analytics/CourseAnalyticsBoard';

export default function CourseAnalyticsPage() {
  return (
    <>
      <Topbar title="Course analytics" subtitle="How each class is doing, and who could use a hand" />
      <CourseAnalyticsBoard base="/teacher" />
    </>
  );
}
