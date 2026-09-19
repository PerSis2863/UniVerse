'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Calendar as CalendarIcon, Clock, Users, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
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
];

export default function TeacherCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM

  // Calculate week offset based on distance from current date
  const today = new Date();
  const diffTime = Math.abs(currentDate.getTime() - today.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  const weekOffset = Math.floor(diffDays / 7);

  const getDayClasses = (dayName: string) => {
    const dMap: Record<string, string> = { 'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday' };
    const fullDayName = dMap[dayName];
    
    let schedule = [...MOCK_SCHEDULE];
    
    // Inject special events based on current week offset to create variety
    if (weekOffset % 3 === 1) {
      schedule = schedule.filter(s => s.day !== 'Friday');
      schedule.push(SPECIAL_EVENTS[0]); // Sports Day
    } else if (weekOffset % 4 === 2) {
      schedule = schedule.filter(s => s.day !== 'Monday');
      schedule.push(SPECIAL_EVENTS[1]); // Public Holiday
    } else if (weekOffset % 5 === 3) {
      schedule = schedule.filter(s => s.day !== 'Wednesday');
      schedule.push(SPECIAL_EVENTS[2]); // Tech Festival
    }

    if (weekOffset === 0) return schedule.filter(cls => cls.day === fullDayName);
    
    const shift = weekOffset;
    
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
    }).filter(cls => cls.day === fullDayName);
  };

  const handlePrevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  const parseTimeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  return (
    <>
      <Topbar 
        title="Teaching Timetable" 
        subtitle="Manage your classes and office hours" 
        rightNode={
          <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" onClick={() => toast.success('Exporting schedule...')}>
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />
      
      <div className="flex-1 p-8 overflow-y-auto bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-4">
              <button onClick={handleToday} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors">
                Today
              </button>
              <div className="flex items-center gap-2">
                <button onClick={handlePrevWeek} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-800 rounded-lg text-white font-medium transition-colors"
                  >
                    <CalendarIcon className="w-5 h-5 text-indigo-400" />
                    {format(start, 'MMM d')} - {format(addDays(start, 4), 'MMM d, yyyy')}
                  </button>
                  {showDatePicker && (
                    <div className="absolute top-full mt-2 left-0 w-64 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl z-50">
                      <input 
                        type="date" 
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white [color-scheme:dark]"
                        onChange={(e) => {
                          if (e.target.value) {
                            setCurrentDate(new Date(e.target.value));
                            setShowDatePicker(false);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
                <button onClick={handleNextWeek} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors" onClick={() => toast.success('Add Office Hours Modal')}>
                + Add Office Hours
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-x-auto shadow-lg">
            <div className="flex min-w-[1000px]">
              <div className="w-20 flex-shrink-0 border-r border-zinc-800/50 bg-zinc-900/80">
                <div className="h-16 border-b border-zinc-800/50"></div>
              {hours.map(hour => (
                <div key={hour} className="h-24 border-b border-zinc-800/50 relative">
                  <span className="absolute -top-3 right-3 text-xs text-zinc-500 font-medium">
                    {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 flex overflow-x-auto">
              {days.map((day, index) => {
                const date = addDays(start, index);
                const isToday = isSameDay(date, new Date());
                const dayClasses = getDayClasses(day);

                return (
                  <div key={day} className="flex-1 min-w-[200px] border-r border-zinc-800/50 last:border-r-0">
                    <div className={`h-16 border-b border-zinc-800/50 flex flex-col items-center justify-center ${isToday ? 'bg-indigo-500/10' : 'bg-zinc-900/80'}`}>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-indigo-400' : 'text-zinc-500'}`}>{day}</span>
                      <span className={`text-xl font-bold ${isToday ? 'text-indigo-400' : 'text-zinc-300'}`}>{format(date, 'd')}</span>
                    </div>

                    <div className="relative" style={{ height: `${hours.length * 96}px` }}>
                      {hours.map(hour => (
                        <div key={hour} className="h-24 border-b border-zinc-800/20"></div>
                      ))}
                      
                      {dayClasses.map((cls, i) => {
                        const startMinutes = parseTimeToMinutes(cls.time);
                        const gridStartMinutes = 8 * 60;
                        const topOffset = ((startMinutes - gridStartMinutes) / 60) * 96;
                        const durationMinutes = parseInt(cls.duration) || 90;
                        const height = (durationMinutes / 60) * 96;

                        return (
                          <div 
                            key={i}
                            className="absolute left-1 right-1 rounded-lg p-3 overflow-hidden shadow-sm transition-transform hover:scale-[1.02] hover:z-10 cursor-pointer"
                            style={{
                              top: `${topOffset}px`,
                              height: `${height}px`,
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
                            <div className="text-sm font-medium text-white mb-2 leading-tight">
                              {cls.course.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-300 mb-1">
                              <Clock className="w-3 h-3" />
                              {cls.time}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-300">
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
