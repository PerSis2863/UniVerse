'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_FINANCE_TABS } from '@/components/layout/SectionTabs';
import { FeesAdmin } from '@/components/fees/FeesAdmin';

export default function AdminFeesPage() {
  return (
    <>
      <Topbar title="School fees" subtitle="Fee plans, bills, payments and receipts" />
      <SectionTabs tabs={ADMIN_FINANCE_TABS} />
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
        <FeesAdmin />
      </div>
    </>
  );
}
