import { Suspense } from 'react';
import { getCourseData } from '@/actions/blackboard';
import { TeacherBlackboardClient } from '@/components/dashboard/TeacherBlackboardClient';

export const metadata = {
  title: 'Teacher Blackboard - Universe',
};

export default async function TeacherBlackboardPage() {
  const courseData = await getCourseData('CS301');

  return (
    <Suspense fallback={<div className="p-8 flex items-center justify-center h-full text-zinc-500">Loading Blackboard...</div>}>
      <TeacherBlackboardClient initialCourse={courseData} />
    </Suspense>
  );
}
