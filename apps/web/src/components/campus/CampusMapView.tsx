'use client';

import { useRef, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { MAP_H, MAP_W, clampBox, loadLevel, roomNow, shortName, type Box } from '@/lib/campus-map';
import { cn } from '@/lib/utils';
import type { Building, LiveClass, MapEvent, MapRoom, NextClass } from './types';

// The campus drawn as buildings (Stage 5 · D15). Each building is a button, filled more strongly the
// more of its rooms are in use right now, with a red dot when an in-person class is live in it, a pin
// on your next class's building and a calendar on buildings with an event now or soon. In edit mode
// (admins) buildings are dragged, or moved with the arrow keys, and a tap opens their settings.

const FILL = ['22', '4d', '8c', 'd9']; // the building's colour at more strength for each load level
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export interface BuildingStats { total: number; inUse: number; live: boolean; events: number; next: boolean }

/** Per building: rooms, rooms in use at `minute`, a live class, events, my next class. */
export function buildingStats(b: Building, rooms: MapRoom[], minute: number, live: LiveClass[], events: MapEvent[], next: NextClass | null): BuildingStats {
  const here = rooms.filter((r) => r.buildingId === b.id);
  return {
    total: here.length,
    inUse: here.filter((r) => roomNow(r.busy, minute).state !== 'free').length,
    live: live.some((l) => here.some((r) => r.id === l.roomId)),
    events: events.filter((e) => e.buildingId === b.id).length,
    next: next?.buildingId === b.id,
  };
}

export function CampusMapView({ buildings, stats, editing, focus, onOpen, onMoved }: {
  buildings: Building[];
  stats: Record<string, BuildingStats>;
  editing: boolean;
  /** A building to point out (after "Show on map"). */
  focus: string | null;
  onOpen: (id: string) => void;
  onMoved: (id: string, box: Box) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; from: { x: number; y: number }; start: Box; box: Box; moved: boolean } | null>(null);
  const toMap = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * MAP_W, y: ((e.clientY - r.top) / r.height) * MAP_H };
  };

  return (
    <div ref={ref} role="group" aria-label={editing ? 'Campus map: drag a building to move it, or tap it to change it' : 'Campus map'}
      className={cn('relative w-full rounded-3xl overflow-hidden border border-zinc-200 dark:border-white/10 bg-emerald-50 dark:bg-[#0d1a17] touch-none select-none', editing && 'ring-2 ring-indigo-400/60')}
      style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, backgroundImage: 'linear-gradient(to right, rgba(100,116,139,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,.12) 1px, transparent 1px)', backgroundSize: `${pct(50, MAP_W)} ${pct(50, MAP_H)}` }}>
      {/* Walkways: a cross through the middle, only to make it look like a campus. */}
      <div aria-hidden className="absolute start-0 end-0 bg-zinc-300/50 dark:bg-white/10" style={{ top: '48%', height: '3%' }} />
      <div aria-hidden className="absolute top-0 bottom-0 bg-zinc-300/50 dark:bg-white/10" style={{ left: '49%', width: '2%' }} />
      {buildings.map((b) => {
        const s = stats[b.id] ?? { total: 0, inUse: 0, live: false, events: 0, next: false };
        const box = drag?.id === b.id ? drag.box : b;
        const color = b.color ?? '#2a2927';
        const level = loadLevel(s.inUse, s.total);
        const label = `${b.name}: ${s.total ? `${s.inUse} of ${s.total} room${s.total === 1 ? '' : 's'} in use` : 'no rooms placed yet'}${s.live ? ', a class live now' : ''}${s.events ? `, ${s.events} event${s.events === 1 ? '' : 's'} now or soon` : ''}${s.next ? ', your next class' : ''}`;
        // The spoken name starts with the short name shown on the map (people using voice control say what they see).
        const short = shortName(b.name, b.code);
        const spoken = b.name.includes(short) ? label : `${short}, ${label}`;
        return (
          <button key={b.id} type="button" aria-label={editing ? `${spoken}. Move with the arrow keys, Enter to change it.` : spoken}
            className={cn('absolute rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 p-1 transition-shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/60',
              editing ? 'cursor-grab active:cursor-grabbing' : 'hover:shadow-lg', (focus === b.id || s.next) && 'ring-4 ring-amber-400/80 z-10', drag?.id === b.id && 'shadow-2xl z-20')}
            style={{ left: pct(box.x, MAP_W), top: pct(box.y, MAP_H), width: pct(box.w, MAP_W), height: pct(box.h, MAP_H), borderColor: color, background: `${color}${FILL[level]}` }}
            onClick={() => { if (!editing) onOpen(b.id); }}
            onKeyDown={(e) => {
              if (!editing) return;
              const step = e.shiftKey ? 50 : 10;
              const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
              if (d) { e.preventDefault(); onMoved(b.id, clampBox({ ...b, x: b.x + d[0], y: b.y + d[1] })); }
              else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(b.id); }
            }}
            onPointerDown={(e) => {
              if (!editing || e.button !== 0) return;
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer already went away */ }
              setDrag({ id: b.id, from: toMap(e), start: { x: b.x, y: b.y, w: b.w, h: b.h }, box: { x: b.x, y: b.y, w: b.w, h: b.h }, moved: false });
            }}
            onPointerMove={(e) => {
              if (!drag || drag.id !== b.id) return;
              const p = toMap(e), dx = p.x - drag.from.x, dy = p.y - drag.from.y;
              setDrag({ ...drag, box: clampBox({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }), moved: drag.moved || Math.hypot(dx, dy) > 6 });
            }}
            onPointerUp={() => {
              if (!drag || drag.id !== b.id) return;
              if (drag.moved) onMoved(b.id, drag.box); else onOpen(b.id);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}>
            <span className="max-w-full truncate rounded-md bg-white/95 dark:bg-zinc-900/90 px-1.5 py-0.5 text-[11px] sm:text-xs font-bold text-zinc-900 dark:text-white shadow-sm">{short}</span>
            {s.total > 0 && <span className="hidden min-[420px]:inline rounded-md bg-white/95 dark:bg-zinc-900/90 px-1 text-[10px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{s.inUse}/{s.total}</span>}
            {s.live && <span aria-hidden className="absolute -top-1.5 -end-1.5 w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900 animate-pulse" />}
            {s.next && <MapPin aria-hidden className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 text-amber-500 fill-amber-200 drop-shadow" />}
            {s.events > 0 && <CalendarDays aria-hidden className="absolute -bottom-1.5 -end-1.5 w-4 h-4 p-0.5 rounded-full bg-white dark:bg-zinc-900 text-fuchsia-600 dark:text-fuchsia-400 shadow" />}
          </button>
        );
      })}
    </div>
  );
}

/** What the colours mean. */
export function MapLegend() {
  const items: [string, string][] = [['22', 'Nothing on'], ['4d', 'A few rooms in use'], ['8c', 'Most rooms in use'], ['d9', 'Every room in use']];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-700 dark:text-zinc-300" aria-label="Map key">
      {items.map(([a, label]) => <li key={a} className="flex items-center gap-1.5"><span aria-hidden className="w-4 h-3 rounded border-2 border-indigo-500" style={{ background: `#2a2927${a}` }} />{label}</li>)}
      <li className="flex items-center gap-1.5"><span aria-hidden className="w-2.5 h-2.5 rounded-full bg-rose-500" />Class live now</li>
      <li className="flex items-center gap-1.5"><MapPin aria-hidden className="w-3.5 h-3.5 text-amber-500" />Your next class</li>
      <li className="flex items-center gap-1.5"><CalendarDays aria-hidden className="w-3.5 h-3.5 text-fuchsia-600 dark:text-fuchsia-400" />Event now or soon</li>
    </ul>
  );
}
