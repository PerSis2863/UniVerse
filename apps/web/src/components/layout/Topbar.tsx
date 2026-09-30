'use client';
import { useRouter } from 'next/navigation';
import { openCommandPalette } from '@/components/ui/CommandPalette';
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

type ApiNotification = { id: string; title: string; body: string; type: string; read: boolean; link: string | null; createdAt: string };
const NOTIF_ICON: Record<string, string> = { info: '🔔', success: '✅', warning: '⚠️', error: '⛔', message: '💬', grade: '🎓', event: '📅' };

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
      {/* Mobile: iOS-style large title. Actions and controls stay visible (they were hidden on phones before). */}
      <div className={hideMobileTitle ? 'hidden' : 'lg:hidden px-4 pt-5 pb-2'}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
          <div className="flex items-start gap-3 min-w-0 flex-1 basis-[60%]">
            {leftNode}
            <div className="min-w-0">
              <h1 className="text-[26px] leading-[1.15] font-bold tracking-tight text-zinc-900 dark:text-white break-words">{title}</h1>
              {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">{subtitle}</p>}
            </div>
          </div>
          {action && (
            <button
              onClick={action.onClick}
              className="pressable shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-indigo-600 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 active:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              <span>{action.label}</span>
            </button>
          )}
        </div>
        {rightNode && <div className="mt-3 flex flex-wrap items-center gap-2 [&>*]:max-w-full">{rightNode}</div>}
      </div>

      <header className="hidden lg:flex relative lg:sticky lg:top-0 z-20 glass-bar border-b border-indigo-100 dark:border-white/[0.07] px-4 md:px-8 h-auto lg:h-16 py-3 lg:py-0 flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
      <div className="flex items-center gap-4">
        {leftNode}
        <div>
          <h1 className="font-bold text-zinc-900 dark:text-white text-lg leading-tight truncate max-w-[250px] sm:max-w-md">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-1 sm:line-clamp-none max-w-sm">{subtitle ?? `${t('common.greeting')}, ${user?.name?.split(' ')[0]}!`}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 self-end md:self-auto w-full md:w-auto overflow-visible pb-1 md:pb-0 flex-wrap">
        {rightNode}

        {/* Command Palette Trigger */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={openCommandPalette}
          className="hidden sm:flex items-center gap-2 bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.07] border border-zinc-200 dark:border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{t('common.search')}...</span>
          <kbd className="ml-1 px-1.5 py-0.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-mono">⌘K</kbd>
        </motion.button>

        <ThemeToggle />
        
        <div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifications(true)}
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            className={cn("btn-ghost p-2 relative", showNotifications && "bg-white/[0.06] text-zinc-900 dark:text-white")}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 text-[9px] text-white font-bold flex items-center justify-center">{unreadCount}</span>}
          </motion.button>
        </div>

        {action && (
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={action.onClick} className="btn-primary flex items-center gap-2 text-sm py-2 whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" />
            {action.label}
          </motion.button>
        )}
      </div>
    </header>

      {/* Notifications Drawer */}
      <AnimatePresence>
        {showNotifications && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="fixed inset-0 bg-black/40 z-[120] backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
              className="fixed right-0 top-0 h-[100dvh] w-full sm:w-[400px] glass-sidebar shadow-2xl border-l border-indigo-100 dark:border-white/[0.07] z-[130] flex flex-col sheet-safe-top"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-indigo-500" /> Notifications
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">{unreadCount === 0 ? 'You’re all caught up' : `You have ${unreadCount} unread`}</p>
                </div>
                <button onClick={() => setShowNotifications(false)} aria-label="Close notifications" className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-200/70 dark:border-white/[0.06]">
                {['All', 'Unread', 'Important'].map(tab => (
                  <button 
                    key={tab} 
                    onClick={() => setActiveNotifTab(tab)}
                    className={cn("px-4 py-1.5 rounded-full text-xs font-semibold transition-colors", 
                      activeNotifTab === tab ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredNotifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                    <Archive className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">No notifications here</p>
                  </div>
                ) : (
                  filteredNotifications.map(n => (
                    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      key={n.id} onClick={() => { if (n.unread) markRead([n.id]); if (n.link?.startsWith("/")) { setShowNotifications(false); router.push(n.link); } }}
                      className={cn("p-4 rounded-2xl border transition-all cursor-pointer group flex items-start gap-3",
                        n.unread ? "bg-white dark:bg-zinc-900 border-indigo-500/30 shadow-sm" : "bg-zinc-50 dark:bg-zinc-900/30 border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0", n.unread ? "bg-indigo-500/10" : "bg-zinc-200/50 dark:bg-zinc-800")}>
                        {n.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className={cn("text-sm pr-2", n.unread ? "font-bold text-zinc-900 dark:text-white" : "font-medium text-zinc-600 dark:text-zinc-400")}>{n.title}</h4>
                          <span className="text-[10px] text-zinc-400 whitespace-nowrap">{n.time}</span>
                        </div>
                        {n.body && <p className="text-xs text-zinc-500 line-clamp-2 mb-1">{n.body}</p>}
                        <div className="flex items-center gap-2">
                          {n.important && <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" /> Important</span>}
                        </div>
                      </div>
                      {n.unread && <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />}
                    </motion.div>
                  ))
                )}
              </div>

              <EmailNotificationsSwitch compact />

              {/* Footer */}
              <div className="p-4 sheet-safe-bottom border-t border-zinc-200/70 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.03] flex justify-between items-center">
                <button onClick={() => { markRead(); import('sonner').then(m => m.toast.success('All marked as read')); }} className="text-sm font-medium text-zinc-500 hover:text-indigo-500 transition-colors">Mark all as read</button>
                <Link href={user?.role === 'TEACHER' ? '/teacher/inbox' : user?.role === 'ADMIN' ? '/admin/inbox' : '/student/inbox'} onClick={() => setShowNotifications(false)} className="text-sm font-semibold text-zinc-900 dark:text-white hover:text-indigo-500 transition-colors">View Inbox &rarr;</Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
