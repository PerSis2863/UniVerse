'use client';

import { Topbar } from '@/components/layout/Topbar';
import { MessagesTabs } from '@/components/layout/SectionTabs';
import { NotificationCentre } from '@/components/notifications/NotificationCentre';

// Messages → Notifications (Stage 5 · Q9): the full notification centre.
export default function NotificationsPage() {
  return (
    <>
      <Topbar title="Messages" subtitle="Everything UniVerse told you, by kind: mark read, snooze or remove" />
      <MessagesTabs />
      <div className="flex-1 p-4 md:p-8">
        <NotificationCentre />
      </div>
    </>
  );
}
