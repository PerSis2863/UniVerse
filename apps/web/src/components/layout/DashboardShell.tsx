'use client';
import { Fragment, useEffect, useState } from 'react';
import { SampleModeBar } from '@/components/SampleMode';
import { useSampleMode } from '@/lib/sample-mode';
import { Sidebar } from './Sidebar';
import {
  LayoutDashboard, BookOpen, MessageSquare, Bell, Search, Globe2, Users, ShieldCheck, Menu,
} from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { AIStudyAssistant } from '@/components/ui/AIStudyAssistant';
import { CommandPalette, openCommandPalette } from '@/components/ui/CommandPalette';
import { useAuthStore } from '@/store/auth';
import { usePathname } from 'next/navigation';
import Link from '@/components/ui/Link';
import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { OfflineBar } from '@/components/pwa/OfflineBar';
import { PushNotificationManager } from '@/components/pwa/PushNotificationManager';
import { IncomingCall } from '@/components/chat/IncomingCall';

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
        { href: '/teacher/students', label: 'Students', icon: Users, match: ['/teacher/students', '/teacher/early-warning'] },
        { href: '/teacher/inbox', label: 'Messages', icon: MessageSquare },
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
        { href: '/admin/inbox', label: 'Messages', icon: MessageSquare },
      ],
    };
  }
  return {
    base: '/student',
    items: [
      { href: '/student', label: 'Home', icon: LayoutDashboard },
      { href: '/student/impact/ngo-marketplace', label: 'Impact', icon: Globe2, match: ['/student/impact', '/student/credentials', '/student/passport'] },
      { href: '/student/courses', label: 'Courses', icon: BookOpen },
      { href: '/student/inbox', label: 'Messages', icon: MessageSquare },
    ],
  };
}

/** iOS-style tab bar. The last tab ("More") opens the full navigation sheet. */
function MobileTabBar({ role, onMore, moreOpen }: { role: string; onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();
  const { base, items } = tabsForRole(role);

  const isActive = (item: TabItem) => {
    if (item.href === base) return pathname === base;
    const prefixes = item.match ?? [item.href];
    return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
  };

  return (
    <nav
      aria-label="Primary"
      className="mobile-tabbar lg:hidden fixed bottom-0 inset-x-0 z-[35] border-t border-indigo-100 dark:border-white/[0.08] glass-bar"
    >
      <div className="grid grid-cols-5 h-[var(--mobile-tabbar-h)]">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable relative flex flex-col items-center justify-center gap-0.5 select-none transition-colors',
                active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400',
              )}
            >
              {active && (
                <motion.span
                  layoutId="tabbar-pill"
                  transition={spring.snappy}
                  aria-hidden
                  className="absolute top-1 h-8 w-14 rounded-full bg-indigo-500/12 dark:bg-indigo-400/15"
                />
              )}
              <item.icon className="relative w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 1.9} />
              <span className={cn('relative text-[10px] leading-none tracking-tight', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={cn(
            'pressable flex flex-col items-center justify-center gap-0.5 select-none',
            moreOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400',
          )}
        >
          <Menu className="w-[22px] h-[22px]" strokeWidth={moreOpen ? 2.4 : 1.9} />
          <span className={cn('text-[10px] leading-none tracking-tight', moreOpen ? 'font-semibold' : 'font-medium')}>More</span>
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

  // Close the navigation sheet whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const openSearch = () => {
    openCommandPalette();
  };
  const openNotifications = () => {
    window.dispatchEvent(new CustomEvent('universe:open-notifications'));
  };

  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Mobile navigation bar (fixed, translucent, respects the notch) */}
        <header className="mobile-header lg:hidden fixed top-0 inset-x-0 z-[35] flex items-center justify-between border-b border-indigo-100 dark:border-white/[0.08] glass-bar">
          <Link href={tabsForRole(user?.role ?? 'STUDENT').base} className="flex items-center gap-2 min-w-0 pressable" aria-label="Home">
            <UniverseLogo size="sm" showText={false} animated={false} withGlow={false} />
            <span className="font-black text-[17px] tracking-tight text-zinc-900 dark:text-white">
              Uni<span className="bg-gradient-to-r from-indigo-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">Verse</span>
            </span>
          </Link>
          <div className="flex items-center">
            <button type="button" onClick={openSearch} aria-label="Search" className="pressable w-11 h-11 flex items-center justify-center rounded-full text-zinc-600 dark:text-zinc-300">
              <Search className="w-[21px] h-[21px]" />
            </button>
            <button type="button" onClick={openNotifications} aria-label="Notifications" className="pressable relative w-11 h-11 flex items-center justify-center rounded-full text-zinc-600 dark:text-zinc-300">
              <Bell className="w-[21px] h-[21px]" />
              <span className="absolute top-[11px] right-[11px] w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-[#0b0f1c]" />
            </button>
          </div>
        </header>

        <main className="mobile-main flex-1 flex flex-col min-w-0 overflow-x-clip">
          <SampleModeBar />
          {/* Re-mount pages when switching between sample and real data so they reload from the right source */}
          <Fragment key={sampleMode ? 'sample' : 'real'}>{children}</Fragment>
        </main>
      </div>

      {/* The floating assistant would cover the chat composer on the Messages page */}
      {!pathname.endsWith('/inbox') && <AIStudyAssistant />}
      <CommandPalette role={user?.role} />
      {user && <MobileTabBar role={user.role} onMore={() => setSidebarOpen((v) => !v)} moreOpen={sidebarOpen} />}
      <OfflineBar />
      <InstallBanner />
      {user && <PushNotificationManager />}
      {user && <IncomingCall inboxPath={`${tabsForRole(user.role).base}/inbox`} />}
    </div>
  );
}
