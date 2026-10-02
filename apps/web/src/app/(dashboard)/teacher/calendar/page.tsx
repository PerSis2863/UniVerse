'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar as CalendarIcon, Clock, Users, ChevronLeft, ChevronRight, Download, X, Plus, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { format, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { m as motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { downloadIcs } from '@/components/dashboard/CourseBoard';
import { courseColor } from '@/lib/course-color';
import { CalendarFeedCard } from '@/components/dashboard/CalendarFeedCard';

// Shapes of /timetable/my and /calendar/my, as this page uses them.
interface Slot { id: string; courseId?: string; dayOfWeek: number; startTime: string; endTime: string; type?: string; course?: { id?: string; name?: string; code?: string; color?: string | null } | null; room?: { name?: string } | null }
interface CalEvent { id: string; courseId?: string | null; title: string; description?: string | null; startAt: string; endAt: string; type?: string; color?: string | null }
// True once the page runs in the browser (false while rendering on the server), without an effect.
const noSubscribe = () => () => {};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TeacherCalendarPage() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [view, setView] = useState('Semester');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [officeDay, setOfficeDay] = useState('Wednesday');
  const [officeTime, setOfficeTime] = useState('14:00');
  const [officeDuration, setOfficeDuration] = useState('60');
  const [officeLocation, setOfficeLocation] = useState('Room 301');
  const [savingOffice, setSavingOffice] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const [timetableSlots, setTimetableSlots] = useState<Slot[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Weekly classes repeat for the next 16 weeks; one-off events (office hours etc.) are exported as-is.
  const exportIcs = () => {
    if (!timetableSlots.length && !calendarEvents.length) return void toast.info('Nothing to export yet — your classes and events will appear here first.');
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (v: string) => v.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Teaching Timetable//EN', 'CALSCALE:GREGORIAN'];
    const today = new Date();
    for (const slot of timetableSlots) {
      const first = new Date(today);
      const jsDay = (slot.dayOfWeek + 1) % 7; // 0=Mon in our data, 0=Sun in JS
      first.setDate(today.getDate() + ((jsDay - today.getDay() + 7) % 7));
      const [sh, sm] = String(slot.startTime).split(':').map(Number);
      const [eh, em] = String(slot.endTime).split(':').map(Number);
      const start = new Date(first); start.setHours(sh, sm, 0, 0);
      const end = new Date(first); end.setHours(eh, em, 0, 0);
      lines.push('BEGIN:VEVENT', `UID:slot-${slot.id}@universe`, `DTSTAMP:${utc(today)}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`, 'RRULE:FREQ=WEEKLY;COUNT=16',
        `SUMMARY:${esc(`${slot.course?.code ?? ''} ${slot.course?.name ?? 'Class'}`.trim())}`, ...(slot.room?.name ? [`LOCATION:${esc(slot.room.name)}`] : []), 'END:VEVENT');
    }
    for (const e of calendarEvents) {
      lines.push('BEGIN:VEVENT', `UID:event-${e.id}@universe`, `DTSTAMP:${utc(today)}`, `DTSTART:${utc(new Date(e.startAt))}`, `DTEND:${utc(new Date(e.endAt))}`,
        `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    downloadIcs(lines.join('\r\n'), 'teaching-timetable.ics');
    toast.success('Calendar file downloaded', { description: 'Open it to add your classes to Google, Apple or Outlook Calendar.' });
  };

  // Loads once, when the page opens.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/timetable/my'), api.get('/calendar/my')])
      .then(([slotsRes, eventsRes]) => {
        if (cancelled) return;
        setTimetableSlots(slotsRes.data || []);
        setCalendarEvents(eventsRes.data || []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to fetch schedule data:', error);
        toast.error('Could not load schedule');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSaveOfficeHours = async () => {
    setSavingOffice(true);
    try {
      // Find the next date that matches the officeDay
      const dayIndex = DAYS.indexOf(officeDay);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + ((dayIndex + 1 + 7 - targetDate.getDay()) % 7));
      
      const [hours, minutes] = officeTime.split(':').map(Number);
      targetDate.setHours(hours, minutes, 0, 0);
      
      const endDate = new Date(targetDate.getTime() + parseInt(officeDuration) * 60000);

      const res = await api.post('/calendar', {
        title: 'Office Hours',
        description: officeLocation,
        startAt: targetDate.toISOString(),
        endAt: endDate.toISOString(),
        type: 'MEETING',
        color: '#71717a'
      });
      
      setCalendarEvents(prev => [...prev, res.data]);
      setShowOfficeModal(false);
      toast.success('Office hours added!', { description: `${officeDay} at ${officeTime} for ${officeDuration} mins in ${officeLocation}` });
    } catch (error) {
      console.error('Failed to add office hours:', error);
      toast.error('Could not save office hours');
    } finally {
      setSavingOffice(false);
    }
  };

  const getDurationMins = (start: string, end: string) => {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  };

  const mappedTimetable = useMemo(() => {
    return timetableSlots.map(slot => ({
      day: DAYS[slot.dayOfWeek] || 'Monday',
      time: slot.startTime,
      duration: getDurationMins(slot.startTime, slot.endTime).toString(),
      course: {
        id: slot.course?.id ?? slot.courseId,
        name: slot.course?.name || 'Unknown Course',
        code: slot.course?.code || 'UNK101',
        color: courseColor(slot.course?.color, slot.course?.code)
      }
    }));
  }, [timetableSlots]);

  const mappedEvents = useMemo(() => {
    return calendarEvents.map(evt => {
      const startObj = new Date(evt.startAt);
      const endObj = new Date(evt.endAt);
      const durationMins = (endObj.getTime() - startObj.getTime()) / 60000;
      
      const hh = startObj.getHours().toString().padStart(2, '0');
      const mm = startObj.getMinutes().toString().padStart(2, '0');

      return {
        dateString: startObj.toDateString(),
        time: `${hh}:${mm}`,
        duration: durationMins.toString(),
        course: {
          id: evt.courseId as string | undefined,
          name: evt.title,
          code: evt.type,
          color: evt.color || '#f97316'
        },
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
    
    const currentDate = new Date(startDate);
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
    
    const regularClasses = mappedTimetable.filter(s => s.day === dayName);
    const specificEvents = mappedEvents.filter(e => e.dateString === dateStr);
    
    return [...regularClasses, ...specificEvents];
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
          <button className="btn-primary" onClick={exportIcs}>
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />
      
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header Controls */}
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-4 justify-between w-full xl:w-auto">
              <button onClick={() => { setCurrentWeekOffset(0); setView('Day'); }} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors hidden sm:block">
                Today
              </button>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <button onClick={() => setCurrentWeekOffset(prev => prev - (view === 'Month' ? 4 : (view === 'Semester' ? 8 : 1)))} className="p-3 sm:p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
                  <ChevronLeft className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="flex items-center gap-2 px-2 sm:px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white font-medium transition-colors min-w-[180px] sm:min-w-[220px] justify-center text-sm sm:text-base"
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
                <button onClick={() => setCurrentWeekOffset(prev => prev + (view === 'Month' ? 4 : (view === 'Semester' ? 8 : 1)))} className="p-3 sm:p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors">
                  <ChevronRight className="w-6 h-6 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
              <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg w-full xl:w-auto justify-between xl:justify-start overflow-x-auto scrollbar-none">
                <button onClick={() => setView('Day')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Day' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>Day</button>
                <button onClick={() => setView('Week')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Week' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>Week</button>
                <button onClick={() => setView('Month')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Month' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>Month</button>
                <button onClick={() => setView('Semester')} className={`px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${view === 'Semester' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>Semester</button>
              </div>
              <div className="hidden xl:block w-px h-8 bg-zinc-200 dark:bg-zinc-700"></div>
              <button className="w-full xl:w-auto px-4 py-3 sm:py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 rounded-lg text-sm font-medium transition-colors" onClick={() => setShowOfficeModal(true)}>
                <Plus className="w-4 h-4 inline mr-1" /> Office Hours
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
                {loading ? (
                  <div className="w-full h-64 flex items-center justify-center">
                    <ContentSkeleton variant="list" />
                  </div>
                ) : generatedDates.map((date, index) => {
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
                                backgroundColor: `${courseColor(cls.course.color, cls.course.code)}20`,
                                borderLeft: `4px solid ${courseColor(cls.course.color, cls.course.code)}`,
                                borderTop: `1px solid ${courseColor(cls.course.color, cls.course.code)}40`,
                                borderRight: `1px solid ${courseColor(cls.course.color, cls.course.code)}40`,
                                borderBottom: `1px solid ${courseColor(cls.course.color, cls.course.code)}40`,
                              }}
                              onClick={() => cls.course.id && router.push(`/teacher/blackboard?course=${cls.course.id}`)}
                              title={`Open ${cls.course.name} on Blackboard`}
                            >
                              <div className="text-xs font-bold mb-1" style={{ color: courseColor(cls.course.color, cls.course.code) }}>
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
                                -- Students
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

          <CalendarFeedCard who="teacher" />
        </div>
      </div>
      {mounted && createPortal(
        <AnimatePresence>
          {showOfficeModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowOfficeModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-500" /> Add Office Hours
                  </h3>
                  <button onClick={() => setShowOfficeModal(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Day</label>
                    <select value={officeDay} onChange={e => setOfficeDay(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                      {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Start Time</label>
                      <input type="time" value={officeTime} onChange={e => setOfficeTime(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Duration (mins)</label>
                      <select value={officeDuration} onChange={e => setOfficeDuration(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                        {['30','60','90','120'].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Location / Room</label>
                    <input type="text" value={officeLocation} onChange={e => setOfficeLocation(e.target.value)} placeholder="e.g. Room 301 or Online" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowOfficeModal(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                  <button onClick={handleSaveOfficeHours} aria-busy={savingOffice || undefined} disabled={savingOffice} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                    {savingOffice ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                    ) : (
                      <><Plus className="w-4 h-4" /> Add Office Hours</>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
