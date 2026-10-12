'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { DeveloperApiPanel } from '@/components/admin/DeveloperApiPanel';

export default function AdminDeveloperPage() {
  return (
    <>
      <Topbar
        title="Developer API & Webhooks"
        subtitle="Manage organization API keys, configure tamper-evident HMAC webhooks, and explore V1 REST endpoints"
      />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
        <DeveloperApiPanel />
      </div>
    </>
  );
}
