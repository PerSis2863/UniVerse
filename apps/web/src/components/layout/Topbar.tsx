'use client';
import { useRouter } from 'next/navigation';
import { openCommandPalette } from '@/lib/palette';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Search, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ArrangeButton } from '@/components/ArrangeMode';
import { LanguageMenu } from './LanguageMenu';
import { useTopNav } from '@/lib/top-nav';
import { useMedia } from '@/lib/use-media';
import { AnimatePresence } from 'framer-motion';
import { useLanguageStore } from '@/store/language';
import useSWR from 'swr';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import dynamic from 'next/dynamic';

// M222: the notifications panel (Apple style) loads on its own, ahead of time once the page is idle, so the first
// open slides at once (M96: it was in every app page's first load).
const loadPanel = () => import('@/components/notifications/NotificationsPanel').then((m) => m.NotificationsPanel);
const NotificationsPanel = dynamic(loadPanel, { ssr: false });

type ApiNotification = { id: string; title: string; body: string; type: string; read: boolean; link: string | null; createdAt: string };

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  rightNode?: React.ReactNode;
  leftNode?: React.ReactNode;
  /** Hide the phone's row of actions under the bar (for full-screen pages like Messages that have their own header). */
  hideMobileTitle?: boolean;
  /** M210 (the owner, 16 Nov: "remove this part from every section … not needed in any apps"): the page's
   *  title is no longer shown, only read out (an sr-only heading, and the browser tab); the subtitle and the
   *  title's glide from a card (sharedId) are kept as props so pages needn't change. */
  sharedId?: string;
}

