'use client';
import { Fragment, useEffect, useState } from 'react';
import { SampleModeBar } from '@/components/SampleMode';
import { useSampleMode } from '@/lib/sample-mode';
import { Sidebar } from './Sidebar';
import {
  LayoutDashboard, BookOpen, MessageSquare, Bell, Search, Globe2, Users, ShieldCheck, Menu,
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { openCommandPalette } from '@/lib/palette';
import { DeferredShell } from './DeferredShell';
import { useAuthStore } from '@/store/auth';
import { usePathname } from 'next/navigation';
import Link from '@/components/ui/Link';
import { m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { OfflineBar } from '@/components/pwa/OfflineBar';
import { IncomingCall } from '@/components/chat/IncomingCall';
import { useOptimisticPath } from '@/lib/nav-pending';
import { usePageTitle, useScrollEdges } from '@/lib/chrome';
import { haptic } from '@/lib/haptics';
import { authedJson } from '@/lib/authed-fetch';
import useSWR from 'swr';
import { PendingPage } from './PendingPage';
import { PullToRefresh } from './PullToRefresh';

interface DashboardShellProps {
  children: React.ReactNode;
}

type TabItem = { href: string; label: string; icon: typeof LayoutDashboard; match?: string[] };

function tabsForRole(role: string): { base: string; items: TabItem[] } {
  if (role === 'TEACHER') {
    return {
      base: '/teacher',
      items: [
        { href: '/teacher', label: 'Home', icon: LayoutDashboard },
        { href: '/teacher/courses', label: 'Courses', icon: BookOpen },
        { href: '/teacher/students', label: 'Students', icon: Users, match: ['/teacher/students', '/teacher/early-warning', '/teacher/analytics'] },
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

/**
 * iOS tab bar: a floating, frosted capsule (iOS 26). The chosen tab sits on a soft capsule that
 * springs between tabs; the last tab ("More") opens the full navigation sheet.
 */
function MobileTabBar({ role, onMore, moreOpen }: { role: string; onMore: () => void; moreOpen: boolean }) {
  // The tapped tab lights up at once, not when its page has downloaded.
  const pathname = useOptimisticPath(usePathname());
  const { base, items } = tabsForRole(role);

  const isActive = (item: TabItem) => {
    if (item.href === base) return pathname === base || !!item.match?.includes(pathname);
    const prefixes = item.match ?? [item.href];
    return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
  };
  const tab = 'relative flex flex-col items-center justify-center gap-[3px] select-none rounded-full transition-colors';

  return (
    <nav aria-label="Primary" className="ios-tabbar ios-glass lg:hidden z-[35] p-1">
      <div className="grid grid-cols-5 h-full">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-vt="fade"
              aria-current={active ? 'page' : undefined}
              onClick={() => { if (!active) haptic('tap'); }}
              className={cn(tab, active ? 'text-tint-text' : 'text-zinc-600 dark:text-zinc-300')}
            >
              {active && (
                <motion.span layoutId="tabbar-pill" transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/[0.18] to-fuchsia-500/[0.14] dark:from-indigo-500/[0.38] dark:to-fuchsia-500/[0.26] ring-1 ring-indigo-400/20" />
              )}
              <item.icon className="relative w-[23px] h-[23px]" strokeWidth={active ? 2.3 : 1.8} />
              <span className={cn('relative text-[10px] leading-none', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => { haptic('tap'); onMore(); }}
          aria-expanded={moreOpen}
          className={cn(tab, moreOpen ? 'text-tint-text' : 'text-zinc-600 dark:text-zinc-300')}
        >
          {moreOpen && <motion.span layoutId="tabbar-pill" transition={spring.snappy} aria-hidden className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/[0.18] to-fuchsia-500/[0.14] dark:from-indigo-500/[0.38] dark:to-fuchsia-500/[0.26] ring-1 ring-indigo-400/20" />}
          <Menu className="relative w-[23px] h-[23px]" strokeWidth={moreOpen ? 2.3 : 1.8} />
          <span className={cn('relative text-[10px] leading-none', moreOpen ? 'font-semibold' : 'font-medium')}>More</span>
        </button>
      </div>
    </nav>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const sampleMode = useSampleMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuthStore();
  const pathname = usePathname();
  const openingPath = useOptimisticPath(pathname);
  const pageTitle = usePageTitle();
  useScrollEdges(pathname);
  // The unread count from the notifications list the page's Topbar already loaded (no extra request).
  const { data: notes } = useSWR<{ read: boolean }[]>(user ? '/api/notifications' : null, authedJson, { revalidateOnMount: false, revalidateOnFocus: false, revalidateIfStale: false });
  const unread = Array.isArray(notes) ? notes.filter((n) => !n.read).length : 0;

  // Close the navigation sheet as soon as a page in it is tapped (and on any route change).
  useEffect(() => {
    setSidebarOpen(false);
  }, [openingPath]);

  const openSearch = () => {
    openCommandPalette();
  };
  const openNotifications = () => {
    window.dispatchEvent(new CustomEvent('universe:open-notifications'));
  };

  return (
    <div className="shell-in flex min-h-[100dvh]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Mobile navigation bar (iOS): clear at the top, frosted once content scrolls under it; the
            brand gives way to the page's title when its large title has scrolled away. */}
        <header className="mobile-header nav-edge lg:hidden fixed top-0 inset-x-0 z-[35] flex items-center justify-between">
          <Link href={tabsForRole(user?.role ?? 'STUDENT').base} className="flex items-center gap-2 min-w-0 pressable" aria-label="Home">
            <UniverseLogo size="sm" showText={false} animated={false} withGlow={false} />
            <span className="nav-brand-text font-bold text-[17px] tracking-tight text-zinc-900 dark:text-white">UniVerse</span>
          </Link>
          {pageTitle && (
            <span aria-hidden className="nav-inline-title absolute left-1/2 -translate-x-1/2 max-w-[52%] truncate text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white" style={{ top: 'calc(var(--safe-top) + 0.875rem)' }}>{pageTitle}</span>
          )}
          <div className="flex items-center">
            <button type="button" onClick={openSearch} aria-label="Search" className="pressable w-11 h-11 flex items-center justify-center rounded-full text-tint-text">
              <Search className="w-[21px] h-[21px]" strokeWidth={2.1} />
            </button>
            <button type="button" onClick={openNotifications} aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'} className="pressable relative w-11 h-11 flex items-center justify-center rounded-full text-tint-text">
              <Bell className="w-[21px] h-[21px]" strokeWidth={2.1} />
              {unread > 0 && <span className="absolute top-[9px] right-[8px] min-w-[16px] h-4 px-1 rounded-full bg-[var(--ios-red)] text-white text-[10px] font-bold leading-4 text-center">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
        </header>

        <main className="mobile-main flex-1 flex flex-col min-w-0 overflow-x-clip">
          <SampleModeBar />
          {/* Re-mount pages when switching between sample and real data so they reload from the right source */}
          <Fragment key={sampleMode ? 'sample' : 'real'}><PendingPage>{children}</PendingPage></Fragment>
        </main>
      </div>

      {/* The floating assistant would cover the chat composer on the Messages page */}
      <DeferredShell role={user?.role} showAssistant={!pathname.endsWith('/inbox')} signedIn={!!user} />
      {user && <MobileTabBar role={user.role} onMore={() => setSidebarOpen((v) => !v)} moreOpen={sidebarOpen} />}
      <OfflineBar />
      <PullToRefresh />
      <InstallBanner />
      {user && <IncomingCall inboxPath={`${tabsForRole(user.role).base}/inbox`} />}
    </div>
  );
}
