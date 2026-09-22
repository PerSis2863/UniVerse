'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar as CalendarIcon, Clock, MapPin, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ClassDetailModal, ClassData } from '@/components/dashboard/ClassDetailModal';

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [timetableSlots, setTimetableSlots] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  const SAMPLE_SLOTS = [
    { id: 's1', dayOfWeek: 0, startTime: '09:00', endTime: '10:30', course: { name: 'Operating Systems', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }, room: { name: 'Hall A-101' }, type: 'Lecture' },
    { id: 's2', dayOfWeek: 2, startTime: '09:00', endTime: '10:30', course: { name: 'Operating Systems', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }, room: { name: 'Hall A-101' }, type: 'Lecture' },
    { id: 's3', dayOfWeek: 1, startTime: '11:00', endTime: '12:30', course: { name: 'Machine Learning', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' }, room: { name: 'Lab B-205' }, type: 'Lab' },
    { id: 's4', dayOfWeek: 3, startTime: '11:00', endTime: '12:30', course: { name: 'Machine Learning', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' }, room: { name: 'Lab B-205' }, type: 'Lab' },
    { id: 's5', dayOfWeek: 0, startTime: '14:00', endTime: '15:30', course: { name: 'Advanced Algorithms', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }, room: { name: 'Room C-312' }, type: 'Lecture' },
    { id: 's6', dayOfWeek: 2, startTime: '14:00', endTime: '15:30', course: { name: 'Advanced Algorithms', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }, room: { name: 'Room C-312' }, type: 'Lecture' },
    { id: 's7', dayOfWeek: 1, startTime: '16:00', endTime: '17:00', course: { name: 'Ethics in AI', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }, room: { name: 'Seminar D-108' }, type: 'Seminar' },
    { id: 's8', dayOfWeek: 4, startTime: '10:00', endTime: '11:00', course: { name: 'Cloud Computing', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' }, room: { name: 'Online (Zoom)' }, type: 'Lecture' },
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      const [slotsRes, eventsRes] = await Promise.all([
        api.get('/timetable/my'),
        api.get('/calendar/my')
      ]);
      const slots = slotsRes.data || [];
      setTimetableSlots(slots.length > 0 ? slots : SAMPLE_SLOTS);
      setCalendarEvents(eventsRes.data || []);
    } catch (error) {
      // Backend offline — show sample schedule
      setTimetableSlots(SAMPLE_SLOTS);
      setCalendarEvents([]);
    } finally {
      setLoading(false);
    }
  };


  const getDuration = (start: string, end: string) => {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    return (h2 + m2 / 60) - (h1 + m1 / 60);
  };

  const mappedTimetable = useMemo(() => {
    return timetableSlots.map(slot => ({
      id: slot.id,
      day: DAYS[slot.dayOfWeek] || 'Monday',
      time: slot.startTime,
      duration: getDuration(slot.startTime, slot.endTime),
      subject: slot.course?.name || 'Unknown Course',
      location: slot.room?.name || 'TBD',
      type: slot.type || 'Lecture',
      color: slot.course?.color || 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
    }));
  }, [timetableSlots]);

  const mappedEvents = useMemo(() => {
    return calendarEvents.map(evt => {
      const startObj = new Date(evt.startAt);
      const endObj = new Date(evt.endAt);
      const durationHours = (endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60);
      
      const hh = startObj.getHours().toString().padStart(2, '0');
      const mm = startObj.getMinutes().toString().padStart(2, '0');

      return {
        id: evt.id,
        dateObj: startObj,
        dateString: startObj.toDateString(),
        time: `${hh}:${mm}`,
        duration: durationHours || 1,
        subject: evt.title,
        location: evt.description || 'Virtual',
        type: evt.type,
        color: evt.color || 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        isSpecial: true
      };
    });
  }, [calendarEvents]);

  // Base date is Monday of current week
  const baseDate = useMemo(() => {
    const d = new Date();
    const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
  }, []);

  const generatedDates = useMemo(() => {
    let daysToGenerate = 70; // Semester (10 weeks)
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
  }, [currentWeekOffset, view, baseDate]);

  const getScheduleForDate = (date: Date) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toDateString();
    
    // Get recurring timetable classes for this day of week
    const regularClasses = mappedTimetable.filter(s => s.day === dayName);
    
    // Get specific events for this date
    const specificEvents = mappedEvents.filter(e => e.dateString === dateStr);
    
    return [...regularClasses, ...specificEvents];
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
          <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl flex [--hour-height:80px] sm:[--hour-height:96px]">
            {/* Sticky Time Column */}
            <div className="w-14 sm:w-20 flex-shrink-0 sticky left-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-r border-zinc-200 dark:border-zinc-800 shadow-[4px_0_12px_rgba(0,0,0,0.03)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.2)]">
              <div className="h-16 flex items-center justify-center border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-500" />
              </div>
              <div className="relative" style={{ height: `calc(${HOURS.length} * var(--hour-height))` }}>
                {HOURS.map((hour, i) => (
                  <div key={hour} className="absolute left-0 right-0 border-t border-zinc-200 dark:border-zinc-800/50 flex items-start justify-center pt-2" style={{ top: `calc(${i} * var(--hour-height))`, height: 'var(--hour-height)' }}>
                    <span className="text-[10px] sm:text-xs font-medium text-zinc-500 bg-transparent px-1">{hour}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable Days */}
            <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 pb-2 snap-x snap-mandatory">
              <div className="flex [--col-width:calc(100vw-5rem)] sm:[--col-width:240px]" style={{ width: `calc(${generatedDates.length} * var(--col-width))` }}>
                {loading ? (
                  <div className="w-full h-64 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  </div>
                ) : generatedDates.map((date, idx) => {
                  const scheduleForDate = getScheduleForDate(date);
                  const isToday = new Date().toDateString() === date.toDateString();
                  
                  // Calculate current time offset
                  const now = new Date();
                  const currentHour = now.getHours();
                  const currentMinute = now.getMinutes();
                  const baseStart = 8;
                  const currentTimeOffset = (currentHour - baseStart) + (currentMinute / 60);
                  const showCurrentTimeLine = isToday && mounted && currentHour >= 8 && currentHour <= 20;
                  
                  return (
                    <div key={idx} className="flex-1 w-[var(--col-width)] border-r border-zinc-200 dark:border-zinc-800/50 last:border-r-0 snap-start">
                      {/* Day Header */}
                      <div className={`h-16 border-b border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center sticky top-0 z-20 backdrop-blur-md ${isToday ? 'bg-indigo-50/90 dark:bg-indigo-500/20 border-b-indigo-200 dark:border-b-indigo-500/30' : 'bg-white/90 dark:bg-zinc-900/90'}`}>
                        <h3 className={`font-bold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-900 dark:text-zinc-300'}`}>
                          {date.toLocaleDateString('en-US', { weekday: 'short' })}
                        </h3>
                        <span className={`text-[10px] sm:text-xs font-medium ${isToday ? 'text-indigo-500/80 bg-indigo-100 dark:bg-indigo-500/20 px-2 py-0.5 rounded-full mt-0.5' : 'text-zinc-500 mt-1'}`}>
                          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      
                      {/* Day Content */}
                      <div className="relative bg-zinc-50/30 dark:bg-zinc-950/20" style={{ height: `calc(${HOURS.length} * var(--hour-height))` }}>
                        {/* Grid Lines */}
                        {HOURS.map((hour, i) => (
                          <div key={hour} className="absolute left-0 right-0 border-t border-dashed border-zinc-200 dark:border-zinc-800/40 transition-colors" style={{ top: `calc(${i} * var(--hour-height))`, height: 'var(--hour-height)' }}></div>
                        ))}
                        
                        {/* Current Time Indicator */}
                        {showCurrentTimeLine && (
                          <div 
                            className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                            style={{ top: `calc(${currentTimeOffset} * var(--hour-height))` }}
                          >
                            <div className="w-2 h-2 rounded-full bg-red-500 absolute -left-1 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                            <div className="flex-1 h-[2px] bg-red-500/50 shadow-[0_0_4px_rgba(239,68,68,0.4)]"></div>
                          </div>
                        )}
                        
                        {/* Schedule Blocks */}
                        {scheduleForDate.length === 0 ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none">
                            <Clock className="w-8 h-8 mb-2 text-zinc-400" />
                            <span className="text-xs font-medium text-zinc-500">No classes</span>
                          </div>
                        ) : scheduleForDate.map(cls => {
                          const startHour = parseInt(cls.time.split(':')[0]);
                          const startMin = parseInt(cls.time.split(':')[1]);
                          const baseStart = 8; // 08:00
                          const topOffsetHours = (startHour - baseStart) + (startMin / 60);
                          const durationHours = cls.duration;

                          return (
                            <div 
                              key={cls.id} 
                              className={`absolute left-1 right-1 sm:left-2 sm:right-2 rounded-xl border p-2 sm:p-3 z-10 hover:z-30 transition-all duration-200 cursor-pointer hover:shadow-xl hover:scale-[1.02] overflow-hidden backdrop-blur-md shadow-sm ${cls.color}`}
                              style={{ 
                                top: `calc(${topOffsetHours} * var(--hour-height) + 4px)`, 
                                height: `calc(${durationHours} * var(--hour-height) - 8px)` 
                              }}
                              onClick={() => setSelectedClass({ ...cls, dateObj: date })}
                            >
                              <div className="absolute top-0 left-0 w-1 h-full bg-current opacity-20"></div>
                              <div className="font-bold text-xs sm:text-sm leading-tight mb-1 truncate pl-1">{cls.subject}</div>
                              <div className="text-[10px] sm:text-xs opacity-90 flex items-center gap-1.5 mb-1 font-medium pl-1">
                                <Clock className="w-3 h-3 flex-shrink-0 opacity-70" /> <span className="truncate">{formatTimeRange(cls.time, cls.duration)}</span>
                              </div>
                              <div className="text-[10px] sm:text-xs opacity-90 flex items-center gap-1.5 pl-1">
                                <MapPin className="w-3 h-3 flex-shrink-0 opacity-70" /> <span className="truncate">{cls.location}</span>
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
      <ClassDetailModal 
        selectedClass={selectedClass} 
        onClose={() => setSelectedClass(null)} 
      />
    </>
  );
}
