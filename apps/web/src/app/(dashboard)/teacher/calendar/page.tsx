'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar as CalendarIcon, Clock, Users, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { toast } from 'sonner';

const MOCK_SCHEDULE = [
  { day: 'Monday', time: '09:00', duration: '120', course: { name: 'Introduction to Computer Science', code: 'CS101', color: '#6366f1' } },
  { day: 'Monday', time: '13:30', duration: '90', course: { name: 'Advanced Calculus', code: 'MATH201', color: '#10b981' } },
  { day: 'Monday', time: '17:00', duration: '120', course: { name: 'Machine Learning', code: 'ML401', color: '#14b8a6' } },
  { day: 'Tuesday', time: '10:00', duration: '120', course: { name: 'Physics Lab', code: 'PHY102', color: '#a855f7' } },
  { day: 'Tuesday', time: '15:00', duration: '120', course: { name: 'Artificial Intelligence', code: 'AI402', color: '#3b82f6' } },
  { day: 'Wednesday', time: '09:00', duration: '120', course: { name: 'Introduction to Computer Science', code: 'CS101', color: '#6366f1' } },
  { day: 'Wednesday', time: '14:00', duration: '90', course: { name: 'World History', code: 'HIST101', color: '#f59e0b' } },
  { day: 'Wednesday', time: '18:00', duration: '120', course: { name: 'Office Hours', code: 'OFFICE', color: '#71717a' } },
  { day: 'Thursday', time: '11:00', duration: '90', course: { name: 'Advanced Calculus', code: 'MATH201', color: '#10b981' } },
  { day: 'Thursday', time: '16:00', duration: '120', course: { name: 'Data Structures', code: 'CS201', color: '#06b6d4' } },
  { day: 'Friday', time: '10:00', duration: '180', course: { name: 'Software Engineering', code: 'SE301', color: '#f43f5e' } },
  { day: 'Friday', time: '15:00', duration: '120', course: { name: 'Web Development', code: 'WEB201', color: '#ec4899' } },
];

const SPECIAL_EVENTS = [
  { day: 'Friday', time: '08:00', duration: '720', course: { name: 'Annual Sports Day', code: 'EVENT', color: '#f97316' }, isSpecial: true },
  { day: 'Monday', time: '08:00', duration: '720', course: { name: 'Public Holiday', code: 'HOLIDAY', color: '#3f3f46' }, isSpecial: true },
  { day: 'Wednesday', time: '08:00', duration: '720', course: { name: 'Tech Festival', code: 'FEST', color: '#d946ef' }, isSpecial: true },
  { day: 'Thursday', time: '08:00', duration: '720', course: { name: 'Thanksgiving Break', code: 'HOLIDAY', color: '#3f3f46' }, isSpecial: true },
  { day: 'Friday', time: '08:00', duration: '720', course: { name: 'Thanksgiving Break', code: 'HOLIDAY', color: '#3f3f46' }, isSpecial: true },
  { day: 'Tuesday', time: '09:00', duration: '180', course: { name: 'Midterm Proct: Adv Calculus', code: 'EXAM', color: '#ef4444' }, isSpecial: true },
  { day: 'Thursday', time: '14:00', duration: '180', course: { name: 'Midterm Proct: Machine Learning', code: 'EXAM', color: '#ef4444' }, isSpecial: true },
  { day: 'Monday', time: '09:00', duration: '180', course: { name: 'Final Proct: CS 101', code: 'EXAM', color: '#ef4444' }, isSpecial: true },
  { day: 'Wednesday', time: '13:00', duration: '180', course: { name: 'Final Proct: Physics', code: 'EXAM', color: '#ef4444' }, isSpecial: true },
];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM

