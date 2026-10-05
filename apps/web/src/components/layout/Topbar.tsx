'use client';
import { useRouter } from 'next/navigation';
import { openCommandPalette } from '@/lib/palette';
import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Plus, CheckCircle2, X, Archive, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
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
}

export function Topbar({ title, subtitle, action, rightNode, leftNode, hideMobileTitle }: TopbarProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [showNotifications, setShowNotifications] = useState(false);
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
              <h1 className="large-title text-zinc-900 dark:text-white break-words">{title}</h1>
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
      <header className="hidden lg:flex lg:sticky lg:top-0 z-20 nav-edge px-8 h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {leftNode}
          <div className="min-w-0">
            <h1 className="font-bold text-[22px] leading-tight tracking-tight text-zinc-900 dark:text-white truncate max-w-md">{title}</h1>
            {subtitle && <p className="text-[13px] text-zinc-500 dark:text-zinc-400 line-clamp-1 max-w-xl">{subtitle ?? `${t('common.greeting')}, ${user?.name?.split(' ')[0]}!`}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {rightNode}

          {/* iOS search field: opens the command palette */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 h-9 w-56 rounded-[10px] bg-[var(--fill)] px-3 text-[15px] text-zinc-500 dark:text-zinc-400 hover:bg-[var(--fill-strong)] transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">{t('common.search')}</span>
            <kbd className="text-[11px] font-medium text-zinc-400">⌘K</kbd>
          </button>

          <ThemeToggle />

          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            className={cn('btn-ghost btn-icon relative rounded-full', showNotifications && 'bg-[var(--fill)]')}
          >
            <Bell className="w-[19px] h-[19px]" strokeWidth={2.1} />
            {unreadCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--ios-red)] text-[10px] text-white font-bold leading-[17px] text-center">{unreadCount > 99 ? '99+' : unreadCount}</span>}
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
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={spring.gentle}
              className="fixed right-0 top-0 h-[100dvh] w-full sm:w-[400px] tone-panel shadow-2xl z-[130] flex flex-col sheet-safe-top sm:rounded-l-[28px] overflow-hidden"
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

              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {filteredNotifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                    <Archive className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-[15px]">No notifications here</p>
                  </div>
                ) : (
                  filteredNotifications.map(n => (
                    <motion.div layout transition={spring.smooth} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
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
                        {n.important && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ios-red)]"><AlertCircle className="w-3 h-3" /> Important</span>}
                      </div>
                      {n.unread && <div className="w-2.5 h-2.5 rounded-full bg-tint mt-1.5 flex-shrink-0" />}
                    </motion.div>
                  ))
                )}
              </div>

              <EmailNotificationsSwitch compact />

              <div className="px-5 py-3 sheet-safe-bottom flex justify-between items-center" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
                <button onClick={() => { markRead(); import('sonner').then(m => m.toast.success('All marked as read')); }} className="text-[15px] font-medium text-tint-text">Mark all as read</button>
                <Link href={user?.role === 'TEACHER' ? '/teacher/inbox' : user?.role === 'ADMIN' ? '/admin/inbox' : '/student/inbox'} onClick={() => setShowNotifications(false)} className="text-[15px] font-semibold text-tint-text">Messages</Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
