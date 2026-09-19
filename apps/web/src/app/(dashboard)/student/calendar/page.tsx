'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar as CalendarIcon, Clock, MapPin, ChevronLeft, ChevronRight, Video, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
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
  const [view, setView] = useState('Week');

  const getWeekString = (offset: number) => {
    // Base date is Monday, Sep 18, 2026
    const baseDate = new Date(2026, 8, 18);
    // Add offset weeks (7 days * offset)
    const startDate = new Date(baseDate.getTime() + offset * 7 * 24 * 60 * 60 * 1000);
    // End date is Friday, which is 4 days after Monday
    const endDate = new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000);
    
    const formatOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const formatOptsShort: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    
    if (startDate.getFullYear() === endDate.getFullYear()) {
      return `${startDate.toLocaleDateString('en-US', formatOptsShort)} - ${endDate.toLocaleDateString('en-US', formatOpts)}`;
    }
    
    return `${startDate.toLocaleDateString('en-US', formatOpts)} - ${endDate.toLocaleDateString('en-US', formatOpts)}`;
  };

  const getActiveSchedule = () => {
    let schedule = [...MOCK_SCHEDULE];
    
    // Inject special events based on current week offset to create variety
    if (Math.abs(currentWeekOffset) % 3 === 1) {
      schedule = schedule.filter(s => s.day !== 'Friday');
      schedule.push(SPECIAL_EVENTS[0]); // Sports Day
    } else if (Math.abs(currentWeekOffset) % 4 === 2) {
      schedule = schedule.filter(s => s.day !== 'Monday');
      schedule.push(SPECIAL_EVENTS[1]); // Public Holiday
    } else if (Math.abs(currentWeekOffset) % 5 === 3) {
      schedule = schedule.filter(s => s.day !== 'Wednesday');
      schedule.push(SPECIAL_EVENTS[2]); // Tech Festival
    }

    if (currentWeekOffset === 0 && view === 'Week') return schedule;
    
    // Create some variation based on the offset and view
    const shift = Math.abs(currentWeekOffset) + (view === 'Month' ? 2 : 0) + (view === 'Day' ? 1 : 0);
    
    return schedule.filter((s, idx) => {
      if ((s as any).isSpecial) return true; // Keep special events
      // Drop some classes to make the week look different
      return (idx + shift) % 4 !== 0; 
    }).map((s, idx) => {
      // Shift times slightly for regular classes
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

  const activeSchedule = getActiveSchedule();
  const currentWeekString = view === 'Month' ? 'September 2026' : (view === 'Day' ? getWeekString(currentWeekOffset).split(' - ')[0] : getWeekString(currentWeekOffset));

  return (
    <>
      <Topbar title="My Timetable" subtitle={`View your ${view.toLowerCase()}ly class schedule`} />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setCurrentWeekOffset(prev => prev - 1)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white min-w-[200px] text-center">{currentWeekString}</h2>
              <button onClick={() => setCurrentWeekOffset(prev => prev + 1)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => setView('Day')} className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Day' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Day</button>
              <button onClick={() => setView('Week')} className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Week' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Week</button>
              <button onClick={() => setView('Month')} className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-colors ${view === 'Month' ? 'bg-indigo-600 text-zinc-900 dark:text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800'}`}>Month</button>
            </div>
          </div>

          {/* Grid View */}
          <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-x-auto shadow-xl scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 pb-2">
            <div className="min-w-[1000px]">
              {/* Header Row */}
              <div className="grid grid-cols-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80">
                  <div className="p-4 border-r border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-zinc-500 dark:text-zinc-500" />
                  </div>
                  {DAYS.map(day => (
                    <div key={day} className="p-4 text-center border-r border-zinc-200 dark:border-zinc-800 last:border-r-0">
                      <h3 className="font-semibold text-zinc-300">{day}</h3>
                    </div>
                  ))}
                </div>

                {/* Time Rows */}
                <div className="relative">
                  {HOURS.map(hour => (
                    <div key={hour} className="grid grid-cols-6 border-b border-zinc-200 dark:border-zinc-800/50 last:border-b-0 h-24">
                      <div className="p-2 border-r border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-500 text-center relative">
                        <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-50 dark:bg-zinc-950 px-2">{hour}</span>
                      </div>
                      {DAYS.map(day => (
                        <div key={day} className="border-r border-zinc-200 dark:border-zinc-800/50 last:border-r-0 relative hover:bg-white/[0.01] transition-colors">
                          {/* Render blocks here if they match hour & day */}
                          {activeSchedule.filter(s => s.day === day && s.time === hour).map(cls => (
                            <div 
                              key={cls.id} 
                              className={`absolute top-1 left-1 right-1 p-3 rounded-xl border z-10 hover:z-20 transition-all cursor-pointer hover:shadow-lg ${cls.color}`}
                              style={{ height: `calc(${cls.duration * 6}rem - 0.5rem)` }}
                              onClick={() => toast.success(`Viewing details for ${cls.subject}`)}
                            >
                              <div className="font-bold text-sm leading-tight mb-1">{cls.subject}</div>
                              <div className="text-xs opacity-80 flex items-center gap-1 mb-1 font-medium">
                                <Clock className="w-3 h-3" /> {formatTimeRange(cls.time, cls.duration)}
                              </div>
                              <div className="text-xs opacity-80 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {cls.location}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

        </div>
      </div>
    </>
  );
}
