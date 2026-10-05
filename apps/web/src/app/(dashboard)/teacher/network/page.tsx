'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, RESEARCH_TABS } from '@/components/layout/SectionTabs';
import { NetworkTeacher } from '@/components/network/CampusNetwork';

// Global collaboration → Research → Campus network (upgrade 9).
export default function TeacherNetworkPage() {
  return (
    <>
      <Topbar title="Campus network" subtitle="Partner universities: open your courses and class calls to their students" />
      <SectionTabs tabs={RESEARCH_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <NetworkTeacher />
        </div>
      </div>
    </>
  );
}
