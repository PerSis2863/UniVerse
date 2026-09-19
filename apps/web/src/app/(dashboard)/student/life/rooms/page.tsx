'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Map, Calendar as CalendarIcon, Clock, Users, Search } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RoomReservationPage() {
  return (
    <>
      <Topbar 
        title="Room Reservation" 
        subtitle="Book study rooms and collaboration spaces" 
      />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Info Banner */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex gap-6 items-center"
          >
            <div className="w-14 h-14 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Map className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Need a quiet place?</h2>
              <p className="text-indigo-200/80 text-sm">
                Reserve library study rooms, media labs, or presentation spaces up to 2 weeks in advance.
              </p>
            </div>
          </motion.div>

          {/* Search Form */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-3xl bg-[#0d1117] border border-white/[0.08] shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white mb-6">Find a Space</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  <input 
                    type="date" 
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Duration</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <Clock className="w-4 h-4" />
                  </div>
                  <select className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 appearance-none">
                    <option value="1">1 Hour</option>
                    <option value="2">2 Hours</option>
                    <option value="3">3 Hours</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Group Size</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <Users className="w-4 h-4" />
                  </div>
                  <select className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 appearance-none">
                    <option value="individual">Individual (1)</option>
                    <option value="small">Small Group (2-4)</option>
                    <option value="large">Large Group (5-10)</option>
                  </select>
                </div>
              </div>
            </div>

            <button className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
              <Search className="w-5 h-5" /> Search Availability
            </button>
          </motion.div>

        </div>
      </div>
    </>
  );
}
