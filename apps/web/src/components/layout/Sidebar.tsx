'use client';
import Link from '@/components/ui/Link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { BarChart3, PenTool, ShieldCheck } from 'lucide-react';
import {
  LayoutDashboard, Users,
  MessageSquare, Settings, LogOut,
  GraduationCap, Brain,
  AlertTriangle, Folder, ChevronDown, ChevronRight,
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
  icon: any;
  subItems?: { href: string; label: string; also?: string[] }[];
  action?: string;
  /** Other pages that count as this entry (tabs of the same section). */
  also?: string[];
};

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
  ],
  TEACHER: [
    { href: '/teacher/tutor', label: 'AI tutor', keywords: 'ai course sources flashcards' },
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
  ],
  ADMIN: [
    { href: '/calls', label: 'Calls', keywords: 'call log phone video voice history missed' },
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
        { href: '/boards', label: 'Collaborate', also: ['/code'] },
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
        { href: '/student/impact/ngo-marketplace', label: 'Opportunities', also: ['/student/impact/startups', '/student/impact/companies'] },
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
        { href: '/teacher/collaborations', label: 'nav.inter_uni_research' },
        { href: '/teacher/collaborations/projects', label: 'nav.ngo_mentorship' },
        { href: '/teacher/mentorship', label: 'nav.volunteer_mentor' },
      ]
    },
    {
      label: 'nav.schooling', icon: GraduationCap,
      subItems: [
        { href: '/teacher/courses', label: 'nav.my_courses' },
        { href: '/teacher/blackboard', label: 'nav.blackboard', also: ['/teacher/tutor'] },
        { href: '/teacher/students', label: 'nav.students', also: ['/teacher/early-warning', '/teacher/analytics'] },
        { href: '/teacher/attendance', label: 'nav.attendance' },
        { href: '/teacher/grades', label: 'nav.grades' },
        { href: '/teacher/quizzes', label: 'nav.quizzes' },
        { href: '/teacher/assignments', label: 'Assignments' },
        { href: '/teacher/live', label: 'Live class' },
        { href: '/boards', label: 'Collaborate', also: ['/code'] },
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
        { href: '/admin/partnerships', label: 'nav.partner_institutions' },
        { href: '/admin/partners', label: 'nav.sponsor_portal' },
        { href: '/admin/impact-reports', label: 'Impact reports' },
        { href: '/admin/certifications', label: 'Certifications' },
        { href: '/admin/credentials', label: 'Credential Verification' },
      ]
    },
    // Management was 15 entries; now three short groups.
    {
      label: 'People', icon: Users,
      subItems: [
        { href: '/admin/users', label: 'nav.users' },
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
        { href: '/admin/finances', label: 'nav.finances' },
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
    { href: '/boards', label: 'Collaborate', icon: PenTool, also: ['/code'] },
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
          className={cn('sidebar-item w-full justify-between', active && !isOpen && 'active text-indigo-400')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span>{t(item.label)}</span>
          </div>
          <ChevronDown className={cn('w-4 h-4 transition-transform duration-300', !isOpen && '-rotate-90')} />
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
              <div className="pl-9 space-y-1 pt-1">
                {item.subItems.map(sub => {
                  const on = isOn(pathname, sub.href, sub.also);
                  return (
                    <Link key={sub.href} href={sub.href} onClick={onClose} aria-current={on ? 'page' : undefined}
                      className={cn('sidebar-item pill-host relative block text-sm py-1.5', on && 'active text-indigo-400')}>
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
      <button className="sidebar-item w-full justify-start text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span>{t(item.label)}</span>
      </button>
    );
  }

  if (item.href) {
    const on = isOn(pathname, item.href, item.also);
    return (
      <Link href={item.href} onClick={onClose} aria-current={on ? 'page' : undefined}
        className={cn('sidebar-item pill-host relative block', on && 'active')}>
        {on && <motion.span layoutId="sidebar-pill" transition={spring.snappy} className="sidebar-pill" />}
        <div className="relative flex items-center gap-3">
          <item.icon className="w-4 h-4 flex-shrink-0" />
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
  const nav = user.owner ? [{ href: '/console', label: 'Owner console', icon: ShieldCheck }, ...(navByRole[user.role] ?? [])] : navByRole[user.role] ?? [];
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
          "fixed left-0 top-0 bottom-0 w-[min(84vw,320px)] lg:w-64 glass-sidebar border-r border-indigo-100 dark:border-white/[0.07] flex flex-col z-[100] lg:z-50 sheet-safe-top lg:pt-0",
          "transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl lg:shadow-none" : "-translate-x-full"
        )}
      >
        {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-indigo-100 dark:border-white/[0.07]">
        <UniverseLogo size="md" animated={true} withGlow={true} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm tracking-tight text-zinc-900 dark:text-white">
              Uni<span className="bg-gradient-to-r from-indigo-500 via-pink-500 to-amber-500 dark:from-indigo-400 dark:via-pink-400 dark:to-amber-400 bg-clip-text text-transparent">Verse</span>
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-amber-500/20 text-indigo-300 font-bold border border-indigo-400/30">
              IMPACT
            </span>
          </div>
          <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            {user.owner ? 'OWNER' : user.role} PORTAL
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-1 custom-scrollbar">
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
      <div className="px-3 pt-4 sheet-safe-bottom lg:pb-4 border-t border-zinc-200 dark:border-white/[0.06]">

        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-900 dark:text-white truncate group-hover:text-indigo-400 transition-colors flex items-center justify-between">
              {user.name}
              <ChevronRight className="w-4 h-4 opacity-50" />
            </div>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-zinc-500 dark:text-zinc-500 hover:text-rose-400 hover:bg-rose-900/20 transition-all text-sm">
          <LogOut className="w-4 h-4" />
          <span>{t('nav.logout')}</span>
        </button>
        <div className="px-3 pt-2 pb-1 flex gap-3 text-[11px] text-zinc-400 dark:text-zinc-600">
          <Link href="/terms" target="_blank" className="hover:text-indigo-400">Terms</Link>
          <Link href="/privacy" target="_blank" className="hover:text-indigo-400">Privacy</Link>
          <Link href="/policies" target="_blank" className="hover:text-indigo-400">Policies</Link>
          <Link href="/contact" target="_blank" className="hover:text-indigo-400">Contact</Link>
        </div>
      </div>
    </aside>
    </>
  );
}
