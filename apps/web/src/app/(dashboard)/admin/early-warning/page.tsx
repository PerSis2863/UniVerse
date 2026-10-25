'use client';

import { Topbar } from '@/components/layout/Topbar';
import { EarlyWarningBoard } from '@/components/early-warning/EarlyWarningBoard';
import { SectionTabs, ADMIN_INSIGHT_TABS } from '@/components/layout/SectionTabs';

export default function EarlyWarningPage() {
  return (
    <>
      <Topbar title="Early warning" subtitle="Students who may need support, with the reasons — you decide what to do" />
      <SectionTabs tabs={ADMIN_INSIGHT_TABS} />
      <EarlyWarningBoard inboxBase="/admin" />
    </>
  );
}
