'use client';
import { useState, useRef, useEffect } from 'react';
import { Bell, Search, Plus, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';

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

  const notifications = [
    { id: 1, title: 'New Consortium Project', time: '10m ago', unread: true },
    { id: 2, title: 'Grade Updated: Advanced AI', time: '2h ago', unread: false },
    { id: 3, title: 'Room Booking Confirmed', time: '1d ago', unread: false },
  ];

  return (
    <header className="relative lg:sticky lg:top-0 z-20 bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/[0.06] px-4 md:px-8 h-auto lg:h-16 py-4 lg:py-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-0">
      <div className="flex items-center gap-4">
        {leftNode}
        <div>
          <h1 className="font-bold text-zinc-900 dark:text-white text-lg leading-tight truncate max-w-[250px] sm:max-w-md">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-1 sm:line-clamp-none max-w-sm">{subtitle ?? `${greeting}, ${user?.name?.split(' ')[0]}!`}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 self-end md:self-auto w-full md:w-auto overflow-visible pb-1 md:pb-0 flex-wrap">
        {rightNode}
        <ThemeToggle />
        
        <div className="relative" ref={dropdownRef}>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifications(!showNotifications)}
            className={cn("btn-ghost p-2 relative", showNotifications && "bg-white/[0.06] text-zinc-900 dark:text-white")}
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
          </motion.button>
          
          <AnimatePresence>
            {showNotifications && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-72 bg-white/80 dark:bg-[#0d1117]/80 backdrop-blur-xl border border-zinc-200 dark:border-white/[0.06] rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="p-3 border-b border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">Notifications</span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">1 New</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map(n => (
                  <div key={n.id} className="p-3 border-b border-zinc-200 dark:border-white/[0.06] hover:bg-zinc-100 dark:hover:bg-white/[0.03] cursor-pointer transition-colors flex items-start gap-3">
                    <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", n.unread ? "bg-indigo-500" : "bg-transparent")} />
                    <div>
                      <div className={cn("text-xs", n.unread ? "text-zinc-900 dark:text-white font-medium" : "text-zinc-600 dark:text-zinc-400")}>{n.title}</div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-0.5">{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-2 bg-zinc-50 dark:bg-zinc-950 text-center">
                <button onClick={() => { import('sonner').then(m => m.toast.success('All notifications marked as read!')); setShowNotifications(false); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Mark all as read</button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
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
  );
}