export function Topbar({ title, action, rightNode, leftNode, hideMobileTitle }: TopbarProps) {
  // The browser tab says which page this is ("Files | UniVerse Impact"), like the public pages' titles.
  useEffect(() => { if (title) document.title = `${title} | UniVerse Impact`; }, [title]);
  const router = useRouter();
  const { user } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const openPanel = () => setShowNotifications(true);
  const closePanel = useCallback(() => setShowNotifications(false), []);
  const { t } = useLanguageStore();
  // M219: on a computer's browser the bar across the top has the search, theme, language and bell: this bar
  // only shows the page's own controls, and isn't there when the page has none (no empty row under the bar).
  const top = useTopNav();
  // With the bar across the top, and on phones, a page's buttons sit at the end of its section tabs' row
  // (SectionTabs' `data-tabs-end`), so moving between a tab with buttons and one without never pushes the
  // tabs down. The installed app on a computer keeps them in its own bar, which is always there.
  const phone = useMedia('(max-width: 1023.98px)');
  const tabsRow = (top || phone) && !leftNode;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const findSlot = useCallback((el: HTMLSpanElement | null) => {
    setSlot(el && tabsRow ? el.parentElement?.querySelector<HTMLElement>('[data-tabs-end]') ?? null : null);
  }, [tabsRow]);


  // Its code arrives while the page is idle, so the first tap on the bell opens it at once.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(() => void loadPanel()); return () => w.cancelIdleCallback?.(id); }
    const t = window.setTimeout(() => void loadPanel(), 3000);
    return () => window.clearTimeout(t);
  }, []);

  // The mobile header's bell (DashboardShell) opens this drawer via a window event.
  useEffect(() => {
    const open = () => setShowNotifications(true);
    window.addEventListener('universe:open-notifications', open);
    return () => window.removeEventListener('universe:open-notifications', open);
  }, []);

  const notificationPoll = useLiveInterval(120_000, 0);
  const { data: apiNotifications, mutate: refreshNotifications } = useSWR<ApiNotification[]>(
    user ? '/api/notifications' : null,
    authedJson,
    // While live updates are connected they refresh this list, so remounting (e.g. another layout) doesn't refetch it.
    { refreshInterval: notificationPoll, revalidateOnFocus: true, dedupingInterval: 15_000, revalidateIfStale: notificationPoll !== 0 },
  );
  const notifications = (apiNotifications ?? []).map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, unread: !n.read }));
  const markRead = async (ids?: string[]) => {
    refreshNotifications((prev) => prev?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)), { revalidate: false });
    await authedFetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ ids: ids ?? [] }) }).catch(() => null);
  };
  const unreadCount = notifications.filter(n => n.unread).length;
  // The same count on the app's home-screen icon (M42; iPhone home-screen apps, Windows, Mac).
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (unreadCount > 0 ? navigator.setAppBadge(unreadCount) : navigator.clearAppBadge()).catch(() => {});
  }, [unreadCount]);

  return (
    <>
      {/* Phones: the page's name for screen readers only (M210); its actions and controls stay, in a row
          shown only when there are some. */}
      <h1 className={cn('sr-only', !top && 'lg:hidden')}>{title}</h1>
      {!hideMobileTitle && (leftNode || ((action || rightNode) && !slot)) ? (
        <div data-bar className="lg:hidden px-4 pt-3 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">{leftNode}</div>
            <ArrangeButton className="shrink-0" />
            {action && (
              <button onClick={action.onClick} className="btn-primary shrink-0">
                <Plus className="w-4 h-4" strokeWidth={2.4} />
                <span>{action.label}</span>
              </button>
            )}
          </div>
          {rightNode && <div className="mt-3 flex flex-wrap items-center gap-2 [&>*]:max-w-full">{rightNode}</div>}
        </div>
      ) : <div data-bar className="lg:hidden flex justify-end px-4"><ArrangeButton className="mt-2" /></div>}

      <span ref={findSlot} hidden />
      {slot && (rightNode || action) && createPortal(<>
        {rightNode}
        {action && <button onClick={action.onClick} className="btn-primary btn-sm"><Plus className="w-3.5 h-3.5" strokeWidth={2.4} />{action.label}</button>}
      </>, slot)}
      {/* Desktop: iPadOS navigation bar, clear at the top and frosted once the page scrolls under it. */}
      {(!top || leftNode || ((rightNode || action) && !slot)) && <header className={cn('app-topbar hidden lg:flex z-20 nav-edge items-center justify-between gap-4', top ? 'px-6 xl:px-8 pt-3 pb-1' : 'lg:sticky lg:top-0 px-8 min-h-16 py-2')}>
        <div className="flex items-center gap-4 min-w-0">
          {!top && <h1 className="sr-only">{title}</h1>}
          {leftNode}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {rightNode}

          {/* iOS search field: opens the command palette */}
          {!top && <><button
            type="button"
            data-tour="search"
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 h-9 w-56 rounded-[10px] bg-[var(--surface)] border border-[var(--hairline)] px-3 text-[13px] text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-start">{t('common.search')}</span>
            <kbd className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">⌘K</kbd>
          </button>

          <ArrangeButton />
          <ThemeToggle />
          <LanguageMenu />

          <button
            type="button"
            data-tour="notifications"
            onClick={openPanel}
            // The count as the badge shows it, so the name contains what's on screen (WCAG 2.5.3)
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount > 99 ? '99+' : unreadCount} unread` : 'Notifications'}
            className={cn('btn-ghost btn-icon relative rounded-full', showNotifications && 'bg-[var(--fill)]')}
          >
            <Bell className="w-[19px] h-[19px]" strokeWidth={2.1} />
            {unreadCount > 0 && <span aria-hidden className="absolute top-0.5 end-0.5 min-w-[17px] h-[17px] px-1 rounded-full badge-count text-[10px] text-white font-bold leading-[17px] text-center">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button></>}

          {action && (
            <button onClick={action.onClick} className="btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
              {action.label}
            </button>
          )}
        </div>
      </header>}

      {/* Notifications: a sheet from the side, Apple style (full screen on phones; M222). */}
      <AnimatePresence>
        {showNotifications && (
          <NotificationsPanel notes={notifications} unread={unreadCount} onClose={closePanel} onRead={(ids) => void markRead(ids)}
            onOpen={(n) => { if (n.unread) void markRead([n.id]); if (n.link?.startsWith('/')) { setShowNotifications(false); router.push(n.link); } }} />
        )}
      </AnimatePresence>
    </>
  );
}
