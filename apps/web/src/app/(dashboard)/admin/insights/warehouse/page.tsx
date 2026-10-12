'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_INSIGHT_TABS } from '@/components/layout/SectionTabs';
import { AnalyticsWarehousePanel } from '@/components/admin/AnalyticsWarehousePanel';

export default function AnalyticsWarehousePage() {
  return (
    <div className="min-h-screen pb-16">
      <Topbar
        title="Learning Analytics Warehouse"
        subtitle="Anonymized learning event warehousing, comparative term analysis, xAPI live telemetry, and academic research access."
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <SectionTabs tabs={ADMIN_INSIGHT_TABS} />
      </div>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <AnalyticsWarehousePanel />
      </main>
    </div>
  );
}
