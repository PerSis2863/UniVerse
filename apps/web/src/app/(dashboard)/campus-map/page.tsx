'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { CalendarDays, Map as MapIcon, MapPin, Pencil, Plus, Radio, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, campusMapTabs } from '@/components/layout/SectionTabs';
import { LoadError } from '@/components/ui/LoadError';
import { Segmented } from '@/components/ui/Segmented';
import { promptDialog } from '@/components/ui/Dialogs';
import { CampusMapView, MapLegend, buildingStats } from '@/components/campus/CampusMapView';
import { BuildingSheet, RoomChip } from '@/components/campus/BuildingSheet';
import { CampusUsage } from '@/components/campus/CampusUsage';
import { floorName, type Building, type CampusMapData } from '@/components/campus/types';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { freeFor, hhmm, isStudyRoom, roomNow, type Box } from '@/lib/campus-map';
import { fadeUp } from '@/lib/motion';
import { useNow } from '@/lib/use-now';
import { useAuthStore } from '@/store/auth';

// The classroom twin (Stage 5 · D15): the campus as a live map. Buildings coloured by how many rooms
// are in use now; your next class and its room; rooms free now and for how long; in-person classes
// live now (with check-ins), online classes and campus events now or soon. Admins draw the map (drag
// buildings, put rooms in them) and see how much rooms are used. A tab of Student life (students),
// Campus services (teachers) and Campus monitoring (admins).
// What's on is worked out on this device from today's lists as the clock moves; the lists themselves
// are fetched again every 15 minutes (and when you come back to the page).

/** The device's date, minutes after midnight and weekday (0 = Monday). */
function localClock(ms: number) {
  const d = new Date(ms);
  return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, min: d.getHours() * 60 + d.getMinutes(), dow: (d.getDay() + 6) % 7 };
}

type View = 'map' | 'usage';

