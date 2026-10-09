'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, PROGRESS_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { CoursePicker, useCourseChoice } from '@/components/mastery/CoursePicker';
import { MasteryMap } from '@/components/mastery/MasteryMap';

// A student's Learning DNA (Stage 5 · D1): a tab of Assignments & grades.
export default function StudentMasteryPage() {
  const { courses, chosen, choose } = useCourseChoice();
  return (
    <>
      <Topbar title="Mastery" subtitle="What you’ve mastered in each course, and what to study next" />
      <SectionTabs tabs={PROGRESS_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-4">
        {!courses ? <ContentSkeleton variant="grid" /> : !chosen ? <p className="text-sm text-zinc-500">You’re not in any courses yet.</p> : (
          <>
            <CoursePicker courses={courses} value={chosen.id} onChange={choose} />
            <MasteryMap key={chosen.id} courseId={chosen.id} />
          </>
        )}
      </div>
    </>
  );
}
