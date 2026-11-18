'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { DoorOpen, Loader2, Search, Users } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { authedJson } from '@/lib/authed-fetch';
import { api } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { clockMinutes, weekdayOf } from '@/lib/campus-map';
import { freeRooms, type Span } from '@/lib/room-finder';

// Find a free room (M298): rooms with enough seats and nothing on (no class, no booking) for the whole
// time chosen, from what the campus map already knows (GET /api/campus/map for that day), snuggest
// first; booking one checks again on the server (src/server/services/rooms.service.ts).

type Room = { id: string; name: string; type: string; capacity: number; buildingId: string | null; floor: number | null; busy: Span[] };
type MapData = { rooms: Room[]; buildings: { id: string; name: string }[] };

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

export function RoomFinder({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ date: tomorrow(), from: '10:00', to: '11:00', seats: '20' });
  const [asked, setAsked] = useState<typeof f | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const key = asked ? `/api/campus/map?date=${asked.date}&min=${clockMinutes(asked.from) ?? 0}&dow=${weekdayOf(asked.date)}` : null;
  const { data, isLoading, mutate } = useSWR<MapData>(key, authedJson);
  const want = useMemo(() => (asked ? { from: clockMinutes(asked.from) ?? 0, to: clockMinutes(asked.to) ?? 0 } : null), [asked]);
  const found = useMemo(() => (data && want && want.to > want.from ? freeRooms(data.rooms, want, Number(asked?.seats) || 0) : []), [data, want, asked]);
  const building = (id: string | null) => data?.buildings.find((b) => b.id === id)?.name;

  const book = async (r: Room) => {
    if (!asked || !want) return;
    setBooking(r.id);
    try {
      await api.post(`/rooms/${r.id}/book`, { date: asked.date, time: asked.from, duration: `${want.to - want.from}m` });
      toast.success(`${r.name} booked`, { description: `${new Date(`${asked.date}T12:00:00`).toLocaleDateString()} · ${asked.from}–${asked.to}` });
      void mutate();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t book that room.')); void mutate(); }
    finally { setBooking(null); }
  };

  return (
    <Sheet title="Find a free room" onClose={onClose}>
      <form className="grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setAsked({ ...f }); }}>
        <Field label="Day" className="col-span-2 sm:col-span-1">{(p) => <input {...p} type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
        <Field label="From">{(p) => <input {...p} type="time" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />}</Field>
        <Field label="To">{(p) => <input {...p} type="time" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />}</Field>
        <Field label="Seats">{(p) => <input {...p} type="number" min={0} max={2000} className="input" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} />}</Field>
        <button type="submit" className="btn-primary btn-sm col-span-2 sm:col-span-4"><Search className="w-4 h-4" aria-hidden />Find rooms</button>
      </form>
      <div className="mt-4" aria-live="polite">
        {!asked ? null : want && want.to <= want.from ? <p className="text-sm text-rose-600 dark:text-rose-400">The end has to be after the start.</p>
          : isLoading || !data ? <div className="h-24 rounded-2xl skeleton" />
          : !found.length ? <p className="text-sm text-zinc-600 dark:text-zinc-300">No room with {asked.seats || 'any'} seats is free for the whole time. Try a shorter time or fewer seats.</p>
          : (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{found.length} {found.length === 1 ? 'room is' : 'rooms are'} free, the best fit first.</p>
              <ul className="mt-2 space-y-1">
                {found.slice(0, 30).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
                    <DoorOpen className="w-4 h-4 shrink-0 text-zinc-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-zinc-900 dark:text-white" translate="no">{r.name}</span>
                      <span className="block text-xs text-zinc-500">{[building(r.buildingId), r.floor != null ? `floor ${r.floor}` : null, r.type.toLowerCase()].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums text-zinc-600 dark:text-zinc-300"><Users className="w-3.5 h-3.5" aria-hidden />{r.capacity}</span>
                    <button type="button" className="btn-secondary btn-sm" disabled={booking === r.id} onClick={() => void book(r)}>{booking === r.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Book</button>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>
    </Sheet>
  );
}
