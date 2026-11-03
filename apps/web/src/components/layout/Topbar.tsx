'use client';
import { usePathname, useRouter } from 'next/navigation';
import { openCommandPalette } from '@/lib/palette';
import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Plus,  X, Archive, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageMenu } from './LanguageMenu';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useLanguageStore } from '@/store/language';
import useSWR from 'swr';
import { formatDistanceToNowStrict } from 'date-fns';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { useLiveInterval } from '@/lib/realtime-client';
import { EmailNotificationsSwitch } from '@/components/notifications/EmailNotificationsSwitch';
import { Segmented } from '@/components/ui/Segmented';
import { setPageTitle } from '@/lib/chrome';
import { spring } from '@/lib/motion';
import { crumbsFor } from '@/lib/breadcrumbs';
import { navByRole } from './Sidebar';

type ApiNotification = { id: string; title: string; body: string; type: string; read: boolean; link: string | null; createdAt: string };
const NOTIF_ICON: Record<string, string> = { info: '🔔', success: '✅', warning: '⚠️', error: '⛔', message: '💬', grade: '🎓', event: '📅', announcement: '📣', chat: '💬', call: '📞' };

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  rightNode?: React.ReactNode;
  leftNode?: React.ReactNode;
  /** Hide the large mobile title (for full-screen pages like Messages that have their own header). */
  hideMobileTitle?: boolean;
  /** Pairs this title with a list card's (data-shared) so it glides in from the card (src/lib/shared-element.ts). */
  sharedId?: string;
}

/**
 * "Where am I" above the title: the menu group and entry this page belongs to ("Schooling ›
 * Courses › Week 2"), from the side menu (src/lib/breadcrumbs.ts). Nothing on a menu entry's own
 * page outside a group, where it would only repeat the title.
 */
function Breadcrumb({ title, className }: { title: string; className?: string }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const c = user ? crumbsFor(navByRole[user.role] ?? [], pathname) : null;
  if (!c) return null;
  const tr = (label: string) => (label.startsWith('nav.') ? t(label) : label);
  const entry = tr(c.entry.label);
  const here = pathname === c.entry.href;
  if (!c.group && here) return null;
  const sep = <li aria-hidden className="text-zinc-300 dark:text-zinc-600">›</li>;
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 text-[12px] font-medium text-zinc-500 dark:text-zinc-400', className)}>
      <ol className="flex items-center gap-1.5 min-w-0">
        {c.group && <><li className="shrink-0">{tr(c.group)}</li>{sep}</>}
        <li className={cn('min-w-0 truncate', here && 'text-tint-text')}>{here ? <span aria-current="page">{entry}</span> : <Link href={c.entry.href} className="hover:text-zinc-900 dark:hover:text-white">{entry}</Link>}</li>
        {!here && entry !== title && <>{sep}<li className="min-w-0 truncate text-tint-text" aria-current="page">{title}</li></>}
      </ol>
    </nav>
  );
}

/** Where the notifications panel slides from: off the end edge (right, or left in right-to-left). */
const offEdge = () => (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'translateX(-100%)' : 'translateX(100%)');