export default function TeacherCalendarPage() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [view, setView] = useState('Semester'); // Day, Week, Month, Semester
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Base date is Monday, Sep 14, 2026
  const baseDate = new Date(2026, 8, 14);

  const generatedDates = useMemo(() => {
    let daysToGenerate = 70; // Semester (8 weeks)
    if (view === 'Day') daysToGenerate = 1;
    if (view === 'Week') daysToGenerate = 5;
    if (view === 'Month') daysToGenerate = 20;

    const dates = [];
    const startDate = new Date(baseDate.getTime() + currentWeekOffset * 7 * 24 * 60 * 60 * 1000);
    
    let currentDate = new Date(startDate);
    if (view !== 'Day') {
      while (currentDate.getDay() !== 1) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
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
      schedule = schedule.filter(s => s.course.name !== 'Physics Lab');
      schedule.push(SPECIAL_EVENTS[5]);
    } else if (weekOffset === 6 && dayName === 'Thursday') {
      schedule = schedule.filter(s => s.course.name !== 'Data Structures');
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

  const parseTimeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
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
      <Topbar 
        title="Teaching Timetable" 
        subtitle="Manage your classes and office hours" 
        rightNode={
          <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" onClick={() => toast.success('Exporting schedule...')}>
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />
      
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header Controls */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-4 justify-between w-full xl:w-auto">
              <button onClick={() => { setCurrentWeekOffset(0); setView('Day'); }} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors hidden sm:block">
                Today
              </button>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <button onClick={() => setCurrentWeekOffset(prev => prev - (view === 'Month' ? 4 : (view === 'Semester' ? 8 : 1)))} className="p-3 sm:p-2 hover:bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
                  <ChevronLeft className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="flex items-center gap-2 px-2 sm:px-4 py-2 hover:bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white font-medium transition-colors min-w-[180px] sm:min-w-[220px] justify-center text-sm sm:text-base"
                  >
                    <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                    {currentRangeString()}
                  </button>
                  {showDatePicker && (
                    <div className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xl z-50">
                      <input 
                        type="date" 
                        className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white [color-scheme:dark]"
                        onChange={(e) => {
                          if (e.target.value) {
                            const selectedDate = new Date(e.target.value);
                            const diffTime = selectedDate.getTime() - baseDate.getTime();
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            setCurrentWeekOffset(Math.floor(diffDays / 7));
                            setShowDatePicker(false);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
                <button onClick={() => setCurrentWeekOffset(prev => prev + (view === 'Month' ? 4 : (view === 'Semester' ? 8 : 1)))} className="p-3 sm:p-2 hover:bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
                  <ChevronRight className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
              <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg w-full xl:w-auto justify-between xl:justify-start overflow-x-auto scrollbar-none">
                <button onClick={() => setView('Day')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Day' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white'}`}>Day</button>
                <button onClick={() => setView('Week')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Week' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white'}`}>Week</button>
                <button onClick={() => setView('Month')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Month' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white'}`}>Month</button>
                <button onClick={() => setView('Semester')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Semester' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white'}`}>Semester</button>
              </div>
              <div className="hidden xl:block w-px h-8 bg-zinc-200 dark:bg-zinc-700"></div>
              <button className="w-full xl:w-auto px-4 py-3 sm:py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 rounded-lg text-sm font-medium transition-colors" onClick={() => toast.success('Add Office Hours Modal')}>
                + Office Hours
              </button>
            </div>
          </div>

          {/* Continuous Scroll View */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-lg flex [--hour-height:130px] sm:[--hour-height:96px]">
            {/* Sticky Time Column */}
            <div className="w-16 sm:w-20 flex-shrink-0 sticky left-0 z-20 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800/50 shadow-[2px_0_10px_rgba(0,0,0,0.05)] dark:shadow-[2px_0_10px_rgba(0,0,0,0.2)]">
              <div className="h-16 border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/80"></div>
              <div className="relative" style={{ height: `calc(${HOURS.length} * var(--hour-height))` }}>
                {HOURS.map((hour, i) => (
                  <div key={hour} className="absolute left-0 right-0 border-t border-zinc-200 dark:border-zinc-800/50 flex justify-end pr-1 sm:pr-2 pt-2" style={{ top: `calc(${i} * var(--hour-height))`, height: 'var(--hour-height)' }}>
                    <span className="text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-500">
                      {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable Days */}
            <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 pb-2">
              <div className="flex [--col-width:280px] sm:[--col-width:240px]" style={{ width: `calc(${generatedDates.length} * var(--col-width))` }}>
                {generatedDates.map((date, index) => {
                  const scheduleForDate = getScheduleForDate(date);
                  const isToday = isSameDay(date, new Date());
                  
                  return (
                    <div key={index} className="flex-1 w-[var(--col-width)] border-r border-zinc-200 dark:border-zinc-800/50 last:border-r-0">
                      {/* Day Header */}
                      <div className={`h-16 border-b border-zinc-200 dark:border-zinc-800/50 flex flex-col items-center justify-center sticky top-0 z-10 ${isToday ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-white dark:bg-zinc-900/80'}`}>
                        <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-500'}`}>
                          {date.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className={`text-xl font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-800 dark:text-zinc-300'}`}>
                          {format(date, 'd')}
                        </span>
                      </div>

                      {/* Day Content */}
                      <div className="relative bg-zinc-50/30 dark:bg-zinc-950/20" style={{ height: `calc(${HOURS.length} * var(--hour-height))` }}>
                        {/* Grid Lines */}
                        {HOURS.map((hour, i) => (
                          <div key={hour} className="absolute left-0 right-0 border-t border-zinc-200 dark:border-zinc-800/20 transition-colors" style={{ top: `calc(${i} * var(--hour-height))`, height: 'var(--hour-height)' }}></div>
                        ))}
                        
                        {/* Schedule Blocks */}
                        {scheduleForDate.map((cls, i) => {
                          const startMinutes = parseTimeToMinutes(cls.time);
                          const gridStartMinutes = 8 * 60;
                          const topOffsetHours = (startMinutes - gridStartMinutes) / 60;
                          const durationMinutes = parseInt(cls.duration) || 90;
                          const durationHours = durationMinutes / 60;

                          return (
                            <div 
                              key={i}
                              className="absolute left-1 right-1 rounded-lg p-3 sm:p-4 overflow-hidden shadow-sm transition-transform hover:scale-[1.02] hover:z-10 cursor-pointer"
                              style={{
                                top: `calc(${topOffsetHours} * var(--hour-height) + 2px)`,
                                height: `calc(${durationHours} * var(--hour-height) - 4px)`,
                                backgroundColor: `${cls.course.color}20` || '#6366f120',
                                borderLeft: `4px solid ${cls.course.color || '#6366f1'}`,
                                borderTop: `1px solid ${cls.course.color}40`,
                                borderRight: `1px solid ${cls.course.color}40`,
                                borderBottom: `1px solid ${cls.course.color}40`,
                              }}
                              onClick={() => toast.success(`Viewing details for ${cls.course.name}`)}
                            >
                              <div className="text-xs font-bold mb-1" style={{ color: cls.course.color || '#818cf8' }}>
                                {cls.course.code}
                              </div>
                              <div className="text-sm font-medium text-zinc-900 dark:text-white mb-2 leading-tight">
                                {cls.course.name}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 mb-1">
                                <Clock className="w-3 h-3" />
                                {cls.time}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                                <Users className="w-3 h-3" />
                                32 Students
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
    </>
  );
}
