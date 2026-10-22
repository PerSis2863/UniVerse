'use client';
import { MiniPlayer } from '@/components/chat/MiniPlayer';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SampleModeBar } from '@/components/SampleMode';
import { useSampleMode } from '@/lib/sample-mode';
import { Sidebar } from './Sidebar';
import { Bell, ChevronLeft, Search, Menu, Plus } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { openCommandPalette } from '@/lib/palette';
import { DeferredShell } from './DeferredShell';
import { useAuthStore } from '@/store/auth';
import { usePathname } from 'next/navigation';
import Link from '@/components/ui/Link';
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
import { AppSkeleton } from './AppSkeleton';
import { entrancePending, playAppEntrance } from '@/lib/app-entrance';
import { isTabRoot, tabsForRole, type TabItem } from '@/lib/app-tabs';
import { goBack } from '@/lib/app-nav';
import { useSectionRoot } from '@/lib/chrome';
import { useRouter } from 'next/navigation';
import { SwipeBack } from './SwipeBack';
import { PullToRefresh } from './PullToRefresh';
import dynamic from 'next/dynamic';

// The "+" menu (Stage 5 · Q8), loaded when it's opened.
// The main tabs are downloaded once per visit, when the app is idle (see DashboardShell).
let tabsPrefetched = false;

const QuickCreate = dynamic(() => import('./QuickCreate').then((m) => m.QuickCreate), { ssr: false });

interface DashboardShellProps {
  children: React.ReactNode;
}

/**
 * iOS tab bar: a floating, frosted capsule (iOS 26). The chosen tab sits on a soft capsule that
 * springs between tabs; the last tab ("More") opens the full navigation sheet.
 */
