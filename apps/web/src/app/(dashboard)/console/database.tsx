'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronRight, Database, Download, HardDrive, Loader2, Plus, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchBox, card, downloadCsv, fetcher, matches } from './shared';
import { useActivePoll } from '@/lib/realtime-client';

// Owner console → Database: what the real database holds, table by table (server side:
// src/server/modules/owner-database.ts). A table opens in All data, where every record can be read
// and edited.

interface Meter { used: number | null; limit: number }
interface DatabaseData {
  tables: { name: string; area: string; rows: number; today: number | null; week: number | null; lastAdded: string | null }[];
  totals: { tables: number; rows: number; today: number; week: number; empty: number };
  added: { day: string; added: number }[];
  busiest: { name: string; count: number }[];
  storage: { size: Meter | null; reads: Meter | null; writes: Meter | null; files: Meter | null; checkedAt: string | null };
}

const nice = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^NGO/, 'NGO ');
const num = (n: number) => new Intl.NumberFormat('en', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
const bytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
// Dates stored by the app look like 2026-10-01T14:59:05.559+00:00.
const when = (s: string | null) => (s ? formatDistanceToNow(new Date(s.replace(' ', 'T')), { addSuffix: true }) : '—');

export function DatabasePanel({ onOpenTable }: { onOpenTable: (name: string) => void }) {
  const { data, isLoading } = useSWR<DatabaseData>('/owner/database', fetcher, { refreshInterval: useActivePoll(60_000) });
  const [q, setQ] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);
  if (isLoading || !data) return <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />;

  const peak = Math.max(1, ...data.added.map((d) => d.added));
  const shown = data.tables.filter((t) => (!hideEmpty || t.rows > 0 || q) && matches(q, t.name, nice(t.name), t.area));
  const areas = [...new Set(shown.map((t) => t.area))];
  const s = data.storage;
  const tiles: [string, string, string?][] = [
    ['Records stored', num(data.totals.rows), `in ${data.totals.tables} tables`],
    ['Added today', num(data.totals.today), 'last 24 hours'],
    ['Added this week', num(data.totals.week), 'last 7 days'],
    ['Database size', s.size?.used != null ? bytes(s.size.used) : '—', s.size?.used != null ? `of ${bytes(s.size.limit)} included` : 'shown once the spending guard runs'],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={cn(card, 'p-4')}>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{label}</p>
            {hint && <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className={cn(card, 'p-5 lg:col-span-2')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Records added per day · 14 days</h2>
          <div className="flex items-end gap-1 h-32" role="img" aria-label="Records added per day">
            {data.added.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${format(new Date(d.day), 'd MMM')}: ${d.added}`}>
                <div className="w-full rounded-t bg-gradient-to-t from-indigo-600/70 to-fuchsia-400/80" style={{ height: `${Math.max(d.added ? 6 : 2, (d.added / peak) * 100)}%`, opacity: d.added ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-400"><span>{format(new Date(data.added[0].day), 'd MMM')}</span><span>today</span></div>
        </div>
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Busiest tables · 14 days</h2>
          {data.busiest.length === 0 ? <p className="text-sm text-zinc-500">Nothing added in the last two weeks.</p> : (
            <ul className="space-y-2">{data.busiest.map((b) => (
              <li key={b.name}>
                <button onClick={() => onOpenTable(b.name)} className="w-full text-left">
                  <div className="flex justify-between text-sm"><span className="text-zinc-700 dark:text-zinc-200 truncate">{nice(b.name)}</span><span className="text-zinc-500 shrink-0">+{num(b.count)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(b.count / data.busiest[0].count) * 100}%` }} /></div>
                </button>
              </li>
            ))}</ul>
          )}
        </div>
      </div>

      {(s.reads || s.writes || s.files) && (
        <div className={cn(card, 'p-5')}>
          <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2 mb-3"><HardDrive className="w-4 h-4 text-zinc-400" /> Use this billing month</h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            {([['Rows read', s.reads, false], ['Rows written', s.writes, false], ['Stored files', s.files, true]] as const).map(([label, m, isBytes]) => m && (
              <div key={label}>
                <div className="flex justify-between text-xs"><span className="text-zinc-600 dark:text-zinc-300">{label}</span><span className="text-zinc-400">{m.used == null ? '—' : isBytes ? bytes(m.used) : num(m.used)} of {isBytes ? bytes(m.limit) : num(m.limit)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(1, Math.min(100, ((m.used ?? 0) / m.limit) * 100))}%` }} /></div>
              </div>
            ))}
          </div>
          {s.checkedAt && <p className="mt-3 text-[11px] text-zinc-400">From Cloudflare, checked {when(s.checkedAt)}.</p>}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={q} onChange={setQ} placeholder={`Search ${data.totals.tables} tables`} className="flex-1 min-w-[14rem]" />
          <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide {data.totals.empty} empty
          </label>
          <button onClick={() => downloadCsv('database', ['Table', 'Area', 'Records', 'Added today', 'Added this week', 'Last added'], data.tables.map((t) => [nice(t.name), t.area, t.rows, t.today ?? '', t.week ?? '', t.lastAdded ?? '']))}
            className="btn-secondary inline-flex items-center gap-1.5"><Download className="w-4 h-4" /> CSV</button>
        </div>
        {areas.map((area) => (
          <div key={area} className={card}>
            <p className="px-4 pt-4 pb-2 text-xs font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> {area}</p>
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {shown.filter((t) => t.area === area).map((t) => (
                <li key={t.name}>
                  <button onClick={() => onOpenTable(t.name)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                    <Table2 className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{nice(t.name)}</span>
                      <span className="block text-xs text-zinc-500">{t.lastAdded ? `last added ${when(t.lastAdded)}` : t.rows ? 'no dates' : 'empty'}</span>
                    </span>
                    {!!t.today && <span className="hidden sm:inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400"><Plus className="w-3 h-3" />{num(t.today)} today</span>}
                    {!!t.week && <span className="hidden md:inline text-xs text-zinc-500">+{num(t.week)} this week</span>}
                    <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums w-16 text-right">{num(t.rows)}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-zinc-500">No tables match.</p>}
      </div>
    </div>
  );
}
