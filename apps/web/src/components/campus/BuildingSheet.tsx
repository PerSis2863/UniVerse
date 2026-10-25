'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Radio, Trash2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { BUILDING_COLORS, MAX_FLOORS, hhmm, roomNow, type RoomNow } from '@/lib/campus-map';
import { cn } from '@/lib/utils';
import { floorName, type Building, type LiveClass, type MapEvent, type MapRoom } from './types';

// One building on the campus map (Stage 5 · D15): its rooms floor by floor, each with what's on now
// and today, a live class's check-ins, events here; Book for a free room. In edit mode (admins): the
// building's name, short code, floors, colour and size, which rooms are in it and on which floor, and
// which campus events happen in it.

const CHIP = 'shrink-0 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full';
const TONE = {
  free: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  class: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
  booked: 'bg-amber-500/15 text-amber-900 dark:text-amber-300',
  mine: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
};

/** A room's state right now, as a coloured chip. */
export function RoomChip({ now, minute }: { now: RoomNow; minute: number }) {
  if (now.state === 'free') {
    const left = now.next == null ? null : now.next - minute;
    return <span className={cn(CHIP, TONE.free)}>{now.next == null ? 'Free all day' : left != null && left < 60 ? `Free for ${left} min` : `Free until ${hhmm(now.next)}`}</span>;
  }
  return <span className={cn(CHIP, now.mine ? TONE.mine : now.state === 'class' ? TONE.class : TONE.booked)}>{now.state === 'class' ? 'Class' : now.mine ? 'Your booking' : 'Booked'} until {hhmm(now.until ?? 0)}</span>;
}

