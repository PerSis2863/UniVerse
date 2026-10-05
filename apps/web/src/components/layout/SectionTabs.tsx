'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';

// Tabs that join related pages into one menu entry (e.g. Support and BeeSafe reporting): each tab
// is its own page, so links, bookmarks and notifications to either keep working.

/** `also`: other pages that belong to this tab (it stays highlighted on them). */
export type SectionTab = { href: string; label: string; also?: string[] };

export const SUPPORT_TABS: SectionTab[] = [
  { href: '/student/support', label: 'Help & support' },
  { href: '/student/beesafe', label: 'BeeSafe reporting' },
];

export const OPPORTUNITY_TABS: SectionTab[] = [
  { href: '/student/impact/ngo-marketplace', label: 'NGO projects' },
  { href: '/student/impact/shifts', label: 'Volunteer shifts' },
  { href: '/student/impact/startups', label: 'Startups' },
  { href: '/student/impact/companies', label: 'Companies' },
];

export const STUDENT_BOARD_TABS: SectionTab[] = [
  { href: '/student/blackboard', label: 'Course board' },
  { href: '/student/tutor', label: 'AI tutor', also: ['/student/voice-tutor'] },
];

/** Inside the AI tutor tab: type to it, or talk to it (the voice tutor). */
export const STUDENT_TUTOR_MODES: SectionTab[] = [
  { href: '/student/tutor', label: 'Type' },
  { href: '/student/voice-tutor', label: 'Talk' },
];

export const TEACHER_BOARD_TABS: SectionTab[] = [
  { href: '/teacher/blackboard', label: 'Course board' },
  { href: '/teacher/tutor', label: 'AI tutor' },
];

export const CREDENTIAL_TABS: SectionTab[] = [
  { href: '/student/credentials', label: 'My credentials' },
  { href: '/student/passport', label: 'Skills passport' },
];

export const HOME_TABS: SectionTab[] = [
  { href: '/student', label: 'Overview' },
  { href: '/student/calendar', label: 'Timetable' },
  { href: '/student/planner', label: 'Study planner' },
  { href: '/student/information', label: 'Information' },
];

export const PROGRESS_TABS: SectionTab[] = [
  { href: '/student/assignments', label: 'Assignments' },
  { href: '/student/grades', label: 'Grades' },
  { href: '/student/attendance', label: 'Attendance' },
  { href: '/student/quizzes', label: 'Quizzes' },
];

/** Whiteboards and shared code editors: one "Collaborate" entry in every portal. */
export const COLLAB_TABS: SectionTab[] = [
  { href: '/boards', label: 'Whiteboards' },
  { href: '/code', label: 'Code together' },
];

export const STUDENT_COURSE_TABS: SectionTab[] = [
  { href: '/student/courses', label: 'My courses' },
  { href: '/student/live', label: 'Live class' },
  { href: '/student/offline', label: 'Offline' },
];

export const STUDENT_LEARN_TABS: SectionTab[] = [
  { href: '/student/skills', label: 'Skills' },
  { href: '/student/knowledge-hub', label: 'Knowledge Hub' },
];

export const TEACHER_STUDENT_TABS: SectionTab[] = [
  { href: '/teacher/students', label: 'Students' },
  { href: '/teacher/early-warning', label: 'Early warning' },
  { href: '/teacher/analytics', label: 'Course analytics' },
];

export const ADMIN_INSIGHT_TABS: SectionTab[] = [
  { href: '/admin/insights', label: 'School insights' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/impact-metrics', label: 'Impact' },
];

export const LIFE_TABS: SectionTab[] = [
  { href: '/student/life/associations', label: 'Associations' },
  { href: '/student/life/events', label: 'Events' },
  { href: '/student/life/lost-found', label: 'Lost & found' },
  { href: '/student/life/rooms', label: 'Room booking' },
  { href: '/student/life/medical', label: 'Medical & disability' },
  { href: '/student/life/everyday', label: 'Everyday life' },
];

// Impact reports (admin): signed reports, volunteer shifts and the yearly volunteering report (upgrade 5)
export const IMPACT_REPORT_TABS: SectionTab[] = [
  { href: '/admin/impact-reports', label: 'Signed reports' },
  { href: '/admin/impact-reports/shifts', label: 'Volunteer shifts' },
  { href: '/admin/impact-reports/volunteering', label: 'Yearly volunteering' },
];

// Campus Monitoring (admin): rooms, clubs, and the campus super-app's events and lost & found (upgrade 7)
export const MONITORING_TABS: SectionTab[] = [
  { href: '/admin/monitoring/rooms', label: 'Room bookings' },
  { href: '/admin/monitoring/associations', label: 'Clubs' },
  { href: '/admin/monitoring/events', label: 'Events' },
  { href: '/admin/monitoring/lost-found', label: 'Lost & found' },
];

export function SectionTabs({ tabs, small, label = 'Sections' }: { tabs: SectionTab[]; small?: boolean; label?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={small ? 'px-4 sm:px-8 pt-3' : 'px-4 sm:px-8 pt-4'}>
      <div className="inline-flex max-w-full overflow-x-auto scrollbar-none gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.06]">
        {tabs.map((t) => {
          const on = pathname === t.href || !!t.also?.includes(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                small ? 'px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors' : 'px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors',
                on ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Messages and calls are one menu entry ("Messages"): Chats is the inbox, Calls the call log.
 * On phones the tabs step aside while a conversation is open, so the chat gets the full screen.
 */
export function MessagesTabs() {
  // useSearchParams needs a Suspense boundary (pages are prerendered); the fallback shows the tabs.
  return <Suspense fallback={<MessagesTabsInner chatOpen={false} />}><MessagesTabsWithQuery /></Suspense>;
}

function MessagesTabsWithQuery() {
  return <MessagesTabsInner chatOpen={!!useSearchParams().get('c')} />;
}

function MessagesTabsInner({ chatOpen }: { chatOpen: boolean }) {
  const role = useAuthStore((s) => s.user?.role);
  const base = role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student';
  return (
    <div className={cn(chatOpen && 'hidden md:block')}>
      <SectionTabs tabs={[{ href: `${base}/inbox`, label: 'Chats' }, { href: '/calls', label: 'Calls' }, ...(role === 'ADMIN' ? [{ href: '/admin/announcements', label: 'Announcements' }] : [])]} />
    </div>
  );
}
