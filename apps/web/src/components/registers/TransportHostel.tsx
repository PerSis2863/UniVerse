'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BedDouble, Bus, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { PersonPicker } from './EquipmentRegister';

// School buses and the hostel (Stage 5 · B15.5; src/server/registers.ts): routes with stops and
// riders, rooms with beds and residents.

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
type Stop = { name: string; time: string | null };
interface RouteRow { id: string; name: string; vehicle: string | null; driverName: string | null; driverPhone: string | null; capacity: number | null; stops: Stop[]; notes: string | null; riders: number }
interface Rider { id: string; name: string; avatar: string | null; stop: string | null }

export function BusRegister() {
  const { data, error, mutate } = useSWR<{ routes: RouteRow[] }>('/api/registers/routes', authedJson);
  const [editing, setEditing] = useState<RouteRow | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing('new')} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> New route</button>
      {data.routes.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>No bus routes yet.</p> : (
        <motion.ul variants={list} initial="hidden" animate="show" className="space-y-2">
          {data.routes.map((r) => (
            <motion.li key={r.id} variants={fadeUp}>
              <button type="button" onClick={() => { haptic('tap'); setOpen(r.id); }} className={`${card} w-full p-4 flex items-center gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]`}>
                <span className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0"><Bus className="w-5 h-5" aria-hidden /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-zinc-900 dark:text-white truncate">{r.name}</span>
                  <span className="block text-xs text-zinc-500 truncate">{[r.vehicle, r.driverName && `driver ${r.driverName}`, `${r.stops.length} stop${r.stops.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={cn('text-xs tabular-nums shrink-0', r.capacity && r.riders >= r.capacity ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-zinc-500')}>{r.riders}{r.capacity ? `/${r.capacity}` : ''} riders</span>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {editing && <RouteEditor route={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void mutate(); }} />}
      {open && <RouteSheet key={open} id={open} onClose={() => setOpen(null)} onEdit={(r) => { setOpen(null); setEditing(r); }} onChanged={() => void mutate()} />}
    </div>
  );
}

function RouteEditor({ route, onClose, onSaved }: { route: RouteRow | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: route?.name ?? '', vehicle: route?.vehicle ?? '', driverName: route?.driverName ?? '', driverPhone: route?.driverPhone ?? '', capacity: route?.capacity ? String(route.capacity) : '', notes: route?.notes ?? '' });
  const [stops, setStops] = useState<Stop[]>(route?.stops.length ? route.stops : [{ name: '', time: '07:30' }]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((c) => ({ ...c, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = JSON.stringify({ ...(route ? { action: 'save' } : {}), ...f, stops: stops.filter((s) => s.name.trim()) });
      await authedJson(route ? `/api/registers/routes/${route.id}` : '/api/registers/routes', { method: 'POST', body });
      haptic('success'); toast.success(route ? 'Route saved' : 'Route added');
      onSaved();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t save the route.')); setBusy(false); }
  };
  return (
    <Sheet title={route ? 'Edit route' : 'New bus route'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">{(p) => <input {...p} required maxLength={80} value={f.name} onChange={set('name')} className="input" placeholder="Route 3 · North" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bus">{(p) => <input {...p} maxLength={60} value={f.vehicle} onChange={set('vehicle')} className="input" placeholder="KA 01 AB 1234" />}</Field>
          <Field label="Seats">{(p) => <input {...p} type="number" min={1} max={200} value={f.capacity} onChange={set('capacity')} className="input" />}</Field>
          <Field label="Driver">{(p) => <input {...p} maxLength={80} value={f.driverName} onChange={set('driverName')} className="input" />}</Field>
          <Field label="Driver’s phone">{(p) => <input {...p} type="tel" maxLength={30} value={f.driverPhone} onChange={set('driverPhone')} className="input" />}</Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="label">Stops, in order (morning times)</legend>
          {stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input aria-label={`Stop ${i + 1} time`} type="time" value={s.time ?? ''} onChange={(e) => setStops((c) => c.map((x, j) => (j === i ? { ...x, time: e.target.value || null } : x)))} className="input w-28 shrink-0" />
              <input aria-label={`Stop ${i + 1} name`} maxLength={80} value={s.name} onChange={(e) => setStops((c) => c.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="input flex-1 min-w-0" placeholder="Stop name" />
              {stops.length > 1 && <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => setStops((c) => c.filter((_, j) => j !== i))} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>}
            </div>
          ))}
          {stops.length < 40 && <button type="button" onClick={() => setStops((c) => [...c, { name: '', time: null }])} className="btn-ghost btn-sm"><Plus className="w-4 h-4" /> Add a stop</button>}
        </fieldset>
        <Field label="Notes for families (optional)">{(p) => <input {...p} maxLength={500} value={f.notes} onChange={set('notes')} className="input" placeholder="Afternoon run leaves at 15:30" />}</Field>
        <button type="submit" disabled={busy || !f.name.trim()} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} {route ? 'Save' : 'Add route'}</button>
      </form>
    </Sheet>
  );
}

function RouteSheet({ id, onClose, onEdit, onChanged }: { id: string; onClose: () => void; onEdit: (r: RouteRow) => void; onChanged: () => void }) {
  const key = `/api/registers/routes/${id}`;
  const { data, mutate } = useSWR<RouteRow & { riders: Rider[] }>(key, authedJson);
  const [stop, setStop] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await authedJson<{ deleted?: boolean; moved?: boolean }>(key, { method: 'POST', body: JSON.stringify(body) });
      haptic('success'); toast.success(done, { description: r.moved ? 'They were moved from another route.' : undefined });
      if (r.deleted) { onChanged(); onClose(); return; }
      await mutate(); onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={data?.name ?? 'Route'} onClose={onClose}>
      {!data ? <ContentSkeleton variant="list" /> : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{[data.vehicle, data.driverName && `driver ${data.driverName}`, data.driverPhone].filter(Boolean).join(' · ') || 'No bus or driver set'}</p>
            <button type="button" onClick={() => onEdit({ ...data, riders: data.riders.length })} className="btn-ghost btn-sm shrink-0">Edit</button>
          </div>
          <section className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2" aria-label="Add a rider">
            {data.stops.length > 0 && (
              <select aria-label="Their stop" value={stop} onChange={(e) => setStop(e.target.value)} className="input">
                <option value="">Choose their stop first…</option>
                {data.stops.map((s) => <option key={s.name} value={s.name}>{s.time ? `${s.time} · ` : ''}{s.name}</option>)}
              </select>
            )}
            {(stop || !data.stops.length) && <PersonPicker students label="Add a student: name or email" onPick={(p) => void act({ action: 'add', studentId: p.id, stop }, `${p.name} added`)} />}
          </section>
          {data.stops.length ? data.stops.map((s) => {
            const here = data.riders.filter((r) => r.stop === s.name);
            return (
              <section key={s.name} aria-label={s.name}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.time ? `${s.time} · ` : ''}{s.name} · {here.length}</p>
                {here.length > 0 && <RiderList riders={here} busy={busy} onRemove={(r) => void act({ action: 'remove', studentId: r.id }, `${r.name} removed`)} />}
              </section>
            );
          }) : <RiderList riders={data.riders} busy={busy} onRemove={(r) => void act({ action: 'remove', studentId: r.id }, `${r.name} removed`)} />}
          <button type="button" disabled={busy} onClick={async () => { if (await confirmDialog({ title: `Delete ${data.name}?`, message: data.riders.length ? `${data.riders.length} students lose their bus.` : undefined, confirmLabel: 'Delete route', destructive: true })) void act({ action: 'delete' }, 'Route deleted'); }} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete route</button>
        </div>
      )}
    </Sheet>
  );
}

function RiderList({ riders, busy, onRemove }: { riders: Rider[]; busy: boolean; onRemove: (r: Rider) => void }) {
  return (
    <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
      {riders.map((r) => (
        <li key={r.id} className="py-1.5 flex items-center gap-3">
          <Avatar name={r.name} src={r.avatar} size={28} />
          <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white truncate">{r.name}</span>
          <button type="button" disabled={busy} aria-label={`Remove ${r.name}`} onClick={() => onRemove(r)} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>
        </li>
      ))}
    </ul>
  );
}

interface Room { id: string; building: string; name: string; beds: number; notes: string | null; residents: { id: string; name: string; avatar: string | null; bed: string | null; since: string | null }[] }

export function HostelRegister() {
  const { data, error, mutate } = useSWR<{ rooms: Room[] }>('/api/registers/rooms', authedJson);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const buildings = [...new Set(data.rooms.map((r) => r.building))];
  const beds = data.rooms.reduce((a, r) => a + r.beds, 0), used = data.rooms.reduce((a, r) => a + r.residents.length, 0);
  const room = data.rooms.find((r) => r.id === open) ?? null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add rooms</button>
        {beds > 0 && <p className="text-xs text-zinc-500 tabular-nums">{used} of {beds} beds taken</p>}
      </div>
      {data.rooms.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>No hostel rooms yet.</p> : buildings.map((b) => (
        <section key={b} className={`${card} p-2 sm:p-3`} aria-label={b}>
          <h2 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{b}</h2>
          <motion.ul variants={list} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1">
            {data.rooms.filter((r) => r.building === b).map((r) => (
              <motion.li key={r.id} variants={fadeUp}>
                <button type="button" onClick={() => { haptic('tap'); setOpen(r.id); }} className={cn('w-full rounded-2xl border p-2.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]', r.residents.length >= r.beds ? 'border-zinc-300 dark:border-white/15' : 'border-emerald-500/30')}>
                  <span className="flex items-center justify-between"><span className="text-sm font-bold text-zinc-900 dark:text-white">{r.name}</span><BedDouble className="w-4 h-4 text-zinc-400" aria-hidden /></span>
                  <span className={cn('block text-[11px] tabular-nums', r.residents.length >= r.beds ? 'text-zinc-500' : 'text-emerald-700 dark:text-emerald-300')}>{r.residents.length}/{r.beds} {r.residents.length >= r.beds ? 'full' : 'free beds: ' + (r.beds - r.residents.length)}</span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      ))}
      {adding && <AddRooms buildings={buildings} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void mutate(); }} />}
      {room && <RoomSheet key={room.id} room={room} onClose={() => setOpen(null)} onChanged={() => void mutate()} />}
    </div>
  );
}

function AddRooms({ buildings, onClose, onAdded }: { buildings: string[]; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ building: buildings[0] ?? '', name: '101', beds: 2, count: 1 });
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ created: number }>('/api/registers/rooms', { method: 'POST', body: JSON.stringify(f) });
      haptic('success'); toast.success(`${r.created} room${r.created === 1 ? '' : 's'} added`);
      onAdded();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t add the rooms.')); setBusy(false); }
  };
  return (
    <Sheet title="Add hostel rooms" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Building">{(p) => <><input {...p} required list="hostel-buildings" maxLength={60} value={f.building} onChange={(e) => setF((c) => ({ ...c, building: e.target.value }))} className="input" placeholder="Boys’ hostel A" /><datalist id="hostel-buildings">{buildings.map((b) => <option key={b} value={b} />)}</datalist></>}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="First room">{(p) => <input {...p} required maxLength={40} value={f.name} onChange={(e) => setF((c) => ({ ...c, name: e.target.value }))} className="input" />}</Field>
          <Field label="How many">{(p) => <input {...p} type="number" min={1} max={100} value={f.count} onChange={(e) => setF((c) => ({ ...c, count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }))} className="input" />}</Field>
          <Field label="Beds each">{(p) => <input {...p} type="number" min={1} max={20} value={f.beds} onChange={(e) => setF((c) => ({ ...c, beds: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))} className="input" />}</Field>
        </div>
        <p className="text-xs text-zinc-500">{f.count > 1 ? (/^\d+$/.test(f.name) ? `Rooms ${f.name} to ${Number(f.name) + f.count - 1}` : 'To add several rooms, start from a number like 101.') : `Room ${f.name}`}</p>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add</button>
      </form>
    </Sheet>
  );
}

function RoomSheet({ room, onClose, onChanged }: { room: Room; onClose: () => void; onChanged: () => void }) {
  const key = `/api/registers/rooms/${room.id}`;
  const [bed, setBed] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await authedJson<{ deleted?: boolean; moved?: boolean }>(key, { method: 'POST', body: JSON.stringify(body) });
      haptic('success'); toast.success(done, { description: r.moved ? 'They were moved from another room.' : undefined });
      setBed(''); onChanged();
      if (r.deleted) onClose();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(false); }
  };
  const full = room.residents.length >= room.beds;
  return (
    <Sheet title={`${room.building} · ${room.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{room.residents.length} of {room.beds} beds taken</p>
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {room.residents.map((r) => (
            <li key={r.id} className="py-2 flex items-center gap-3">
              <Avatar name={r.name} src={r.avatar} size={32} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.name}</span>{r.bed && <span className="block text-xs text-zinc-500">Bed {r.bed}</span>}</span>
              <button type="button" disabled={busy} aria-label={`Move ${r.name} out`} onClick={() => void act({ action: 'remove', studentId: r.id }, `${r.name} moved out`)} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
        {full ? <p className="text-sm text-zinc-500">The room is full.</p> : (
          <section className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2" aria-label="Add a resident">
            <input aria-label="Bed (optional)" maxLength={20} value={bed} onChange={(e) => setBed(e.target.value)} className="input" placeholder="Bed (optional), like A or 2" />
            <PersonPicker students label="Add a student: name or email" onPick={(p) => void act({ action: 'add', studentId: p.id, bed }, `${p.name} moved in`)} />
          </section>
        )}
        {room.residents.length === 0 && <button type="button" disabled={busy} onClick={async () => { if (await confirmDialog({ title: `Delete room ${room.name}?`, confirmLabel: 'Delete room', destructive: true })) void act({ action: 'delete' }, 'Room deleted'); }} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete room</button>}
      </div>
    </Sheet>
  );
}
