'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { ChatAppsPanel } from '@/components/admin/ChatAppsPanel';

export default function AdminChatAppsPage() {
  return (
    <>
      <Topbar title="Chat apps" subtitle="Your school’s own slash commands in chat, answered by your apps" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
        <ChatAppsPanel />
      </div>
    </>
  );
}
