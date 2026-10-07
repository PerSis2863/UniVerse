'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, SAFETY_TABS } from '@/components/layout/SectionTabs';
import { SafetyPolicy } from '@/components/safety/SafetyPolicy';

/** The school's safety policy for young students (Stage 4 · 4.10). */
export default function SafetyPolicyPage() {
  return (
    <>
      <Topbar title="Safety reports" subtitle="How UniVerse keeps students safe at your school." />
      <SectionTabs tabs={SAFETY_TABS} />
      <SafetyPolicy />
    </>
  );
}
