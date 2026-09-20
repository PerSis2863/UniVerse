'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Plus, CheckCircle2, X, Archive, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguageStore } from '@/store/language';

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  rightNode?: React.ReactNode;
  leftNode?: React.ReactNode;
}

export function Topbar({ title, subtitle, action, rightNode, leftNode }: TopbarProps) {
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

  const [notifications, setNotifications] = useState([
    { id: 1, icon: '🎓', title: 'Grade posted: CS301 — A (94%)', time: '10m ago', unread: true, important: false },
    { id: 2, icon: '📅', title: 'Attendance alert: DB class missed', time: '2h ago', unread: true, important: true },
    { id: 3, icon: '💬', title: 'New message from Prof. Sharma', time: '4h ago', unread: false, important: false },
    { id: 4, icon: '📢', title: 'Room Booking Confirmed: CS-201', time: '1d ago', unread: false, important: false },
    { id: 5, icon: '🤝', title: 'New Consortium Project: UNICEF', time: '2d ago', unread: false, important: true },
  ]);
  const unreadCount = notifications.filter(n => n.unread).length;

  const filteredNotifications = notifications.filter(n => {
    if (activeNotifTab === 'Unread') return n.unread;
    if (activeNotifTab === 'Important') return n.important;
    return true; // All
  });

  return (
    <>
      <header className="relative lg:sticky lg:top-0 z-20 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/[0.06] px-4 md:px-8 h-auto lg:h-16 py-4 lg:py-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-0">
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
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true });
            document.dispatchEvent(event);
          }}
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
              className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-white dark:bg-[#09090b] shadow-2xl border-l border-zinc-200 dark:border-zinc-800 z-[70] flex flex-col"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-5 h-5 text-indigo-500" /> Notifications
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">You have {unreadCount} unread messages</p>
                </div>
                <button onClick={() => setShowNotifications(false)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
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
                      key={n.id} onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? {...x, unread: false} : x))}
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
                        <div className="flex items-center gap-2">
                          {n.important && <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" /> Important</span>}
                        </div>
                      </div>
                      {n.unread && <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />}
                    </motion.div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex justify-between items-center">
                <button onClick={() => { setNotifications(prev => prev.map(n => ({...n, unread: false}))); import('sonner').then(m => m.toast.success('All marked as read')); }} className="text-sm font-medium text-zinc-500 hover:text-indigo-500 transition-colors">Mark all as read</button>
                <Link href="/student/inbox" onClick={() => setShowNotifications(false)} className="text-sm font-semibold text-zinc-900 dark:text-white hover:text-indigo-500 transition-colors">View Inbox &rarr;</Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
