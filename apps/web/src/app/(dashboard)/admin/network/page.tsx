'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, PARTNER_TABS } from '@/components/layout/SectionTabs';
import { NetworkAdmin } from '@/components/network/CampusNetwork';

// Global Impact → Partner institutions → Campus network (upgrade 9).
export default function AdminNetworkPage() {
  return (
    <>
      <Topbar title="Campus network" subtitle="Partner universities in your UniVerse: joint courses, exchange students and who belongs where" />
      <SectionTabs tabs={PARTNER_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <NetworkAdmin />
        </div>
      </div>
    </>
  );
}
