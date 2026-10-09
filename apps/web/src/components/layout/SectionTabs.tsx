'use client';

import { Suspense, useLayoutEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth';
import Link from '@/components/ui/Link';
import { useOptimisticPath } from '@/lib/nav-pending';
import { isTabRoot } from '@/lib/app-tabs';
import { setSectionRoot } from '@/lib/chrome';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { userCan, type Permission } from '@/lib/permissions';

// Tabs that join related pages into one menu entry (e.g. Support and BeeSafe reporting): each tab
// is its own page, so links, bookmarks and notifications to either keep working.

/** `also`: other pages that belong to this tab (it stays highlighted on them). */
export type SectionTab = { href: string; label: string; also?: string[]; /** Shown only to people who may (Stage 5 · B15.6). */ need?: Permission | Permission[] | 'admin' };

export const SUPPORT_TABS: SectionTab[] = [
  { href: '/student/support', label: 'Help & support' },
  { href: '/student/beesafe', label: 'BeeSafe reporting' },
];

export const OPPORTUNITY_TABS: SectionTab[] = [
  { href: '/student/impact/ngo-marketplace', label: 'NGO projects' },
  { href: '/student/impact/shifts', label: 'Volunteer shifts' },
  { href: '/impact-rooms', label: 'Impact rooms' },
  { href: '/student/impact/startups', label: 'Startups' },
  { href: '/student/impact/companies', label: 'Companies' },
];

export const STUDENT_BOARD_TABS: SectionTab[] = [
  { href: '/student/blackboard', label: 'Course board' },
  { href: '/student/tutor', label: 'AI tutor', also: ['/student/voice-tutor', '/student/semester'] },
];

/** Inside the AI tutor tab: type to it, or talk to it (the voice tutor). */
export const STUDENT_TUTOR_MODES: SectionTab[] = [
  { href: '/student/tutor', label: 'Type' },
  { href: '/student/voice-tutor', label: 'Talk' },
  { href: '/student/semester', label: 'My semester' },
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
  { href: '/spaces', label: 'Spaces' },
  { href: '/boards', label: 'Whiteboards' },
  { href: '/docs', label: 'Docs' },
  { href: '/code', label: 'Code together' },
  { href: '/tasks', label: 'Tasks' },
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
  { href: '/teacher/meetings', label: 'Parent meetings' },
  { href: '/teacher/forms', label: 'Parent forms' },
];

export const SAFETY_TABS: SectionTab[] = [
  { href: '/admin/safety', label: 'BeeSafe reports' },
  { href: '/admin/safety/chats', label: 'Chat safety' },
  { href: '/admin/safety/policy', label: 'Policy' },
];

/** Admin → Users: the people, admissions (B15.1) and bulk import/export from CSV (B15.7). */
export const ADMIN_PEOPLE_TABS: SectionTab[] = [
  { href: '/admin/users', label: 'Users', need: 'admin' },
  { href: '/admin/admissions', label: 'Admissions', need: 'admissions.review' },
  { href: '/admin/roles', label: 'Roles', need: 'admin' },
  { href: '/admin/import', label: 'Import & export', need: ['import.run', 'export.run'] },
];

/** Admin → Finances: the platform's money, and school fees (Stage 5 · B15.2). */
export const ADMIN_FINANCE_TABS: SectionTab[] = [
  { href: '/admin/finances', label: 'Overview', need: 'admin' },
  { href: '/admin/fees', label: 'School fees', need: 'fees.view' },
];

export const ADMIN_INSIGHT_TABS: SectionTab[] = [
  { href: '/admin/insights', label: 'School insights' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/reports/report-cards', label: 'Report cards' },
  { href: '/admin/impact-metrics', label: 'Impact' },
];

// Global Impact → Partner institutions (admin), with the campus network (upgrade 9)
export const PARTNER_TABS: SectionTab[] = [
  { href: '/admin/partnerships', label: 'Partner institutions' },
  { href: '/admin/network', label: 'Campus network' },
];

// Global collaboration → Inter-university research (teacher), with the campus network (upgrade 9)
export const RESEARCH_TABS: SectionTab[] = [
  { href: '/teacher/collaborations', label: 'Research' },
  { href: '/teacher/network', label: 'Campus network' },
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
  { href: '/impact-rooms', label: 'Impact rooms' },
];

// NGO work (teacher): mentoring NGO projects, and their impact rooms (Stage 4 · 4.12)
export const TEACHER_IMPACT_TABS: SectionTab[] = [
  { href: '/teacher/collaborations/projects', label: 'NGO mentorship' },
  { href: '/impact-rooms', label: 'Impact rooms' },
];

/** Impact rooms sit in a different menu for each role. */
export const impactTabs = (role: string | undefined) => (role === 'ADMIN' ? IMPACT_REPORT_TABS : role === 'TEACHER' ? TEACHER_IMPACT_TABS : OPPORTUNITY_TABS);

// Campus Monitoring (admin): rooms, clubs, and the campus super-app's events and lost & found (upgrade 7)
export const MONITORING_TABS: SectionTab[] = [
  { href: '/admin/monitoring/rooms', label: 'Room bookings' },
  { href: '/admin/monitoring/associations', label: 'Clubs' },
  { href: '/admin/monitoring/events', label: 'Events' },
  { href: '/admin/monitoring/lost-found', label: 'Lost & found' },
];

/**
 * The tabs as an iOS segmented control. The tapped segment's thumb slides over at once (before its
 * page has loaded), so switching feels instant.
 */
export function SectionTabs({ tabs, small, label = 'Sections' }: { tabs: SectionTab[]; small?: boolean; label?: string }) {
  const here = usePathname();
  const pathname = useOptimisticPath(here);
  const group = tabs.map((t) => t.href).join('|');
  // Tabs next to one of the tab bar's pages (Timetable next to Overview…) make this a top-level
  // screen: the phone's top bar shows no back button here. Before paint, so it never flickers.
  const role = useAuthStore((st) => st.user?.role);
  const user = useAuthStore((st) => st.user);
  // Tabs for areas this person can't open are left out (admins see them all).
  const shown = tabs.filter((t) => !t.need || role === 'ADMIN' || (t.need !== 'admin' && (Array.isArray(t.need) ? t.need : [t.need]).some((p) => userCan(user, p))));
  useLayoutEffect(() => {
    if (!role || !tabs.some((t) => isTabRoot(t.href, role))) return;
    setSectionRoot(here);
    return () => setSectionRoot(null);
  }, [role, here, group]); // eslint-disable-line react-hooks/exhaustive-deps
  if (shown.length < 2) return null;
  return (
    <nav aria-label={label} data-steady className={small ? 'px-4 sm:px-8 pt-3' : 'px-4 sm:px-8 pt-4'}>
      <div className={cn('ios-segmented', !small && 'large')}>
        {shown.map((t) => {
          const on = pathname === t.href || !!t.also?.includes(pathname);
          return (
            <Link key={t.href} href={t.href} data-vt="tab" aria-current={on ? 'page' : undefined} className="ios-segment">
              {on && <motion.span layoutId={`tabs-${group}`} transition={spring.snappy} className="ios-segment-thumb" aria-hidden />}
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
