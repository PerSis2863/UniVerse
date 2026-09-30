'use client';

import { Topbar } from '@/components/layout/Topbar';
import { TutorStudio } from '@/components/tutor/TutorStudio';

export default function TutorPage() {
  return (
    <>
      <Topbar title="AI tutor" subtitle="Answers from your course materials, with sources · practice questions · flashcards" />
      <TutorStudio />
    </>
  );
}
