'use client';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { DoorOpen, Loader2, Plus, Trash2, Users, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';
import { AdminSearch, PersonCell, RoleBadge, matchesQuery, personText, type PersonInfo } from '@/components/admin/AdminPeople';

type Reservation = { id: string; date: string; time: string; duration: string; createdAt?: string; user: PersonInfo };
type Room = { id: string; name: string; capacity: number; type: string; amenities: string; reservations: Reservation[] };
const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';

export default function RoomBookingsPage() {
  const { data, isLoading, error, mutate } = useSWR<Room[]>('/api/admin/rooms', authedJson);
  const [form, setForm] = useState<{ name: string; capacity: string; type: string; amenities: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const rooms = useMemo(() => data ?? [], [data]);
  const allBookings = useMemo(() => rooms.flatMap((r) => r.reservations.map((b) => ({ ...b, room: r.name, roomType: r.type }))), [rooms]);
  const bookings = useMemo(() => allBookings
    .filter((b) => (when === 'all' || (when === 'upcoming' ? b.date >= today : b.date < today)))
    .filter((b) => matchesQuery(q, b.room, b.roomType, b.date, b.time, personText(b.user)))
    .sort((a, b) => (when === 'past' ? -1 : 1) * (a.date + a.time).localeCompare(b.date + b.time)), [allBookings, when, today, q]);
  const shownRooms = useMemo(() => rooms.filter((r) => matchesQuery(q, r.name, r.type, r.amenities) || r.reservations.some((b) => matchesQuery(q, personText(b.user)))), [rooms, q]);
  // Who books the most (from the bookings loaded: up to 100 most recent per room).
  const bookers = useMemo(() => {
    const map = new Map<string, { person: PersonInfo; count: number; upcoming: number }>();
    for (const b of allBookings) {
      const key = b.user.id ?? b.user.email ?? b.user.name ?? '?';
      const row = map.get(key) ?? { person: b.user, count: 0, upcoming: 0 };
      row.count += 1;
      if (b.date >= today) row.upcoming += 1;
      map.set(key, row);
    }
    return [...map.values()].filter((r) => matchesQuery(q, personText(r.person))).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [allBookings, today, q]);

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
      <Topbar title="Room Bookings" subtitle="Campus spaces and everyone who has booked them"
        rightNode={<button onClick={() => setForm({ name: '', capacity: '', type: 'Classroom', amenities: '' })} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add room</button>} />
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
              <button onClick={addRoom} disabled={busy || !form.name.trim() || !form.capacity} className="btn-primary sm:col-span-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save room</button>
            </div>
          )}

          {isLoading ? <div className="h-48 rounded-3xl skeleton" /> : rooms.length === 0 ? (
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
              <AdminSearch value={q} onChange={setQ} placeholder="Search rooms, dates, or who booked (name, email, role, phone)…" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {shownRooms.length === 0 && <p className="text-sm text-zinc-500 sm:col-span-2 lg:col-span-3">No rooms match your search.</p>}
                {shownRooms.map((r) => {
                  const people = new Set(r.reservations.map((b) => b.user.id ?? b.user.email)).size;
                  return (
                    <div key={r.id} className="p-5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03]">
                      <p className="font-bold text-zinc-900 dark:text-white">{r.name}</p>
                      <p className="text-xs text-zinc-500 inline-flex items-center gap-1">{r.type} · <Users className="w-3 h-3" />{r.capacity}</p>
                      {r.amenities && <p className="text-xs text-zinc-500 mt-1">{r.amenities}</p>}
                      <p className="text-xs font-semibold text-indigo-500 mt-3">
                        {r.reservations.filter((b) => b.date >= today).length} upcoming booking(s) · {people} {people === 1 ? 'person' : 'people'}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
                <section className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="font-bold text-zinc-900 dark:text-white">Bookings <span className="text-xs font-medium text-zinc-500">({bookings.length})</span></h2>
                    <div className="flex gap-1">
                      {(['upcoming', 'past', 'all'] as const).map((w) => (
                        <button key={w} onClick={() => setWhen(w)} aria-pressed={when === w}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${when === w ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
                          {w.charAt(0).toUpperCase() + w.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {bookings.length === 0 ? <p className="text-sm text-zinc-500">{q.trim() ? 'No bookings match your search.' : when === 'past' ? 'No past bookings.' : when === 'upcoming' ? 'No upcoming bookings.' : 'No bookings yet.'}</p> : (
                    <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                      {bookings.map((b) => (
                        <li key={b.id} className="py-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0 space-y-2">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{b.room} · {b.date} at {b.time} ({b.duration})</p>
                            <PersonCell person={b.user} />
                          </div>
                          {b.date >= today && (
                            <button onClick={() => cancel(b.id)} aria-label="Cancel booking" className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <aside className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-4 sm:p-5">
                  <h2 className="font-bold text-zinc-900 dark:text-white mb-1">Who books rooms</h2>
                  <p className="text-xs text-zinc-500 mb-3">By number of bookings</p>
                  {bookers.length === 0 ? <p className="text-sm text-zinc-500">{allBookings.length ? 'No one matches your search.' : 'No bookings yet.'}</p> : (
                    <ul className="space-y-3">
                      {bookers.map((p, i) => (
                        <li key={p.person.id ?? p.person.email ?? i} className="flex items-center gap-2">
                          <button onClick={() => setQ(p.person.email || p.person.name || '')} className="min-w-0 flex-1 text-left">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">{p.person.name}</span>
                              <RoleBadge role={p.person.role} />
                            </span>
                            <span className="block text-xs text-zinc-500 truncate">{p.person.email}</span>
                          </button>
                          <span className="text-xs text-zinc-500 tabular-nums shrink-0">{p.count} · {p.upcoming} upcoming</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
