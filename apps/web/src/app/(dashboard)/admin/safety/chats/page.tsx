'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, SAFETY_TABS } from '@/components/layout/SectionTabs';
import { ChatSafety } from '@/components/safety/ChatSafety';

/** Chat messages the safety check flagged, for the school's moderators (Stage 4 · 4.10). */
export default function ChatSafetyPage() {
  return (
    <>
      <Topbar title="Safety reports" subtitle="Chat messages that may need a look. Only school admins see these." />
      <SectionTabs tabs={SAFETY_TABS} />
      <ChatSafety />
    </>
  );
}
