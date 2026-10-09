'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_STUDENT_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { CoursePicker, useCourseChoice } from '@/components/mastery/CoursePicker';
import { TeacherDna } from '@/components/mastery/TeacherDna';

// A course's Learning DNA for its teacher (Stage 5 · D1): a tab of Students.
export default function TeacherMasteryPage() {
  const { courses, chosen, choose } = useCourseChoice();
  return (
    <>
      <Topbar title="Mastery" subtitle="Learning DNA: which concepts your class has mastered, and what to re-teach" />
      <SectionTabs tabs={TEACHER_STUDENT_TABS} />
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-4">
        {!courses ? <ContentSkeleton variant="list" /> : !chosen ? <p className="text-sm text-zinc-500">You don’t teach any courses yet.</p> : (
          <>
            <CoursePicker courses={courses} value={chosen.id} onChange={choose} />
            <TeacherDna key={chosen.id} courseId={chosen.id} />
          </>
        )}
      </div>
    </>
  );
}