export function Topbar({ title, subtitle, action, rightNode, leftNode, hideMobileTitle, sharedId }: TopbarProps) {
  // The browser tab says which page this is ("Files | UniVerse Impact"), like the public pages' titles.
  useEffect(() => { if (title) document.title = `${title} | UniVerse Impact`; }, [title]);
  const router = useRouter();
  const { user } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);
  // The first rows draw with the panel and the rest once it has slid in: all 30 at once made the
  // opening tap take about a quarter of a second on a slow phone.
  const [allRows, setAllRows] = useState(false);
  const openPanel = () => { setAllRows(false); setShowNotifications(true); };
  const [activeNotifTab, setActiveNotifTab] = useState('All');
  const { t } = useLanguageStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // The phone's navigation bar shows this title once the large title scrolls away (iOS).
  useEffect(() => { setPageTitle(title); }, [title]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape closes the panel, like every other dialog.
  useEffect(() => {
    if (!showNotifications) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNotifications(false); };
    window.addEventListener('keydown', onKey);
    const rest = setTimeout(() => setAllRows(true), 450);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(rest); };
  }, [showNotifications]);

  // The mobile header's bell (DashboardShell) opens this drawer via a window event.
  useEffect(() => {
    const open = () => { setAllRows(false); setShowNotifications(true); };
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
  const notifications = (apiNotifications ?? []).map((n) => ({
    id: n.id,
    icon: NOTIF_ICON[n.type] ?? '🔔',
    title: n.title,
    body: n.body,
    link: n.link,
    time: formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true }),
    unread: !n.read,
    important: n.type === 'warning' || n.type === 'error',
  }));
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

  const filteredNotifications = notifications.filter(n => {
    if (activeNotifTab === 'Unread') return n.unread;
    if (activeNotifTab === 'Important') return n.important;
    return true; // All
  });

  return (
    <>
      {/* Phones: iOS large title. Actions and controls stay visible under it. */}
      <div className={hideMobileTitle ? 'hidden' : 'lg:hidden px-4 pt-3 pb-2'}>
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
          <div className="flex items-start gap-3 min-w-0 flex-1 basis-[60%]">
            {leftNode}
            <div className="min-w-0">
              <Breadcrumb title={title} className="mb-0.5" />
              <h1 data-shared={sharedId} className="large-title text-zinc-900 dark:text-white break-words">{title}</h1>
              {subtitle && <p className="text-[15px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">{subtitle}</p>}
            </div>
          </div>
          {action && (
            <button onClick={action.onClick} className="btn-primary shrink-0">
              <Plus className="w-4 h-4" strokeWidth={2.4} />
              <span>{action.label}</span>
            </button>
          )}
        </div>
        {rightNode && <div className="mt-3 flex flex-wrap items-center gap-2 [&>*]:max-w-full">{rightNode}</div>}
      </div>

      {/* Desktop: iPadOS navigation bar, clear at the top and frosted once the page scrolls under it. */}
      <header className="hidden lg:flex lg:sticky lg:top-0 z-20 nav-edge px-8 min-h-16 py-2 items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {leftNode}
          <div className="min-w-0">
            <Breadcrumb title={title} />
            <h1 data-shared={sharedId} className="font-bold text-[22px] leading-tight tracking-tight text-zinc-900 dark:text-white truncate max-w-md">{title}</h1>
            {subtitle && <p className="text-[13px] text-zinc-500 dark:text-zinc-400 line-clamp-1 max-w-xl">{subtitle ?? `${t('common.greeting')}, ${user?.name?.split(' ')[0]}!`}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {rightNode}

          {/* iOS search field: opens the command palette */}
          <button
            type="button"
            data-tour="search"
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 h-9 w-56 rounded-[10px] bg-[var(--fill)] px-3 text-[15px] text-zinc-500 dark:text-zinc-400 hover:bg-[var(--fill-strong)] transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-start">{t('common.search')}</span>
            <kbd className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">⌘K</kbd>
          </button>

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
          </button>

          {action && (
            <button onClick={action.onClick} className="btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
              {action.label}
            </button>
          )}
        </div>
      </header>

      {/* Notifications: an iOS sheet from the side (full screen on phones). */}
      <AnimatePresence>
        {showNotifications && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 bg-black/30 z-[120]"
            />
            <motion.div
              ref={dropdownRef}
              role="dialog" aria-label="Notifications"
              // A whole transform (not x) so it slides on the GPU, smooth even while the list renders;
              // from the left in right-to-left languages, where the panel sits.
              initial={{ transform: offEdge() }} animate={{ transform: 'translateX(0%)' }} exit={{ transform: offEdge() }}
              transition={spring.gentle}
              className="fixed end-0 top-0 h-[100dvh] w-full sm:w-[400px] tone-panel shadow-2xl z-[130] flex flex-col sheet-safe-top sm:rounded-s-[28px] overflow-hidden"
            >
              <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[28px] font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">Notifications</h2>
                  <p className="text-[13px] text-zinc-500 mt-0.5">{unreadCount === 0 ? 'You’re all caught up' : `${unreadCount} unread`}</p>
                </div>
                <button onClick={() => setShowNotifications(false)} aria-label="Close notifications" className="w-8 h-8 mt-1 rounded-full bg-[var(--fill)] flex items-center justify-center text-zinc-500 dark:text-zinc-300">
                  <X className="w-4 h-4" strokeWidth={2.4} />
                </button>
              </div>

              <div className="px-5 pb-3">
                <Segmented
                  label="Show"
                  value={activeNotifTab as 'All' | 'Unread' | 'Important'}
                  onChange={setActiveNotifTab}
                  segments={[{ value: 'All', label: 'All' }, { value: 'Unread', label: 'Unread' }, { value: 'Important', label: 'Important' }]}
                  className="w-full"
                />
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 stagger">
                {filteredNotifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                    <Archive className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-[15px]">No notifications here</p>
                  </div>
                ) : (
                  (allRows ? filteredNotifications : filteredNotifications.slice(0, 12)).map(n => (
                    // Plain rows with the CSS cascade: an animation each in JS (and layout tracking)
                    // restyled every row on every frame while the panel slid in.
                    <div
                      key={n.id} onClick={() => { if (n.unread) markRead([n.id]); if (n.link?.startsWith("/")) { setShowNotifications(false); router.push(n.link); } }}
                      className="p-3.5 rounded-[20px] bg-[var(--surface-2)] dark:bg-white/[0.06] cursor-pointer flex items-start gap-3 active:scale-[0.98] transition-transform"
                    >
                      <div className="w-9 h-9 rounded-[10px] bg-white dark:bg-white/10 shadow-sm flex items-center justify-center text-base flex-shrink-0">
                        {n.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline gap-2">
                          <h4 className={cn('text-[15px] leading-snug', n.unread ? 'font-semibold text-zinc-900 dark:text-white' : 'font-medium text-zinc-600 dark:text-zinc-300')}>{n.title}</h4>
                          <span className="text-[12px] text-zinc-400 whitespace-nowrap">{n.time}</span>
                        </div>
                        {n.body && <p className="text-[13px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">{n.body}</p>}
                        {n.important && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-[var(--ios-red)]"><AlertCircle className="w-3 h-3" /> Important</span>}
                      </div>
                      {n.unread && <div className="w-2.5 h-2.5 rounded-full bg-tint mt-1.5 flex-shrink-0" />}
                    </div>
                  ))
                )}
              </div>

              <EmailNotificationsSwitch compact />

              <div className="px-5 py-3 sheet-safe-bottom flex justify-between items-center" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
                <button onClick={() => { markRead(); import('sonner').then(m => m.toast.success('All marked as read')); }} className="text-[15px] font-medium text-tint-text">Mark all as read</button>
                {/* The full list: filters, snooze, settings (Stage 5 · Q9). */}
                <Link href="/notifications" onClick={() => setShowNotifications(false)} className="text-[15px] font-semibold text-tint-text">See all</Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
