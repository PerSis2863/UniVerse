'use client';
import Link from '@/components/ui/Link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { BarChart3, Briefcase, PenTool, ShieldCheck, type LucideIcon } from 'lucide-react';
import { userCan } from '@/lib/permissions';
import {
  LayoutDashboard, Users,
  MessageSquare, Settings, LogOut,
  GraduationCap, Brain,
  AlertTriangle, Folder, ChevronDown,
  Coffee, Shield, Map, Globe2, Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { useLanguageStore } from '@/store/language';
import { useOptimisticPath } from '@/lib/nav-pending';

export type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  subItems?: { href: string; label: string; also?: string[] }[];
  action?: string;
  /** Other pages that count as this entry (tabs of the same section). */
  also?: string[];
};

/**
 * Staff with custom roles (Stage 5 · B15.6) get an "Office" group with the admin areas their
 * permissions open, before Messages and Settings.
 */
function withOffice(nav: NavItem[], user: { role?: string; permissions?: string[] }): NavItem[] {
  const subItems = [
    userCan(user, 'fees.view') && { href: '/admin/fees', label: 'School fees' },
    userCan(user, 'admissions.review') && { href: '/admin/admissions', label: 'Admissions' },
    (userCan(user, 'import.run') || userCan(user, 'export.run')) && { href: '/admin/import', label: 'Import & export' },
  ].filter((x): x is { href: string; label: string } => !!x);
  if (!subItems.length) return nav;
  const at = Math.max(0, nav.length - 2);
  return [...nav.slice(0, at), { label: 'Office', icon: Briefcase, subItems }, ...nav.slice(at)];
}

/** Whether `pathname` is the page of this entry (its href without a query, or one of `also`). */
const isOn = (pathname: string, href: string | undefined, also?: string[]) => !!href && (pathname === href.split('?')[0] || !!also?.includes(pathname));

/**
 * Pages that are tabs of another menu entry, or only reached from search (Ctrl+K / the search
 * button): listed in search by name. `quick` ones also show before anything is typed.
 */
export const searchOnlyPages: Record<string, { href: string; label: string; keywords?: string; quick?: boolean }[]> = {
  STUDENT: [
    { href: '/student/search/directory', label: 'Student directory', keywords: 'people find students classmates', quick: true },
    { href: '/student/search/internships', label: 'Internship history', keywords: 'placements companies past internships', quick: true },
    { href: '/student/links', label: 'Apps & links', keywords: 'tools portals email library wifi', quick: true },
    { href: '/student/calendar', label: 'Timetable', keywords: 'calendar schedule classes week' },
    { href: '/student/planner', label: 'Study planner', keywords: 'plan study schedule ai deadlines revision' },
    { href: '/student/information', label: 'Information', keywords: 'news announcements updates' },
    { href: '/student/attendance', label: 'Attendance', keywords: 'absences presence' },
    { href: '/student/quizzes', label: 'Quizzes', keywords: 'tests exams' },
    { href: '/student/assignments', label: 'Assignments', keywords: 'essay homework coursework hand in' },
    { href: '/student/tutor', label: 'AI tutor', keywords: 'ai study flashcards practice' },
    { href: '/student/voice-tutor', label: 'Voice tutor', keywords: 'talk speak ai tutor voice' },
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/student/passport', label: 'Skills passport', keywords: 'cv profile share employers' },
    { href: '/student/life/rooms', label: 'Room booking', keywords: 'reserve study room' },
    { href: '/student/life/medical', label: 'Medical & disability', keywords: 'health doctor accessibility' },
    { href: '/student/life/everyday', label: 'Everyday life', keywords: 'dining menu food transport campus' },
    { href: '/student/life/events', label: 'Campus events', keywords: 'rsvp check in qr ticket event' },
    { href: '/student/life/lost-found', label: 'Lost & found', keywords: 'lost found missing item' },
    { href: '/impact-rooms', label: 'Impact rooms', keywords: 'ngo volunteer sponsor donate time pledge impact call project updates' },
  ],
  TEACHER: [
    { href: '/teacher/tutor', label: 'AI tutor', keywords: 'ai course sources flashcards' },
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/impact-rooms', label: 'Impact rooms', keywords: 'ngo volunteer sponsor impact call report project updates' },
  ],
  ADMIN: [
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
    { href: '/impact-rooms', label: 'Impact rooms', keywords: 'ngo volunteer sponsor impact call report project updates' },
  ],
};

