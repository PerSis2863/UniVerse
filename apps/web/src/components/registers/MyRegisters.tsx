'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { BedDouble, Bus, Laptop, Phone } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { fadeUp } from '@/lib/motion';

// A student's school bus, hostel room and the equipment lent to them (Stage 5 · B15.5;
// src/server/registers.ts): on Everyday life for students, under each child for parents, and the
// equipment part for staff. Shows nothing when there's nothing.

interface Data {
  bus: { route: string; vehicle: string | null; driver: string | null; driverPhone: string | null; notes: string | null; stop: string | null; time: string | null; stops: { name: string; time: string | null }[] } | null;
  room: { building: string; name: string; bed: string | null; since: string | null; roommates: string[] } | null;
  assets: { tag: string; name: string; category: string | null }[];
}

export function MyRegisters({ url, title = 'Bus, room and equipment', className }: { url: string; title?: string; className?: string }) {
  const { data } = useSWR<Data>(url, authedJson);
  if (!data || (!data.bus && !data.room && !data.assets.length)) return null;
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={`rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 space-y-4 ${className ?? ''}`} aria-label={title}>
      <h2 className="font-bold text-zinc-900 dark:text-white">{title}</h2>
      {data.bus && (
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0"><Bus className="w-5 h-5" aria-hidden /></span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-zinc-900 dark:text-white">{data.bus.route}{data.bus.vehicle ? <span className="font-normal text-zinc-500"> · {data.bus.vehicle}</span> : null}</p>
            {data.bus.stop && <p className="text-zinc-700 dark:text-zinc-200">From <span className="font-semibold">{data.bus.stop}</span>{data.bus.time ? <> at <span className="font-semibold tabular-nums">{data.bus.time}</span></> : null}</p>}
            {data.bus.driver && <p className="text-xs text-zinc-500">Driver {data.bus.driver}{data.bus.driverPhone ? <> · <a href={`tel:${data.bus.driverPhone}`} className="inline-flex items-center gap-0.5 hover:underline"><Phone className="w-3 h-3" aria-hidden />{data.bus.driverPhone}</a></> : null}</p>}
            {data.bus.stops.length > 1 && (
              <details className="mt-1">
                <summary className="text-xs text-indigo-700 dark:text-indigo-300 cursor-pointer min-h-8 inline-flex items-center">All stops</summary>
                <ol className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 space-y-0.5">{data.bus.stops.map((s, i) => <li key={i} className={s.name === data.bus!.stop ? 'font-semibold text-zinc-900 dark:text-white' : ''}>{s.time ? <span className="tabular-nums">{s.time} </span> : null}{s.name}</li>)}</ol>
              </details>
            )}
            {data.bus.notes && <p className="text-xs text-zinc-500 mt-1">{data.bus.notes}</p>}
          </div>
        </div>
      )}
      {data.room && (
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0"><BedDouble className="w-5 h-5" aria-hidden /></span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-zinc-900 dark:text-white">{data.room.building} · room {data.room.name}{data.room.bed ? <span className="font-normal text-zinc-500"> · bed {data.room.bed}</span> : null}</p>
            {data.room.roommates.length > 0 && <p className="text-xs text-zinc-500">With {data.room.roommates.join(', ')}</p>}
          </div>
        </div>
      )}
      {data.assets.length > 0 && (
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0"><Laptop className="w-5 h-5" aria-hidden /></span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-zinc-900 dark:text-white">Lent by the school</p>
            <ul className="text-xs text-zinc-600 dark:text-zinc-300">{data.assets.map((a) => <li key={a.tag}>{a.name} <span className="font-mono text-zinc-500">{a.tag}</span></li>)}</ul>
          </div>
        </div>
      )}
    </motion.section>
  );
}
