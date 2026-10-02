'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_BOARD_TABS } from '@/components/layout/SectionTabs';
import { TutorStudio } from '@/components/tutor/TutorStudio';

export default function TutorPage() {
  return (
    <>
      <Topbar title="AI tutor" subtitle="Answers from your course materials, with sources · practice questions · flashcards" />
      <SectionTabs tabs={TEACHER_BOARD_TABS} />
      <TutorStudio />
    </>
  );
}
