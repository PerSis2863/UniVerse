'use client';

import { useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
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
  { href: '/student/wellbeing', label: 'Wellbeing' },
  { href: '/student/beesafe', label: 'BeeSafe reporting' },
];

export const OPPORTUNITY_TABS: SectionTab[] = [
  { href: '/student/impact/ngo-marketplace', label: 'NGO projects' },
  { href: '/student/impact/ai-match', label: 'AI match' },
  { href: '/student/impact/shifts', label: 'Volunteer shifts' },
  { href: '/impact-rooms', label: 'Impact rooms' },
  { href: '/impact-league', label: 'Impact League' },
  { href: '/student/impact/startups', label: 'Startups' },
  { href: '/student/impact/companies', label: 'Companies' },
];

// Internships (student): the openings, how my verified skills match them (Stage 5 · D18), and careers
// help: the application tracker, interview practice and mentors (Stage 5 · Q15)
export const INTERNSHIP_TABS: SectionTab[] = [
  { href: '/student/internships', label: 'Openings' },
  { href: '/student/internships/match', label: 'Skills match' },
  { href: '/student/internships/applications', label: 'Applications' },
  { href: '/student/internships/interview', label: 'Interview practice' },
  { href: '/student/internships/mentors', label: 'Mentors' },
];

export const STUDENT_BOARD_TABS: SectionTab[] = [
  { href: '/student/blackboard', label: 'Course board' },
  { href: '/student/tutor', label: 'AI tutor', also: ['/student/voice-tutor', '/student/semester'] },
  { href: '/student/tutoring', label: 'Peer time-bank' },
  { href: '/student/reels', label: 'Revision reels' },
];

/** Inside the AI tutor tab: type to it, or talk to it (the voice tutor). */
export const STUDENT_TUTOR_MODES: SectionTab[] = [
  { href: '/student/tutor', label: 'Type' },
  { href: '/student/voice-tutor', label: 'Talk' },
  { href: '/student/oral-practice', label: 'Oral practice' },
  { href: '/student/tutoring', label: 'Peer time-bank' },
  { href: '/student/semester', label: 'My semester' },
];

export const TEACHER_BOARD_TABS: SectionTab[] = [
  { href: '/teacher/blackboard', label: 'Course board' },
  { href: '/teacher/tutor', label: 'AI tutor' },
  { href: '/teacher/reels', label: 'Revision reels' },
];

export const CREDENTIAL_TABS: SectionTab[] = [
  { href: '/student/credentials', label: 'My credentials' },
  { href: '/student/passport', label: 'Skills passport' },
  { href: '/student/impact/leaderboard', label: 'Leaderboard' },
  { href: '/student/impact/edu-society', label: 'Educational society' },
];
/** M27: a student's own records, once five menu entries. */
export const STUDENT_RECORDS_TABS: SectionTab[] = [
  { href: '/student/administrative/personal', label: 'Personal data' },
  { href: '/student/administrative/documents', label: 'Documents' },
  { href: '/student/administrative/accounting', label: 'Fees & payments' },
  { href: '/student/administrative/scholarships', label: 'Scholarships' },
  { href: '/student/choices', label: 'Course choices' },
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
  { href: '/student/mastery', label: 'Mastery' },
];

/** Whiteboards and shared code editors: one "Collaborate" entry in every portal. */
export const COLLAB_TABS: SectionTab[] = [
  { href: '/collab', label: 'Home' },
  { href: '/spaces', label: 'Spaces' },
  { href: '/boards', label: 'Whiteboards' },
  { href: '/docs', label: 'Docs' },
  { href: '/files', label: 'Files' },
  { href: '/studio', label: 'Tools' },
  { href: '/code', label: 'Code' },
  { href: '/tasks', label: 'Tasks' },
];

