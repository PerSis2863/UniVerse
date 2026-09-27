'use client';

import { Topbar } from '@/components/layout/Topbar';
import { MessagingHub } from '@/components/chat/MessagingHub';

// Shared by the student, teacher and admin portals (their inbox pages re-export this one).
export default function InboxPage() {
  return (
    <div className="flex mobile-fill-height lg:h-screen flex-col">
      <Topbar title="Messages" subtitle="Chats, groups and calls with your campus" hideMobileTitle />
      <MessagingHub />
    </div>
  );
}
