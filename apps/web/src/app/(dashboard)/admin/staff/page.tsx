'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { StaffAdmin } from '@/components/staff/StaffAdmin';

export default function AdminStaffPage() {
  return (
    <>
      <Topbar title="Staff" subtitle="Who’s in, leave requests and cover for absent teachers" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <StaffAdmin />
      </div>
    </>
  );
}
