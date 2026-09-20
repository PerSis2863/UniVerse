'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Map, Calendar as CalendarIcon, Clock, Users, Search, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useState } from 'react';

type Room = { name: string, capacity: number, type: string, features: string[] };

export default function RoomReservationPage() {
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Form states
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00 AM');
  const [duration, setDuration] = useState('1');

  // Booking modal states
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [bookingStatus, setBookingStatus] = useState<'confirm' | 'loading' | 'success'>('confirm');
  const [bookingId, setBookingId] = useState('');

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

  const handleBookClick = (room: Room) => {
    setSelectedRoom(room);
    setBookingStatus('confirm');
  };

  const confirmBooking = () => {
    setBookingStatus('loading');
    setTimeout(() => {
      const randomId = Math.random().toString(36).substring(2, 10).toUpperCase();
      setBookingId(randomId);
      setBookingStatus('success');
    }, 1500);
  };

  const closeBookingModal = () => {
    setSelectedRoom(null);
    setTimeout(() => {
      setBookingStatus('confirm');
      setBookingId('');
    }, 300);
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Time</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <Clock className="w-4 h-4" />
                  </div>
                  <select 
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 appearance-none [color-scheme:dark]"
                  >
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="01:00 PM">01:00 PM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="03:00 PM">03:00 PM</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Duration</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                    <Clock className="w-4 h-4" />
                  </div>
                  <select 
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-indigo-500 appearance-none [color-scheme:dark]"
                  >
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
                  <button 
                    onClick={() => handleBookClick(room)} 
                    className="px-6 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold transition-colors shrink-0 border border-indigo-500/20 hover:border-indigo-500/40 w-full sm:w-auto"
                  >
                    Book Now
                  </button>
                </div>
              ))}
            </motion.div>
          )}

        </div>
      </div>

      <AnimatePresence>
        {selectedRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <h2 className="text-xl font-bold text-white">Booking Confirmation</h2>
                <button onClick={closeBookingModal} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8">
                {bookingStatus === 'success' ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Booking Confirmed!</h3>
                    <p className="text-zinc-400 text-sm mb-6">Your room has been successfully reserved.</p>
                    
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-6 text-left">
                      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Booking ID</div>
                      <div className="text-lg font-mono font-bold text-indigo-400 mb-4">{bookingId}</div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Room</div>
                          <div className="text-sm text-white font-medium">{selectedRoom.name}</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Date</div>
                          <div className="text-sm text-white font-medium">{date || 'Today'}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Time</div>
                          <div className="text-sm text-white font-medium">{time} ({duration} hr{duration !== '1' ? 's' : ''})</div>
                        </div>
                      </div>
                    </div>

                    <button onClick={closeBookingModal} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl font-medium transition-colors w-full">
                      Close
                    </button>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    <p className="text-zinc-300 mb-6 text-center">Are you sure you want to book this room?</p>
                    
                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 mb-8">
                      <h4 className="font-bold text-lg text-white mb-4">{selectedRoom.name}</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-zinc-400 text-sm">Date</span>
                          <span className="text-white text-sm font-medium">{date || 'Today'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400 text-sm">Time</span>
                          <span className="text-white text-sm font-medium">{time}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400 text-sm">Duration</span>
                          <span className="text-white text-sm font-medium">{duration} Hour{duration !== '1' ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={closeBookingModal}
                        disabled={bookingStatus === 'loading'}
                        className="flex-1 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={confirmBooking}
                        disabled={bookingStatus === 'loading'}
                        className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-70"
                      >
                        {bookingStatus === 'loading' ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Confirming...
                          </>
                        ) : (
                          'Confirm Booking'
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
