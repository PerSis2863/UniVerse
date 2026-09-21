'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  LayoutDashboard, Users,
  MessageSquare, Bell, Settings, LogOut,
  GraduationCap, Brain, ClipboardList, Calendar as CalendarIcon,
  Info, AlertTriangle, Globe, Folder, Search, Link as LinkIcon, ChevronDown, ChevronRight,
  Coffee, Shield, Map, Globe2, Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { motion } from 'framer-motion';
import { useLanguageStore } from '@/store/language';

type NavItem = {
  href?: string;
  label: string;
  icon: any;
  subItems?: { href: string; label: string }[];
  action?: string;
};

const navByRole: Record<string, NavItem[]> = {
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
        { href: '/student/impact/startups', label: 'nav.startups' },
        { href: '/student/impact/ngo-marketplace', label: 'nav.ngo_marketplace' },
        { href: '/student/impact/edu-society', label: 'nav.edu_society' },
        { href: '/student/impact/companies', label: 'nav.companies' },
        { href: '/student/impact/leaderboard', label: 'nav.leaderboard' },
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
    { href: '/student/inbox', label: 'nav.inbox', icon: MessageSquare },
    { href: '/student/community', label: 'nav.community', icon: Users },
    { href: '/student/support', label: 'nav.support', icon: Settings },
    { href: '/student/beesafe', label: 'nav.beesafe', icon: AlertTriangle },
    { href: '/student/settings?section=language', label: 'nav.settings', icon: Globe },
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
      ]
    },
    {
      label: 'nav.management', icon: Settings,
      subItems: [
        { href: '/admin/users', label: 'nav.users' },
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
    { href: '/admin/announcements', label: 'nav.announcements', icon: Bell },
    { href: '/admin/inbox', label: 'nav.messages', icon: MessageSquare },
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
  const hasActiveChild = item.subItems?.some(sub => pathname === sub.href || pathname.startsWith(sub.href + '/'));
  const active = pathname === item.href || (item.href && item.href !== '/' && pathname.startsWith(item.href)) || hasActiveChild;

  if (item.subItems) {
    return (
      <div className="space-y-1">
        <motion.button
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          onClick={onToggle}
          className={cn('sidebar-item w-full justify-between', active && !isOpen && 'active text-indigo-400')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span>{t(item.label)}</span>
          </div>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </motion.button>
        {isOpen && (
          <div className="pl-9 space-y-1 mt-1">
            {item.subItems.map(sub => (
              <Link key={sub.href} href={sub.href} onClick={onClose} passHref legacyBehavior>
                <motion.a 
                  whileHover={{ x: 4 }}
                  className={cn('sidebar-item block text-sm py-1.5', pathname === sub.href && 'active text-indigo-400')}>
                  <span>{t(sub.label)}</span>
                </motion.a>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.action) {
    return (
      <motion.button 
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        className="sidebar-item w-full justify-start text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white">
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span>{t(item.label)}</span>
      </motion.button>
    );
  }

  if (item.href) {
    return (
      <Link href={item.href} onClick={onClose} passHref legacyBehavior>
        <motion.a 
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={cn('sidebar-item block', pathname === item.href && 'active')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span>{t(item.label)}</span>
          </div>
        </motion.a>
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

  if (!user) return null;

  const nav = navByRole[user.role] ?? [];
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}
      
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-[#0d1424]/90 backdrop-blur-xl border-r border-zinc-200 dark:border-white/[0.06] flex flex-col z-50 transition-transform duration-300 lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-zinc-200 dark:border-white/[0.06] bg-gradient-to-r from-indigo-50 dark:from-indigo-950/20 via-transparent to-transparent">
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
      <div className="px-3 py-4 border-t border-zinc-200 dark:border-white/[0.06]">
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
