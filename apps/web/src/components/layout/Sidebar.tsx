'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  LayoutDashboard, BookOpen, Users, Calendar, BarChart3,
  FileText, MessageSquare, Bell, Settings, LogOut,
  GraduationCap, ClipboardList, Brain, Briefcase,
  Info, AlertTriangle, Maximize, Globe, Folder, Search, Link as LinkIcon, ChevronDown, ChevronRight,
  Coffee, Shield, Map, Globe2, HandHeart, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

type NavItem = {
  href?: string;
  label: string;
  icon: any;
  subItems?: { href: string; label: string }[];
  action?: string;
};

const navByRole: Record<string, NavItem[]> = {
  STUDENT: [
    { href: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/student/information', label: 'Information', icon: Info },
    { 
      label: 'Schooling', icon: GraduationCap, 
      subItems: [
        { href: '/student/courses', label: 'Courses' },
        { href: '/student/groups', label: 'Groups' },
        { href: '/student/internships', label: 'Internships' },
        { href: '/student/choices', label: 'My choices' },
        { href: '/student/attendance', label: 'Attendance' },
        { href: '/student/grades', label: 'Grades' },
        { href: '/student/calendar', label: 'Timetable' },
        { href: '/student/skills', label: 'Skills' },
      ]
    },
    { 
      label: 'Administrative data', icon: Folder,
      subItems: [
        { href: '/student/administrative/personal', label: 'Personal data' },
        { href: '/student/administrative/documents', label: 'School documents' },
        { href: '/student/administrative/accounting', label: 'Accounting' },
        { href: '/student/administrative/scholarships', label: 'Scholarships' },
        { href: '/student/administrative/consents', label: 'My consents' },
      ]
    },
    {
      label: 'Global Impact', icon: Globe2,
      subItems: [
        { href: '/student/impact/projects', label: 'Collaborative Projects' },
        { href: '/student/impact/partners', label: 'Universities & Partners' },
        { href: '/student/impact/dashboard', label: 'My Social Impact' },
        { href: '/student/impact/summits', label: 'Global Summits' },
      ]
    },
    {
      label: 'Student Life', icon: Coffee,
      subItems: [
        { href: '/student/life/associations', label: 'Associations' },
        { href: '/student/life/rooms', label: 'Room Reservation' },
        { href: '/student/life/medical', label: 'Medical & Disability' },
        { href: '/student/life/everyday', label: 'Everyday Life' },
        { href: '/student/life/financing', label: 'Financing' },
        { href: '/student/life/services', label: 'Using my services' },
      ]
    },
    {
      label: 'Search', icon: Search,
      subItems: [
        { href: '/student/search/directory', label: 'Student directory' },
        { href: '/student/search/internships', label: 'Internship history' },
      ]
    },
    {
      label: 'Links', icon: LinkIcon,
      subItems: [
        { href: '/student/links', label: 'Apps & Links' },
      ]
    },
    { href: '/student/inbox', label: 'Messages', icon: MessageSquare },
    { href: '/student/community', label: 'Community', icon: Users },
    { href: '/student/support', label: 'Support', icon: Settings },
    { href: '/student/beesafe', label: 'BeeSafe Reporting', icon: AlertTriangle },
    { action: 'language', label: 'Change language', icon: Globe },
  ],
  TEACHER: [
    { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
    {
      label: 'Global Collaborations', icon: Globe2,
      subItems: [
        { href: '/teacher/collaborations', label: 'Inter-Uni Research' },
        { href: '/teacher/collaborations/projects', label: 'NGO Mentorship' },
      ]
    },
    {
      label: 'Schooling', icon: GraduationCap,
      subItems: [
        { href: '/teacher/courses', label: 'My Courses' },
        { href: '/teacher/students', label: 'Students' },
        { href: '/teacher/attendance', label: 'Attendance' },
        { href: '/teacher/grades', label: 'Grades' },
        { href: '/teacher/quizzes', label: 'Quizzes' },
        { href: '/teacher/calendar', label: 'Timetable' },
      ]
    },
    {
      label: 'Campus Services', icon: Map,
      subItems: [
        { href: '/teacher/services/rooms', label: 'Room Reservation' },
      ]
    },
    { href: '/teacher/knowledge', label: 'Knowledge Hub', icon: Brain },
    { href: '/teacher/inbox', label: 'Messages', icon: MessageSquare },
  ],
  ADMIN: [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    {
      label: 'Global Impact', icon: Globe2,
      subItems: [
        { href: '/admin/partnerships', label: 'Partner Institutions' },
        { href: '/admin/impact-metrics', label: 'Impact Analytics' },
      ]
    },
    {
      label: 'Management', icon: Settings,
      subItems: [
        { href: '/admin/users', label: 'Users' },
        { href: '/admin/courses', label: 'Courses' },
        { href: '/admin/administrative', label: 'Administrative' },
        { href: '/admin/internships', label: 'Internships' },
        { href: '/admin/attendance', label: 'Attendance' },
        { href: '/admin/finances', label: 'Finances' },
        { href: '/admin/quizzes', label: 'Quizzes' },
        { href: '/admin/knowledge-hub', label: 'Knowledge Hub' },
        { href: '/admin/student-life', label: 'Student Life' },
      ]
    },
    {
      label: 'Campus Monitoring', icon: Shield,
      subItems: [
        { href: '/admin/monitoring/rooms', label: 'Room Bookings' },
        { href: '/admin/monitoring/associations', label: 'Associations' },
        { href: '/admin/timetable', label: 'Timetable Management' },
      ]
    },
    { href: '/admin/announcements', label: 'Announcements', icon: Bell },
    { href: '/admin/inbox', label: 'Messages', icon: MessageSquare },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ],
};

function NavItemComponent({ item, pathname }: { item: NavItem, pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const hasActiveChild = item.subItems?.some(sub => pathname === sub.href || pathname.startsWith(sub.href + '/'));
  const active = pathname === item.href || (item.href && item.href !== '/' && pathname.startsWith(item.href)) || hasActiveChild;

  if (item.subItems) {
    return (
      <div className="space-y-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn('sidebar-item w-full justify-between', active && !isOpen && 'active text-indigo-400')}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span>{item.label}</span>
          </div>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {isOpen && (
          <div className="pl-9 space-y-1 mt-1">
            {item.subItems.map(sub => (
              <Link key={sub.href} href={sub.href}>
                <div className={cn('sidebar-item text-sm py-1.5', pathname === sub.href && 'active text-indigo-400')}>
                  <span>{sub.label}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.action) {
    return (
      <button className="sidebar-item w-full justify-start text-zinc-400 hover:text-white">
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span>{item.label}</span>
      </button>
    );
  }

  if (item.href) {
    return (
      <Link href={item.href}>
        <div className={cn('sidebar-item', pathname === item.href && 'active')}>
          <item.icon className="w-4 h-4 flex-shrink-0" />
          <span>{item.label}</span>
        </div>
      </Link>
    );
  }

  return null;
}

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) return null;

  const nav = navByRole[user.role] ?? [];
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0d1424]/90 backdrop-blur-xl border-r border-white/[0.06] flex flex-col z-40">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/[0.06] bg-gradient-to-r from-indigo-950/20 via-transparent to-transparent">
        <UniverseLogo size="md" animated={true} withGlow={true} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm tracking-tight text-white">
              Uni<span className="bg-gradient-to-r from-indigo-400 via-pink-400 to-amber-400 bg-clip-text text-transparent">Verse</span>
            </span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-amber-500/20 text-indigo-300 font-bold border border-indigo-400/30">
              IMPACT
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 font-medium tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            {user.role} PORTAL
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {nav.map((item, i) => (
          <NavItemComponent key={i} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors flex items-center justify-between">
              {user.name}
              <ChevronRight className="w-4 h-4 opacity-50" />
            </div>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-900/20 transition-all text-sm">
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
