'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Clock, MapPin, Users, Video, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const schedule = [
  { id: 1, time: '09:00 AM', duration: 90, title: 'Computer Networks', type: 'Lecture', location: 'Room 304, Tech Bldg', prof: 'Vint Cerf', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  { id: 2, time: '11:00 AM', duration: 60, title: 'Data Structures Lab', type: 'Lab', location: 'Lab 2, CS Dept', prof: 'Dr. Sarah Chen', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  { id: 3, time: '02:00 PM', duration: 120, title: 'Operating Systems', type: 'Lecture', location: 'Virtual', prof: 'Prof. Alan Turing', color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20' },
  { id: 4, time: '04:30 PM', duration: 60, title: 'Study Group: DB', type: 'Peer Session', location: 'Library 2nd Floor', prof: 'Peers', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
];

export default function CalendarPage() {
  return (
    <>
      <Topbar 
        title="Timetable & Calendar" 
        subtitle="Manage your academic schedule and upcoming events."
        action={{ label: 'Add Event', onClick: () => console.log('add') }}
      />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex flex-col xl:flex-row gap-8">
          
          {/* Main Calendar Area */}
          <div className="flex-1 space-y-6">
            
            {/* Calendar Header Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-zinc-900 dark:text-white">Today</h2>
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Monday, Sept 20, 2026</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-xl border border-zinc-200 dark:border-white/[0.06] hover:bg-zinc-100 dark:hover:bg-white/[0.03] text-zinc-600 dark:text-zinc-300 transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button className="p-2 rounded-xl border border-zinc-200 dark:border-white/[0.06] hover:bg-zinc-100 dark:hover:bg-white/[0.03] text-zinc-600 dark:text-zinc-300 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-zinc-200 dark:bg-white/[0.06] mx-2" />
                <div className="flex bg-zinc-100 dark:bg-white/[0.03] p-1 rounded-xl border border-zinc-200 dark:border-white/[0.06]">
                  <button className="px-4 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-bold shadow-sm">Day</button>
                  <button className="px-4 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 text-sm font-medium hover:text-zinc-900 dark:hover:text-white transition-colors">Week</button>
                  <button className="px-4 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 text-sm font-medium hover:text-zinc-900 dark:hover:text-white transition-colors">Month</button>
                </div>
              </div>
            </div>

            {/* Daily Timeline */}
            <div className="relative mt-8">
              {/* Timeline Grid */}
              <div className="absolute top-0 bottom-0 left-[4.5rem] w-px bg-zinc-200 dark:bg-white/[0.06]" />
              
              <div className="space-y-8 relative">
                {schedule.map((event, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={event.id} 
                    className="flex gap-6 relative group"
                  >
                    {/* Time Label */}
                    <div className="w-16 pt-3 text-right">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white block">{event.time.split(' ')[0]}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{event.time.split(' ')[1]}</span>
                    </div>

                    {/* Timeline Node */}
                    <div className="absolute left-[4.5rem] top-4 w-3 h-3 rounded-full bg-indigo-500 border-4 border-zinc-50 dark:border-[#0d1117] -translate-x-1.5" />

                    {/* Event Card */}
                    <div className={`flex-1 p-5 rounded-2xl border ${event.color} transition-transform hover:-translate-y-1`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{event.type}</div>
                          <h3 className="text-lg font-bold">{event.title}</h3>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-md bg-white/20 dark:bg-black/20">
                          {event.duration} min
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm mt-4 opacity-90">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" /> {event.prof}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {event.location === 'Virtual' ? <Video className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                          {event.location}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Sidebar */}
          <div className="w-full xl:w-80 space-y-6">
            <div className="card">
              <h3 className="font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-500" /> Mini Calendar
              </h3>
              <div className="w-full aspect-square rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/[0.04] flex items-center justify-center text-sm text-zinc-500">
                [Calendar Widget Placeholder]
              </div>
            </div>

            <div className="card space-y-4">
              <h3 className="font-bold text-zinc-900 dark:text-white flex items-center justify-between">
                Upcoming Deadlines
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-rose-500/10 text-rose-500">3 Due</span>
              </h3>
              
              <div className="space-y-3">
                {[
                  { title: 'OS Midterm Prep', time: 'Tomorrow, 11:59 PM', color: 'bg-rose-500' },
                  { title: 'Networking Lab Report', time: 'Wed, 5:00 PM', color: 'bg-amber-500' },
                  { title: 'DB Group Project', time: 'Friday, 10:00 AM', color: 'bg-emerald-500' },
                ].map((task, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors border border-transparent hover:border-zinc-100 dark:hover:border-white/[0.04] cursor-pointer">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${task.color}`} />
                    <div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-white">{task.title}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" /> {task.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button className="w-full btn-secondary text-xs mt-2 py-2 flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Task
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