export const STUDENT_COURSE_TABS: SectionTab[] = [
  { href: '/student/courses', label: 'My courses' },
  { href: '/student/live', label: 'Live class' },
  { href: '/student/groups', label: 'Groups' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/student/offline', label: 'Offline' },
];
/** M27: a teacher's courses, the live class and the curriculum marketplace. */
export const TEACHER_COURSE_TABS: SectionTab[] = [
  { href: '/teacher/courses', label: 'My courses' },
  { href: '/teacher/live', label: 'Live class' },
  { href: '/marketplace', label: 'Marketplace' },
];
/** M27: marking and the register, once four menu entries. */
export const TEACHER_MARKING_TABS: SectionTab[] = [
  { href: '/teacher/assignments', label: 'Assignments' },
  { href: '/teacher/quizzes', label: 'Quizzes' },
  { href: '/teacher/grades', label: 'Grades' },
  { href: '/teacher/attendance', label: 'Attendance' },
];
/** M27: an admin's courses and the marketplace. */
export const ADMIN_COURSE_TABS: SectionTab[] = [
  { href: '/admin/courses', label: 'Courses' },
  { href: '/marketplace', label: 'Marketplace' },
];
/** M27: the knowledge hub and the library desk. */
export const ADMIN_LEARN_TABS: SectionTab[] = [
  { href: '/admin/knowledge-hub', label: 'Knowledge hub' },
  { href: '/admin/library', label: 'Library desk', need: 'library.manage' },
];
/** M27: verifying what students ask to have signed, and signed certifications. */
export const ADMIN_CREDENTIAL_TABS: SectionTab[] = [
  { href: '/admin/credentials', label: 'Verify credentials' },
  { href: '/admin/certifications', label: 'Certifications' },
];

export const STUDENT_LEARN_TABS: SectionTab[] = [
  { href: '/student/skills', label: 'Skills' },
  { href: '/student/knowledge-hub', label: 'Knowledge Hub' },
  { href: '/library', label: 'Library' },
];

/** A teacher's reading: the knowledge hub and the school library (Stage 5 · B15.4). */
export const TEACHER_LEARN_TABS: SectionTab[] = [
  { href: '/teacher/knowledge', label: 'Knowledge Hub' },
  { href: '/library', label: 'Library' },
];

/** A teacher's timetable, and their leave and the classes they cover (Stage 5 · B15.8). */
export const TEACHER_TIME_TABS: SectionTab[] = [
  { href: '/teacher/calendar', label: 'Timetable' },
  { href: '/teacher/staff', label: 'Leave & cover' },
];

export const TEACHER_STUDENT_TABS: SectionTab[] = [
  { href: '/teacher/students', label: 'Students' },
  { href: '/teacher/early-warning', label: 'Early warning' },
  { href: '/teacher/analytics', label: 'Course analytics' },
  { href: '/teacher/mastery', label: 'Mastery' },
  { href: '/teacher/meetings', label: 'Parent meetings' },
  { href: '/teacher/forms', label: 'Parent forms' },
];

export const SAFETY_TABS: SectionTab[] = [
  { href: '/admin/safety', label: 'BeeSafe reports' },
  { href: '/admin/safety/chats', label: 'Chat safety' },
  { href: '/admin/safety/policy', label: 'Policy' },
  { href: '/admin/wellbeing', label: 'Wellbeing requests', need: 'wellbeing.counsel' },
];

/** Admin → Users: the people, staff (B15.8), admissions (B15.1), roles (B15.6) and bulk import/export (B15.7). */
export const ADMIN_PEOPLE_TABS: SectionTab[] = [
  { href: '/admin/users', label: 'Users', need: 'admin' },
  { href: '/admin/staff', label: 'Staff', need: 'staff.manage' },
  { href: '/admin/admissions', label: 'Admissions', need: 'admissions.review' },
  { href: '/admin/roles', label: 'Roles', need: 'admin' },
  { href: '/admin/import', label: 'Import & export', need: ['import.run', 'export.run'] },
  { href: '/admin/integrations/oneroster', label: 'OneRoster SIS', need: 'admin' },
  { href: '/admin/integrations/developer', label: 'Developer API', need: 'admin' },
  { href: '/admin/integrations/chat-apps', label: 'Chat apps', need: 'admin' },
  { href: '/admin/integrations/lti', label: 'LMS integration', need: 'admin' },
];

/** Admin → Finances: the platform's money, and school fees (Stage 5 · B15.2). */
export const ADMIN_FINANCE_TABS: SectionTab[] = [
  { href: '/admin/finances', label: 'Overview', need: 'admin' },
  { href: '/admin/fees', label: 'School fees', need: 'fees.view' },
  { href: '/admin/finances/reconciliation', label: 'Payments & Gateways', need: 'fees.view' },
  { href: '/admin/billing', label: 'Billing & plans', need: 'admin' },
];

export const ADMIN_INSIGHT_TABS: SectionTab[] = [
  { href: '/admin/insights', label: 'School insights' },
  { href: '/admin/early-warning', label: 'Early warning' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/reports/report-cards', label: 'Report cards' },
  { href: '/admin/reports/grading-scale', label: 'Grading scale' },
  { href: '/admin/impact-metrics', label: 'Impact' },
  { href: '/admin/insights/warehouse', label: 'Analytics warehouse' },
];

// Global Impact → Partner institutions (admin), with the campus network (upgrade 9)
export const PARTNER_TABS: SectionTab[] = [
  { href: '/admin/partnerships', label: 'Partner institutions' },
  { href: '/admin/network', label: 'Campus network' },
  { href: '/admin/partners', label: 'Sponsor portal' },
];

// Global collaboration → Inter-university research (teacher), with the campus network (upgrade 9)
// M27: with NGO mentorship, impact rooms, the Impact League and volunteer mentoring (once three entries).
export const RESEARCH_TABS: SectionTab[] = [
  { href: '/teacher/collaborations', label: 'Research' },
  { href: '/teacher/network', label: 'Campus network' },
  { href: '/teacher/collaborations/projects', label: 'NGO mentorship' },
  { href: '/impact-rooms', label: 'Impact rooms' },
  { href: '/impact-league', label: 'Impact League' },
  { href: '/teacher/mentorship', label: 'Volunteer mentor' },
];

export const LIFE_TABS: SectionTab[] = [
  { href: '/student/life/associations', label: 'Associations', also: ['/student/life/associations/carbon', '/student/life/associations/club'] },
  { href: '/student/life/board', label: 'Campus board' },
  { href: '/student/life/events', label: 'Events' },
  { href: '/student/life/lost-found', label: 'Lost & found' },
  { href: '/student/life/rooms', label: 'Room booking' },
  { href: '/campus-map', label: 'Campus map' },
  { href: '/student/life/medical', label: 'Medical & disability' },
  { href: '/student/life/everyday', label: 'Everyday life' },
];

// Impact reports (admin): signed reports, volunteer shifts and the yearly volunteering report (upgrade 5)
export const IMPACT_REPORT_TABS: SectionTab[] = [
  { href: '/admin/impact-reports', label: 'Signed reports' },
  { href: '/admin/impact-reports/shifts', label: 'Volunteer shifts' },
  { href: '/admin/impact-reports/volunteering', label: 'Yearly volunteering' },
  { href: '/admin/impact-reports/donations', label: 'Donations' },
  { href: '/impact-rooms', label: 'Impact rooms' },
  { href: '/impact-league', label: 'Impact League' },
];

// NGO work (teacher): mentoring NGO projects, their impact rooms (Stage 4 · 4.12) and the Impact
// League's challenges between universities (Stage 5 · D14); one section with research since M27.
export const TEACHER_IMPACT_TABS = RESEARCH_TABS;

// Campus services (teacher): booking a room and the live campus map (Stage 5 · D15)
export const CAMPUS_SERVICE_TABS: SectionTab[] = [
  { href: '/teacher/services/rooms', label: 'Room booking' },
  { href: '/campus-map', label: 'Campus map' },
];

/** The campus map sits in Student life (students), Campus services (teachers) and Campus monitoring (admins). */
export const campusMapTabs = (role: string | undefined) => (role === 'ADMIN' ? MONITORING_TABS : role === 'TEACHER' ? CAMPUS_SERVICE_TABS : LIFE_TABS);

/** Impact rooms and the Impact League sit in a different menu for each role. */
export const impactTabs = (role: string | undefined) => (role === 'ADMIN' ? IMPACT_REPORT_TABS : role === 'TEACHER' ? TEACHER_IMPACT_TABS : OPPORTUNITY_TABS);

// Campus Monitoring (admin): rooms, the live campus map (Stage 5 · D15), clubs, and the campus
// super-app's events and lost & found (upgrade 7)
export const MONITORING_TABS: SectionTab[] = [
  { href: '/admin/student-life', label: 'Student life' },
  { href: '/admin/monitoring/rooms', label: 'Room bookings' },
  { href: '/campus-map', label: 'Campus map' },
  { href: '/admin/monitoring/associations', label: 'Clubs' },
  { href: '/admin/monitoring/events', label: 'Events' },
  { href: '/admin/monitoring/lost-found', label: 'Lost & found' },
  { href: '/admin/monitoring/board', label: 'Campus board' },
  { href: '/admin/monitoring/meals', label: 'Pre-orders' },
];

/** The marketplace sits in each role's courses section. */
export const courseTabs = (role: string | undefined) => (role === 'ADMIN' ? ADMIN_COURSE_TABS : role === 'TEACHER' ? TEACHER_COURSE_TABS : STUDENT_COURSE_TABS);

/** Every role's tab bars, so search (CommandPalette) finds pages that are tabs, not menu entries. */
export const TABS_BY_ROLE: Record<string, SectionTab[][]> = {
  STUDENT: [HOME_TABS, STUDENT_COURSE_TABS, PROGRESS_TABS, STUDENT_BOARD_TABS, STUDENT_TUTOR_MODES, STUDENT_LEARN_TABS, INTERNSHIP_TABS, OPPORTUNITY_TABS, CREDENTIAL_TABS, LIFE_TABS, SUPPORT_TABS, STUDENT_RECORDS_TABS, COLLAB_TABS],
  TEACHER: [TEACHER_COURSE_TABS, TEACHER_MARKING_TABS, TEACHER_STUDENT_TABS, TEACHER_BOARD_TABS, TEACHER_TIME_TABS, RESEARCH_TABS, CAMPUS_SERVICE_TABS, TEACHER_LEARN_TABS, COLLAB_TABS],
  ADMIN: [ADMIN_PEOPLE_TABS, SAFETY_TABS, ADMIN_COURSE_TABS, ADMIN_LEARN_TABS, ADMIN_FINANCE_TABS, MONITORING_TABS, PARTNER_TABS, IMPACT_REPORT_TABS, ADMIN_CREDENTIAL_TABS, ADMIN_INSIGHT_TABS, COLLAB_TABS],
};

/** The marketplace's tabs: the courses section of whoever is looking. */
export function MarketplaceTabs() {
  const role = useAuthStore((st) => st.user?.role);
  return <SectionTabs tabs={courseTabs(role)} />;
}

/**
 * The tabs as an iOS segmented control. The tapped segment's thumb slides over at once (before its
 * page has loaded), so switching feels instant.
 */
export function SectionTabs({ tabs, small, label = 'Sections', end }: { tabs: SectionTab[]; small?: boolean; label?: string; /** Beside the tabs (e.g. Collaborate's focus timer). */ end?: React.ReactNode }) {
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
    <nav aria-label={label} data-steady className={cn(small ? 'px-4 sm:px-8 pt-3' : 'px-4 sm:px-8 pt-4', end && 'flex flex-wrap items-center gap-3')}>
      <div className={cn('ios-segmented', !small && 'large')}>
        {shown.map((t) => {
          const on = pathname === t.href || !!t.also?.includes(pathname);
          return (
            <Link key={t.href} href={t.href} data-vt="tab" aria-current={on ? 'page' : undefined} className="ios-segment">
              {/* M17: a softer tail follows the highlight a moment later, so it moves like liquid. */}
              {on && <motion.span layoutId={`tabs-tail-${group}`} transition={{ type: 'spring', stiffness: 170, damping: 24 }} className="ios-segment-tail" aria-hidden />}
              {on && <motion.span layoutId={`tabs-${group}`} transition={spring.snappy} className="ios-segment-thumb" aria-hidden />}
              {t.label}
            </Link>
          );
        })}
      </div>
      {end}
    </nav>
  );
}

// The focus timer's pill loads on its own: most pages with tabs never show it.
const FocusPill = dynamic(() => import('@/components/collab/FocusTimer').then((m) => m.FocusPill), { ssr: false });
/** Collaborate's tabs, with the focus timer beside them while a round runs (M17). */
export function CollabTabs() {
  return <SectionTabs tabs={COLLAB_TABS} end={<FocusPill />} />;
}