export const navByRole: Record<string, NavItem[]> = {
  STUDENT: [
    { href: '/student', label: 'nav.dashboard', icon: LayoutDashboard, also: ['/student/calendar', '/student/planner', '/student/information'] },
    // Messages and calls are one entry: the Calls list is a tab inside Messages.
    { href: '/student/inbox', label: 'nav.inbox', icon: MessageSquare, also: ['/calls'] },
    {
      label: 'nav.schooling', icon: GraduationCap,
      subItems: [
        { href: '/student/courses', label: 'nav.courses', also: ['/student/live', '/student/offline'] },
        { href: '/student/groups', label: 'nav.groups' },
        { href: '/student/blackboard', label: 'nav.blackboard', also: ['/student/tutor', '/student/voice-tutor'] },
        { href: '/student/internships', label: 'nav.internships' },
        { href: '/student/choices', label: 'nav.my_choices' },
        { href: '/student/assignments', label: 'Assignments & grades', also: ['/student/grades', '/student/attendance', '/student/quizzes'] },
        { href: '/boards', label: 'Collaborate', also: ['/code', '/tasks', '/docs', '/spaces'] },
        { href: '/student/skills', label: 'Learning resources', also: ['/student/knowledge-hub'] },
      ]
    },
    {
      label: 'nav.administrative_data', icon: Folder,
      subItems: [
        { href: '/student/administrative/personal', label: 'nav.personal_data' },
        { href: '/student/administrative/documents', label: 'nav.school_documents' },
        { href: '/student/administrative/accounting', label: 'nav.accounting' },
        { href: '/student/administrative/scholarships', label: 'nav.scholarships' },
      ]
    },
    {
      label: 'nav.global_impact', icon: Globe2,
      subItems: [
        { href: '/student/impact/ai-match', label: 'AI project match' },
        { href: '/student/impact/ngo-marketplace', label: 'Opportunities', also: ['/student/impact/startups', '/student/impact/companies', '/student/impact/shifts', '/impact-rooms'] },
        { href: '/student/impact/edu-society', label: 'nav.edu_society' },
        { href: '/student/credentials', label: 'Credentials & passport', also: ['/student/passport'] },
        { href: '/student/impact/leaderboard', label: 'Leaderboard' },
      ]
    },
    { href: '/student/life/associations', label: 'nav.student_life', icon: Coffee, also: ['/student/life/rooms', '/student/life/medical', '/student/life/everyday', '/student/life/events', '/student/life/lost-found'] },
    { href: '/student/community', label: 'nav.community', icon: Users },
    { href: '/student/support', label: 'Support & BeeSafe', icon: AlertTriangle, also: ['/student/beesafe'] },
    { href: '/student/settings?section=language', label: 'nav.settings', icon: Settings },
  ],
  TEACHER: [
    { href: '/teacher', label: 'nav.dashboard', icon: LayoutDashboard },
    {
      label: 'nav.global_collab', icon: Globe2,
      subItems: [
        { href: '/teacher/collaborations', label: 'nav.inter_uni_research', also: ['/teacher/network'] },
        { href: '/teacher/collaborations/projects', label: 'nav.ngo_mentorship', also: ['/impact-rooms'] },
        { href: '/teacher/mentorship', label: 'nav.volunteer_mentor' },
      ]
    },
    {
      label: 'nav.schooling', icon: GraduationCap,
      subItems: [
        { href: '/teacher/courses', label: 'nav.my_courses' },
        { href: '/teacher/blackboard', label: 'nav.blackboard', also: ['/teacher/tutor'] },
        { href: '/teacher/students', label: 'nav.students', also: ['/teacher/early-warning', '/teacher/analytics', '/teacher/meetings', '/teacher/forms'] },
        { href: '/teacher/attendance', label: 'nav.attendance' },
        { href: '/teacher/grades', label: 'nav.grades' },
        { href: '/teacher/quizzes', label: 'nav.quizzes' },
        { href: '/teacher/assignments', label: 'Assignments' },
        { href: '/teacher/live', label: 'Live class' },
        { href: '/boards', label: 'Collaborate', also: ['/code', '/tasks', '/docs', '/spaces'] },
        { href: '/teacher/calendar', label: 'nav.timetable' },
      ]
    },
    {
      label: 'nav.campus_services', icon: Map,
      subItems: [
        { href: '/teacher/services/rooms', label: 'nav.room_reservation' },
      ]
    },
    { href: '/teacher/knowledge', label: 'nav.knowledge_hub', icon: Brain },
    { href: '/teacher/inbox', label: 'nav.messages', icon: MessageSquare, also: ['/calls'] },
    { href: '/teacher/settings?section=profile', label: 'nav.settings', icon: Settings },
  ],
  ADMIN: [
    { href: '/admin', label: 'nav.overview', icon: LayoutDashboard },
    {
      label: 'nav.global_impact', icon: Globe2,
      subItems: [
        { href: '/admin/partnerships', label: 'nav.partner_institutions', also: ['/admin/network'] },
        { href: '/admin/partners', label: 'nav.sponsor_portal' },
        { href: '/admin/impact-reports', label: 'Impact reports', also: ['/admin/impact-reports/shifts', '/admin/impact-reports/volunteering', '/impact-rooms'] },
        { href: '/admin/certifications', label: 'Certifications' },
        { href: '/admin/credentials', label: 'Credential Verification' },
      ]
    },
    // Management was 15 entries; now three short groups.
    {
      label: 'People', icon: Users,
      subItems: [
        { href: '/admin/users', label: 'nav.users', also: ['/admin/admissions', '/admin/roles', '/admin/import'] },
        { href: '/admin/approvals', label: 'Approvals' },
        { href: '/admin/early-warning', label: 'Early warning' },
        { href: '/admin/safety', label: 'Safety reports' },
        { href: '/admin/audit', label: 'Activity Log' },
      ]
    },
    {
      label: 'Academics', icon: GraduationCap,
      subItems: [
        { href: '/admin/courses', label: 'nav.courses' },
        { href: '/admin/attendance', label: 'nav.attendance' },
        { href: '/admin/quizzes', label: 'nav.quizzes' },
        { href: '/admin/timetable', label: 'nav.timetable_management' },
        { href: '/admin/knowledge-hub', label: 'nav.knowledge_hub' },
      ]
    },
    {
      label: 'Operations', icon: Settings,
      subItems: [
        { href: '/admin/administrative', label: 'nav.administrative' },
        { href: '/admin/finances', label: 'nav.finances', also: ['/admin/fees'] },
        { href: '/admin/internships', label: 'nav.internships' },
        { href: '/admin/student-life', label: 'nav.student_life' },
        { href: '/admin/integrations/lti', label: 'LMS integration' },
      ]
    },
    { href: '/admin/insights', label: 'Insights', icon: BarChart3, also: ['/admin/analytics', '/admin/reports', '/admin/impact-metrics'] },
    {
      label: 'nav.campus_monitoring', icon: Shield,
      subItems: [
        { href: '/admin/monitoring/rooms', label: 'nav.room_bookings' },
        { href: '/admin/monitoring/associations', label: 'nav.associations', also: ['/admin/monitoring/events', '/admin/monitoring/lost-found'] },
      ]
    },
    { href: '/admin/inbox', label: 'nav.messages', icon: MessageSquare, also: ['/calls', '/admin/announcements'] },
    { href: '/boards', label: 'Collaborate', icon: PenTool, also: ['/code', '/tasks', '/docs', '/spaces'] },
    { href: '/admin/billing', label: 'Billing & plans', icon: Crown },
    { href: '/admin/settings', label: 'nav.settings', icon: Settings },
  ],
};

