'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_BOARD_TABS, STUDENT_TUTOR_MODES } from '@/components/layout/SectionTabs';
import { SemesterSearch } from '@/components/tutor/SemesterSearch';

// "Ask your semester" (Stage 4 · 4.5): a mode of the AI tutor.
export default function SemesterPage() {
  return (
    <>
      <Topbar title="AI tutor" subtitle="Search and ask across your whole semester, with sources" />
      <SectionTabs tabs={STUDENT_BOARD_TABS} />
      <SectionTabs tabs={STUDENT_TUTOR_MODES} small label="AI tutor mode" />
      <SemesterSearch />
    </>
  );
}
