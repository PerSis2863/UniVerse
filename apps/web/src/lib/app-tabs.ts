import { LayoutDashboard, BookOpen, MessageSquare, Globe2, Users, ShieldCheck, ScanLine, Wallet, Map, HandHeart, Leaf, Trophy } from 'lucide-react';
import { appFor, inboxFor } from './apps';

// The phone's tab bar for each app (src/lib/apps.ts; UniVersity's by role), and which pages count as top-level screens (no back button:
// the tab bar's own pages, and the pages it highlights). Shared by the shell, the back button and
// the swipe-back gesture.

export type TabItem = { href: string; label: string; icon: typeof LayoutDashboard; match?: string[] };

function campusTabs(role: string): { base: string; items: TabItem[] } {
  if (role === 'TEACHER') {
    return {
      base: '/teacher',
      items: [
        { href: '/teacher', label: 'Home', icon: LayoutDashboard },
        { href: '/teacher/courses', label: 'Courses', icon: BookOpen },
        { href: '/teacher/students', label: 'Students', icon: Users, match: ['/teacher/students', '/teacher/early-warning', '/teacher/analytics', '/teacher/mastery', '/teacher/meetings', '/teacher/forms'] },
        { href: '/teacher/inbox', label: 'Messages', icon: MessageSquare, match: ['/teacher/inbox', '/calls', '/notifications'] },
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
        { href: '/admin/inbox', label: 'Messages', icon: MessageSquare, match: ['/admin/inbox', '/calls', '/notifications'] },
      ],
    };
  }
  return {
    base: '/student',
    items: [
      { href: '/student', label: 'Home', icon: LayoutDashboard, match: ['/student/calendar', '/student/information'] },
      { href: '/student/impact/ngo-marketplace', label: 'Impact', icon: Globe2, match: ['/student/impact', '/student/credentials', '/student/passport'] },
      { href: '/student/courses', label: 'Courses', icon: BookOpen },
      { href: '/student/inbox', label: 'Messages', icon: MessageSquare, match: ['/student/inbox', '/calls', '/notifications'] },
    ],
  };
}


/** The tab bar for the app this page belongs to (UniVersity's by role when the page isn't in another app). */
export function tabsForRole(role: string, path?: string): { base: string; items: TabItem[] } {
  const app = path ? appFor(path)?.id : null;
  const inbox = inboxFor(role), messages: TabItem = { href: inbox, label: 'Messages', icon: MessageSquare, match: [inbox, '/calls', '/notifications'] };
  if (app === 'trace') return { base: '/trace', items: [
    { href: '/trace', label: 'Console', icon: ScanLine, match: ['/trace/campaigns', '/trace/radar', '/trace/insights', '/trace/brands'] },
    { href: '/trace/map', label: 'Map', icon: Globe2, match: ['/trace/tracking'] },
    { href: '/trace/wallet', label: 'Wallet', icon: Wallet },
    messages,
  ] };
  if (app === 'relief') return { base: '/relief', items: [{ href: '/relief', label: 'Map', icon: Map }, { href: '/relief/mine', label: 'Mine', icon: HandHeart }, messages] };
  if (app === 'green') return { base: '/green', items: [{ href: '/green', label: 'Impact', icon: Leaf }, { href: '/green/teams', label: 'Teams', icon: Trophy }, messages] };
  return campusTabs(role);
}

/** A top-level screen: one of the tab bar's pages (or a page it highlights as its own). */
export function isTabRoot(path: string, role: string): boolean {
  if (path === '/hub') return true;
  const { base, items } = tabsForRole(role, path);
  return path === base || items.some((i) => i.href === path || !!i.match?.includes(path));
}