function NavItemComponent({ 
  item, 
  pathname, 
  onClose,
  isOpen,
  onToggle
}: { 
  item: NavItem; 
  pathname: string; 
  onClose?: () => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useLanguageStore();
  const hasActiveChild = item.subItems?.some(sub => isOn(pathname, sub.href, sub.also) || pathname.startsWith(sub.href + '/'));
  const active = pathname === item.href || (item.href && item.href !== '/' && pathname.startsWith(item.href)) || hasActiveChild;

  if (item.subItems) {
    return (
      <div className="space-y-1">
        <button
          onClick={onToggle}
          aria-expanded={isOpen}
          className={cn('sidebar-item w-full justify-between', active && !isOpen && 'active')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
            <span>{t(item.label)}</span>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 transition-transform duration-300', !isOpen && '-rotate-90')} strokeWidth={2.5} />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="sub"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.smooth}
              className="overflow-hidden"
            >
              <div className="pl-[1.875rem] space-y-0.5 pt-0.5">
                {item.subItems.map(sub => {
                  const on = isOn(pathname, sub.href, sub.also);
                  return (
                    <Link key={sub.href} href={sub.href} data-vt="fade" onClick={onClose} aria-current={on ? 'page' : undefined}
                      className={cn('sidebar-item pill-host relative block text-[15px] py-1.5', on && 'active')}>
                      {on && <motion.span layoutId="sidebar-pill" transition={spring.snappy} className="sidebar-pill" />}
                      <span className="relative block truncate">{t(sub.label)}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (item.action) {
    return (
      <button className="sidebar-item w-full justify-start">
        <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
        <span>{t(item.label)}</span>
      </button>
    );
  }

  if (item.href) {
    const on = isOn(pathname, item.href, item.also);
    return (
      <Link href={item.href} data-vt="fade" onClick={onClose} aria-current={on ? 'page' : undefined}
        className={cn('sidebar-item pill-host relative block', on && 'active')}>
        {on && <motion.span layoutId="sidebar-pill" transition={spring.snappy} className="sidebar-pill" />}
        <div className="relative flex items-center gap-3">
          <item.icon className="w-[18px] h-[18px] flex-shrink-0 text-tint-text" strokeWidth={2} />
          <span>{t(item.label)}</span>
        </div>
      </Link>
    );
  }

  return null;
}


export function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const { user, logout } = useAuthStore();
  // The tapped entry lights up at once, not when its page has downloaded.
  const pathname = useOptimisticPath(usePathname());
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { t } = useLanguageStore();

  // Lock background scrolling while the mobile navigation sheet is open.
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('scroll-locked');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('scroll-locked');
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!user) return null;

  // The owner console link exists only for the owner (the console itself answers "not found" to anyone else).
  const base = user.owner ? [{ href: '/console', label: 'Owner console', icon: ShieldCheck }, ...(navByRole[user.role] ?? [])] : navByRole[user.role] ?? [];
  const nav = user.role === 'TEACHER' ? withOffice(base, user) : base;
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try {
      const { auth } = await import('@/lib/firebase');
      await auth.signOut();
    } catch (error) {
      console.warn('Firebase signOut failed:', error);
    }
    logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile backdrop (fades in/out; sits above the mobile header and tab bar) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[95] bg-black/50 lg:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      <aside
        aria-label="Navigation"
        className={cn(
          "fixed left-0 top-0 bottom-0 w-[min(84vw,320px)] lg:w-64 glass-sidebar border-r border-[var(--sidebar-border)] flex flex-col z-[100] lg:z-50 sheet-safe-top lg:pt-0 rounded-r-[28px] lg:rounded-none",
          "transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl lg:shadow-none" : "-translate-x-full"
        )}
      >
        {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16">
        <UniverseLogo size="md" animated={false} withGlow={false} />
        <div className="min-w-0">
          <div className="font-bold text-[17px] leading-tight tracking-tight text-zinc-900 dark:text-white">UniVerse</div>
          <div className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium">{user.owner ? 'Owner' : user.role === 'ADMIN' ? 'Admin' : user.role === 'TEACHER' ? 'Teacher' : 'Student'}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto min-h-0 px-3 pb-4 space-y-0.5 custom-scrollbar">
        {nav.map((item, i) => (
          <NavItemComponent 
            key={i} 
            item={item} 
            pathname={pathname} 
            onClose={onClose}
            isOpen={openIndex === i || (item.subItems?.some(sub => isOn(pathname, sub.href, sub.also) || pathname.startsWith(sub.href + '/')) && openIndex === null) ? true : false}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </nav>

      {/* User */}
      <div className="px-3 pt-3 sheet-safe-bottom lg:pb-4" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#a5abb8] to-[#848993] flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-zinc-900 dark:text-white truncate">{user.name}</div>
            <div className="text-[12px] text-zinc-500 truncate">{user.email}</div>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-[15px] text-[var(--ios-red)] hover:bg-[var(--fill)] transition-colors">
          <LogOut className="w-[18px] h-[18px]" />
          <span>{t('nav.logout')}</span>
        </button>
        <div className="px-3 pt-2 pb-1 flex gap-3 text-[12px] text-zinc-400 dark:text-zinc-500">
          <Link href="/terms" target="_blank" className="hover:text-tint-text">Terms</Link>
          <Link href="/privacy" target="_blank" className="hover:text-tint-text">Privacy</Link>
          <Link href="/policies" target="_blank" className="hover:text-tint-text">Policies</Link>
          <Link href="/contact" target="_blank" className="hover:text-tint-text">Contact</Link>
        </div>
      </div>
    </aside>
    </>
  );
}
