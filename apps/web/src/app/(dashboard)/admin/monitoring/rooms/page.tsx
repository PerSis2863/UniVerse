'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { DoorOpen, Loader2, Plus, Trash2, Users, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';

type Reservation = { id: string; date: string; time: string; duration: string; user: { name: string; email: string } };
type Room = { id: string; name: string; capacity: number; type: string; amenities: string; reservations: Reservation[] };
const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';

export default function RoomBookingsPage() {
  const { data, isLoading, error, mutate } = useSWR<Room[]>('/api/admin/rooms', authedJson);
  const [form, setForm] = useState<{ name: string; capacity: string; type: string; amenities: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rooms = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rooms.flatMap((r) => r.reservations.filter((b) => b.date >= today).map((b) => ({ ...b, room: r.name }))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const addRoom = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await authedJson('/api/admin/rooms', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Room added');
      setForm(null);
      mutate();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    if (!(await confirmDialog({ title: 'Cancel this booking?', message: 'The room becomes free for others to book.', confirmLabel: 'Cancel booking', cancelLabel: 'Keep', destructive: true }))) return;
    try { await authedJson(`/api/admin/rooms?reservationId=${id}`, { method: 'DELETE' }); mutate(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <Topbar title="Room Bookings" subtitle="Campus spaces and who has booked them"
        rightNode={<button onClick={() => setForm({ name: '', capacity: '', type: 'Classroom', amenities: '' })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Plus className="w-4 h-4" /> Add room</button>} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {form && (
            <div className="rounded-3xl border border-indigo-200/60 dark:border-indigo-400/20 bg-indigo-50/50 dark:bg-indigo-500/[0.05] p-5 grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 flex justify-between"><p className="font-bold text-zinc-900 dark:text-white">New room</p><button onClick={() => setForm(null)} aria-label="Cancel"><X className="w-4 h-4 text-zinc-500" /></button></div>
              <input className={input} placeholder="Room name, e.g. B-204" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={input} type="number" min={1} placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['Classroom', 'Lab', 'Study room', 'Auditorium', 'Meeting room'].map((t) => <option key={t}>{t}</option>)}</select>
              <input className={input} placeholder="Amenities, e.g. Projector, Whiteboard" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} />
              <button onClick={addRoom} disabled={busy || !form.name.trim() || !form.capacity} className="sm:col-span-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save room</button>
            </div>
          )}

          {isLoading ? <div className="h-48 rounded-3xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" /> : rooms.length === 0 ? (
            <FeatureGuide
              icon={DoorOpen}
              title="Add your campus rooms"
              description="Once rooms are added, students and teachers can book them from Student Life → Room reservation, and every booking shows up here."
              steps={['Add each bookable room with its capacity', 'Students and teachers book time slots', 'See upcoming bookings and cancel if needed']}
              example={<div><ExampleRow title="Study Room 3" meta="Study room · 8 seats · Whiteboard" right="4 bookings" /><ExampleRow title="Lab B-204" meta="Lab · 30 seats · Projector" right="2 bookings" accent="from-emerald-500 to-teal-500" /></div>}
              action={{ label: 'Add room', onClick: () => setForm({ name: '', capacity: '', type: 'Classroom', amenities: '' }) }}
            />
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((r) => (
                  <div key={r.id} className="p-5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03]">
                    <p className="font-bold text-zinc-900 dark:text-white">{r.name}</p>
                    <p className="text-xs text-zinc-500 inline-flex items-center gap-1">{r.type} · <Users className="w-3 h-3" />{r.capacity}</p>
                    {r.amenities && <p className="text-xs text-zinc-500 mt-1">{r.amenities}</p>}
                    <p className="text-xs font-semibold text-indigo-500 mt-3">{r.reservations.filter((b) => b.date >= today).length} upcoming booking(s)</p>
                  </div>
                ))}
              </div>
              <section className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-5">
                <h2 className="font-bold text-zinc-900 dark:text-white mb-3">Upcoming bookings</h2>
                {upcoming.length === 0 ? <p className="text-sm text-zinc-500">No upcoming bookings.</p> : (
                  <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                    {upcoming.map((b) => (
                      <li key={b.id} className="py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{b.room} · {b.date} at {b.time} ({b.duration})</p>
                          <p className="text-xs text-zinc-500 truncate">{b.user.name} · {b.user.email}</p>
                        </div>
                        <button onClick={() => cancel(b.id)} aria-label="Cancel booking" className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
