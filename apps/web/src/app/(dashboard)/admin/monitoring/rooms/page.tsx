'use client';

import { useState, useMemo } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Building, Filter, CheckCircle2, Clock, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const BOOKING_TYPES = ['All', 'Active', 'Upcoming', 'Pending Approval'];

const INITIAL_BOOKINGS = [
  { id: 'b-1', room: 'Seminar Room 104', type: 'Active', user: 'Dr. Sarah Mitchell', purpose: 'Research Presentation', time: '10:00 AM – 12:00 PM', date: 'Today', capacity: 30 },
  { id: 'b-2', room: 'Lab B-204', type: 'Upcoming', user: 'Student Group – CS401', purpose: 'Project Workshop', time: '2:00 PM – 4:00 PM', date: 'Today', capacity: 20 },
  { id: 'b-3', room: 'Conference Room 301', type: 'Pending Approval', user: 'Prof. Ahmed Hassan', purpose: 'International Consortium Meeting', time: '9:00 AM – 11:00 AM', date: 'Tomorrow', capacity: 50 },
  { id: 'b-4', room: 'Auditorium A', type: 'Upcoming', user: 'Student Council', purpose: 'Annual Hackathon Kickoff', time: '6:00 PM – 9:00 PM', date: 'Tomorrow', capacity: 200 },
  { id: 'b-5', room: 'Seminar Room 205', type: 'Pending Approval', user: 'Alice Johnson', purpose: 'Study Group', time: '3:00 PM – 5:00 PM', date: 'Oct 21', capacity: 15 },
];

const typeColors: Record<string, string> = {
  'Active': 'bg-emerald-500/10 text-emerald-400',
  'Upcoming': 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  'Pending Approval': 'bg-amber-500/10 text-amber-400',
};

export default function AdminRoomMonitoringPage() {
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);
  const [typeFilter, setTypeFilter] = useState('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const filteredBookings = useMemo(() => {
    if (typeFilter === 'All') return bookings;
    return bookings.filter(b => b.type === typeFilter);
  }, [bookings, typeFilter]);

  const handleApprove = (id: string) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, type: 'Upcoming' } : b));
    toast.success('Booking approved!');
  };

  const handleCancel = (id: string) => {
    setBookings(prev => prev.filter(b => b.id !== id));
    setConfirmCancel(null);
    toast.success('Booking cancelled.');
  };

  const stats = [
    { label: 'Total Bookings Today', value: bookings.filter(b => b.date === 'Today').length.toString(), color: 'text-blue-400' },
    { label: 'Active Now', value: bookings.filter(b => b.type === 'Active').length.toString(), color: 'text-emerald-400' },
    { label: 'Pending Approvals', value: bookings.filter(b => b.type === 'Pending Approval').length.toString(), color: 'text-amber-400' },
    { label: 'Total Rooms Tracked', value: '24', color: 'text-indigo-400' },
  ];

  return (
    <>
      <Topbar title="Room Bookings Monitoring" subtitle="Manage and oversee all campus space reservations" />

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {stats.map(stat => (
              <div key={stat.label} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-xl">
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">{stat.label}</div>
                <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Bookings Panel */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900/80">
              <h3 className="font-semibold text-zinc-900 dark:text-white">
                {typeFilter === 'All' ? 'All' : typeFilter} Reservations
                <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-500">({filteredBookings.length})</span>
              </h3>
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(p => !p)}
                  className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  {typeFilter === 'All' ? 'Filter by Type' : typeFilter}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showFilterDropdown && (
                  <div className="absolute right-0 top-10 z-30 bg-white dark:bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-48 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    {BOOKING_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => { setTypeFilter(t); setShowFilterDropdown(false); }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          typeFilter === t ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="divide-y divide-zinc-800/50">
              {filteredBookings.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 dark:text-zinc-500">
                  <Building className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No bookings matching this filter.</p>
                </div>
              ) : (
                filteredBookings.map((booking) => (
                  <div key={booking.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <Building className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-zinc-900 dark:text-white">{booking.room}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[booking.type]}`}>
                            {booking.type}
                          </span>
                        </div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-400">
                          {booking.user} • <span className="text-zinc-500 dark:text-zinc-500">{booking.purpose}</span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {booking.date} · {booking.time} · Capacity: {booking.capacity}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end gap-2 ml-auto sm:ml-0 flex-shrink-0">
                      {booking.type === 'Pending Approval' && (
                        <button
                          onClick={() => handleApprove(booking.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-900 dark:text-white text-xs font-semibold transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmCancel(booking.id)}
                        className="text-rose-400 hover:text-rose-300 font-medium text-xs transition-colors"
                      >
                        Cancel Booking
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white text-center">Cancel Booking?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">The user will be notified that their room reservation has been cancelled.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancel(null)} className="flex-1 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Keep</button>
              <button onClick={() => handleCancel(confirmCancel)} className="flex-1 px-4 py-2 text-sm font-bold text-zinc-900 dark:text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors">Cancel Booking</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
