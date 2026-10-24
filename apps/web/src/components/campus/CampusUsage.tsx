'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Segmented } from '@/components/ui/Segmented';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { DAY_SHORT, HEAT_FROM, HEAT_TO, OPEN_HOURS_A_WEEK } from '@/lib/campus-map';
import type { Building, CampusRef } from './types';

// How much the rooms were used (Stage 5 · D15, admins): hour by hour, Monday to Sunday, over the past
// weeks, from the class timetable and room bookings; and each room's share of the open hours.

interface Usage { weeks: number; from: string; to: string; rooms: number; bookings: number; grid: number[][]; use: { id: string; name: string; hours: number; share: number }[] }
type Weeks = '2' | '4' | '8';

const HOURS = Array.from({ length: HEAT_TO - HEAT_FROM }, (_, i) => HEAT_FROM + i);

export function CampusUsage({ date, campus, buildings }: { date: string; campus: CampusRef; buildings: Building[] }) {
  const [weeks, setWeeks] = useState<Weeks>('4');
  const [building, setBuilding] = useState('');
  const key = `/api/campus/map/usage?date=${date}&weeks=${weeks}${campus.id ? `&campus=${campus.id}` : ''}${building ? `&building=${building}` : ''}`;
  const { data, error, mutate } = useSWR<Usage>(key, authedJson);
  const busiest = data?.use.filter((r) => r.hours > 0).slice(0, 5) ?? [];
  const quiet = data ? [...data.use].sort((a, b) => a.hours - b.hours || a.name.localeCompare(b.name)).slice(0, 5) : [];
  return (
    <section aria-labelledby="usage-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="usage-title" className="font-bold text-zinc-900 dark:text-white">How much rooms are used</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">From the class timetable and room bookings{data ? `, ${data.from} to ${data.to}` : ''}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Building" className="input text-sm !w-auto">
            <option value="">All buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Segmented<Weeks> label="Weeks" value={weeks} onChange={(v) => setWeeks(v)} segments={[{ value: '2', label: '2 weeks' }, { value: '4', label: '4 weeks' }, { value: '8', label: '8 weeks' }]} />
        </div>
      </div>
      {error && !data ? <LoadError onRetry={() => mutate()} /> : !data ? <div className="h-64 rounded-2xl skeleton" /> : data.rooms === 0 ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">No rooms here yet.</p>
      ) : (
        <>
          <div className="panel p-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Rooms in use by hour (scrolls sideways on small screens)">
            <table className="w-full border-separate border-spacing-0.5 text-[11px]">
              <caption className="sr-only">Share of the {data.rooms} rooms in use each hour, Monday to Sunday</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-10"><span className="sr-only">Day</span></th>
                  {HOURS.map((h) => <th key={h} scope="col" className="font-medium text-zinc-600 dark:text-zinc-400 tabular-nums">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.grid.map((row, d) => (
                  <tr key={d}>
                    <th scope="row" className="text-start font-semibold text-zinc-700 dark:text-zinc-300 pe-1">{DAY_SHORT[d]}</th>
                    {row.map((v, i) => (
                      <td key={i} title={`${DAY_SHORT[d]} ${HOURS[i]}:00: ${Math.round(v * 100)}% of rooms in use`} className="h-7 min-w-[1.4rem] rounded-md border border-zinc-200/70 dark:border-white/5" style={{ background: v > 0 ? `rgba(37, 55, 69, ${0.12 + v * 0.88})` : undefined }}>
                        <span className="sr-only">{Math.round(v * 100)}%</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400" aria-hidden>
              <span>None</span><span className="h-2.5 w-24 rounded-full" style={{ background: 'linear-gradient(to right, rgba(37,55,69,.12), rgba(37,55,69,1))' }} /><span>Every room</span>
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <RoomList title="Busiest rooms" rooms={busiest} weeks={data.weeks} empty="No room was used." />
            <RoomList title="Least used rooms" rooms={quiet} weeks={data.weeks} empty="" />
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">A room’s share is its hours in use out of {OPEN_HOURS_A_WEEK} open hours a week (Monday to Friday, 8:00 to 18:00). {data.bookings} booking{data.bookings === 1 ? '' : 's'} counted.</p>
        </>
      )}
    </section>
  );
}

function RoomList({ title, rooms, weeks, empty }: { title: string; rooms: Usage['use']; weeks: number; empty: string }) {
  return (
    <div className="panel p-4 space-y-3">
      <h3 className="font-semibold text-zinc-900 dark:text-white">{title}</h3>
      {rooms.length === 0 ? <p className="text-sm text-zinc-700 dark:text-zinc-300">{empty}</p> : (
        <ul className="space-y-2.5">
          {rooms.map((r) => (
            <li key={r.id} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate text-zinc-900 dark:text-white">{r.name}</span><span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-300">{Math.round(r.hours / weeks)} h a week · {Math.round(r.share * 100)}%</span></div>
              <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, r.share * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
