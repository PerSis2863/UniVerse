'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { BulkImport } from '@/components/admin/BulkImport';

export default function AdminImportPage() {
  return (
    <>
      <Topbar title="Import & export" subtitle="People, enrolments, courses and the timetable, from and to spreadsheets" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <BulkImport />
      </div>
    </>
  );
}
