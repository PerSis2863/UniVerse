'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Map, CheckCircle2, Clock, X, Calendar, Users, Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher, api } from '@/lib/fetcher';

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

export default function TeacherRoomReservationPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [duration, setDuration] = useState('1 Hour');
  const [roomType, setRoomType] = useState('lecture');
  const [searched, setSearched] = useState(false);
  const [confirmBooking, setConfirmBooking] = useState<{ room: any; time: string } | null>(null);
  const [purpose, setPurpose] = useState('');

  const { data: rooms = [], isLoading: loadingRooms, mutate: mutateRooms } = useSWR(
    searched && date ? `/rooms?date=${date}` : null,
    fetcher
  );

  const { data: myBookings = [], isLoading: loadingBookings, mutate: mutateBookings } = useSWR(
    '/rooms/my-bookings',
    fetcher
  );

  const filteredRooms = useMemo(() => {
    if (!searched) return [];
    return rooms.filter((r: any) => r.type === roomType);
  }, [searched, roomType, rooms]);

  const isBooked = (roomId: string, time: string) => {
    const room = rooms.find((r: any) => r.id === roomId);
    if (!room) return false;
    return room.reservations?.some((r: any) => r.time === time);
  };

  const handleBook = async () => {
    if (!confirmBooking) return;
    try {
      await api.post(`/rooms/${confirmBooking.room.id}/book`, {
        date,
        time: confirmBooking.time,
        duration,
        purpose: purpose || 'Extra Class'
      });
      toast.success(`Reserved ${confirmBooking.room.name} at ${confirmBooking.time}!`);
      setConfirmBooking(null);
      setPurpose('');
      mutateRooms();
      mutateBookings();
    } catch (error) {
      toast.error('Failed to reserve room.');
    }
  };

  return (
    <>
      <Topbar title="Room Reservation" subtitle="Book lecture halls and seminar rooms for classes, exams, or special sessions" />

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">

          <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl p-6 flex gap-6 items-center">
            <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Map className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Need a space for a special session?</h2>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm max-w-2xl">Reserve large lecture halls, seminar rooms, and labs for extra classes or exams.</p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Find a Space</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white [color-scheme:dark] focus:outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">Duration</label>
                <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white appearance-none focus:outline-none focus:border-indigo-500 transition-colors">
                  <option>1 Hour</option>
                  <option>2 Hours</option>
                  <option>3 Hours</option>
                  <option>Full Day</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">Room Type</label>
                <select value={roomType} onChange={e => setRoomType(e.target.value)} className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white appearance-none focus:outline-none focus:border-indigo-500 transition-colors">
                  <option value="lecture">Lecture Hall (80–120)</option>
                  <option value="seminar">Seminar Room (20–30)</option>
                  <option value="lab">Computer Lab (40)</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => { setSearched(true); toast.success('Showing available rooms!'); }}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white font-medium py-3 rounded-lg transition-colors"
            >
              Search Availability
            </button>
          </div>

          {searched && (
            <div className="space-y-4">
              <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                Available Rooms
                {loadingRooms && <Loader2 className="w-4 h-4 animate-spin" />}
                {!loadingRooms && <span className="text-zinc-500 dark:text-zinc-500 font-normal text-sm ml-2">({filteredRooms.length} found)</span>}
              </h3>
              {!loadingRooms && filteredRooms.map((room: any) => (
                <div key={room.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-zinc-900 dark:text-white">{room.name}</h4>
                      <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Available
                      </span>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">Capacity: {room.capacity} people • {room.amenities}</div>
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
                              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
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

          {myBookings.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                My Reservations
                {loadingBookings && <Loader2 className="w-4 h-4 animate-spin" />}
              </h3>
              {myBookings.map((b: any) => {
                const room = b.room;
                return (
                  <div key={b.id} className="flex items-center justify-between p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white text-sm">{room?.name || 'Unknown Room'}</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3" /> {b.date} at {b.time} · {b.duration}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await api.delete(`/rooms/bookings/${b.id}`);
                          toast.success('Booking cancelled.');
                          mutateBookings();
                          if (date === b.date) mutateRooms();
                        } catch (e) {
                          toast.error('Failed to cancel');
                        }
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

      {confirmBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Confirm Booking</h2>
              <button onClick={() => setConfirmBooking(null)} className="p-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl space-y-2 text-sm">
              <div className="flex items-center gap-2 text-zinc-300"><Map className="w-4 h-4 text-indigo-400" />{confirmBooking.room.name}</div>
              <div className="flex items-center gap-2 text-zinc-300"><Calendar className="w-4 h-4 text-indigo-400" />{date || 'Selected date'} at {confirmBooking.time}</div>
              <div className="flex items-center gap-2 text-zinc-300"><Clock className="w-4 h-4 text-indigo-400" />{duration}</div>
              <div className="flex items-center gap-2 text-zinc-300"><Users className="w-4 h-4 text-indigo-400" />Capacity: {confirmBooking.room.capacity}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Purpose / Session Title</label>
              <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g., Midterm Exam CS401" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBooking(null)} className="flex-1 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleBook} className="flex-1 px-4 py-2 text-sm font-bold text-zinc-900 dark:text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