export function BuildingSheet({ building, rooms, minute, live, events, editing, bookHref, onClose, onChanged }: {
  building: Building;
  rooms: MapRoom[];
  minute: number;
  live: LiveClass[];
  events: MapEvent[];
  editing: boolean;
  /** Where to book a room (null: no booking, for admins). */
  bookHref: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const here = rooms.filter((r) => r.buildingId === building.id);
  const floors = [...new Set([...Array.from({ length: building.floors }, (_, i) => i), ...here.map((r) => r.floor)])].sort((a, b) => (a ?? 99) - (b ?? 99));
  const eventsHere = events.filter((e) => e.buildingId === building.id);
  return (
    <Sheet title={building.name} onClose={onClose}>
      <div className="space-y-5">
        {editing && <EditBuilding building={building} rooms={rooms} onChanged={onChanged} onGone={onClose} />}
        {eventsHere.length > 0 && (
          <section aria-labelledby="b-events" className="space-y-2">
            <h3 id="b-events" className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Events now or soon</h3>
            <ul className="space-y-1.5">
              {eventsHere.map((e) => <li key={e.id} className="text-sm text-zinc-800 dark:text-zinc-200"><span className="font-semibold">{e.title}</span>{e.startAt && <span className="text-zinc-600 dark:text-zinc-400"> · {e.now ? 'started' : 'at'} {new Date(e.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</li>)}
            </ul>
          </section>
        )}
        {here.length === 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{editing ? 'No rooms in this building yet: put some in below.' : 'No rooms have been placed in this building yet.'}</p>
        ) : floors.map((f) => {
          const list = here.filter((r) => r.floor === f).sort((a, b) => a.name.localeCompare(b.name));
          if (!list.length) return null;
          return (
            <section key={String(f)} aria-label={floorName(f)} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{floorName(f)}</h3>
              <ul className="space-y-2">
                {list.map((r) => {
                  const now = roomNow(r.busy, minute);
                  const l = live.find((x) => x.roomId === r.id);
                  return (
                    <li key={r.id} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-semibold text-zinc-900 dark:text-white">{r.name}</span>
                          <span className="block text-xs text-zinc-600 dark:text-zinc-400">{r.type.replace(/_/g, ' ').toLowerCase()} · {r.capacity} seats</span>
                        </span>
                        <RoomChip now={now} minute={minute} />
                      </div>
                      {now.label && now.state !== 'free' && <p className="text-sm text-zinc-800 dark:text-zinc-200">{now.label}</p>}
                      {l && <p className="text-sm font-medium text-rose-700 dark:text-rose-400 flex items-center gap-1.5"><Radio className="w-4 h-4" aria-hidden />Live now · {l.checkedIn} checked in</p>}
                      {r.busy.length > 0 && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">Today: {r.busy.map((b) => `${hhmm(b.from)}–${hhmm(b.to)} ${b.kind === 'class' ? b.label.split(' · ')[0] : b.label.toLowerCase()}`).join(', ')}</p>
                      )}
                      {bookHref && now.state === 'free' && <Link href={bookHref} className="inline-flex text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">Book this room</Link>}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}

const sizeOf = (v: number) => Math.round(v);

function EditBuilding({ building, rooms, onChanged, onGone }: { building: Building; rooms: MapRoom[]; onChanged: () => void; onGone: () => void }) {
  const [form, setForm] = useState({ name: building.name, code: building.code ?? '', floors: building.floors, color: building.color ?? BUILDING_COLORS[0], w: building.w, h: building.h });
  const [busy, setBusy] = useState<string | null>(null);
  const [add, setAdd] = useState({ room: '', floor: 0 });
  const { data: upcoming } = useSWR<{ id: string; title: string; startAt: string | null; buildingId?: string | null }[]>('/api/campus/events', authedJson);
  const here = rooms.filter((r) => r.buildingId === building.id).sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0) || a.name.localeCompare(b.name));
  const elsewhere = rooms.filter((r) => r.buildingId !== building.id).sort((a, b) => a.name.localeCompare(b.name));
  const floorChoices = Array.from({ length: form.floors }, (_, i) => i);

  const run = async (what: string, path: string, init: RequestInit, done?: string) => {
    setBusy(what);
    try { await authedJson(path, init); if (done) toast.success(done); onChanged(); return true; }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t save that.')); return false; }
    finally { setBusy(null); }
  };
  const save = () => run('save', `/api/campus/map/buildings/${building.id}`, { method: 'PATCH', body: JSON.stringify({ ...form, code: form.code.trim() }) }, 'Building saved');
  const place = (roomId: string, buildingId: string | null, floor: number | null) => run(`room-${roomId}`, `/api/campus/map/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify({ buildingId, floor }) });
  const remove = async () => {
    if (!(await confirmDialog({ title: `Take “${building.name}” off the map?`, message: 'Its rooms stay (you can put them in another building), they just won’t be on the map.', confirmLabel: 'Take it off', destructive: true }))) return;
    if (await run('delete', `/api/campus/map/buildings/${building.id}`, { method: 'DELETE' }, 'Building removed')) onGone();
  };

  return (
    <section aria-labelledby="b-edit" className="space-y-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/10 p-3">
      <h3 id="b-edit" className="text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">Change this building</h3>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 block text-sm text-zinc-800 dark:text-zinc-200">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 60) })} className="input text-sm mt-1" /></label>
        <label className="block text-sm text-zinc-800 dark:text-zinc-200">Short code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.slice(0, 6) })} placeholder="SCI" className="input text-sm mt-1" /></label>
      </div>
      <label className="block text-sm text-zinc-800 dark:text-zinc-200">Floors
        <input type="number" min={1} max={MAX_FLOORS} value={form.floors} onChange={(e) => setForm({ ...form, floors: Math.max(1, Math.min(MAX_FLOORS, Number(e.target.value) || 1)) })} className="input text-sm mt-1 !w-24" />
      </label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
        {BUILDING_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={`Colour ${c}`} onClick={() => setForm({ ...form, color: c })} className={cn('w-7 h-7 rounded-full border border-white/40', form.color === c && 'ring-2 ring-offset-2 ring-indigo-500 ring-offset-white dark:ring-offset-[#141416]')} style={{ background: c }} />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-zinc-800 dark:text-zinc-200">Width<input type="range" min={60} max={600} value={form.w} onChange={(e) => setForm({ ...form, w: sizeOf(Number(e.target.value)) })} className="w-full accent-indigo-500" /></label>
        <label className="block text-sm text-zinc-800 dark:text-zinc-200">Height<input type="range" min={60} max={400} value={form.h} onChange={(e) => setForm({ ...form, h: sizeOf(Number(e.target.value)) })} className="w-full accent-indigo-500" /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={!!busy || !form.name.trim()} className="btn-primary btn-sm">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
        <button type="button" onClick={() => void remove()} disabled={!!busy} className="btn-ghost btn-sm text-rose-700 dark:text-rose-400"><Trash2 className="w-4 h-4" />Take off the map</button>
      </div>

      <div className="space-y-2 pt-2 border-t border-indigo-200/60 dark:border-white/10">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Rooms in this building</p>
        {here.length === 0 && <p className="text-sm text-zinc-700 dark:text-zinc-300">None yet.</p>}
        <ul className="space-y-1.5">
          {here.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-zinc-900 dark:text-white">{r.name}</span>
              <select value={r.floor ?? 0} onChange={(e) => void place(r.id, building.id, Number(e.target.value))} aria-label={`Floor of ${r.name}`} className="input text-sm !w-auto !py-1">
                {floorChoices.map((f) => <option key={f} value={f}>{floorName(f)}</option>)}
              </select>
              <button type="button" onClick={() => void place(r.id, null, null)} disabled={busy === `room-${r.id}`} aria-label={`Take ${r.name} out of this building`} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-white/70 dark:hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
        {elsewhere.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[10rem] block text-sm text-zinc-800 dark:text-zinc-200">Put a room here
              <select value={add.room} onChange={(e) => setAdd({ ...add, room: e.target.value })} className="input text-sm mt-1">
                <option value="">Choose a room…</option>
                {elsewhere.map((r) => <option key={r.id} value={r.id}>{r.name}{r.buildingId ? ' (in another building)' : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm text-zinc-800 dark:text-zinc-200">On
              <select value={add.floor} onChange={(e) => setAdd({ ...add, floor: Number(e.target.value) })} className="input text-sm mt-1 !w-auto">
                {floorChoices.map((f) => <option key={f} value={f}>{floorName(f)}</option>)}
              </select>
            </label>
            <button type="button" onClick={async () => { if (add.room && await place(add.room, building.id, add.floor)) setAdd({ room: '', floor: add.floor }); }} disabled={!add.room || !!busy} className="btn-secondary btn-sm">Add</button>
          </div>
        )}
      </div>

      {!!upcoming?.length && (
        <div className="space-y-2 pt-2 border-t border-indigo-200/60 dark:border-white/10">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Campus events</p>
          <ul className="space-y-1.5">
            {upcoming.slice(0, 12).map((e) => {
              const isHere = e.buildingId === building.id;
              return (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-zinc-900 dark:text-white">{e.title}{e.startAt && <span className="text-zinc-600 dark:text-zinc-400"> · {new Date(e.startAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>}</span>
                  <button type="button" aria-pressed={isHere} onClick={() => void run(`ev-${e.id}`, `/api/campus/map/events/${e.id}`, { method: 'PATCH', body: JSON.stringify({ buildingId: isHere ? null : building.id }) }, isHere ? 'Event taken out of this building' : 'Event placed here')} disabled={!!busy}
                    className={cn('rounded-full px-2.5 py-1 text-xs font-semibold border', isHere ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-300 dark:border-white/20 text-zinc-800 dark:text-zinc-200')}>{isHere ? 'Here' : 'Put here'}</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
