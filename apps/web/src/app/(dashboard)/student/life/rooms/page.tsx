'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Map, CheckCircle2, Clock, X, Calendar, Users } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';

const ALL_ROOMS = [
  { id: 'r-1', name: 'Library Study Room 1A', capacity: 4, amenities: 'Screen + Whiteboard', type: 'individual' },
  { id: 'r-2', name: 'Library Study Room 2B', capacity: 4, amenities: 'Screen + Whiteboard', type: 'individual' },
  { id: 'r-3', name: 'Media Lab 101', capacity: 8, amenities: 'iMacs + Green Screen', type: 'small' },
  { id: 'r-4', name: 'Collaboration Hub 202', capacity: 10, amenities: 'Smart Board + Video Conferencing', type: 'small' },
  { id: 'r-5', name: 'Seminar Room 301', capacity: 20, amenities: 'Projector + Microphone', type: 'large' },
  { id: 'r-6', name: 'Conference Room A', capacity: 15, amenities: 'Video Wall + Webcam Kit', type: 'large' },
];

const TIME_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

export default function RoomReservationPage() {
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('1 Hour');
  const [capacity, setCapacity] = useState('individual');
  const [searched, setSearched] = useState(false);
  const [bookings, setBookings] = useState<{ roomId: string; time: string }[]>([]);
  const [confirmBooking, setConfirmBooking] = useState<{ room: any; time: string } | null>(null);

  const filteredRooms = useMemo(() => {
    if (!searched) return [];
    return ALL_ROOMS.filter(r => {
      if (capacity === 'individual') return r.type === 'individual';
      if (capacity === 'small') return r.type === 'small';
      if (capacity === 'large') return r.type === 'large';
      return true;
    });
  }, [searched, capacity]);

  const isBooked = (roomId: string, time: string) =>
    bookings.some(b => b.roomId === roomId && b.time === time);

  const handleBook = () => {
    if (!confirmBooking) return;
    setBookings(prev => [...prev, { roomId: confirmBooking.room.id, time: confirmBooking.time }]);
    toast.success(`Booked ${confirmBooking.room.name} at ${confirmBooking.time} on ${date || 'selected date'}!`);
    setConfirmBooking(null);
  };

  return (
    <>
      <Topbar title="Room Reservation" subtitle="Book study rooms and collaboration spaces" />

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">

          <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-6 flex gap-6 items-center">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Map className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Need a quiet place?</h2>
              <p className="text-zinc-400 text-sm max-w-2xl">Reserve library study rooms, media labs, or presentation spaces up to 2 weeks in advance.</p>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Find a Space</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white [color-scheme:dark] focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Duration</label>
                <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white appearance-none focus:outline-none focus:border-indigo-500 transition-colors">
                  <option>1 Hour</option>
                  <option>2 Hours</option>
                  <option>3 Hours</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Group Size</label>
                <select value={capacity} onChange={e => setCapacity(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white appearance-none focus:outline-none focus:border-indigo-500 transition-colors">
                  <option value="individual">Individual (1–4)</option>
                  <option value="small">Small Group (5–10)</option>
                  <option value="large">Large Group (10+)</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => { setSearched(true); toast.success('Showing available rooms!'); }}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Search Availability
            </button>
          </div>

          {searched && (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">
                Available Rooms
                <span className="text-zinc-500 font-normal text-sm ml-2">({filteredRooms.length} found)</span>
              </h3>

              {filteredRooms.map((room) => (
                <div key={room.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white">{room.name}</h4>
                      <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Available
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400">Capacity: up to {room.capacity} people • {room.amenities}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    {TIME_SLOTS.map(time => {
                      const booked = isBooked(room.id, time);
                      return (
                        <button
                          key={time}
                          disabled={booked}
                          onClick={() => setConfirmBooking({ room, time })}
                          className={`flex-shrink-0 px-3 py-1.5 border rounded text-sm transition-colors ${
                            booked
                              ? 'border-zinc-800 bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                              : 'border-zinc-700 text-zinc-300 hover:bg-indigo-500/20 hover:text-indigo-400 hover:border-indigo-500/50'
                          }`}
                        >
                          {booked ? '✓' : time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* My Bookings */}
          {bookings.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-white">My Reservations</h3>
              {bookings.map((b, i) => {
                const room = ALL_ROOMS.find(r => r.id === b.roomId);
                return (
                  <div key={i} className="flex items-center justify-between p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                    <div>
                      <div className="font-medium text-white text-sm">{room?.name}</div>
                      <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3" /> {date || 'Selected date'} at {b.time} · {duration}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBookings(prev => prev.filter((_, idx) => idx !== i));
                        toast.success('Booking cancelled.');
                      }}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Booking Modal */}
      {confirmBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-white">Confirm Booking</h2>
              <button onClick={() => setConfirmBooking(null)} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-xl space-y-2 text-sm">
              <div className="flex items-center gap-2 text-zinc-300">
                <Map className="w-4 h-4 text-indigo-400" />
                <span>{confirmBooking.room.name}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>{date || 'Selected date'} at {confirmBooking.time}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>{duration}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Up to {confirmBooking.room.capacity} people</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBooking(null)} className="flex-1 px-4 py-2 text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleBook} className="flex-1 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors">Confirm Booking</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