function MobileTabBar({ role, onMore, moreOpen, onCreate, createOpen }: { role: string; onMore: () => void; moreOpen: boolean; onCreate?: () => void; createOpen: boolean }) {
  // The tapped tab lights up at once, not when its page has downloaded.
  const pathname = useOptimisticPath(usePathname());
  const { base, items } = tabsForRole(role);

  const isActive = (item: TabItem) => {
    if (item.href === base) return pathname === base || !!item.match?.includes(pathname);
    const prefixes = item.match ?? [item.href];
    return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
  };
  const tab = 'relative flex flex-col items-center justify-center gap-[3px] select-none rounded-full transition-colors';
  // The capsule under the chosen tab: one element that slides by its column with a CSS transition
  // (on the GPU). A shared-layout animation instead made framer-motion measure the page and every
  // animated element on each frame of the slide, while the new page was drawing.
  const cols = items.length + 1 + (onCreate ? 1 : 0);
  const activeIndex = items.findIndex(isActive);
  const column = moreOpen ? cols - 1 : activeIndex < 0 ? -1 : activeIndex + (onCreate && activeIndex >= 2 ? 1 : 0);

  return (
    <nav aria-label="Primary" className="ios-tabbar ios-glass lg:hidden z-[35] p-1">
      <div className={cn('relative grid h-full', onCreate ? 'grid-cols-6' : 'grid-cols-5')}>
        <span aria-hidden className="tabbar-pill absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-indigo-500/[0.18] to-fuchsia-500/[0.14] dark:from-indigo-500/[0.38] dark:to-fuchsia-500/[0.26] ring-1 ring-indigo-400/20"
          style={{ width: `${100 / cols}%`, '--col': Math.max(column, 0), opacity: column < 0 ? 0 : 1 } as React.CSSProperties} />
        {items.map((item, i) => {
          const active = isActive(item);
          return (
            <Fragment key={item.href}>
            {/* "+" (new message, document, task board, call, ask AI, scan a code) in the middle. */}
            {onCreate && i === 2 && (
              <button type="button" onClick={() => { haptic('tap'); onCreate(); }} aria-haspopup="dialog" aria-expanded={createOpen} aria-label="Quick create" className={cn(tab, 'text-zinc-600 dark:text-zinc-300')}>
                <span className="relative w-9 h-9 -my-1 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/30"><Plus className="w-[22px] h-[22px]" strokeWidth={2.4} /></span>
              </button>
            )}
            <Link
              href={item.href}
              data-vt="fade"
              data-tour-href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={() => { if (!active) haptic('tap'); }}
              className={cn(tab, active ? 'text-tint-text' : 'text-zinc-600 dark:text-zinc-300')}
            >
              <item.icon className="relative w-[23px] h-[23px]" strokeWidth={active ? 2.3 : 1.8} />
              <span className={cn('relative text-[10px] leading-none', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </Link>
            </Fragment>
          );
        })}
        <button
          type="button"
          data-tour="more"
          onClick={() => { haptic('tap'); onMore(); }}
          aria-expanded={moreOpen}
          className={cn(tab, moreOpen ? 'text-tint-text' : 'text-zinc-600 dark:text-zinc-300')}
        >
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
  const [creating, setCreating] = useState(false);
  const { user } = useAuthStore();
  const pathname = usePathname();
  const openingPath = useOptimisticPath(pathname);
  const pageTitle = usePageTitle();
  useScrollEdges(pathname);
  const router = useRouter();
  // Inner pages get a back button (and, in the installed iPhone app, the edge swipe): an installed
  // web app has no browser back button, so without it you could get stuck on an inner page.
  const sectionRoot = useSectionRoot();
  const home = tabsForRole(user?.role ?? 'STUDENT').base;
  const canGoBack = !!user && !isTabRoot(pathname, user.role) && sectionRoot !== pathname;
  const back = () => goBack(router, home);
  // The unread count from the notifications list the page's Topbar already loaded (no extra request).
  const { data: notes } = useSWR<{ read: boolean }[]>(user ? '/api/notifications' : null, authedJson, { revalidateOnMount: false, revalidateOnFocus: false, revalidateIfStale: false });
  const unread = Array.isArray(notes) ? notes.filter((n) => !n.read).length : 0;

  // Close the navigation sheet as soon as a page in it is tapped (and on any route change).
  const [sheetPath, setSheetPath] = useState(openingPath);
  if (sheetPath !== openingPath) {
    setSheetPath(openingPath);
    setSidebarOpen(false);
  }

  // Opening the app: the start-up placeholder stays behind the app for a moment and dissolves while
  // the app's parts glide into place over it (src/lib/app-entrance.ts), once per page load.
  const shellRef = useRef<HTMLDivElement>(null);
  const [bootCover, setBootCover] = useState(entrancePending);
  useLayoutEffect(() => { playAppEntrance(shellRef.current); }, []);

  // The main tabs download quietly once the app is idle, so a first tap on one opens at once and
  // its entrance glides straight away instead of waiting on the network (pages open without
  // prefetching otherwise, to keep requests low). One request each, from the cache; not in
  // low-data mode or with the browser's data saver on.
  const role = user?.role;
  useEffect(() => {
    if (!role || tabsPrefetched) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || document.documentElement.classList.contains('low-data')) return;
    const run = () => {
      tabsPrefetched = true;
      for (const t of tabsForRole(role).items) if (t.href !== window.location.pathname) router.prefetch(t.href);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(run, { timeout: 4000 }); return () => w.cancelIdleCallback?.(id); }
    const t = window.setTimeout(run, 2500);
    return () => window.clearTimeout(t);
  }, [role, router]);

  const openSearch = () => {
    openCommandPalette();
  };
  const openNotifications = () => {
    window.dispatchEvent(new CustomEvent('universe:open-notifications'));
  };

  return (
    <div ref={shellRef} className="shell-in flex min-h-[100dvh]">
      {bootCover && <div aria-hidden className="boot-cover" onAnimationEnd={(e) => { if (e.target === e.currentTarget) setBootCover(false); }}><AppSkeleton /></div>}
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 lg:ms-64 flex flex-col min-w-0">
        {/* Mobile navigation bar (iOS): clear at the top, frosted once content scrolls under it; the
            brand gives way to the page's title when its large title has scrolled away. */}
        <header className="mobile-header nav-edge lg:hidden fixed top-0 inset-x-0 z-[35] flex items-center justify-between">
          {canGoBack ? (
            <button type="button" onClick={back} aria-label="Back" className="pressable -ms-2 h-11 pe-3 flex items-center gap-0.5 rounded-full text-tint-text text-[17px]">
              <ChevronLeft className="w-7 h-7" strokeWidth={2.3} />
              <span className="nav-brand-text">Back</span>
            </button>
          ) : (
            <Link href={home} className="flex items-center gap-2 min-w-0 pressable" aria-label="UniVerse home">
              <UniverseLogo size="sm" showText={false} animated={false} withGlow={false} />
              <span className="nav-brand-text font-bold text-[17px] tracking-tight text-zinc-900 dark:text-white">UniVerse</span>
            </Link>
          )}
          {pageTitle && (
            <span aria-hidden className="nav-inline-title absolute left-1/2 -translate-x-1/2 max-w-[52%] truncate text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white" style={{ top: 'calc(var(--safe-top) + 0.875rem)' }}>{pageTitle}</span>
          )}
          <div className="flex items-center">
            <button type="button" data-tour="search" onClick={openSearch} aria-label="Search" className="pressable w-11 h-11 flex items-center justify-center rounded-full text-tint-text">
              <Search className="w-[21px] h-[21px]" strokeWidth={2.1} />
            </button>
            <button type="button" data-tour="notifications" onClick={openNotifications} aria-label={unread ? `Notifications, ${unread > 9 ? '9+' : unread} unread` : 'Notifications'} className="pressable relative w-11 h-11 flex items-center justify-center rounded-full text-tint-text">
              <Bell className="w-[21px] h-[21px]" strokeWidth={2.1} />
              {unread > 0 && <span aria-hidden className="absolute top-[9px] end-[8px] min-w-[16px] h-4 px-1 rounded-full badge-count text-white text-[10px] font-bold leading-4 text-center">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
        </header>

        <SwipeBack enabled={canGoBack} pathname={pathname} onBack={back} />
        <main id="main" tabIndex={-1} className="mobile-main flex-1 flex flex-col min-w-0 overflow-x-clip outline-none">
          <SampleModeBar />
          {/* Re-mount pages when switching between sample and real data so they reload from the right source */}
          <Fragment key={sampleMode ? 'sample' : 'real'}><PendingPage>{children}</PendingPage></Fragment>
        </main>
      </div>

      {/* The floating assistant would cover the chat composer on the Messages page */}
      <DeferredShell role={user?.role} showAssistant={!pathname.endsWith('/inbox')} signedIn={!!user} />
      {user && <MobileTabBar role={user.role} onMore={() => setSidebarOpen((v) => !v)} moreOpen={sidebarOpen} createOpen={creating} onCreate={user.role === 'GUARDIAN' ? undefined : () => setCreating(true)} />}
      {creating && user && <QuickCreate base={home} onClose={() => setCreating(false)} />}
      <OfflineBar />
      <PullToRefresh />
      <MiniPlayer />
      <InstallBanner />
      {user && <IncomingCall inboxPath={`${tabsForRole(user.role).base}/inbox`} />}
    </div>
  );
}
