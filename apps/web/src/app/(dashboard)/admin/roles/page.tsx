'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { RolesAdmin } from '@/components/admin/RolesAdmin';

export default function AdminRolesPage() {
  return (
    <>
      <Topbar title="Roles" subtitle="Give staff the parts of school admin they need" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <RolesAdmin />
      </div>
    </>
  );
}
