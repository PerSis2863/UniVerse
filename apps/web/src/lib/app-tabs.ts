import { LayoutDashboard, BookOpen, MessageSquare, Globe2, Users, ShieldCheck } from 'lucide-react';

// The phone's tab bar for each role, and which pages count as top-level screens (no back button:
// the tab bar's own pages, and the pages it highlights). Shared by the shell, the back button and
// the swipe-back gesture.

export type TabItem = { href: string; label: string; icon: typeof LayoutDashboard; match?: string[] };

export function tabsForRole(role: string): { base: string; items: TabItem[] } {
  if (role === 'TEACHER') {
    return {
      base: '/teacher',
      items: [
        { href: '/teacher', label: 'Home', icon: LayoutDashboard },
        { href: '/teacher/courses', label: 'Courses', icon: BookOpen },
        { href: '/teacher/students', label: 'Students', icon: Users, match: ['/teacher/students', '/teacher/early-warning', '/teacher/analytics', '/teacher/meetings', '/teacher/forms'] },
        { href: '/teacher/inbox', label: 'Messages', icon: MessageSquare, match: ['/teacher/inbox', '/calls'] },
      ],
    };
  }
  if (role === 'ADMIN') {
    return {
      base: '/admin',
      items: [
        { href: '/admin', label: 'Overview', icon: LayoutDashboard },
        { href: '/admin/users', label: 'Users', icon: Users },
        { href: '/admin/credentials', label: 'Verify', icon: ShieldCheck, match: ['/admin/credentials', '/admin/certifications'] },
        { href: '/admin/inbox', label: 'Messages', icon: MessageSquare, match: ['/admin/inbox', '/calls'] },
      ],
    };
  }
  return {
    base: '/student',
    items: [
      { href: '/student', label: 'Home', icon: LayoutDashboard, match: ['/student/calendar', '/student/information'] },
      { href: '/student/impact/ngo-marketplace', label: 'Impact', icon: Globe2, match: ['/student/impact', '/student/credentials', '/student/passport'] },
      { href: '/student/courses', label: 'Courses', icon: BookOpen },
      { href: '/student/inbox', label: 'Messages', icon: MessageSquare, match: ['/student/inbox', '/calls'] },
    ],
  };
}


/** A top-level screen: one of the tab bar's pages (or a page it highlights as its own). */
export function isTabRoot(path: string, role: string): boolean {
  const { base, items } = tabsForRole(role);
  return path === base || items.some((i) => i.href === path || !!i.match?.includes(path));
}
