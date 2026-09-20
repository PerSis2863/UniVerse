'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Map, Calendar as CalendarIcon, Clock, Users, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useState } from 'react';

export default function RoomReservationPage() {
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    setIsSearching(true);
    setHasSearched(false);
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: 'Searching for available rooms...',
        success: 'Found 3 available rooms!',
        error: 'Error searching for rooms',
      }
    );
    setTimeout(() => {
      setIsSearching(false);
      setHasSearched(true);
    }, 1500);
  };

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
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Duration</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <Clock className="w-4 h-4" />
                  </div>
                  <select className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 appearance-none [color-scheme:dark]">
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
                  <select className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 appearance-none [color-scheme:dark]">
                    <option value="individual">Individual (1)</option>
                    <option value="small">Small Group (2-4)</option>
                    <option value="large">Large Group (5-10)</option>
                  </select>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className={`w-5 h-5 ${isSearching ? 'animate-spin' : ''}`} /> 
              {isSearching ? 'Searching...' : 'Search Availability'}
            </button>
          </motion.div>

          {/* Results */}
          {hasSearched && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h3 className="text-lg font-bold text-white mb-4">Available Rooms</h3>
              {[
                { name: 'Library Study Room 4A', capacity: 4, type: 'Study Room', features: ['Whiteboard', 'Monitor'] },
                { name: 'Media Lab B', capacity: 2, type: 'Media Lab', features: ['Mac Studio', 'Dual Monitors'] },
                { name: 'Innovation Hub 1', capacity: 6, type: 'Collaboration', features: ['Smart Board', 'Video Conf'] },
              ].map((room, i) => (
                <div key={i} className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-6 flex flex-col sm:flex-row gap-6 justify-between items-center hover:bg-white/[0.02] transition-colors shadow-lg">
                  <div>
                    <h4 className="font-bold text-white text-lg">{room.name}</h4>
                    <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
                      <span className="flex items-center gap-1"><Users className="w-4 h-4" /> Up to {room.capacity}</span>
                      <span className="flex items-center gap-1"><Map className="w-4 h-4" /> {room.type}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {room.features.map(f => (
                        <span key={f} className="px-2.5 py-1 rounded-md bg-white/[0.05] text-xs font-medium text-zinc-300">{f}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => toast.success(`Booked ${room.name}!`)} className="px-6 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold transition-colors shrink-0 border border-indigo-500/20 hover:border-indigo-500/40 w-full sm:w-auto">
                    Book Now
                  </button>
                </div>
              ))}
            </motion.div>
          )}

        </div>
      </div>
    </>
  );
}
