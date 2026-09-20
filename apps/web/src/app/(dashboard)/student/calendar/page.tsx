'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar as CalendarIcon, Clock, MapPin, ChevronLeft, ChevronRight, Video, Users, X, BookOpen, ExternalLink, Bell, FileText, ChevronRight as ChevronR } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const MOCK_SCHEDULE = [
  { id: '1', day: 'Monday', time: '09:00', duration: 2, subject: 'Computer Science 101', location: 'Room 302', type: 'Lecture', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { id: '2', day: 'Monday', time: '13:30', duration: 1.5, subject: 'Advanced Calculus', location: 'Room 105', type: 'Lecture', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { id: '10', day: 'Monday', time: '17:00', duration: 2, subject: 'Machine Learning', location: 'Room 305', type: 'Lecture', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  { id: '3', day: 'Tuesday', time: '10:00', duration: 2, subject: 'Physics Lab', location: 'Lab 4B', type: 'Lab', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { id: '11', day: 'Tuesday', time: '15:00', duration: 2, subject: 'Artificial Intelligence', location: 'Auditorium B', type: 'Lecture', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { id: '4', day: 'Wednesday', time: '09:00', duration: 2, subject: 'Computer Science 101', location: 'Room 302', type: 'Lecture', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { id: '5', day: 'Wednesday', time: '14:00', duration: 1.5, subject: 'World History', location: 'Auditorium A', type: 'Lecture', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { id: '12', day: 'Wednesday', time: '18:00', duration: 2, subject: 'Study Group', location: 'Library', type: 'Meeting', color: 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border-zinc-500/30' },
  { id: '6', day: 'Thursday', time: '11:00', duration: 1.5, subject: 'Advanced Calculus', location: 'Room 105', type: 'Lecture', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { id: '7', day: 'Thursday', time: '16:00', duration: 2, subject: 'Data Structures', location: 'Room 401', type: 'Lecture', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  { id: '8', day: 'Friday', time: '10:00', duration: 3, subject: 'Software Engineering', location: 'Innovation Hub', type: 'Workshop', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  { id: '9', day: 'Friday', time: '15:00', duration: 2, subject: 'Web Development', location: 'Lab 2A', type: 'Lab', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
];

const SPECIAL_EVENTS = [
  { id: 's1', day: 'Friday', time: '08:00', duration: 12, subject: 'Annual Sports Day', location: 'Main Stadium', type: 'Event', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', isSpecial: true },
  { id: 's2', day: 'Monday', time: '08:00', duration: 12, subject: 'Public Holiday', location: 'Campus Closed', type: 'Holiday', color: 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-300 border-zinc-600', isSpecial: true },
  { id: 's3', day: 'Wednesday', time: '08:00', duration: 12, subject: 'Tech Festival', location: 'Campus Wide', type: 'Festival', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30', isSpecial: true },
  { id: 's4', day: 'Thursday', time: '08:00', duration: 12, subject: 'Thanksgiving Break', location: 'Campus Closed', type: 'Holiday', color: 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-300 border-zinc-600', isSpecial: true },
  { id: 's5', day: 'Friday', time: '08:00', duration: 12, subject: 'Thanksgiving Break', location: 'Campus Closed', type: 'Holiday', color: 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-300 border-zinc-600', isSpecial: true },
  { id: 's6', day: 'Tuesday', time: '09:00', duration: 3, subject: 'Midterm Exam: Adv Calculus', location: 'Main Hall', type: 'Exam', color: 'bg-red-500/20 text-red-500 border-red-500/30', isSpecial: true },
  { id: 's7', day: 'Thursday', time: '14:00', duration: 3, subject: 'Midterm Exam: Machine Learning', location: 'Main Hall', type: 'Exam', color: 'bg-red-500/20 text-red-500 border-red-500/30', isSpecial: true },
  { id: 's8', day: 'Monday', time: '09:00', duration: 3, subject: 'Final Exam: CS 101', location: 'Main Hall', type: 'Exam', color: 'bg-red-500/20 text-red-500 border-red-500/30', isSpecial: true },
  { id: 's9', day: 'Wednesday', time: '13:00', duration: 3, subject: 'Final Exam: Physics', location: 'Main Hall', type: 'Exam', color: 'bg-red-500/20 text-red-500 border-red-500/30', isSpecial: true },
];

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const formatTimeRange = (startTime: string, durationHours: number) => {
  const [hours, minutes] = startTime.split(':').map(Number);
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

export default function CalendarPage() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [view, setView] = useState('Semester');
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Base date is Monday, Sep 14, 2026
  const baseDate = new Date(2026, 8, 14);

  const generatedDates = useMemo(() => {
    let daysToGenerate = 70; // Semester (8 weeks)
    if (view === 'Day') daysToGenerate = 1;
    if (view === 'Week') daysToGenerate = 5;
    if (view === 'Month') daysToGenerate = 20;

    const dates = [];
    const startDate = new Date(baseDate.getTime() + currentWeekOffset * 7 * 24 * 60 * 60 * 1000);
    
    // Fast forward to next Monday if weekend, or keep current day if Day view
    let currentDate = new Date(startDate);
    if (view !== 'Day') {
      while (currentDate.getDay() !== 1) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
      // For Day view, skip weekends
      if (currentDate.getDay() === 0) currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate.getDay() === 6) currentDate.setDate(currentDate.getDate() + 2);
    }

    let count = 0;
    while (count < daysToGenerate) {
      const day = currentDate.getDay();
      if (day >= 1 && day <= 5) { // Mon-Fri
        dates.push(new Date(currentDate));
        count++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  }, [currentWeekOffset, view]);

  const getScheduleForDate = (date: Date) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const diffTime = date.getTime() - baseDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekOffset = Math.floor(diffDays / 7);
    
    let schedule = [...MOCK_SCHEDULE].filter(s => s.day === dayName);
    
    if (weekOffset === 10 && dayName === 'Thursday') {
      schedule = [];
      schedule.push(SPECIAL_EVENTS[3]);
    } else if (weekOffset === 10 && dayName === 'Friday') {
      schedule = [];
      schedule.push(SPECIAL_EVENTS[4]);
    } else if (weekOffset === 6 && dayName === 'Tuesday') {
      schedule = schedule.filter(s => s.subject !== 'Physics Lab');
      schedule.push(SPECIAL_EVENTS[5]);
    } else if (weekOffset === 6 && dayName === 'Thursday') {
      schedule = schedule.filter(s => s.subject !== 'Data Structures');
      schedule.push(SPECIAL_EVENTS[6]);
    } else if (weekOffset >= 13) {
      schedule = []; // exam week
      if (weekOffset === 13 && dayName === 'Monday') schedule.push(SPECIAL_EVENTS[7]);
      if (weekOffset === 13 && dayName === 'Wednesday') schedule.push(SPECIAL_EVENTS[8]);
    } else if (Math.abs(weekOffset) % 3 === 1 && dayName === 'Friday') {
      schedule = [];
      schedule.push(SPECIAL_EVENTS[0]);
    } else if (Math.abs(weekOffset) % 4 === 2 && dayName === 'Monday') {
      schedule = [];
      schedule.push(SPECIAL_EVENTS[1]);
    } else if (Math.abs(weekOffset) % 5 === 3 && dayName === 'Wednesday') {
      schedule = [];
      schedule.push(SPECIAL_EVENTS[2]);
    }

    const shift = Math.abs(weekOffset);
    
    return schedule.filter((s, idx) => {
      if ((s as any).isSpecial) return true;
      return (idx + shift) % 4 !== 0; 
    }).map((s, idx) => {
      if (shift > 0 && !(s as any).isSpecial) {
        const oldHour = parseInt(s.time.split(':')[0]);
        let newHour = oldHour + (shift % 4) - 1;
        if (newHour > 18) newHour -= 8;
        if (newHour < 8) newHour += 4;
        return { ...s, time: `${newHour < 10 ? '0' : ''}${newHour}:00` };
      }
      return s;
    });
  };

  const currentRangeString = () => {
    if (generatedDates.length === 0) return '';
    const start = generatedDates[0];
    const end = generatedDates[generatedDates.length - 1];
    
    const formatOptsShort: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const formatOptsFull: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    
    if (view === 'Day') {
      return start.toLocaleDateString('en-US', formatOptsFull);
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${start.toLocaleDateString('en-US', formatOptsShort)} - ${end.toLocaleDateString('en-US', formatOptsFull)}`;
    }
    return `${start.toLocaleDateString('en-US', formatOptsFull)} - ${end.toLocaleDateString('en-US', formatOptsFull)}`;
  };

  return (
    <>
      <Topbar title="My Timetable" subtitle={`View your ${view.toLowerCase()}ly class schedule`} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header Controls */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 xl:gap-4 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-6 xl:p-4">
            <div className="flex items-center gap-2 sm:gap-4 w-full xl:w-auto justify-between xl:justify-start">
              <button onClick={() => setCurrentWeekOffset(prev => prev - (view === 'Month' ? 4 : (view === 'Semester' ? 8 : 1)))} className="p-3 sm:p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <ChevronLeft className="w-6 h-6 sm:w-5 sm:h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white min-w-[200px] sm:min-w-[220px] text-center">{currentRangeString()}</h2>
              <button onClick={() => setCurrentWeekOffset(prev => prev + (view === 'Month' ? 4 : (view === 'Semester' ? 8 : 1)))} className="p-3 sm:p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <ChevronRight className="w-6 h-6 sm:w-5 sm:h-5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 w-full xl:w-auto">
              <button onClick={() => setView('Day')} className={`flex-1 xl:flex-none px-4 py-3 sm:py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Day' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Day</button>
              <button onClick={() => setView('Week')} className={`flex-1 xl:flex-none px-4 py-3 sm:py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Week' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Week</button>
              <button onClick={() => setView('Month')} className={`flex-1 xl:flex-none px-4 py-3 sm:py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Month' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Month</button>
              <button onClick={() => setView('Semester')} className={`flex-1 xl:flex-none px-4 py-3 sm:py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Semester' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Semester</button>
            </div>
          </div>

          {/* Continuous Scroll View */}
          <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl flex [--hour-height:130px] sm:[--hour-height:96px]">
            {/* Sticky Time Column */}
            <div className="w-16 sm:w-20 flex-shrink-0 sticky left-0 z-20 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shadow-[2px_0_10px_rgba(0,0,0,0.05)] dark:shadow-[2px_0_10px_rgba(0,0,0,0.2)]">
              <div className="h-16 flex items-center justify-center border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-500" />
              </div>
              <div className="relative" style={{ height: `calc(${HOURS.length} * var(--hour-height))` }}>
                {HOURS.map((hour, i) => (
                  <div key={hour} className="absolute left-0 right-0 border-t border-zinc-200 dark:border-zinc-800/50 flex items-start justify-center pt-2" style={{ top: `calc(${i} * var(--hour-height))`, height: 'var(--hour-height)' }}>
                    <span className="text-[10px] sm:text-xs font-medium text-zinc-500 bg-white dark:bg-zinc-900 px-1">{hour}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable Days */}
            <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 pb-2">
              <div className="flex [--col-width:280px] sm:[--col-width:240px]" style={{ width: `calc(${generatedDates.length} * var(--col-width))` }}>
                {generatedDates.map((date, idx) => {
                  const scheduleForDate = getScheduleForDate(date);
                  const isToday = new Date().toDateString() === date.toDateString();
                  
                  return (
                    <div key={idx} className="flex-1 w-[var(--col-width)] border-r border-zinc-200 dark:border-zinc-800/50 last:border-r-0">
                      {/* Day Header */}
                      <div className={`h-16 border-b border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center sticky top-0 z-10 ${isToday ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-white dark:bg-zinc-900/80'}`}>
                        <h3 className={`font-semibold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-900 dark:text-zinc-300'}`}>
                          {date.toLocaleDateString('en-US', { weekday: 'short' })}
                        </h3>
                        <span className={`text-xs ${isToday ? 'text-indigo-500/80' : 'text-zinc-500'}`}>
                          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      
                      {/* Day Content */}
                      <div className="relative bg-zinc-50/30 dark:bg-zinc-950/20" style={{ height: `calc(${HOURS.length} * var(--hour-height))` }}>
                        {/* Grid Lines */}
                        {HOURS.map((hour, i) => (
                          <div key={hour} className="absolute left-0 right-0 border-t border-zinc-200 dark:border-zinc-800/30 transition-colors" style={{ top: `calc(${i} * var(--hour-height))`, height: 'var(--hour-height)' }}></div>
                        ))}
                        
                        {/* Schedule Blocks */}
                        {scheduleForDate.map(cls => {
                          const startHour = parseInt(cls.time.split(':')[0]);
                          const startMin = parseInt(cls.time.split(':')[1]);
                          const baseStart = 8; // 08:00
                          const topOffsetHours = (startHour - baseStart) + (startMin / 60);
                          const durationHours = cls.duration;

                          return (
                            <div 
                              key={cls.id} 
                              className={`absolute left-2 right-2 rounded-xl border p-3 sm:p-4 z-10 hover:z-20 transition-all cursor-pointer hover:shadow-lg ${cls.color}`}
                              style={{ 
                                top: `calc(${topOffsetHours} * var(--hour-height) + 4px)`, 
                                height: `calc(${durationHours} * var(--hour-height) - 8px)` 
                              }}
                              onClick={() => setSelectedClass({ ...cls, dateObj: date })}
                            >
                              <div className="font-bold text-sm leading-tight mb-1 truncate">{cls.subject}</div>
                              <div className="text-xs opacity-80 flex items-center gap-1 mb-1 font-medium">
                                <Clock className="w-3 h-3" /> {formatTimeRange(cls.time, cls.duration)}
                              </div>
                              <div className="text-xs opacity-80 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {cls.location}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
      {/* ─── Class Detail Panel ─────────────────────────────── */}
      {mounted && createPortal(
        <AnimatePresence>
          {selectedClass && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedClass(null)} />
              <motion.div
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 overflow-y-auto flex flex-col"
              >
                {/* Colour band header */}
                <div className={cn('h-24 relative flex items-end p-5', selectedClass.color?.replace('text-', 'bg-').replace('/20', '/30') ?? 'bg-indigo-500/30')}>
                  <button onClick={() => setSelectedClass(null)} className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-zinc-900 dark:text-white transition-colors">
                    <X className="w-4 h-4" />
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
                      label: 'Date', value: selectedClass.dateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) ?? selectedClass.day, icon: CalendarIcon
                    }, {
                      label: 'Duration', value: `${selectedClass.duration * 60} mins`, icon: Clock
                    }].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <div key={i} className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-3">
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
                      onClick={() => { setSelectedClass(null); router.push('/student/blackboard'); }}
                    >
                      <BookOpen className="w-4 h-4" /> Open Blackboard <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Quick links */}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Quick Actions</h4>
                    <div className="space-y-1.5">
                      {[{
                        label: 'View Announcements', icon: Bell, action: () => { setSelectedClass(null); router.push('/student/blackboard'); toast.info('Opening announcements...'); }
                      }, {
                        label: 'Download Materials', icon: FileText, action: () => toast.info('Opening course materials...')
                      }, {
                        label: 'Join Online Session', icon: Video, action: () => toast.success('Joining virtual class...')
                      }, {
                        label: 'View Classmates', icon: Users, action: () => toast.info('Loading class roster...')
                      }].map((item, i) => {
                        const Icon = item.icon;
                        return (
                          <button key={i} onClick={item.action} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors group">
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
      )}
    </>
  );
}
