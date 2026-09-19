import { Suspense } from 'react';
import { getCourseData } from '@/actions/blackboard';
import { StudentBlackboardClient } from '@/components/dashboard/StudentBlackboardClient';

export const metadata = {
  title: 'Student Blackboard - Universe',
};

export default async function StudentBlackboardPage() {
  const courseData = await getCourseData('CS301');

  return (
    <Suspense fallback={<div className="p-8 flex items-center justify-center h-full text-zinc-500">Loading Blackboard...</div>}>
      <StudentBlackboardClient initialCourse={courseData} />
    </Suspense>
  );
}