export default function CampusMapPage() {
  const role = useAuthStore((s) => s.user?.role);
  const nowMs = useNow();
  const clock = nowMs ? localClock(nowMs) : null;
  const [campus, setCampus] = useState<string | null | undefined>(undefined); // undefined: the server picks mine
  const [view, setView] = useState<View>('map');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const key = clock ? `/api/campus/map?date=${clock.date}&min=${Math.floor(clock.min / 15) * 15}&dow=${clock.dow}${campus !== undefined ? `&campus=${campus ?? ''}` : ''}` : null;
  const { data, error, mutate } = useSWR<CampusMapData>(key, authedJson, { keepPreviousData: true });
  const minute = clock?.min ?? 0;
  const stats = useMemo(() => Object.fromEntries((data?.buildings ?? []).map((b) => [b.id, buildingStats(b, data!.rooms, minute, data!.live, data!.events, data!.next)])), [data, minute]);
  const byId = useMemo(() => new Map((data?.buildings ?? []).map((b) => [b.id, b])), [data]);
  const bookHref = role === 'STUDENT' ? '/student/life/rooms' : role === 'TEACHER' ? '/teacher/services/rooms' : null;
  const show = (id: string | null) => { if (!id) return; setFocus(id); setOpen(id); };

  const move = async (id: string, box: Box) => {
    void mutate((d) => d && { ...d, buildings: d.buildings.map((b) => (b.id === id ? { ...b, ...box } : b)) }, { revalidate: false });
    try { await authedJson(`/api/campus/map/buildings/${id}`, { method: 'PATCH', body: JSON.stringify({ x: box.x, y: box.y }) }); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t move it.')); void mutate(); }
  };
  const addBuilding = async () => {
    const name = await promptDialog({ title: 'Add a building', message: 'It goes in a free spot on the map: drag it where it belongs.', placeholder: 'e.g. Science Block', confirmLabel: 'Add', maxLength: 60 });
    if (!name?.trim()) return;
    try {
      const b = await authedJson<Building>('/api/campus/map/buildings', { method: 'POST', body: JSON.stringify({ name, campusId: data?.campus.id ?? null }) });
      await mutate();
      setEditing(true);
      setOpen(b.id);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t add it.')); }
  };

  const opened = open ? byId.get(open) ?? null : null;
  const next = data?.next ?? null;
  const nextBuilding = next?.buildingId ? byId.get(next.buildingId) ?? null : null;
  const free = data ? data.rooms.map((r) => ({ r, now: roomNow(r.busy, minute) })).filter((x) => x.now.state === 'free')
    .sort((a, b) => Number(isStudyRoom(b.r.type, b.r.name)) - Number(isStudyRoom(a.r.type, a.r.name)) || freeFor(b.now, minute) - freeFor(a.now, minute) || a.r.name.localeCompare(b.r.name)) : [];
  const [allFree, setAllFree] = useState(false);
  const roomName = (id: string | null) => {
    const r = id ? data?.rooms.find((x) => x.id === id) : null;
    if (!r) return null;
    const b = r.buildingId ? byId.get(r.buildingId) : null;
    return `${r.name}${b ? ` · ${b.name}` : ''}`;
  };
  const roomBuilding = (id: string | null) => (id ? data?.rooms.find((x) => x.id === id)?.buildingId ?? null : null);
  const nothingNow = data && !data.live.length && !data.online.length && !data.events.length;

  return (
    <>
      <Topbar title="Campus map" subtitle="What’s on now: free rooms, live classes, events, and where your next class is" />
      <SectionTabs tabs={campusMapTabs(role)} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          {(data && (data.campuses.length > 1 || data.canEdit)) && (
            <div className="flex flex-wrap items-center gap-2">
              {data.campuses.length > 1 && (
                <select value={data.campus.id ?? ''} onChange={(e) => { setCampus(e.target.value || null); setOpen(null); setFocus(null); }} aria-label="University" className="input text-sm !w-auto">
                  {data.campuses.map((c) => <option key={c.id ?? ''} value={c.id ?? ''}>{c.name}</option>)}
                </select>
              )}
              {data.canEdit && <Segmented<View> label="Show" value={view} onChange={(v) => { setView(v); setEditing(false); }} segments={[{ value: 'map', label: 'Map' }, { value: 'usage', label: 'Usage' }]} />}
              {data.canEdit && view === 'map' && (
                <span className="flex gap-2 ms-auto">
                  {editing && <button type="button" onClick={() => void addBuilding()} className="btn-secondary btn-sm"><Plus className="w-4 h-4" />Add building</button>}
                  <button type="button" onClick={() => setEditing(!editing)} aria-pressed={editing} className={editing ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}><Pencil className="w-4 h-4" />{editing ? 'Done editing' : 'Edit map'}</button>
                </span>
              )}
            </div>
          )}

          {error && !data ? <LoadError onRetry={() => mutate()} /> : !data || !clock ? (
            <div className="space-y-4"><div className="h-20 rounded-2xl skeleton" /><div className="rounded-3xl skeleton" style={{ aspectRatio: '1000 / 640' }} /></div>
          ) : view === 'usage' && data.canEdit ? (
            <CampusUsage date={clock.date} campus={data.campus} buildings={data.buildings} />
          ) : (
            <>
              {next && (
                <motion.section variants={fadeUp} initial="hidden" animate="show" aria-labelledby="next-title" className="panel p-4 flex flex-wrap items-center gap-3">
                  <span className="w-11 h-11 shrink-0 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300 grid place-items-center"><MapPin className="w-5 h-5" aria-hidden /></span>
                  <div className="flex-1 min-w-[12rem]">
                    <h2 id="next-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{next.now ? 'On now' : role === 'TEACHER' ? 'Your next class to teach' : 'Your next class'}</h2>
                    <p className="font-semibold text-zinc-900 dark:text-white">{next.code} · {next.name}</p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{next.day} {next.start}–{next.end} · {next.roomName ?? 'Room not set'}{nextBuilding ? `, ${nextBuilding.name}` : ''}{nextBuilding && next.floor != null ? `, ${floorName(next.floor).toLowerCase()}` : ''}</p>
                  </div>
                  {nextBuilding && <button type="button" onClick={() => show(nextBuilding.id)} className="btn-secondary btn-sm">Show on map</button>}
                </motion.section>
              )}

              {data.buildings.length ? (
                <div className="space-y-2">
                  {editing && <p className="text-sm text-indigo-800 dark:text-indigo-300">Drag a building to move it (or use the arrow keys); tap it to rename it, set its floors and put rooms in it.</p>}
                  <CampusMapView buildings={data.buildings} stats={stats} editing={editing} focus={focus} onOpen={setOpen} onMoved={(id, box) => void move(id, box)} />
                  <MapLegend />
                </div>
              ) : (
                <div className="panel p-5 flex flex-wrap items-center gap-4">
                  <span className="w-11 h-11 shrink-0 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 grid place-items-center"><MapIcon className="w-5 h-5" aria-hidden /></span>
                  <p className="flex-1 min-w-[12rem] text-sm text-zinc-700 dark:text-zinc-300">{data.canEdit ? 'Draw the campus: add each building, drag it into place, then put its rooms in it, floor by floor.' : 'The campus map hasn’t been drawn yet. Free rooms and what’s on now are below.'}</p>
                  {data.canEdit && <button type="button" onClick={() => void addBuilding()} className="btn-primary btn-sm"><Plus className="w-4 h-4" />Add the first building</button>}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 items-start">
                <section aria-labelledby="free-title" className="panel p-4 space-y-3">
                  <h2 id="free-title" className="font-bold text-zinc-900 dark:text-white">Free now <span className="font-normal text-sm text-zinc-600 dark:text-zinc-400">{free.length} of {data.rooms.length} rooms</span></h2>
                  {!data.rooms.length ? <p className="text-sm text-zinc-700 dark:text-zinc-300">No rooms yet.</p> : !free.length ? <p className="text-sm text-zinc-700 dark:text-zinc-300">Every room is in use right now.</p> : (
                    <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                      {(allFree ? free : free.slice(0, 6)).map(({ r, now }) => {
                        const b = r.buildingId ? byId.get(r.buildingId) : null;
                        return (
                          <li key={r.id} className="py-2 flex items-center gap-2">
                            <span className="flex-1 min-w-0">
                              {b ? <button type="button" onClick={() => show(b.id)} className="block max-w-full truncate text-start font-medium text-zinc-900 dark:text-white hover:underline">{r.name}</button> : <span className="block truncate font-medium text-zinc-900 dark:text-white">{r.name}</span>}
                              <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">{b ? `${b.name} · ${floorName(r.floor).toLowerCase()}` : 'Not on the map'} · {r.capacity} seats{isStudyRoom(r.type, r.name) ? ' · study room' : ''}</span>
                            </span>
                            <RoomChip now={now} minute={minute} />
                            {bookHref && <Link href={bookHref} className="shrink-0 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:underline" aria-label={`Book ${r.name}`}>Book</Link>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {free.length > 6 && <button type="button" onClick={() => setAllFree(!allFree)} className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{allFree ? 'Show fewer' : `Show all ${free.length}`}</button>}
                </section>

                <section aria-labelledby="now-title" className="panel p-4 space-y-3">
                  <h2 id="now-title" className="font-bold text-zinc-900 dark:text-white">Happening now</h2>
                  {nothingNow && <p className="text-sm text-zinc-700 dark:text-zinc-300">No class or event live right now.</p>}
                  <ul className="space-y-3">
                    {data.live.map((l) => (
                      <li key={l.courseId} className="flex items-start gap-3">
                        <Radio className="w-5 h-5 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-zinc-900 dark:text-white">{l.code} · {l.name}</span>
                          <span className="block text-xs text-zinc-600 dark:text-zinc-400">In person{roomName(l.roomId) ? ` · ${roomName(l.roomId)}` : ''} · {l.checkedIn} checked in</span>
                        </span>
                        {roomBuilding(l.roomId) && <button type="button" onClick={() => show(roomBuilding(l.roomId))} className="shrink-0 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:underline" aria-label={`Show ${l.code} on the map`}>Show</button>}
                      </li>
                    ))}
                    {data.online.map((o) => (
                      <li key={o.id} className="flex items-start gap-3">
                        <Video className="w-5 h-5 mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-zinc-900 dark:text-white">{o.title}</span>
                          <span className="block text-xs text-zinc-600 dark:text-zinc-400">Online{o.code ? ` · ${o.code}` : ''} · until {hhmm(new Date(o.until).getHours() * 60 + new Date(o.until).getMinutes())}</span>
                        </span>
                        <Link href={o.join} className="btn-primary btn-sm shrink-0">Join</Link>
                      </li>
                    ))}
                    {data.events.map((e) => (
                      <li key={e.id} className="flex items-start gap-3">
                        <CalendarDays className="w-5 h-5 mt-0.5 shrink-0 text-fuchsia-600 dark:text-fuchsia-400" aria-hidden />
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-zinc-900 dark:text-white">{e.title}</span>
                          <span className="block text-xs text-zinc-600 dark:text-zinc-400">{e.now ? 'Started' : 'At'} {e.startAt ? new Date(e.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{e.buildingId && byId.get(e.buildingId) ? ` · ${byId.get(e.buildingId)!.name}` : e.location ? ` · ${e.location}` : ''}</span>
                        </span>
                        {e.buildingId && byId.get(e.buildingId) && <button type="button" onClick={() => show(e.buildingId)} className="shrink-0 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:underline" aria-label={`Show ${e.title} on the map`}>Show</button>}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
      {opened && data && <BuildingSheet building={opened} rooms={data.rooms} minute={minute} live={data.live} events={data.events} editing={editing} bookHref={bookHref} onClose={() => { setOpen(null); setFocus(null); }} onChanged={() => void mutate()} />}
    </>
  );
}
