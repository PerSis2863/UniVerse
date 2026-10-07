'use client';

import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, Calendar as CalendarIcon, BookOpen, ExternalLink, Bell, FileText, Video, Users, X, ChevronRight as ChevronR } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSyncExternalStore } from 'react';

export interface ClassData {
  id?: string;
  /** The course, for its class call room. */
  courseId?: string;
  subject: string;
  time: string;
  duration: number;
  location: string;
  type: string;
  color: string;
  day?: string;
  dateObj?: Date;
}

interface ClassDetailModalProps {
  selectedClass: ClassData | null;
  onClose: () => void;
}

const noSubscribe = () => () => {};

export function ClassDetailModal({ selectedClass, onClose }: ClassDetailModalProps) {
  const router = useRouter();
  // false during server rendering and hydration, true afterwards (the modal portals into <body>)
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return null;

  const formatTimeRange = (startTime: string, durationHours: number) => {
    let hours = 0, minutes = 0;
    
    // Handle 12-hour format like "09:00 AM" or 24-hour format like "09:00"
    if (startTime.includes('AM') || startTime.includes('PM')) {
      const [timeMatch, period] = startTime.split(' ');
      const [h0, m] = timeMatch.split(':').map(Number);
      let h = h0;
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      hours = h;
      minutes = m || 0;
    } else {
      const parts = startTime.split(':');
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    }
    
    const totalMinutes = hours * 60 + minutes + durationHours * 60;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = Math.round(totalMinutes % 60);
    
    const format12H = (h: number, m: number) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
    };

    return `${format12H(hours, minutes)} - ${format12H(endHours, endMinutes)}`;
  };

  return createPortal(
    <AnimatePresence>
      {selectedClass && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[140]" onClick={onClose} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed right-0 top-0 h-[100dvh] w-full sm:w-[400px] glass-sidebar border-l border-[var(--separator)] dark:border-white/[0.07] shadow-2xl z-[150] overflow-y-auto flex flex-col"
          >
            {/* Header (padded below the phone status bar so the close button is always tappable) */}
            <div className="relative flex items-end px-5 pb-5 pt-[calc(env(safe-area-inset-top)+3.5rem)] bg-gradient-to-br from-indigo-500/25 via-transparent to-fuchsia-500/20">
              <button onClick={onClose} aria-label="Close" className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-zinc-900 dark:text-white flex items-center justify-center transition-colors">
                <X className="w-5 h-5" />
              </button>
              <div>
                <span className="text-xs font-bold opacity-70">{selectedClass.type}</span>
                <h2 className="text-xl font-black text-zinc-900 dark:text-white leading-tight">{selectedClass.subject}</h2>
              </div>
            </div>

            <div className="p-5 flex-1 space-y-5">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3">
                {[{
                  label: 'Time', value: formatTimeRange(selectedClass.time, selectedClass.duration), icon: Clock
                }, {
                  label: 'Location', value: selectedClass.location, icon: MapPin
                }, {
                  label: 'Date', value: selectedClass.dateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) ?? selectedClass.day ?? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), icon: CalendarIcon
                }, {
                  label: 'Duration', value: `${selectedClass.duration * 60} mins`, icon: Clock
                }].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="bg-white/60 dark:bg-white/[0.05] border border-zinc-200/70 dark:border-white/[0.06] rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] mb-1"><Icon className="w-3 h-3" />{item.label}</div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">{item.value}</div>
                    </div>
                  );
                })}
              </div>

              {/* Blackboard CTA */}
              <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white text-sm">Blackboard</p>
                    <p className="text-xs text-zinc-500">Resources, assignments & more</p>
                  </div>
                </div>
                <button
                  className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2"
                  onClick={() => { onClose(); router.push('/student/blackboard'); }}
                >
                  <BookOpen className="w-4 h-4" /> Open Blackboard <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick links */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Quick Actions</h4>
                <div className="space-y-1.5">
                  {[{
                    label: 'Announcements & materials', icon: Bell, action: () => { onClose(); router.push('/student/blackboard'); }
                  }, {
                    label: 'Assignments & quizzes', icon: FileText, action: () => { onClose(); router.push('/student/quizzes'); }
                  }, {
                    // The class's own call room in UniVerse (src/server/calls.ts): its teacher and students.
                    label: selectedClass.courseId ? 'Join class video call' : 'Class video call (not available for this event)', icon: Video, action: () => {
                      if (!selectedClass.courseId) return;
                      onClose();
                      router.push(`/call/c_${selectedClass.courseId}?kind=video`);
                    }
                  }, {
                    label: 'Message classmates', icon: Users, action: () => { onClose(); router.push('/student/inbox'); }
                  }].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <button key={i} onClick={item.action} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-white/[0.05] text-left transition-colors group">
                        <Icon className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{item.label}</span>
                        <ChevronR className="w-3.5 h-3.5 text-zinc-300 group-hover:text-indigo-400 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
