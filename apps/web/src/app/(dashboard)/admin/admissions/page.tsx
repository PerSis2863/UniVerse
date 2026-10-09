'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { AdmissionsAdmin } from '@/components/admissions/AdmissionsAdmin';

export default function AdminAdmissionsPage() {
  return (
    <>
      <Topbar title="Admissions" subtitle="Application forms, reviews, offers and enrolment" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <AdmissionsAdmin />
      </div>
    </>
  );
}
