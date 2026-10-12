'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { OneRosterSyncPanel } from '@/components/admin/OneRosterSyncPanel';

export default function OneRosterPage() {
  return (
    <>
      <Topbar
        title="OneRoster 1.2 SIS Integration"
        subtitle="Synchronize student rosters, faculty, courses, and class memberships from standard SIS exports"
      />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
        <OneRosterSyncPanel />
      </div>
    </>
  );
}
