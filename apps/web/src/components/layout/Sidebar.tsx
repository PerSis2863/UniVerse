'use client';
import Link from '@/components/ui/Link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Compass } from 'lucide-react';
import {
  LayoutDashboard, Users,
  MessageSquare, Bell, Settings, LogOut,
  GraduationCap, Brain, ClipboardList, Calendar as CalendarIcon,
  Info, AlertTriangle, Globe, Folder, Search, Link as LinkIcon, ChevronDown, ChevronRight,
  Coffee, Shield, Map, Globe2, Layers, Award, Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { useLanguageStore } from '@/store/language';
import { auth } from '@/lib/firebase';

export type NavItem = {
  href?: string;
  label: string;
  icon: any;
  subItems?: { href: string; label: string }[];
  action?: string;
};

export const navByRole: Record<string, NavItem[]> = {
  STUDENT: [
    { href: '/student', label: 'nav.dashboard', icon: LayoutDashboard },
    { href: '/student/information', label: 'nav.information', icon: Info },
    { href: '/student/calendar', label: 'nav.calendar', icon: CalendarIcon },
    { 
      label: 'nav.schooling', icon: GraduationCap, 
      subItems: [
        { href: '/student/courses', label: 'nav.courses' },
        { href: '/student/groups', label: 'nav.groups' },
        { href: '/student/blackboard', label: 'nav.blackboard' },
        { href: '/student/internships', label: 'nav.internships' },
        { href: '/student/choices', label: 'nav.my_choices' },
        { href: '/student/attendance', label: 'nav.attendance' },
        { href: '/student/grades', label: 'nav.grades' },
        { href: '/student/quizzes', label: 'nav.quizzes' },
        { href: '/student/skills', label: 'nav.skills' },
      ]
    },
    { 
      label: 'nav.administrative_data', icon: Folder,
      subItems: [
        { href: '/student/administrative/personal', label: 'nav.personal_data' },
        { href: '/student/administrative/documents', label: 'nav.school_documents' },
        { href: '/student/administrative/accounting', label: 'nav.accounting' },
        { href: '/student/administrative/scholarships', label: 'nav.scholarships' },
        { href: '/student/administrative/consents', label: 'nav.my_consents' },
      ]
    },
    {
      label: 'nav.global_impact', icon: Globe2,
      subItems: [
        { href: '/student/impact/ai-match', label: '🤖 AI Project Match' },
        { href: '/student/credentials', label: '🛡️ Verified Credentials' },
        { href: '/student/impact/startups', label: 'nav.startups' },
        { href: '/student/impact/ngo-marketplace', label: 'nav.ngo_marketplace' },
        { href: '/student/impact/edu-society', label: 'nav.edu_society' },
        { href: '/student/impact/companies', label: 'nav.companies' },
        { href: '/student/impact/leaderboard', label: '🏆 Impact Leaderboard' },
      ]
    },
    {
      label: 'nav.student_life', icon: Coffee,
      subItems: [
        { href: '/student/life/associations', label: 'nav.associations' },
        { href: '/student/life/rooms', label: 'nav.room_reservation' },
        { href: '/student/life/medical', label: 'nav.medical_disability' },
        { href: '/student/life/everyday', label: 'nav.everyday_life' },
        { href: '/student/life/financing', label: 'nav.financing' },
      ]
    },
    {
      label: 'nav.search', icon: Search,
      subItems: [
        { href: '/student/search/directory', label: 'nav.student_directory' },
        { href: '/student/search/internships', label: 'nav.internship_history' },
      ]
    },
    {
      label: 'nav.links', icon: LinkIcon,
      subItems: [
        { href: '/student/links', label: 'nav.apps_links' },
      ]
    },
    { href: '/student/knowledge-hub', label: 'nav.knowledge_hub', icon: Brain },
    { href: '/student/credentials', label: 'nav.credentials', icon: Award },
    { href: '/student/inbox', label: 'nav.inbox', icon: MessageSquare },
    { href: '/student/community', label: 'nav.community', icon: Users },
    { href: '/student/support', label: 'nav.support', icon: Settings },
    { href: '/student/beesafe', label: 'nav.beesafe', icon: AlertTriangle },
    { href: '/student/settings?section=language', label: 'nav.settings', icon: Globe },
    { href: '/explore', label: 'Explore modes', icon: Compass },
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
        { href: '/teacher/blackboard', label: 'nav.blackboard' },
        { href: '/teacher/students', label: 'nav.students' },
        { href: '/teacher/attendance', label: 'nav.attendance' },
        { href: '/teacher/grades', label: 'nav.grades' },
        { href: '/teacher/quizzes', label: 'nav.quizzes' },
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
    { href: '/teacher/inbox', label: 'nav.messages', icon: MessageSquare },
    { href: '/explore', label: 'Explore modes', icon: Compass },
  ],
  ADMIN: [
    { href: '/admin', label: 'nav.overview', icon: LayoutDashboard },
    {
      label: 'nav.global_impact', icon: Globe2,
      subItems: [
        { href: '/admin/partnerships', label: 'nav.partner_institutions' },
        { href: '/admin/partners', label: 'nav.sponsor_portal' },
        { href: '/admin/impact-metrics', label: 'nav.impact_analytics' },
        { href: '/admin/certifications', label: 'Certifications' },
        { href: '/admin/credentials', label: 'Credential Verification' },
      ]
    },
    {
      label: 'nav.management', icon: Settings,
      subItems: [
        { href: '/admin/users', label: 'nav.users' },
        { href: '/admin/approvals', label: 'Approvals' },
        { href: '/admin/audit', label: 'Activity Log' },
        { href: '/admin/courses', label: 'nav.courses' },
        { href: '/admin/administrative', label: 'nav.administrative' },
        { href: '/admin/internships', label: 'nav.internships' },
        { href: '/admin/attendance', label: 'nav.attendance' },
        { href: '/admin/finances', label: 'nav.finances' },
        { href: '/admin/quizzes', label: 'nav.quizzes' },
        { href: '/admin/knowledge-hub', label: 'nav.knowledge_hub' },
        { href: '/admin/student-life', label: 'nav.student_life' },
      ]
    },
    {
      label: 'nav.campus_monitoring', icon: Shield,
      subItems: [
        { href: '/admin/monitoring/rooms', label: 'nav.room_bookings' },
        { href: '/admin/monitoring/associations', label: 'nav.associations' },
        { href: '/admin/timetable', label: 'nav.timetable_management' },
      ]
    },
    {
      label: 'Premium', icon: Crown,
      subItems: [
        { href: '/admin/analytics', label: 'Advanced Analytics' },
        { href: '/admin/reports', label: 'Reports & Exports' },
        { href: '/admin/billing', label: 'Billing & Plans' },
      ]
    },
    { href: '/admin/announcements', label: 'nav.announcements', icon: Bell },
    { href: '/admin/inbox', label: 'nav.messages', icon: MessageSquare },
    { href: '/admin/settings', label: 'nav.settings', icon: Settings },
    { href: '/explore', label: 'Explore modes', icon: Compass },
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
  const hasActiveChild = item.subItems?.some(sub => pathname === sub.href || pathname.startsWith(sub.href + '/'));
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
                  const on = pathname === sub.href;
                  return (
                    <Link key={sub.href} href={sub.href} onClick={onClose} aria-current={on ? 'page' : undefined}
                      className={cn('sidebar-item pill-host relative block text-sm py-1.5', on && 'active text-indigo-400')}>
                      {on && <motion.span layoutId="sidebar-pill" transition={spring.snappy} className="sidebar-pill" />}
                      <span className="relative">{t(sub.label)}</span>
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
    const on = pathname === item.href;
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
  const pathname = usePathname();
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

  const nav = navByRole[user.role] ?? [];
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try {
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
            {user.role} PORTAL
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
            isOpen={openIndex === i || (item.subItems?.some(sub => pathname === sub.href || pathname.startsWith(sub.href + '/')) && openIndex === null) ? true : false}
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
      </div>
    </aside>
    </>
  );
}
